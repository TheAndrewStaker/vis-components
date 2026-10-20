import { describe, expect, it } from "vitest"
import {
	alignEditedRows,
	editBaseVersionId,
	isHandEditedDataset,
	planEditedFields,
} from "./datasetEdits"
import type { Field } from "./types"

const q = (name: string): Field => ({ name, inferredType: "quantitative" })
const c = (name: string): Field => ({ name, inferredType: "categorical" })

describe("planEditedFields", () => {
	const source: Field[] = [c("city"), q("sales"), q("units")]

	it("keeps same-named columns, in the edited order", () => {
		const plan = planEditedFields(source, [q("units"), c("city"), q("sales")], {
			keepDropped: false,
			keepTypes: false,
		})
		expect(plan.fields.map((f) => f.name)).toEqual(["units", "city", "sales"])
		expect(plan.renames).toEqual([])
		expect(plan.added).toEqual([])
		expect(plan.dropped).toEqual([])
	})

	it("reads a changed header as a rename that remembers the old name", () => {
		const plan = planEditedFields(source, [c("city"), q("revenue"), q("units")], {
			keepDropped: false,
			keepTypes: false,
		})
		expect(plan.renames).toEqual([{ from: "sales", to: "revenue" }])
		expect(plan.fields[1]).toEqual({
			name: "revenue",
			inferredType: "quantitative",
			sourceNames: ["sales"],
		})
	})

	it("pairs several changed headers in order", () => {
		const plan = planEditedFields(source, [c("town"), q("sales"), q("qty")], {
			keepDropped: false,
			keepTypes: false,
		})
		expect(plan.renames).toEqual([
			{ from: "city", to: "town" },
			{ from: "units", to: "qty" },
		])
	})

	it("matches a former name to its field without renaming", () => {
		const renamed: Field[] = [
			c("city"),
			{ name: "revenue", inferredType: "quantitative", sourceNames: ["sales"] },
		]
		const plan = planEditedFields(renamed, [c("city"), q("sales")], {
			keepDropped: false,
			keepTypes: false,
		})
		expect(plan.renames).toEqual([])
		expect(plan.fields[1]).toBe(renamed[1])
	})

	it("adds and drops columns when the counts don't pair up", () => {
		const fork = planEditedFields(
			source,
			[c("city"), q("sales"), q("units"), c("note")],
			{
				keepDropped: false,
				keepTypes: false,
			}
		)
		expect(fork.added).toEqual(["note"])
		expect(fork.fields.at(-1)).toEqual({
			name: "note",
			inferredType: "categorical",
		})

		const dropped = planEditedFields(source, [c("city"), q("sales")], {
			keepDropped: false,
			keepTypes: false,
		})
		expect(dropped.dropped).toEqual(["units"])
		expect(dropped.fields.map((f) => f.name)).toEqual(["city", "sales"])

		const kept = planEditedFields(source, [c("city"), q("sales")], {
			keepDropped: true,
			keepTypes: true,
		})
		expect(kept.dropped).toEqual(["units"])
		expect(kept.fields.map((f) => f.name)).toEqual(["city", "sales", "units"])
	})

	it("keeps the stored type when compatible, takes the new one otherwise on a fork", () => {
		const widened = planEditedFields(
			[c("code"), q("sales")],
			[q("code"), c("sales")],
			{
				keepDropped: false,
				keepTypes: false,
			}
		)
		// categorical → quantitative is the lenient direction: stored wins.
		expect(widened.fields[0]?.inferredType).toBe("categorical")
		// quantitative → categorical (text landed in the column): the edit wins.
		expect(widened.fields[1]?.inferredType).toBe("categorical")

		const pinned = planEditedFields(
			[c("code"), q("sales")],
			[q("code"), c("sales")],
			{
				keepDropped: true,
				keepTypes: true,
			}
		)
		expect(pinned.fields.map((f) => f.inferredType)).toEqual([
			"categorical",
			"quantitative",
		])
	})
})

describe("alignEditedRows", () => {
	const F = ["city", "sales"]
	const base = [
		{ city: "Lima", sales: "10" },
		{ city: "Quito", sales: "20" },
		{ city: "Bogotá", sales: "30" },
	]

	it("reports nothing for identical rows", () => {
		const r = alignEditedRows(
			base,
			base.map((row) => ({ ...row })),
			F
		)
		expect(r.cells.size).toBe(0)
		expect(r.changedCellCount).toBe(0)
		expect(r.addedRowCount).toBe(0)
		expect(r.removedRowCount).toBe(0)
	})

	it("outlines exactly the changed cell", () => {
		const edited = [base[0]!, { city: "Quito", sales: "25" }, base[2]!]
		const r = alignEditedRows(base, edited, F)
		expect([...r.cells.entries()].map(([i, s]) => [i, [...s]])).toEqual([
			[1, ["sales"]],
		])
		expect(r.changedCellCount).toBe(1)
	})

	it("keeps later rows aligned when a row is removed in the middle", () => {
		const edited = [base[0]!, { city: "Bogotá", sales: "31" }]
		const r = alignEditedRows(base, edited, F)
		expect([...r.cells.entries()].map(([i, s]) => [i, [...s]])).toEqual([
			[1, ["sales"]],
		])
		expect(r.removedRowCount).toBe(1)
	})

	it("outlines every cell of an added row and counts it", () => {
		const edited = [...base, { city: "Cusco", sales: "5" }]
		const r = alignEditedRows(base, edited, F)
		expect([...r.cells.get(3)!]).toEqual(F)
		expect(r.addedRowCount).toBe(1)
		expect(r.changedCellCount).toBe(0)
	})

	it("inserts in the middle without disturbing the rows after", () => {
		const edited = [base[0]!, { city: "Cusco", sales: "5" }, base[1]!, base[2]!]
		const r = alignEditedRows(base, edited, F)
		expect([...r.cells.keys()]).toEqual([1])
		expect(r.addedRowCount).toBe(1)
	})

	it("treats an added column as changed everywhere, without breaking row anchors", () => {
		const edited = base.map((row, i) => ({ ...row, note: i === 1 ? "x" : "" }))
		const r = alignEditedRows(base, edited, [...F, "note"])
		expect([...r.cells.entries()].map(([i, s]) => [i, [...s]])).toEqual([
			[1, ["note"]],
		])
		expect(r.addedRowCount).toBe(0)
	})

	it("compares a renamed column under its current name", () => {
		const remappedBase = base.map(({ city, sales }) => ({
			city,
			revenue: sales,
		}))
		const edited = [
			{ city: "Lima", revenue: "10" },
			{ city: "Quito", revenue: "21" },
			{ city: "Bogotá", revenue: "30" },
		]
		const r = alignEditedRows(remappedBase, edited, ["city", "revenue"])
		expect([...r.cells.get(1)!]).toEqual(["revenue"])
	})

	it("pairs by similarity inside a gap, so a two-row edit outlines two cells", () => {
		const edited = [
			{ city: "Lima", sales: "11" },
			{ city: "Quito", sales: "21" },
			base[2]!,
		]
		const r = alignEditedRows(base, edited, F)
		expect([...r.cells.entries()].map(([i, s]) => [i, [...s]])).toEqual([
			[0, ["sales"]],
			[1, ["sales"]],
		])
	})

	it("pairs positionally when the gap is large", () => {
		const bigBase = Array.from({ length: 120 }, (_, i) => ({
			city: `c${i}`,
			sales: String(i),
		}))
		const edited = bigBase.map((row) => ({ ...row, sales: `${row.sales}0` }))
		const r = alignEditedRows(bigBase, edited, F)
		expect(r.cells.size).toBe(120)
		expect(r.changedCellCount).toBe(120)
		expect(r.addedRowCount).toBe(0)
	})
})

describe("editBaseVersionId", () => {
	const versions = [
		{ id: "v1", filename: "a.csv", createdAt: 0 },
		{ id: "v2", filename: "Edited data", createdAt: 1, editedFrom: "v1" },
		{ id: "v3", filename: "Edited data", createdAt: 2, editedFrom: "v2" },
		{ id: "v4", filename: "b.csv", createdAt: 3 },
		{ id: "v5", filename: "Edited data", createdAt: 4, editedFrom: "v4" },
	]

	it("follows the chain to the last import", () => {
		expect(editBaseVersionId({ versions }, "v3")).toBe("v1")
		expect(editBaseVersionId({ versions }, "v2")).toBe("v1")
		expect(editBaseVersionId({ versions }, "v5")).toBe("v4")
	})

	it("answers null for an imported version", () => {
		expect(editBaseVersionId({ versions }, "v1")).toBeNull()
		expect(editBaseVersionId({ versions }, "v4")).toBeNull()
		expect(editBaseVersionId({ versions }, "nope")).toBeNull()
	})

	it("stops at the nearest surviving ancestor when the base was deleted", () => {
		const trimmed = versions.filter((v) => v.id !== "v1")
		expect(editBaseVersionId({ versions: trimmed }, "v3")).toBe("v2")
		// The orphaned link itself has no ancestor left: nothing to compare.
		expect(editBaseVersionId({ versions: trimmed }, "v2")).toBeNull()
	})

	it("flags a data set that holds any hand-edited version", () => {
		expect(isHandEditedDataset({ versions })).toBe(true)
		expect(isHandEditedDataset({ versions: [versions[0]!] })).toBe(false)
	})
})
