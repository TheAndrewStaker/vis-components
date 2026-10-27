import { describe, expect, it } from "vitest"
import {
	BLANK_KEY_LABEL,
	DEFAULT_PIVOT_CONFIG,
	allPivotFields,
	applyPivotToView,
	pivotApplies,
	pivotDataset,
	pivotIssues,
	pivotMintedNames,
	presentPivotFields,
	type PivotConfig,
} from "./pivot"
import type { DatasetView, Field } from "./types"

const FIELDS: Field[] = [
	{ name: "store", inferredType: "categorical" },
	{ name: "year", inferredType: "categorical" },
	{ name: "sales", inferredType: "quantitative" },
	{ name: "cost", inferredType: "quantitative" },
	{ name: "notes", inferredType: "categorical" },
]

const ROWS = [
	{ store: "A", year: "2023", sales: "1", cost: "10", notes: "n1" },
	{ store: "A", year: "2024", sales: "2", cost: "20", notes: "n2" },
	{ store: "B", year: "2023", sales: "3", cost: "30", notes: "n3" },
	{ store: "B", year: "2024", sales: "4", cost: "40", notes: "n4" },
]

const config = (overrides: Partial<PivotConfig> = {}): PivotConfig => ({
	...DEFAULT_PIVOT_CONFIG,
	idFields: ["store"],
	keyFields: ["year"],
	valueFields: ["sales"],
	...overrides,
})

describe("pivotDataset", () => {
	it("spreads one column's values into columns, one row per ID", () => {
		const { fields, rows, overwritten } = pivotDataset(FIELDS, ROWS, config())
		expect(overwritten).toEqual([0])
		expect(fields).toEqual([
			{ name: "store", inferredType: "categorical" },
			{ name: "2023", inferredType: "quantitative" },
			{ name: "2024", inferredType: "quantitative" },
		])
		expect(rows).toEqual([
			{ store: "A", "2023": "1", "2024": "2" },
			{ store: "B", "2023": "3", "2024": "4" },
		])
	})

	it("orders the new columns by first appearance and leaves unlisted columns out", () => {
		const rows = [ROWS[1]!, ROWS[0]!, ROWS[3]!, ROWS[2]!]
		const { fields, rows: out } = pivotDataset(FIELDS, rows, config())
		expect(fields.map((f) => f.name)).toEqual(["store", "2024", "2023"])
		expect(out.every((r) => !("notes" in r) && !("cost" in r))).toBe(true)
	})

	it("names columns by the value column too when several fill them (the inverse of paired groups)", () => {
		const { fields, rows } = pivotDataset(
			FIELDS,
			ROWS,
			config({ valueFields: ["sales", "cost"] })
		)
		expect(fields.map((f) => f.name)).toEqual([
			"store",
			"sales 2023",
			"cost 2023",
			"sales 2024",
			"cost 2024",
		])
		expect(rows[0]).toEqual({
			store: "A",
			"sales 2023": "1",
			"cost 2023": "10",
			"sales 2024": "2",
			"cost 2024": "20",
		})
	})

	it("joins two split-out columns' values to name a column", () => {
		const fields: Field[] = [...FIELDS, { name: "half", inferredType: "categorical" }]
		const rows = ROWS.map((r, i) => ({ ...r, half: i % 2 === 0 ? "H1" : "H2" }))
		const { fields: out } = pivotDataset(
			fields,
			rows,
			config({ keyFields: ["year", "half"] })
		)
		expect(out.map((f) => f.name)).toEqual(["store", "2023 H1", "2024 H2"])
	})

	it("leaves a cell blank where no row has that ID + split-out combination, and names a blank split-out cell", () => {
		const rows = [ROWS[0]!, ROWS[1]!, { ...ROWS[2]!, year: "" }]
		const { fields, rows: out } = pivotDataset(FIELDS, rows, config())
		expect(fields.map((f) => f.name)).toEqual(["store", "2023", "2024", BLANK_KEY_LABEL])
		expect(out[1]).toEqual({ store: "B", "2023": "", "2024": "", [BLANK_KEY_LABEL]: "3" })
	})

	it("lets the later row win when rows repeat an ID + split-out combination, and counts them", () => {
		const rows = [...ROWS, { store: "A", year: "2023", sales: "9", cost: "0", notes: "" }]
		const { rows: out, overwritten } = pivotDataset(FIELDS, rows, config())
		expect(out[0]).toEqual({ store: "A", "2023": "9", "2024": "2" })
		expect(overwritten).toEqual([1])
	})

	it("groups every row together when there is no ID column", () => {
		const { fields, rows } = pivotDataset(FIELDS, ROWS, config({ idFields: [] }))
		expect(fields.map((f) => f.name)).toEqual(["2023", "2024"])
		// Store B's rows came later and win.
		expect(rows).toEqual([{ "2023": "3", "2024": "4" }])
	})

	it("re-infers each new column's type from its cells", () => {
		const rows = ROWS.map((r) => (r.year === "2024" ? { ...r, sales: "high" } : r))
		const { fields } = pivotDataset(FIELDS, rows, config())
		expect(fields.map((f) => f.inferredType)).toEqual([
			"categorical",
			"quantitative",
			"categorical",
		])
	})

	it("keeps an ID column over a new column of the same name", () => {
		const rows = ROWS.map((r) => ({ ...r, year: r.year === "2023" ? "store" : r.year }))
		const { fields, rows: out } = pivotDataset(FIELDS, rows, config())
		expect(fields.map((f) => f.name)).toEqual(["store", "2024"])
		expect(out[0]).toEqual({ store: "A", "2024": "2" })
	})
})

describe("pivotDataset — groups", () => {
	const GROUPED: Field[] = [
		{ name: "store", inferredType: "categorical" },
		{ name: "day", inferredType: "categorical" },
		{ name: "sales", inferredType: "quantitative" },
		{ name: "region", inferredType: "categorical" },
		{ name: "cost", inferredType: "quantitative" },
	]
	// What a paired-group melt of `monday, tuesday, north, south` made.
	const GROUPED_ROWS = [
		{ store: "A", day: "monday", sales: "1", region: "north", cost: "10" },
		{ store: "A", day: "tuesday", sales: "2", region: "south", cost: "20" },
		{ store: "B", day: "monday", sales: "3", region: "north", cost: "30" },
		{ store: "B", day: "tuesday", sales: "4", region: "south", cost: "40" },
	]
	const grouped: PivotConfig = {
		idFields: ["store"],
		keyFields: ["day"],
		valueFields: ["sales"],
		extraGroups: [{ keyFields: ["region"], valueFields: ["cost"] }],
	}

	it("spreads each group beside the others on the same ID rows", () => {
		const { fields, rows, overwritten } = pivotDataset(GROUPED, GROUPED_ROWS, grouped)
		expect(fields.map((f) => f.name)).toEqual(["store", "monday", "tuesday", "north", "south"])
		expect(rows).toEqual([
			{ store: "A", monday: "1", tuesday: "2", north: "10", south: "20" },
			{ store: "B", monday: "3", tuesday: "4", north: "30", south: "40" },
		])
		expect(overwritten).toEqual([0, 0])
		expect(pivotMintedNames(GROUPED, GROUPED_ROWS, grouped)).toEqual([
			"monday",
			"tuesday",
			"north",
			"south",
		])
	})

	it("counts repeats per group", () => {
		const rows = GROUPED_ROWS.map((r) => ({ ...r, region: "north" }))
		const { rows: out, overwritten } = pivotDataset(GROUPED, rows, grouped)
		// One repeat per store: both of its rows say "north".
		expect(overwritten).toEqual([0, 2])
		expect(out[0]).toEqual({ store: "A", monday: "1", tuesday: "2", north: "20" })
	})

	it("flags a column two groups both make", () => {
		const rows = GROUPED_ROWS.map((r) => ({ ...r, region: r.day }))
		expect(pivotIssues(GROUPED, rows, grouped)).toEqual([
			'"monday" is made by two groups.',
			'"tuesday" is made by two groups.',
		])
		expect(pivotIssues(GROUPED, GROUPED_ROWS, grouped)).toEqual([])
	})

	it("lists every group's columns as used", () => {
		expect(allPivotFields(grouped)).toEqual(["store", "day", "sales", "region", "cost"])
	})
})

describe("presentPivotFields / pivotApplies", () => {
	it("gives a column to one list only — ID, then split-out, then value — and ignores stale names", () => {
		const present = presentPivotFields(
			FIELDS,
			config({
				idFields: ["store", "gone"],
				keyFields: ["store", "year"],
				valueFields: ["year", "sales"],
			})
		)
		expect(present.idFields.map((f) => f.name)).toEqual(["store"])
		expect(present.groups).toHaveLength(1)
		expect(present.groups[0]!.keyFields.map((f) => f.name)).toEqual(["year"])
		expect(present.groups[0]!.valueFields.map((f) => f.name)).toEqual(["sales"])
	})

	it("drops a group missing a split-out or a value column, keeping the others' config indexes", () => {
		const present = presentPivotFields(
			FIELDS,
			config({
				extraGroups: [
					{ keyFields: ["gone"], valueFields: [] },
					{ keyFields: ["notes"], valueFields: ["cost"] },
				],
			})
		)
		expect(present.groups.map((g) => g.index)).toEqual([0, 2])
		expect(present.groups[1]!.keyFields.map((f) => f.name)).toEqual(["notes"])
		// An earlier group's claim on a column holds even when that group
		// spreads nothing (a stale config; the panel keeps lists exclusive).
		const stale = presentPivotFields(
			FIELDS,
			config({
				extraGroups: [
					{ keyFields: ["gone"], valueFields: ["cost"] },
					{ keyFields: ["notes"], valueFields: ["cost"] },
				],
			})
		)
		expect(stale.groups.map((g) => g.index)).toEqual([0])
	})

	it("applies only with a present split-out column AND a present value column", () => {
		expect(pivotApplies(FIELDS, config())).toBe(true)
		expect(pivotApplies(FIELDS, config({ keyFields: [] }))).toBe(false)
		expect(pivotApplies(FIELDS, config({ valueFields: ["gone"] }))).toBe(false)
		expect(pivotApplies(FIELDS, DEFAULT_PIVOT_CONFIG)).toBe(false)
	})
})

describe("pivotMintedNames / pivotIssues", () => {
	it("lists the new columns in output order, nothing while the pivot doesn't apply", () => {
		expect(pivotMintedNames(FIELDS, ROWS, config())).toEqual(["2023", "2024"])
		expect(
			pivotMintedNames(FIELDS, ROWS, config({ valueFields: ["sales", "cost"] }))
		).toEqual(["sales 2023", "cost 2023", "sales 2024", "cost 2024"])
		expect(pivotMintedNames(FIELDS, ROWS, config({ keyFields: [] }))).toEqual([])
	})

	it("flags a new column that takes a kept ID column's name", () => {
		const rows = ROWS.map((r) => ({ ...r, year: r.year === "2023" ? "store" : r.year }))
		expect(pivotIssues(FIELDS, rows, config())).toEqual([
			'"store" is already the name of an ID column.',
		])
		expect(pivotIssues(FIELDS, ROWS, config())).toEqual([])
	})

	it("flags two split-out combinations that name the same column", () => {
		const fields: Field[] = [...FIELDS, { name: "half", inferredType: "categorical" }]
		const rows = [
			{ ...ROWS[0]!, year: "a b", half: "c" },
			{ ...ROWS[1]!, year: "a", half: "b c" },
		]
		expect(pivotIssues(fields, rows, config({ keyFields: ["year", "half"] }))).toEqual([
			'Two different split-out combinations both make "a b c".',
		])
		// Not an issue when both rows ARE the same combination.
		expect(
			pivotIssues(fields, [rows[0]!, rows[0]!], config({ keyFields: ["year", "half"] }))
		).toEqual([])
	})
})

describe("applyPivotToView", () => {
	const view: DatasetView = {
		id: "ds",
		name: "d",
		filename: "d.csv",
		fields: FIELDS,
		rows: ROWS,
		createdAt: 0,
		versionId: "v1",
		versionIndex: 1,
		totalVersions: 1,
		isLatest: true,
		versionCreatedAt: 0,
	}

	it("passes the view through untouched when the pivot doesn't apply", () => {
		expect(applyPivotToView(view, undefined)).toBe(view)
		expect(applyPivotToView(view, DEFAULT_PIVOT_CONFIG)).toBe(view)
		expect(applyPivotToView(undefined, config())).toBeUndefined()
	})

	it("pivots the view's fields and rows", () => {
		const out = applyPivotToView(view, config())!
		expect(out.fields.map((f) => f.name)).toEqual(["store", "2023", "2024"])
		expect(out.rows).toHaveLength(2)
		expect(out.id).toBe("ds")
	})
})
