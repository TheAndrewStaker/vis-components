import { describe, expect, it } from "vitest"

import {
	buildDataTable,
	dataTableColumnNames,
	dataTableToCsv,
} from "./dataTable"
import {
	DEFAULT_DATA_TABLE_CONFIG,
	defaultDataTableCaption,
	migrateDataTableConfig,
} from "./dataTableConfig"
import { emptyEncodings, type DatasetView, type Encodings } from "./types"

const view = (over: Partial<DatasetView> = {}): DatasetView => ({
	id: "ds",
	name: "Sales",
	filename: "sales.csv",
	fields: [
		{ name: "region", inferredType: "categorical" },
		{ name: "size", inferredType: "ordinal" },
		{ name: "sales", inferredType: "quantitative" },
		{ name: "share", inferredType: "quantitative", formatHint: "percent" },
		{ name: "note", inferredType: "categorical" },
	],
	rows: [
		{ region: "West", size: "L", sales: "1200.5", share: "0.25", note: "a, b" },
		{ region: "East", size: "S", sales: "300", share: "0.1", note: 'say "hi"' },
		{ region: "North", size: "M", sales: "", share: "0.65", note: "" },
	],
	createdAt: 0,
	versionId: "v1",
	versionIndex: 1,
	totalVersions: 1,
	isLatest: true,
	versionCreatedAt: 0,
	...over,
})

const enc = (map: Partial<Record<keyof Encodings, string>>): Encodings => {
	const out = emptyEncodings()
	for (const [ch, field] of Object.entries(map))
		out[ch as keyof Encodings] = { field: field ?? null }
	return out
}

const build = (
	encodings: Encodings,
	extra: Partial<Parameters<typeof buildDataTable>[0]> = {}
) =>
	buildDataTable({
		view: view(),
		encodings,
		columns: "encoded",
		overrides: {},
		fieldLevelOrders: {},
		formats: new Map(),
		...extra,
	})

describe("dataTableColumnNames", () => {
	it("lists encoded fields in encoding order: positions, channels, facets last", () => {
		const e = enc({ facet: "note", hue: "size", y: "sales", x: "region" })
		expect(dataTableColumnNames(view(), e, "encoded")).toEqual([
			"region",
			"sales",
			"size",
			"note",
		])
	})

	it("puts dimensions before measures, each in encoding order", () => {
		// A horizontal chart: x is the measure, y the category.
		const e = enc({ x: "sales", y: "region", hue: "size", area: "share", facet: "note" })
		const typeOf = (f: string) =>
			view().fields.find((x) => x.name === f)?.inferredType ?? "categorical"
		expect(dataTableColumnNames(view(), e, "encoded", typeOf)).toEqual([
			"region",
			"size",
			"note",
			"sales",
			"share",
		])
	})

	it("lists a field mapped twice once", () => {
		const e = enc({ x: "region", hue: "region", length: "sales" })
		expect(dataTableColumnNames(view(), e, "encoded")).toEqual(["region", "sales"])
	})

	it("ignores fields the view no longer has", () => {
		const e = enc({ x: "region", y: "gone" })
		expect(dataTableColumnNames(view(), e, "encoded")).toEqual(["region"])
	})

	it("falls back to every column when nothing is mapped", () => {
		expect(dataTableColumnNames(view(), emptyEncodings(), "encoded")).toEqual([
			"region",
			"size",
			"sales",
			"share",
			"note",
		])
	})

	it('"all" lists every view column in view order', () => {
		expect(dataTableColumnNames(view(), enc({ x: "sales" }), "all")).toHaveLength(5)
	})
})

describe("buildDataTable", () => {
	it("orders a measure-on-x chart's columns dimension first", () => {
		const t = build(enc({ x: "sales", y: "region" }))
		expect(t.columns.map((c) => c.name)).toEqual(["region", "sales"])
	})

	it("prints cells through the tooltip's inherited formats", () => {
		const t = build(enc({ x: "region", y: "sales" }), {
			formats: new Map([["sales", "$,.0f"]]),
		})
		expect(t.columns.map((c) => [c.name, c.numeric])).toEqual([
			["region", false],
			["sales", true],
		])
		expect(t.rows.map((r) => r.cells.map((c) => c.text))).toEqual([
			["West", "$1,201"],
			["East", "$300"],
			["North", ""],
		])
		// Raw cells stay available for the CSV.
		expect(t.rows[0]?.cells[1]?.raw).toBe("1200.5")
	})

	it("falls back to a field's percent / dollar hint when nothing formats it", () => {
		const t = build(enc({ x: "share" }))
		expect(t.rows.map((r) => r.cells[0]?.text)).toEqual(["25%", "10%", "65%"])
	})

	it("keeps data order when no shown column has a level order", () => {
		const t = build(enc({ x: "region", y: "sales" }))
		expect(t.rows.map((r) => r.index)).toEqual([0, 1, 2])
	})

	it("follows a pinned level order", () => {
		const t = build(enc({ x: "region", y: "sales" }), {
			fieldLevelOrders: { region: ["North", "West", "East"] },
		})
		expect(t.rows.map((r) => r.cells[0]?.text)).toEqual(["North", "West", "East"])
	})

	it("smart-sorts an ordinal column", () => {
		const t = build(enc({ x: "size", y: "sales" }))
		expect(t.rows.map((r) => r.cells[0]?.text)).toEqual(["L", "M", "S"])
	})

	it("respects a type override", () => {
		const t = build(enc({ x: "share" }), { overrides: { share: "categorical" } })
		expect(t.columns[0]?.numeric).toBe(false)
	})
})

describe("dataTableToCsv", () => {
	it("writes headers and RAW cells, quoting where needed", () => {
		const t = build(enc({ x: "region", y: "note" }))
		expect(dataTableToCsv(t)).toBe(
			'region,note\nWest,"a, b"\nEast,"say ""hi"""\nNorth,'
		)
	})
})

describe("migrateDataTableConfig", () => {
	it("defaults an absent config (visuals saved before the table)", () => {
		expect(migrateDataTableConfig(undefined)).toEqual(DEFAULT_DATA_TABLE_CONFIG)
		expect(DEFAULT_DATA_TABLE_CONFIG.enabled).toBe(false)
	})

	it("fills a partial config and drops wrong-typed values", () => {
		const cfg = migrateDataTableConfig({
			enabled: true,
			placement: "sideways",
			maxRows: -3,
			fontSize: "12",
			textColor: "#123456",
			numberAlign: "center",
		})
		expect(cfg).toEqual({
			...DEFAULT_DATA_TABLE_CONFIG,
			enabled: true,
			textColor: "#123456",
			numberAlign: "center",
		})
	})

	it("is idempotent", () => {
		const once = migrateDataTableConfig({ enabled: true, maxRows: 25.4, caption: "x" })
		expect(migrateDataTableConfig(once)).toEqual(once)
		expect(once.maxRows).toBe(25)
	})
})

describe("defaultDataTableCaption", () => {
	it("prefers the chart title, then the visual name", () => {
		expect(defaultDataTableCaption("Sales by region", "Untitled")).toBe(
			"Data for Sales by region"
		)
		expect(defaultDataTableCaption("  ", "My chart")).toBe("Data for My chart")
		expect(defaultDataTableCaption("", "")).toBe("Data for this chart")
	})
})
