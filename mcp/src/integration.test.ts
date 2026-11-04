// @vitest-environment node
// The MCP tools against the real self-host server (server/src), in-process
// on an ephemeral port with temp dirs, the way server/src/routes.test.ts
// starts one.
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import type { Dataset, Visual } from "../../src/contexts/chartBuilder/lib/types"
import { createApi } from "./api"
import type { SpecProblem } from "../../src/contexts/chartBuilder/lib/chartSpec"
import { startTestServer, type TestServer } from "./testServer"
import { createHandlers } from "./tools"

let server: TestServer
let base: string

beforeAll(async () => {
	server = await startTestServer()
	base = server.base
})

afterAll(() => {
	server.close()
})

type ToolOutput = { id: string; message: string; problems: SpecProblem[]; [key: string]: unknown }

const parsed = (result: CallToolResult) => {
	expect(result.isError, (result.content[0] as { text: string }).text).toBeFalsy()
	return JSON.parse((result.content[0] as { text: string }).text) as ToolOutput
}

const storedVisual = async (id: string): Promise<Visual | undefined> =>
	((await (await fetch(`${base}/api/visuals?thumbnails=0`)).json()) as Visual[]).find(
		(v) => v.id === id
	)

describe("MCP tools over the real HTTP API", () => {
	it("create_dataset → create_chart → get_chart → edit_chart → undo round-trips", async () => {
		const tools = createHandlers(createApi(base))
		const ds = parsed(
			await tools.create_dataset({
				name: "Fruit",
				rows: [
					{ fruit: "Apple", count: 3, month: "2024-01-01" },
					{ fruit: "Pear", count: 5, month: "2024-02-01" },
				],
			})
		)
		const listed = parsed(await tools.list_datasets(undefined)) as unknown as Array<{ id: string; rowCount: number }>
		expect(listed).toContainEqual(expect.objectContaining({ id: ds.id, rowCount: 2 }))
		const body = (await (await fetch(`${base}/api/datasets/${ds.id}`)).json()) as Dataset
		const version = await fetch(`${base}/api/datasets/${ds.id}/versions/${body.latestVersionId}`)
		expect(version.status).toBe(200)

		const chart = parsed(
			await tools.create_chart({
				datasetId: ds.id,
				folderId: null,
				encodings: { x: "fruit", length: "count" },
				title: "Fruit",
			})
		)
		expect(chart.editorUrl).toBe(`https://charts.example.com/editor/${chart.id}`)
		const created = await storedVisual(chart.id)
		expect(created).toMatchObject({ id: chart.id, datasetId: ds.id, name: "Fruit" })
		expect(created?.createdAtVersionId).toBe(body.latestVersionId)

		expect(parsed(await tools.get_chart({ id: chart.id }))).toMatchObject({
			encodings: { x: "fruit", length: "count" },
			title: "Fruit",
		})

		parsed(await tools.edit_chart({ id: chart.id, patch: { subtitle: "By count" } }))
		expect((await storedVisual(chart.id))?.labelsConfig.subtitle).toBe("By count")

		parsed(await tools.undo_chart_edit({ id: chart.id }))
		const restored = await storedVisual(chart.id)
		expect({ ...restored, updatedAt: 0 }).toEqual({ ...created, updatedAt: 0 })
	})
})
