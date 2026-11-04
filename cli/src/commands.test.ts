// @vitest-environment node
// Each command's refusals, and the undo and revision rules, against the real
// self-host server (mcp/src/testServer.ts).
import { readFileSync } from "node:fs"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { PUBLIC_SEED_FOLDER_IDS } from "../../src/contexts/chartBuilder/lib/stockFolders"
import type { Visual } from "../../src/contexts/chartBuilder/lib/types"
import { createApi, type Api } from "../../mcp/src/api"
import { startTestServer, type TestServer } from "../../mcp/src/testServer"
import {
	COMMANDS,
	CommandError,
	manifest,
	memoryUndo,
	revisionOf,
	run,
	type Deps,
	type UndoEntry,
} from "./commands"

let server: TestServer
let api: Api
let deps: Deps

beforeAll(async () => {
	server = await startTestServer()
	api = createApi(server.base)
	deps = { api, undo: memoryUndo() }
})
afterAll(() => server.close())

type Written = { id: string; visual: Visual; revision: string; written: boolean; undo: UndoEntry }

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a test reads whatever the command returns
const call = (name: string, input: unknown, d: Deps = deps) => run(name, input, d) as Promise<any>

/** The CommandError a call throws. */
const refusal = async (promise: Promise<unknown>): Promise<CommandError> => {
	const error = await promise.then(
		() => null,
		(e: unknown) => e
	)
	expect(error).toBeInstanceOf(CommandError)
	return error as CommandError
}

const stored = async (id: string): Promise<Visual> => {
	const visual = await api.visual(id)
	if (!visual) throw new Error(`no stored visual ${id}`)
	return visual
}

let seq = 0
const dataset = async () =>
	(
		await call("dataset create", {
			name: `rates ${++seq}`,
			rows: [
				{ hospital: "Riverside", rate: 14.2 },
				{ hospital: "Lakeview", rate: 11.8 },
			],
		})
	).id as string

const chart = async (): Promise<Written> =>
	call("chart create", {
		spec: { datasetId: await dataset(), folderId: null, encodings: { x: "hospital", length: "rate" } },
	})

const edit = (id: string, title: string, extra: Record<string, unknown> = {}): Promise<Written> =>
	call("chart edit", { id, patch: { title }, ...extra })

/** What the editor's save of an unchanged chart rewrites: a new thumbnail
 *  and updatedAt. */
const resave = async (id: string) => {
	const visual = await stored(id)
	await api.putVisual({ ...visual, updatedAt: visual.updatedAt + 1000 })
	return visual
}

describe("run", () => {
	it("refuses an unknown input key instead of dropping it, and a wrong type", async () => {
		for (const { name } of COMMANDS) {
			const e = await refusal(call(name, { extraKey: 1 }))
			expect(e.code, name).toBe("usage")
			expect(e.problems, name).toContainEqual({ path: "extraKey", message: 'unknown input "extraKey"' })
		}
		const nested = await refusal(call("chart undo", { id: "x", undo: { previous: {}, wrote: "r", by: "me" } }))
		expect(nested.problems).toContainEqual({ path: "undo.by", message: 'unknown input "by"' })
		const typed = await refusal(call("chart get", { id: 7 }))
		expect(typed.code).toBe("usage")
		expect(typed.problems?.[0].path).toBe("id")
	})

	it("reports a content-version mismatch as version, before writing", async () => {
		const ahead = createApi(server.base, (url, init) =>
			String(url).endsWith("/api/content-versions")
				? Promise.resolve(new Response(JSON.stringify({ visuals: 9999 })))
				: fetch(url, init)
		)
		const before = (await api.visuals()).length
		const e = await refusal(
			call(
				"chart create",
				{ spec: { datasetId: await dataset(), folderId: null, encodings: { x: "hospital", length: "rate" } } },
				{ api: ahead, undo: memoryUndo() }
			)
		)
		expect(e.code).toBe("version")
		expect((await api.visuals()).length).toBe(before)
	})
})

describe("manifest", () => {
	it("lists every command with strict input schemas", () => {
		const m = manifest()
		expect(m.manifestVersion).toBe(1)
		expect(m.commands.map((c) => c.name)).toEqual(COMMANDS.map((c) => c.name))
		for (const c of m.commands) {
			expect(c.summary.length).toBeGreaterThan(0)
			expect(c.inputSchema).toMatchObject({ type: "object", additionalProperties: false })
		}
	})
})

describe("revisionOf", () => {
	it("ignores what a save without a change rewrites, and key order", () => {
		const v = { id: "v", name: "a", nested: { b: 1, a: 2 } }
		const r = revisionOf(v)
		expect(revisionOf({ nested: { a: 2, b: 1 }, name: "a", id: "v" })).toBe(r)
		expect(revisionOf({ ...v, thumbnail: "data:", thumbnailAt: 5, updatedAt: 9, updatedBy: "x" })).toBe(r)
		expect(revisionOf({ ...v, name: "b" })).not.toBe(r)
	})
})

describe("chart create", () => {
	it("writes nothing in preview mode", async () => {
		const out = await call("chart create", {
			spec: { datasetId: await dataset(), folderId: null, encodings: { x: "hospital", length: "rate" } },
			mode: "preview",
		})
		expect(out.written).toBe(false)
		expect(await api.visual(out.id)).toBeNull()
	})

	it("refuses the stock Examples folder", async () => {
		const spec = { datasetId: await dataset(), folderId: PUBLIC_SEED_FOLDER_IDS[0], encodings: { x: "hospital" } }
		expect(await refusal(call("chart create", { spec }))).toMatchObject({
			code: "invalid",
			problems: [{ path: "folderId", message: expect.stringContaining("read-only") }],
		})
	})
})

describe("chart edit", () => {
	it("refuses a stale expectedRevision and writes nothing", async () => {
		const { id, revision } = await chart()
		await edit(id, "someone else's")
		const e = await refusal(edit(id, "mine", { expectedRevision: revision }))
		expect(e.code).toBe("stale")
		expect((await stored(id)).labelsConfig.title).toBe("someone else's")
	})

	it("accepts its expectedRevision after a save that changed nothing", async () => {
		const { id, revision } = await chart()
		await resave(id)
		await edit(id, "mine", { expectedRevision: revision })
		expect((await stored(id)).labelsConfig.title).toBe("mine")
	})

	it("refuses when the chart changes while the edit runs", async () => {
		const { id } = await chart()
		let reads = 0
		const racing: Api = {
			...api,
			visual: async (wanted) => {
				// The second read is the one just before the PUT.
				if (++reads === 2) await api.putVisual({ ...(await stored(wanted)), name: "saved meanwhile" })
				return api.visual(wanted)
			},
		}
		const e = await refusal(call("chart edit", { id, patch: { title: "mine" } }, { api: racing, undo: memoryUndo() }))
		expect(e.code).toBe("stale")
		expect((await stored(id)).name).toBe("saved meanwhile")
	})

	it("refuses a chart in the stock Examples folder, and a move into it", async () => {
		const example = await chart()
		await api.putVisual({ ...(await stored(example.id)), folderId: PUBLIC_SEED_FOLDER_IDS[0] })
		const e = await refusal(edit(example.id, "t"))
		expect(e.code).toBe("invalid")
		expect(e.problems?.[0].message).toContain("read-only")
		const mine = await chart()
		const move = await refusal(call("chart edit", { id: mine.id, patch: { folderId: PUBLIC_SEED_FOLDER_IDS[0] } }))
		expect(move.problems?.[0]).toMatchObject({ path: "folderId" })
		expect((await stored(mine.id)).folderId).toBeNull()
	})
})

describe("chart undo", () => {
	it("refuses with nothing to undo: no entry, an empty stack, or another chart's undo", async () => {
		const { id } = await chart()
		expect((await refusal(call("chart undo", { id }))).code).toBe("nothing_to_undo")
		expect((await refusal(call("chart undo", { id, caller: "nobody" }))).code).toBe("nothing_to_undo")
		const other = await chart()
		const { undo } = await edit(other.id, "t")
		expect((await refusal(call("chart undo", { id, undo }))).code).toBe("nothing_to_undo")
	})

	it("steps back three edits in a row from the caller's stack", async () => {
		const { id } = await chart()
		const original = await stored(id)
		for (const title of ["one", "two", "three"]) await edit(id, title, { caller: "s2" })
		for (const title of ["two", "one", ""]) {
			await call("chart undo", { id, caller: "s2" })
			expect((await stored(id)).labelsConfig.title).toBe(title)
		}
		expect(revisionOf(await stored(id))).toBe(revisionOf(original))
		expect((await refusal(call("chart undo", { id, caller: "s2" }))).code).toBe("nothing_to_undo")
	})

	it("keeps each caller's stack apart", async () => {
		const { id } = await chart()
		await edit(id, "a's", { caller: "a" })
		expect((await refusal(call("chart undo", { id, caller: "b" }))).code).toBe("nothing_to_undo")
		await call("chart undo", { id, caller: "a" })
		expect((await stored(id)).labelsConfig.title).toBe("")
	})

	it("undoes after a save that changed nothing, as opening the editor does", async () => {
		const { id } = await chart()
		const { undo } = await edit(id, "t")
		await resave(id)
		await call("chart undo", { id, undo })
		expect((await stored(id)).labelsConfig.title).toBe("")
	})

	it("refuses once the chart changed after that edit, and keeps the entry", async () => {
		const { id } = await chart()
		await edit(id, "mine", { caller: "c" })
		await edit(id, "theirs")
		const e = await refusal(call("chart undo", { id, caller: "c" }))
		expect(e.code).toBe("stale")
		expect((await stored(id)).labelsConfig.title).toBe("theirs")
		await edit(id, "mine")
		await call("chart undo", { id, caller: "c" })
		expect((await stored(id)).labelsConfig.title).toBe("")
	})
})

describe("guide", () => {
	it("is mcp/guide/agent-guide.md as is", async () => {
		const file = readFileSync(new URL("../../mcp/guide/agent-guide.md", import.meta.url), "utf8")
		expect((await call("guide", {})).markdown).toBe(file)
	})
})
