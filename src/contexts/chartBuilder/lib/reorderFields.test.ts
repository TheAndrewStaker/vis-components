import { describe, expect, it } from "vitest"
import {
	applyFieldOrder,
	moveNameBefore,
	reorderFieldsByNames,
} from "./reorderFields"
import type { DatasetView, Field } from "./types"

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

describe("applyFieldOrder", () => {
	const view = (names: string[]): DatasetView =>
		({ fields: names.map(f), rows: [] }) as unknown as DatasetView
	it("puts the view's columns in the visual's order, unnamed ones after", () => {
		const v = view(["a", "b", "measure", "value"])
		const next = applyFieldOrder(v, ["value", "a"])
		expect(next.fields.map((g) => g.name)).toEqual(["value", "a", "b", "measure"])
		expect(next.rows).toBe(v.rows)
	})
	it("is the same view with no order, or when the order already holds", () => {
		const v = view(["a", "b"])
		expect(applyFieldOrder(v, [])).toBe(v)
		expect(applyFieldOrder(v, ["a", "b"])).toBe(v)
		expect(applyFieldOrder(undefined, ["a"])).toBeUndefined()
	})
})
