// @vitest-environment node
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { describe, expect, it } from "vitest"

import { CONTENT_VERSION_HEADER } from "../../src/contexts/chartBuilder/lib/storage/contentVersionHeader"
import { VISUALS_VERSION } from "../../src/contexts/chartBuilder/lib/storage/migrations"
import type { DatasetMeta, Visual } from "../../src/contexts/chartBuilder/lib/types"
import { createApi } from "./api"
import type { SpecProblem } from "../../src/contexts/chartBuilder/lib/chartSpec"
import { createHandlers } from "./tools"

type Call = { method: string; path: string; headers: Record<string, string>; body?: string }

/** An in-memory stand-in for the self-host API that records every call. */
const fakeServer = (stamps: Record<string, number> = {}) => {
	const calls: Call[] = []
	const visuals = new Map<string, Visual>()
	const datasets = new Map<string, unknown>()
	const metas = new Map<string, DatasetMeta>()
	const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 })
	const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
		const url = new URL(String(input))
		const method = init?.method ?? "GET"
		const path = url.pathname + url.search
		calls.push({
			method,
			path,
			headers: (init?.headers ?? {}) as Record<string, string>,
			body: typeof init?.body === "string" ? init.body : undefined,
		})
		const parts = url.pathname.split("/").slice(2).map(decodeURIComponent)
		if (method === "GET") {
			if (path === "/api/config") return json({ v: 1, baseUrl: "https://charts.example.com/" })
			if (path === "/api/content-versions") return json(stamps)
			if (path === "/api/datasets?view=index") return json(Object.fromEntries(metas))
			if (parts[0] === "datasets" && parts[1]) return json(datasets.get(parts[1]))
			if (path === "/api/visuals?thumbnails=0") return json([...visuals.values()])
			if (["/api/folders", "/api/themes", "/api/settings"].includes(path)) return json([])
			return new Response("not found", { status: 404 })
		}
		const body = JSON.parse(String(init?.body))
		if (parts[0] === "visuals") visuals.set(parts[1], body)
		if (parts[0] === "datasets" && parts.length === 2) datasets.set(parts[1], body)
		if (parts[0] === "datasets" && parts[2] === "meta") metas.set(parts[1], body)
		return new Response(null, { status: 204 })
	}) as typeof fetch
	return { calls, visuals, fetchImpl, writes: () => calls.filter((c) => c.method !== "GET") }
}

type ToolOutput = { id: string; message: string; problems: SpecProblem[]; [key: string]: unknown }

const parsed = (result: CallToolResult) =>
	JSON.parse((result.content[0] as { text: string }).text) as ToolOutput

const setup = (stamps?: Record<string, number>) => {
	const fake = fakeServer(stamps)
	return { ...fake, tools: createHandlers(createApi("http://api.test/", fake.fetchImpl)) }
}

const ROWS = [
	{ year: 2020, region: "North", sales: 10 },
	{ year: 2021, region: "South", sales: 12 },
	{ year: 2022, region: "North", sales: 9 },
]

const withDataset = async () => {
	const s = setup()
	const created = parsed(await s.tools.create_dataset({ name: "Sales", rows: ROWS }))
	s.calls.length = 0
	return { ...s, datasetId: created.id as string }
}

describe("create_dataset", () => {
	it("writes body, versions, then meta, with the managed and content-version headers", async () => {
		const s = setup()
		const result = await s.tools.create_dataset({ name: "Sales", rows: ROWS })
		expect(result.isError).toBeFalsy()
		const out = parsed(result)
		const writes = s.writes()
		expect(writes.map((w) => `${w.method} ${w.path}`)).toEqual([
			`PUT /api/datasets/${out.id}`,
			expect.stringMatching(new RegExp(`^PUT /api/datasets/${out.id}/versions/dv-`)),
			`PUT /api/datasets/${out.id}/meta`,
		])
		expect(writes[0].headers["x-vis-versions-managed"]).toBe("1")
		for (const w of writes) expect(w.headers[CONTENT_VERSION_HEADER]).toBeDefined()
		expect(out.rowCount).toBe(3)
		expect(out.fields).toContainEqual({ name: "sales", type: "quantitative" })
	})

	it("reuses an identical data set instead of writing", async () => {
		const s = setup()
		const first = parsed(await s.tools.create_dataset({ name: "Sales", rows: ROWS }))
		s.calls.length = 0
		const second = parsed(await s.tools.create_dataset({ name: "Sales", rows: ROWS }))
		expect(second).toMatchObject({ id: first.id, reused: true })
		expect(s.writes()).toEqual([])
	})

	it("refuses bad rows with nothing written", async () => {
		const s = setup()
		const result = await s.tools.create_dataset({ name: "", rows: [] })
		expect(result.isError).toBe(true)
		expect(parsed(result).problems.map((p: { path: string }) => p.path)).toEqual(["name", "rows"])
		expect(s.writes()).toEqual([])
	})
})

describe("create_chart", () => {
	it("PUTs the composed visual with the content-version header and returns links", async () => {
		const s = await withDataset()
		const result = await s.tools.create_chart({
			datasetId: s.datasetId,
			folderId: null,
			encodings: { x: "year", y: "sales" },
			title: "Sales by year",
		})
		expect(result.isError).toBeFalsy()
		const out = parsed(result)
		const [put] = s.writes()
		expect(put.path).toBe(`/api/visuals/${out.id}`)
		expect(put.headers[CONTENT_VERSION_HEADER]).toBe(String(VISUALS_VERSION))
		expect(JSON.parse(put.body ?? "{}")).not.toHaveProperty("thumbnail")
		expect(out.editorUrl).toBe(`https://charts.example.com/editor/${out.id}`)
		expect(out.pictureUrl).toBe(`https://charts.example.com/embed/${out.id}?export=png`)
		expect(s.visuals.get(out.id)?.themeId).toBeDefined()
	})

	it("returns problems as an error and writes nothing", async () => {
		const s = await withDataset()
		const result = await s.tools.create_chart({
			datasetId: s.datasetId,
			folderId: null,
			encodings: { x: "yaer" },
		})
		expect(result.isError).toBe(true)
		expect(parsed(result).problems[0].message).toContain('did you mean "year"')
		expect(s.writes()).toEqual([])
	})

	it("refuses when the server's content stamp differs from this build", async () => {
		const s = setup({ visuals: VISUALS_VERSION + 1 })
		const result = await s.tools.create_chart({
			datasetId: "ds-x",
			folderId: null,
			encodings: { x: "year" },
		})
		expect(result.isError).toBe(true)
		expect(parsed(result).message).toMatch(/behind the server's content; rebuild/)
		expect(s.writes()).toEqual([])
	})
})

describe("edit_chart and undo", () => {
	it("edits, then undo puts the previous visual back; a second undo errors", async () => {
		const s = await withDataset()
		const { id } = parsed(
			await s.tools.create_chart({
				datasetId: s.datasetId,
				folderId: null,
				encodings: { x: "year", y: "sales" },
				title: "Before",
			})
		)
		const edited = await s.tools.edit_chart({ id, patch: { title: "After", encodings: { hue: "region" } } })
		expect(edited.isError).toBeFalsy()
		expect(s.visuals.get(id)?.labelsConfig.title).toBe("After")
		expect(s.visuals.get(id)?.encodings.hue?.field).toBe("region")
		const summary = parsed(await s.tools.get_chart({ id }))
		expect(summary).toMatchObject({ title: "After", encodings: { x: "year", y: "sales", hue: "region" } })

		const undone = await s.tools.undo_chart_edit({ id })
		expect(undone.isError).toBeFalsy()
		expect(s.visuals.get(id)?.labelsConfig.title).toBe("Before")
		expect(s.visuals.get(id)?.encodings.hue?.field ?? null).toBeNull()
		expect((await s.tools.undo_chart_edit({ id })).isError).toBe(true)
	})

	it("a refused edit writes nothing and leaves nothing to undo", async () => {
		const s = await withDataset()
		const { id } = parsed(
			await s.tools.create_chart({ datasetId: s.datasetId, folderId: null, encodings: { x: "year" } })
		)
		s.calls.length = 0
		const result = await s.tools.edit_chart({ id, patch: { encodings: { y: "nope" } } })
		expect(result.isError).toBe(true)
		expect(s.writes()).toEqual([])
		expect((await s.tools.undo_chart_edit({ id })).isError).toBe(true)
	})
})
