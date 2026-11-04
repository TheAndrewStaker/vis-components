// @vitest-environment node
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { describe, expect, it } from "vitest"

import { CONTENT_VERSION_HEADER } from "../../src/contexts/chartBuilder/lib/storage/contentVersionHeader"
import { VISUALS_VERSION } from "../../src/contexts/chartBuilder/lib/storage/migrations"
import { SYSTEM_THEMES, themeOf } from "../../src/contexts/chartBuilder/lib/systemThemes"
import type { DatasetMeta, SavedTheme, Visual } from "../../src/contexts/chartBuilder/lib/types"
import { createApi } from "./api"
import type { SpecProblem } from "../../src/contexts/chartBuilder/lib/chartSpec"
import { createHandlers } from "./tools"

type Call = { method: string; path: string; headers: Record<string, string>; body?: string }

/** An in-memory stand-in for the self-host API that records every call. */
const fakeServer = (stamps: Record<string, number> = {}) => {
	const calls: Call[] = []
	/** Runs before each read of the visuals collection (an editor save
	 *  landing between the MCP's reads). */
	const hooks: { beforeVisualsRead?: (visuals: Map<string, Visual>, read: number) => void } = {}
	let visualReads = 0
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
			if (path === "/api/visuals?thumbnails=0") {
				hooks.beforeVisualsRead?.(visuals, ++visualReads)
				return json([...visuals.values()])
			}
			if (["/api/folders", "/api/themes", "/api/settings"].includes(path)) return json([])
			return new Response("not found", { status: 404 })
		}
		const body = JSON.parse(String(init?.body))
		if (parts[0] === "visuals") visuals.set(parts[1], body)
		if (parts[0] === "datasets" && parts.length === 2) datasets.set(parts[1], body)
		if (parts[0] === "datasets" && parts[2] === "meta") metas.set(parts[1], body)
		return new Response(null, { status: 204 })
	}) as typeof fetch
	return { calls, visuals, hooks, fetchImpl, writes: () => calls.filter((c) => c.method !== "GET") }
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

const lineChart = async () => {
	const s = await withDataset()
	const { id } = parsed(
		await s.tools.create_chart({
			datasetId: s.datasetId,
			folderId: null,
			encodings: { x: "year", y: "sales" },
		})
	)
	s.calls.length = 0
	return { ...s, id: id as string }
}

describe("settings", () => {
	it("applies settings on create and on edit", async () => {
		const s = await withDataset()
		const created = await s.tools.create_chart({
			datasetId: s.datasetId,
			folderId: null,
			encodings: { x: "year", y: "sales" },
			settings: { channelConfigs: { y: { gridlines: { enabled: false } } } },
		})
		expect(created.isError).toBeFalsy()
		const { id } = parsed(created)
		expect(s.visuals.get(id)?.channelConfigs.y?.gridlines?.enabled).toBe(false)
		const edited = await s.tools.edit_chart({
			id,
			patch: { settings: { legendConfig: { position: "bottom" } } },
		})
		expect(edited.isError).toBeFalsy()
		expect(s.visuals.get(id)?.legendConfig?.position).toBe("bottom")
		expect(s.visuals.get(id)?.channelConfigs.y?.gridlines?.enabled).toBe(false)
	})

	it("refuses a bad setting with nothing written", async () => {
		const s = await lineChart()
		const result = await s.tools.edit_chart({
			id: s.id,
			patch: { settings: { channelConfigs: { x: { gridline: {} } } } },
		})
		expect(result.isError).toBe(true)
		expect(parsed(result).problems[0].path).toBe("settings.channelConfigs.x.gridline")
		expect(s.writes()).toEqual([])
	})

	it("get_chart returns the settings slices", async () => {
		const s = await lineChart()
		const out = parsed(await s.tools.get_chart({ id: s.id }))
		const settings = out.settings as Record<string, unknown>
		expect(Object.keys(settings)).toEqual(expect.arrayContaining(["channelConfigs", "labelsConfig"]))
		expect(settings).not.toHaveProperty("encodings")
		expect(settings).not.toHaveProperty("id")
	})

	it("agent_guide returns the bundled guide", async () => {
		const s = setup()
		const out = await s.tools.agent_guide(undefined)
		const text = (out.content[0] as { text: string }).text
		expect(text).toContain("# Zafiro agent guide")
		expect(text).toContain("Bar axes start at zero")
	})

	it("list_settings filters by slice and query, and refuses an unknown slice", async () => {
		const s = setup()
		const out = parsed(await s.tools.list_settings({ slice: "channelConfigs", query: "GRIDLINES.enabled" }))
		const rows = out.rows as Array<{ path: string; kinds: string[] }>
		expect(rows.length).toBeGreaterThan(0)
		expect(rows.every((r) => r.path.startsWith("channelConfigs.") && /gridlines\.enabled/i.test(r.path))).toBe(true)
		expect(rows.find((r) => r.path === "channelConfigs.x.gridlines.enabled")?.kinds).toEqual(["boolean"])
		const all = parsed(await s.tools.list_settings({}))
		expect(all.rows).toHaveLength(200)
		expect(all.note).toMatch(/narrow the query/)
		const bad = await s.tools.list_settings({ slice: "labelConfig" })
		expect(bad.isError).toBe(true)
		expect(parsed(bad).message).toContain('did you mean "labelsConfig"')
	})

	it("list_settings with a chart returns the keys its `*` paths take and the theme's palettes", async () => {
		const s = await withDataset()
		const created = parsed(
			await s.tools.create_chart({
				datasetId: s.datasetId,
				folderId: null,
				encodings: { x: "year", y: "sales", hue: "region", facet: "region" },
				settings: { dataLabelsEncodings: { value: { field: null, multiField: true, fields: ["sales"] } } },
			})
		)
		expect(created.id).toBeDefined()
		const out = parsed(await s.tools.list_settings({ chartId: created.id as string, query: "panelOrder" }))
		const keys = out.keys as { fields: string[]; levels: Record<string, string[]>; composedLabels: string[]; facetPanels: string[] }
		expect(keys.fields).toEqual(["year", "region", "sales"])
		expect(keys.levels).toEqual({ region: ["North", "South"] })
		expect(keys.facetPanels).toEqual(["North", "South"])
		expect(keys.composedLabels).toEqual(["sales"])
		const palettes = out.palettes as { categorical: Array<{ id: string; colors: string[] }> }
		expect(palettes.categorical.length).toBeGreaterThan(0)
		expect(palettes.categorical[0].colors[0]).toMatch(/^#/)
		const missing = await s.tools.list_settings({ chartId: "nope" })
		expect(missing.isError).toBe(true)
	})
})

describe("stale-edit guard", () => {
	const editorSave = (id: string) => (visuals: Map<string, Visual>, read: number) => {
		const v = visuals.get(id)
		if (read === 2 && v) visuals.set(id, { ...v, updatedAt: v.updatedAt + 1, name: "Editor" })
	}

	it("edit_chart refuses and writes nothing when the chart changed after it was read", async () => {
		const s = await lineChart()
		s.hooks.beforeVisualsRead = editorSave(s.id)
		const result = await s.tools.edit_chart({ id: s.id, patch: { title: "Mine" } })
		expect(result.isError).toBe(true)
		expect(parsed(result).message).toMatch(/changed in the editor since it was read/)
		expect(s.writes()).toEqual([])
		expect(s.visuals.get(s.id)?.name).toBe("Editor")
		expect((await s.tools.undo_chart_edit({ id: s.id })).isError).toBe(true)
	})

	it("undo_chart_edit refuses when the chart changed after the edit", async () => {
		const s = await lineChart()
		expect((await s.tools.edit_chart({ id: s.id, patch: { title: "Mine" } })).isError).toBeFalsy()
		const v = s.visuals.get(s.id) as Visual
		s.visuals.set(s.id, { ...v, updatedAt: v.updatedAt + 1 })
		s.calls.length = 0
		const result = await s.tools.undo_chart_edit({ id: s.id })
		expect(result.isError).toBe(true)
		expect(parsed(result).message).toMatch(/changed in the editor/)
		expect(s.writes()).toEqual([])
	})
})

describe("theme on edit", () => {
	it("re-themes by name and refuses an unknown theme", async () => {
		const s = await lineChart()
		const bad = await s.tools.edit_chart({ id: s.id, patch: { themeId: "no such theme" } })
		expect(bad.isError).toBe(true)
		expect(parsed(bad).problems[0].path).toBe("themeId")
		expect(s.writes()).toEqual([])
		const other = SYSTEM_THEMES.find((t) => t.id !== s.visuals.get(s.id)?.themeId) as SavedTheme
		const result = await s.tools.edit_chart({ id: s.id, patch: { themeId: other.name, title: "Kept" } })
		expect(result.isError).toBeFalsy()
		const v = s.visuals.get(s.id) as Visual
		expect(v.themeId).toBe(other.id)
		expect(v.labelsConfig.title).toBe("Kept")
		expect(v.channelConfigs.defaultFill).toBe(themeOf(other).defaultFill)
	})
})
