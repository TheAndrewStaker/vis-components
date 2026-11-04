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
	UNDO_DEPTH,
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
	it("refuses an unknown command with a did-you-mean", async () => {
		const e = await refusal(call("chart gte", {}))
		expect(e.code).toBe("usage")
		expect(e.message).toContain('did you mean "chart get"')
	})

	it.each(COMMANDS.map((c) => c.name))("%s refuses an unknown input key instead of dropping it", async (name) => {
		const e = await refusal(call(name, { extraKey: 1 }))
		expect(e.code).toBe("usage")
		expect(e.problems).toContainEqual({ path: "extraKey", message: 'unknown input "extraKey"' })
	})

	it("names an unknown key inside undo, and a wrong type", async () => {
		const e = await refusal(call("chart undo", { id: "x", undo: { previous: {}, wrote: "r", by: "me" } }))
		expect(e.problems).toContainEqual({ path: "undo.by", message: 'unknown input "by"' })
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

	it("reports an unreachable server as failed", async () => {
		const e = await refusal(call("chart get", { id: "x" }, { api: createApi("http://127.0.0.1:1"), undo: memoryUndo() }))
		expect(e.code).toBe("failed")
		expect(e.message).toContain("Could not reach")
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

	it("is the same on every call", () => {
		expect(JSON.stringify(manifest())).toBe(JSON.stringify(manifest()))
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
	it("refuses a missing data set and the stock Examples folder together", async () => {
		const e = await refusal(
			call("chart create", {
				spec: { datasetId: "ds-none", folderId: PUBLIC_SEED_FOLDER_IDS[0], encodings: { x: "a" } },
			})
		)
		expect(e.code).toBe("invalid")
		expect(e.problems?.map((p) => p.path)).toEqual(["datasetId", "folderId"])
		expect(e.problems?.[1].message).toContain("read-only")
	})

	it("refuses an unknown theme, listing the themes", async () => {
		const e = await refusal(
			call("chart create", {
				spec: { datasetId: await dataset(), folderId: null, encodings: { x: "hospital" }, themeId: "Neon" },
			})
		)
		expect(e.code).toBe("invalid")
		expect(e.problems?.[0]).toMatchObject({ path: "themeId" })
		expect(e.problems?.[0].message).toContain("system-dark")
	})

	it("refuses a spec the lib finds problems in, with its problems", async () => {
		const e = await refusal(
			call("chart create", {
				spec: { datasetId: await dataset(), folderId: null, encodings: { x: "hospitl" } },
			})
		)
		expect(e.code).toBe("invalid")
		expect(e.problems?.[0].path).toBe("encodings.x")
	})

	it("writes nothing in preview mode", async () => {
		const out = await call("chart create", {
			spec: { datasetId: await dataset(), folderId: null, encodings: { x: "hospital", length: "rate" } },
			mode: "preview",
		})
		expect(out.written).toBe(false)
		expect(await api.visual(out.id)).toBeNull()
	})

	it("returns the stored chart's revision", async () => {
		const out = await chart()
		expect(out.written).toBe(true)
		expect(revisionOf(await stored(out.id))).toBe(out.revision)
	})
})

describe("chart get", () => {
	it("refuses an unknown id as not_found", async () => {
		expect((await refusal(call("chart get", { id: "vs-none" }))).code).toBe("not_found")
	})

	it("returns the chart and its revision", async () => {
		const { id, revision } = await chart()
		expect(await call("chart get", { id })).toMatchObject({ visual: { id }, revision })
	})
})

describe("chart edit", () => {
	it("refuses an unknown id as not_found", async () => {
		expect((await refusal(edit("vs-none", "t"))).code).toBe("not_found")
	})

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

	it("refuses a trashed chart, and edits one whose deletedAt is null", async () => {
		const trashed = await chart()
		await api.putVisual({ ...(await stored(trashed.id)), deletedAt: Date.now() })
		expect((await refusal(edit(trashed.id, "t"))).code).toBe("conflict")
		const restored = await chart()
		await api.putVisual({ ...(await stored(restored.id)), deletedAt: null } as unknown as Visual)
		await edit(restored.id, "back")
		expect((await stored(restored.id)).labelsConfig.title).toBe("back")
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

	it("refuses a move to a folder that doesn't exist", async () => {
		const { id } = await chart()
		const e = await refusal(call("chart edit", { id, patch: { folderId: "fl-none" } }))
		expect(e.problems?.[0].message).toContain('no folder with id "fl-none"')
	})

	it("refuses a patch the lib finds problems in, and writes nothing", async () => {
		const { id, revision } = await chart()
		const e = await refusal(call("chart edit", { id, patch: { encodings: { x: "hospitl" } } }))
		expect(e.code).toBe("invalid")
		expect(revisionOf(await stored(id))).toBe(revision)
	})

	it("writes nothing in preview mode, and returns what it would write", async () => {
		const { id, revision } = await chart()
		const out = await edit(id, "maybe", { mode: "preview" })
		expect(out).toMatchObject({ written: false, previousRevision: revision })
		expect(out.visual.labelsConfig.title).toBe("maybe")
		expect(revisionOf(await stored(id))).toBe(revision)
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

	it("refuses to put a chart back into, or over one in, the stock Examples folder", async () => {
		const { id } = await chart()
		const { undo } = await edit(id, "t")
		const planted = { ...undo, previous: { ...undo.previous, folderId: PUBLIC_SEED_FOLDER_IDS[0] } }
		const e = await refusal(call("chart undo", { id, undo: planted }))
		expect(e.code).toBe("invalid")
		expect((await stored(id)).labelsConfig.title).toBe("t")
	})
})

describe("dataset create", () => {
	it("refuses rows the lib can't store, with its problems", async () => {
		const e = await refusal(call("dataset create", { name: "empty", rows: [] }))
		expect(e.code).toBe("invalid")
		expect(e.problems?.length).toBeGreaterThan(0)
	})

	it("reuses identical data under the same name, and refuses different data by that name", async () => {
		const rows = [{ a: "x", b: 1 }]
		const first = await call("dataset create", { name: "Reuse me", rows })
		expect(first.reused).toBe(false)
		const again = await call("dataset create", { name: "Reuse me", rows })
		expect(again).toMatchObject({ id: first.id, reused: true })
		const e = await refusal(call("dataset create", { name: "Reuse me", rows: [{ a: "y", b: 2 }] }))
		expect(e.code).toBe("conflict")
	})
})

describe("dataset fields", () => {
	it("refuses an unknown id as not_found", async () => {
		expect((await refusal(call("dataset fields", { id: "ds-none" }))).code).toBe("not_found")
	})

	it("returns the fields, versions and latest version", async () => {
		const id = await dataset()
		const out = await call("dataset fields", { id })
		expect(out.fields.map((f: { name: string }) => f.name)).toEqual(["hospital", "rate"])
		expect(out.versions).toHaveLength(1)
		expect(out.latestVersionId).toBe(out.versions[0].id)
	})
})

describe("settings list", () => {
	it("refuses an unknown slice with a did-you-mean", async () => {
		const e = await refusal(call("settings list", { slice: "legendConfg" }))
		expect(e.code).toBe("invalid")
		expect(e.message).toContain('did you mean "legendConfig"')
	})

	it("refuses an unknown chart as not_found", async () => {
		expect((await refusal(call("settings list", { chartId: "vs-none" }))).code).toBe("not_found")
	})

	it("adds a chart's stored slices, keys and palettes", async () => {
		const { id } = await chart()
		const out = await call("settings list", { chartId: id, query: "legend" })
		expect(out.total).toBeGreaterThan(0)
		expect(out.stored).toHaveProperty("channelConfigs")
		expect(out.palettes.categorical.length).toBeGreaterThan(0)
	})
})

describe("vocabulary and guide", () => {
	it("vocabulary names spec keys, channels, families, slices, themes and folders", async () => {
		const out = await call("vocabulary", {})
		expect(Object.keys(out.specKeys)).toContain("encodings")
		expect(out.channels.find((c: { name: string }) => c.name === "x")).toHaveProperty("label")
		expect(out.settingsFamilies.map((f: { chart: string }) => f.chart)).toContain("map")
		expect(out.themes.filter((t: { default: boolean }) => t.default)).toHaveLength(1)
	})

	it("guide is mcp/guide/agent-guide.md as is", async () => {
		const file = readFileSync(new URL("../../mcp/guide/agent-guide.md", import.meta.url), "utf8")
		expect((await call("guide", {})).markdown).toBe(file)
	})
})

describe("memoryUndo", () => {
	it(`keeps the last ${UNDO_DEPTH} entries per caller and chart`, async () => {
		const store = memoryUndo()
		const entry = (n: number) => ({ previous: { id: "v" } as Visual, wrote: String(n) })
		for (let n = 0; n < UNDO_DEPTH + 5; n++) await store.push("c", "v", entry(n))
		const popped: string[] = []
		for (let e = await store.pop("c", "v"); e; e = await store.pop("c", "v")) popped.push(e.wrote)
		expect(popped).toHaveLength(UNDO_DEPTH)
		expect(popped[0]).toBe(String(UNDO_DEPTH + 4))
	})
})
