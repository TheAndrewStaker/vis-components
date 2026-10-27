import { describe, expect, it } from "vitest"
import type { DerivedVariable } from "./derivedVariables"
import {
	bakeTransforms,
	dropColumn,
	moveField,
	storedFields,
} from "./materializeTransforms"
import { DEFAULT_RESHAPE_CONFIG } from "./reshape"
import type { DatasetView, Field } from "./types"

const FIELDS: Field[] = [
	{ name: "store", inferredType: "categorical" },
	{ name: "monday", inferredType: "quantitative" },
	{ name: "tuesday", inferredType: "quantitative" },
]

const view = (rows: DatasetView["rows"], fields = FIELDS): DatasetView => ({
	id: "ds",
	name: "d",
	filename: "d.csv",
	fields,
	rows,
	createdAt: 0,
	versionId: "v1",
	versionIndex: 1,
	totalVersions: 1,
	isLatest: true,
	versionCreatedAt: 0,
})

const ROWS = [
	{ store: "A", monday: "$1,000", tuesday: "2" },
	{ store: "B", monday: "$3,000", tuesday: "4" },
]

const total: DerivedVariable = {
	id: "t",
	name: "total",
	kind: "math",
	math: { formula: "{monday} + {tuesday}" },
}

describe("bakeTransforms", () => {
	it("keeps original cells as imported and writes only the new columns, computed over converted cells", () => {
		const baked = bakeTransforms(view(ROWS), {}, DEFAULT_RESHAPE_CONFIG, {
			variables: [total],
		})
		expect(baked.reshaped).toBe(false)
		expect(baked.variables).toEqual([total])
		expect(baked.fields.map((f) => f.name)).toEqual(["store", "monday", "tuesday", "total"])
		// No view-time annotations on stored fields.
		expect(baked.fields.every((f) => !("derived" in f) && !("formatHint" in f))).toBe(true)
		expect(baked.rows[0]).toEqual({ store: "A", monday: "$1,000", tuesday: "2", total: "1002" })
	})

	it("passes the table through untouched when nothing applies", () => {
		const v = view(ROWS)
		const baked = bakeTransforms(v, {}, DEFAULT_RESHAPE_CONFIG, { variables: [] })
		expect(baked.rows).toBe(v.rows)
		expect(baked.variables).toEqual([])
		// A variable that can't apply (missing column) is just not here.
		const broken = bakeTransforms(v, {}, DEFAULT_RESHAPE_CONFIG, {
			variables: [{ ...total, math: { formula: "{nope} + 1" } }],
		})
		expect(broken.variables).toEqual([])
		expect(broken.rows).toBe(v.rows)
	})

	it("runs a variable the reshape uses before the melt and the rest after it", () => {
		const sign: DerivedVariable = {
			id: "s",
			name: "sign",
			kind: "rules",
			rules: { rules: [{ condition: "{value} > 2", output: "big" }], fallback: "small" },
		}
		const baked = bakeTransforms(
			view(ROWS),
			{},
			{
				idFields: ["store", "total"],
				meltFields: ["monday", "tuesday"],
				variableName: "day",
				valueName: "value",
			},
			{ variables: [total, sign] }
		)
		expect(baked.reshaped).toBe(true)
		expect(baked.wide.fields.map((f) => f.name)).toEqual(["store", "monday", "tuesday", "total"])
		expect(baked.fields.map((f) => f.name)).toEqual(["store", "total", "day", "value", "sign"])
		expect(baked.variables.map((v) => v.name)).toEqual(["total", "sign"])
		expect(baked.rows).toEqual([
			{ store: "A", total: "1002", day: "monday", value: "$1,000", sign: "big" },
			{ store: "A", total: "1002", day: "tuesday", value: "2", sign: "small" },
			{ store: "B", total: "3004", day: "monday", value: "$3,000", sign: "big" },
			{ store: "B", total: "3004", day: "tuesday", value: "4", sign: "big" },
		])
	})

	it("saves a blank-named variable under its positional default", () => {
		const baked = bakeTransforms(view(ROWS), {}, DEFAULT_RESHAPE_CONFIG, {
			variables: [{ ...total, name: "  " }],
		})
		expect(baked.variables[0]?.name).toBe("Variable 1")
		expect(baked.fields.at(-1)?.name).toBe("Variable 1")
	})
})

describe("dropColumn / moveField / storedFields", () => {
	it("removes a column from fields and rows", () => {
		const out = dropColumn({ fields: FIELDS, rows: ROWS }, "monday")
		expect(out.fields.map((f) => f.name)).toEqual(["store", "tuesday"])
		expect(out.rows[0]).toEqual({ store: "A", tuesday: "2" })
	})

	it("moves a field to an index, same reference when already there", () => {
		expect(moveField(FIELDS, "tuesday", 0).map((f) => f.name)).toEqual([
			"tuesday",
			"store",
			"monday",
		])
		expect(moveField(FIELDS, "store", 0)).toBe(FIELDS)
		expect(moveField(FIELDS, "nope", 0)).toBe(FIELDS)
	})

	it("strips the view-time annotations", () => {
		expect(
			storedFields([
				{ name: "a", inferredType: "quantitative", derived: true, formatHint: "dollar", displayCells: {} },
			])
		).toEqual([{ name: "a", inferredType: "quantitative" }])
	})
})

describe("bakeTransforms — long → wide pivot", () => {
	const LONG: Field[] = [
		{ name: "store", inferredType: "categorical" },
		{ name: "day", inferredType: "categorical" },
		{ name: "sales", inferredType: "quantitative" },
	]
	const LONG_ROWS = [
		{ store: "A", day: "monday", sales: "$1,000" },
		{ store: "A", day: "tuesday", sales: "2" },
		{ store: "B", day: "monday", sales: "$3,000" },
		{ store: "B", day: "tuesday", sales: "4" },
	]
	const pivot = { idFields: ["store"], keyFields: ["day"], valueFields: ["sales"] }

	it("spreads the long table out and keeps the original cells as imported", () => {
		const baked = bakeTransforms(view(LONG_ROWS, LONG), {}, DEFAULT_RESHAPE_CONFIG, { variables: [] }, pivot)
		expect(baked.pivoted).toBe(true)
		expect(baked.reshaped).toBe(false)
		expect(baked.fields.map((f) => f.name)).toEqual(["store", "monday", "tuesday"])
		expect(baked.rows).toEqual([
			{ store: "A", monday: "$1,000", tuesday: "2" },
			{ store: "B", monday: "$3,000", tuesday: "4" },
		])
		// `wide` is the table the pivot saw; `shaped` the table it made.
		expect(baked.wide.fields.map((f) => f.name)).toEqual(["store", "day", "sales"])
		expect(baked.shaped.fields).toEqual(baked.fields)
	})

	it("runs a variable the pivot fills with before it, and the rest after", () => {
		const doubled: DerivedVariable = {
			id: "d",
			name: "double",
			kind: "math",
			math: { formula: "{sales} * 2" },
		}
		const widthwise: DerivedVariable = {
			id: "w",
			name: "week",
			kind: "math",
			math: { formula: "{monday} + {tuesday}" },
		}
		const baked = bakeTransforms(
			view(LONG_ROWS, LONG),
			{},
			DEFAULT_RESHAPE_CONFIG,
			{ variables: [doubled, widthwise] },
			{ ...pivot, valueFields: ["double"] }
		)
		expect(baked.pivoted).toBe(true)
		expect(baked.variables.map((v) => v.name)).toEqual(["double", "week"])
		expect(baked.fields.map((f) => f.name)).toEqual(["store", "monday", "tuesday", "week"])
		expect(baked.rows[0]).toEqual({ store: "A", monday: "2000", tuesday: "4", week: "2004" })
	})

	it("is not pivoted without a split-out and a value column", () => {
		const baked = bakeTransforms(
			view(LONG_ROWS, LONG),
			{},
			DEFAULT_RESHAPE_CONFIG,
			{ variables: [] },
			{ idFields: ["store"], keyFields: ["day"], valueFields: [] }
		)
		expect(baked.pivoted).toBe(false)
		expect(baked.rows).toBe(LONG_ROWS)
	})
})
