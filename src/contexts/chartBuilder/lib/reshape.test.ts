import { describe, expect, it } from "vitest"
import {
	applyReshapeToView,
	DEFAULT_RESHAPE_CONFIG,
	meltDataset,
	meltVariableNameOf,
	presentGroups,
	presentMeltFields,
	reshapeApplies,
	reshapeIssues,
	type ReshapeConfig,
} from "./reshape"
import type { DatasetView, Field } from "./types"

const FIELDS: Field[] = [
	{ name: "store", inferredType: "categorical" },
	{ name: "monday", inferredType: "quantitative" },
	{ name: "tuesday", inferredType: "quantitative" },
	{ name: "wednesday", inferredType: "quantitative" },
	{ name: "notes", inferredType: "categorical" },
]

const ROWS = [
	{ store: "A", monday: "1", tuesday: "2", wednesday: "3", notes: "n1" },
	{ store: "B", monday: "4", tuesday: "5", wednesday: "6", notes: "n2" },
]

const config = (overrides: Partial<ReshapeConfig> = {}): ReshapeConfig => ({
	...DEFAULT_RESHAPE_CONFIG,
	idFields: ["store"],
	meltFields: ["monday", "tuesday", "wednesday"],
	variableName: "day",
	valueName: "sales",
	...overrides,
})

describe("meltDataset", () => {
	it("melts each row into one row per combined column", () => {
		const { fields, rows } = meltDataset(FIELDS, ROWS, config())
		expect(fields).toEqual([
			{ name: "store", inferredType: "categorical" },
			{ name: "day", inferredType: "categorical" },
			{ name: "sales", inferredType: "quantitative" },
		])
		expect(rows).toEqual([
			{ store: "A", day: "monday", sales: "1" },
			{ store: "A", day: "tuesday", sales: "2" },
			{ store: "A", day: "wednesday", sales: "3" },
			{ store: "B", day: "monday", sales: "4" },
			{ store: "B", day: "tuesday", sales: "5" },
			{ store: "B", day: "wednesday", sales: "6" },
		])
	})

	it("drops columns checked in neither list (notes)", () => {
		const { fields, rows } = meltDataset(FIELDS, ROWS, config())
		expect(fields.some((f) => f.name === "notes")).toBe(false)
		expect(rows.every((r) => !("notes" in r))).toBe(true)
	})

	it("melts in dataset column order regardless of check order", () => {
		const { rows } = meltDataset(
			FIELDS,
			ROWS,
			config({ meltFields: ["wednesday", "monday", "tuesday"] })
		)
		expect(rows.slice(0, 3).map((r) => r.day)).toEqual([
			"monday",
			"tuesday",
			"wednesday",
		])
	})

	it("keeps sparse/missing cells as empty strings", () => {
		// The CSV parser omits trailing keys on short rows.
		const { rows } = meltDataset(
			FIELDS,
			[{ store: "A", monday: "1" }],
			config()
		)
		expect(rows).toEqual([
			{ store: "A", day: "monday", sales: "1" },
			{ store: "A", day: "tuesday", sales: "" },
			{ store: "A", day: "wednesday", sales: "" },
		])
	})

	it("re-infers the value column's type (mixed sources → categorical)", () => {
		const { fields } = meltDataset(
			FIELDS,
			ROWS,
			config({ meltFields: ["monday", "notes"] })
		)
		expect(fields.find((f) => f.name === "sales")?.inferredType).toBe(
			"categorical"
		)
	})

	it("ignores stale field names and lets ID win over melt", () => {
		const { fields, rows } = meltDataset(
			FIELDS,
			ROWS,
			config({
				idFields: ["store", "gone", "monday"],
				meltFields: ["monday", "tuesday", "alsoGone"],
			})
		)
		expect(fields.map((f) => f.name)).toEqual([
			"store",
			"monday",
			"day",
			"sales",
		])
		expect(rows).toHaveLength(2)
		expect(rows[0]).toEqual({
			store: "A",
			monday: "1",
			day: "tuesday",
			sales: "2",
		})
	})

	it("trims the new column names", () => {
		const { rows } = meltDataset(
			FIELDS,
			ROWS,
			config({ variableName: " day ", valueName: " sales " })
		)
		expect(Object.keys(rows[0])).toEqual(["store", "day", "sales"])
	})
})

describe("reshapeIssues / reshapeApplies", () => {
	it("applies for a complete config", () => {
		expect(reshapeApplies(FIELDS, config())).toBe(true)
	})

	it("does not apply without any present melt column", () => {
		expect(reshapeApplies(FIELDS, config({ meltFields: [] }))).toBe(false)
		expect(reshapeApplies(FIELDS, config({ meltFields: ["gone"] }))).toBe(
			false
		)
	})

	it("blank names fall back to the defaults instead of blocking", () => {
		const c = config({ variableName: "", valueName: "  " })
		expect(reshapeIssues(FIELDS, c)).toEqual([])
		expect(reshapeApplies(FIELDS, c)).toBe(true)
		const { rows } = meltDataset(FIELDS, ROWS, c)
		expect(Object.keys(rows[0])).toEqual(["store", "category", "value"])
	})

	it("flags a blank box whose fallback collides with the other name", () => {
		// valueName blank → effective "value"; variableName typed as "value".
		const c = config({ variableName: "value", valueName: "" })
		expect(reshapeIssues(FIELDS, c)).toEqual([
			"The combined and value variables need different names.",
		])
		expect(reshapeApplies(FIELDS, c)).toBe(false)
	})

	it("flags the pair sharing one name", () => {
		const c = config({ variableName: "sales" })
		expect(reshapeIssues(FIELDS, c)).toEqual([
			"The combined and value variables need different names.",
		])
		expect(reshapeApplies(FIELDS, c)).toBe(false)
	})

	it("flags collisions with kept ID columns only", () => {
		const c = config({ variableName: "store" })
		expect(reshapeIssues(FIELDS, c)).toEqual([
			'"store" is already the name of an ID column.',
		])
		expect(reshapeApplies(FIELDS, c)).toBe(false)
		// Colliding with a MELTED column is fine — it's gone from the output.
		expect(reshapeIssues(FIELDS, config({ valueName: "monday" }))).toEqual([])
	})
})

describe("paired groups (extraGroups)", () => {
	// sales_2023, cost_2023, sales_2024, cost_2024 → year + sales + cost,
	// the classic multi-measure wide layout: the i-th column of every group
	// shares a row.
	const PAIRED_FIELDS: Field[] = [
		{ name: "store", inferredType: "categorical" },
		{ name: "sales_2023", inferredType: "quantitative" },
		{ name: "cost_2023", inferredType: "quantitative" },
		{ name: "sales_2024", inferredType: "quantitative" },
		{ name: "cost_2024", inferredType: "quantitative" },
	]
	const PAIRED_ROWS = [
		{ store: "A", sales_2023: "10", cost_2023: "6", sales_2024: "12", cost_2024: "7" },
	]
	const paired = (over: Partial<ReshapeConfig> = {}): ReshapeConfig => ({
		idFields: ["store"],
		meltFields: ["sales_2023", "sales_2024"],
		variableName: "year",
		valueName: "sales",
		extraGroups: [
			{ meltFields: ["cost_2023", "cost_2024"], variableName: "cost of", valueName: "cost" },
		],
		...over,
	})

	it("pairs the groups' columns by position, one row per position", () => {
		const { fields, rows } = meltDataset(PAIRED_FIELDS, PAIRED_ROWS, paired())
		expect(fields.map((f) => [f.name, f.inferredType])).toEqual([
			["store", "categorical"],
			["year", "categorical"],
			["sales", "quantitative"],
			["cost of", "categorical"],
			["cost", "quantitative"],
		])
		expect(rows).toEqual([
			{ store: "A", year: "sales_2023", sales: "10", "cost of": "cost_2023", cost: "6" },
			{ store: "A", year: "sales_2024", sales: "12", "cost of": "cost_2024", cost: "7" },
		])
	})

	it("pads a shorter group with blank cells past its last column", () => {
		const { rows } = meltDataset(
			PAIRED_FIELDS,
			PAIRED_ROWS,
			paired({
				extraGroups: [
					{ meltFields: ["cost_2023"], variableName: "cost of", valueName: "cost" },
				],
			})
		)
		expect(rows).toEqual([
			{ store: "A", year: "sales_2023", sales: "10", "cost of": "cost_2023", cost: "6" },
			{ store: "A", year: "sales_2024", sales: "12", "cost of": "", cost: "" },
		])
	})

	it("a longer extra group sets the depth; the first group pads", () => {
		const { rows } = meltDataset(
			PAIRED_FIELDS,
			PAIRED_ROWS,
			paired({ meltFields: ["sales_2023"] })
		)
		expect(rows.map((r) => [r.year, r.sales, r["cost of"], r.cost])).toEqual([
			["sales_2023", "10", "cost_2023", "6"],
			["", "", "cost_2024", "7"],
		])
	})

	it("blank extra-group names fall back to numbered defaults", () => {
		const { fields } = meltDataset(
			PAIRED_FIELDS,
			PAIRED_ROWS,
			paired({
				variableName: "",
				valueName: "",
				extraGroups: [
					{ meltFields: ["cost_2023", "cost_2024"], variableName: " ", valueName: "" },
				],
			})
		)
		expect(fields.map((f) => f.name)).toEqual([
			"store",
			"category",
			"value",
			"category 2",
			"value 2",
		])
	})

	it("a group with no present column mints nothing; an empty first group still melts the rest", () => {
		const c = paired({ meltFields: ["gone"] })
		expect(reshapeApplies(PAIRED_FIELDS, c)).toBe(true)
		const { fields } = meltDataset(PAIRED_FIELDS, PAIRED_ROWS, c)
		expect(fields.map((f) => f.name)).toEqual(["store", "cost of", "cost"])
		// And an extra group pointing at nothing is simply ignored.
		expect(
			meltDataset(
				PAIRED_FIELDS,
				PAIRED_ROWS,
				paired({ extraGroups: [{ meltFields: [], variableName: "x", valueName: "y" }] })
			).fields.map((f) => f.name)
		).toEqual(["store", "year", "sales"])
	})

	it("ID wins over any group, and an earlier group wins over a later one", () => {
		const c = paired({
			idFields: ["store", "cost_2023"],
			extraGroups: [
				{ meltFields: ["sales_2023", "cost_2023", "cost_2024"], variableName: "k", valueName: "v" },
			],
		})
		expect(presentGroups(PAIRED_FIELDS, c).map((g) => g.fields.map((f) => f.name))).toEqual([
			["sales_2023", "sales_2024"],
			["cost_2024"],
		])
		expect(presentMeltFields(PAIRED_FIELDS, c).map((f) => f.name)).toEqual([
			"sales_2023",
			"sales_2024",
			"cost_2024",
		])
	})

	it("flags names shared between groups, and a group's own pair sharing a name", () => {
		expect(
			reshapeIssues(
				PAIRED_FIELDS,
				paired({
					extraGroups: [
						{ meltFields: ["cost_2023"], variableName: "year", valueName: "sales" },
					],
				})
			)
		).toEqual(['"year" is used by two groups.', '"sales" is used by two groups.'])
		expect(
			reshapeIssues(
				PAIRED_FIELDS,
				paired({
					extraGroups: [{ meltFields: ["cost_2023"], variableName: "c", valueName: "c" }],
				})
			)
		).toEqual(["Group 2's combined and value variables need different names."])
		expect(
			reshapeIssues(
				PAIRED_FIELDS,
				paired({
					extraGroups: [{ meltFields: ["cost_2023"], variableName: "store", valueName: "c" }],
				})
			)
		).toEqual(['"store" is already the name of an ID column.'])
	})

	it("names the variable column a melted column lands in, per group", () => {
		expect(meltVariableNameOf(PAIRED_FIELDS, paired(), "sales_2024")).toBe("year")
		expect(meltVariableNameOf(PAIRED_FIELDS, paired(), "cost_2023")).toBe("cost of")
		expect(meltVariableNameOf(PAIRED_FIELDS, paired(), "store")).toBeUndefined()
	})

	it("a config without extraGroups behaves exactly as the single-group shape", () => {
		expect(meltDataset(FIELDS, ROWS, config())).toEqual(
			meltDataset(FIELDS, ROWS, { ...config(), extraGroups: [] })
		)
	})
})

describe("applyReshapeToView", () => {
	const view: DatasetView = {
		id: "ds-1",
		name: "sales",
		filename: "sales.csv",
		fields: FIELDS,
		rows: ROWS,
		createdAt: 0,
		versionId: "dv-1",
		versionIndex: 1,
		totalVersions: 1,
		isLatest: true,
		versionCreatedAt: 0,
	}

	it("returns the SAME view object when the reshape doesn't apply", () => {
		expect(applyReshapeToView(view, DEFAULT_RESHAPE_CONFIG)).toBe(view)
		expect(applyReshapeToView(view, config({ meltFields: [] }))).toBe(view)
		expect(applyReshapeToView(undefined, config())).toBeUndefined()
	})

	it("swaps fields/rows but keeps the version metadata", () => {
		const reshaped = applyReshapeToView(view, config())
		expect(reshaped).not.toBe(view)
		expect(reshaped?.rows).toHaveLength(6)
		expect(reshaped?.fields.map((f) => f.name)).toEqual([
			"store",
			"day",
			"sales",
		])
		expect(reshaped?.versionId).toBe("dv-1")
		expect(reshaped?.name).toBe("sales")
	})
})
