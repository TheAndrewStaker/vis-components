import { describe, expect, it } from "vitest"
import { buildDataset } from "../../../testSupport/fixtures"
import {
	moveNameBefore,
	reorderDatasetFields,
	reorderFieldsByNames,
} from "./reorderFields"
import type { Field } from "./types"

const f = (name: string): Field => ({ name, inferredType: "categorical" })

describe("moveNameBefore", () => {
	const names = ["a", "b", "c", "d"]
	it("moves a name ahead of another, either direction", () => {
		expect(moveNameBefore(names, "d", "b")).toEqual(["a", "d", "b", "c"])
		expect(moveNameBefore(names, "a", "d")).toEqual(["b", "c", "a", "d"])
	})
	it("moves a name to the end for a null target", () => {
		expect(moveNameBefore(names, "b", null)).toEqual(["a", "c", "d", "b"])
	})
	it("is the same list when nothing moves or a name is unknown", () => {
		expect(moveNameBefore(names, "b", "c")).toBe(names)
		expect(moveNameBefore(names, "b", "b")).toBe(names)
		expect(moveNameBefore(names, "d", null)).toBe(names)
		expect(moveNameBefore(names, "zz", "a")).toBe(names)
		expect(moveNameBefore(names, "a", "zz")).toBe(names)
	})
})

describe("reorderFieldsByNames", () => {
	it("sorts into the given order and keeps unlisted fields after, in their own order", () => {
		const fields = [f("a"), f("b"), f("c"), f("x"), f("y")]
		expect(reorderFieldsByNames(fields, ["c", "a", "b"]).map((g) => g.name)).toEqual([
			"c",
			"a",
			"b",
			"x",
			"y",
		])
	})
	it("is the same list when the order already holds", () => {
		const fields = [f("a"), f("b")]
		expect(reorderFieldsByNames(fields, ["a", "b"])).toBe(fields)
		expect(reorderFieldsByNames(fields, ["a", "b", "nope"])).toBe(fields)
	})
})

describe("reorderDatasetFields", () => {
	it("reorders the data set's list and each version's own list, leaving rows alone", () => {
		const rows = [{ a: "1", b: "2", old: "0" }]
		const dataset = buildDataset({
			fields: [f("a"), f("b")],
			versions: [
				{ id: "v1", filename: "x.csv", rows, createdAt: 0, fields: [f("old"), f("a"), f("b")] },
				{ id: "v2", filename: "y.csv", rows, createdAt: 1 },
			],
		})
		const next = reorderDatasetFields(dataset, ["b", "a"])
		expect(next.fields.map((g) => g.name)).toEqual(["b", "a"])
		expect(next.versions[0]!.fields!.map((g) => g.name)).toEqual(["b", "a", "old"])
		expect(next.versions[1]!.fields).toBeUndefined()
		expect(next.versions[0]!.rows).toBe(rows)
	})
	it("is the same data set when the order already holds", () => {
		const dataset = buildDataset({ fields: [f("a"), f("b")] })
		expect(reorderDatasetFields(dataset, ["a", "b"])).toBe(dataset)
	})
})
