import { describe, expect, it } from "vitest"

import { datasetContentHash } from "./datasetDedupe"
import { API_ROWS_FILENAME, datasetFromRows } from "./datasetFromRows"
import type { DatasetMeta } from "./types"

const ROWS = [
	{ region: "East", sales: 10, day: "2020-01-01", flag: true },
	{ region: "West", sales: 12.5, day: "2020-01-02", flag: null },
	{ region: "North", day: "2020-01-03" },
]

describe("datasetFromRows", () => {
	it("stores text cells, every column, inferred types, one version and its hash", () => {
		const { dataset, problems, duplicateOf } = datasetFromRows({ name: " Sales ", rows: ROWS })
		expect(problems).toEqual([])
		expect(duplicateOf).toBeUndefined()
		expect(dataset.id).toMatch(/^ds-/)
		expect(dataset.name).toBe("Sales")
		expect(dataset.fields).toEqual([
			{ name: "region", inferredType: "categorical" },
			{ name: "sales", inferredType: "quantitative" },
			{ name: "day", inferredType: "temporal" },
			{ name: "flag", inferredType: "categorical" },
		])
		const [version] = dataset.versions
		expect(version).toMatchObject({ id: dataset.latestVersionId, filename: API_ROWS_FILENAME })
		expect(version?.rows[1]).toEqual({ region: "West", sales: "12.5", day: "2020-01-02", flag: "" })
		expect(version?.rows[2]).toEqual({ region: "North", sales: "", day: "2020-01-03", flag: "" })
		expect(dataset.contentHash).toBe(datasetContentHash(dataset))
	})

	it("honors a type override", () => {
		const { dataset } = datasetFromRows({ name: "s", rows: ROWS, types: { sales: "ordinal" } })
		expect(dataset.fields[1]).toEqual({ name: "sales", inferredType: "ordinal" })
	})

	it("names a same-named, same-content data set as the duplicate", () => {
		const first = datasetFromRows({ name: "Sales", rows: ROWS }).dataset
		const meta = { ...first, versions: [] } as unknown as DatasetMeta
		expect(datasetFromRows({ name: "Sales", rows: ROWS }, { existing: [meta] }).duplicateOf).toBe(
			first.id
		)
		expect(
			datasetFromRows({ name: "Sales", rows: ROWS.slice(1) }, { existing: [meta] }).duplicateOf
		).toBeUndefined()
	})

	it("refuses object cells, unknown type columns, and an empty body", () => {
		const { problems } = datasetFromRows({
			name: "s",
			rows: [{ a: 1, b: { nested: true } }],
			types: { c: "quantitative" },
		})
		expect(problems.map((p) => p.path)).toEqual(["rows[0].b", "types.c"])
		expect(datasetFromRows({ name: "", rows: [] }).problems.map((p) => p.path)).toEqual([
			"name",
			"rows",
		])
	})
})
