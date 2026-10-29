import { describe, expect, it } from "vitest"

import { deepEqual } from "./deepEqual"

describe("deepEqual", () => {
	it("compares primitives by value", () => {
		expect(deepEqual(1, 1)).toBe(true)
		expect(deepEqual("a", "b")).toBe(false)
		expect(deepEqual(null, null)).toBe(true)
		expect(deepEqual(null, undefined)).toBe(false)
		expect(deepEqual(NaN, NaN)).toBe(true)
		expect(deepEqual(0, "0")).toBe(false)
	})

	it("compares nested objects and arrays by value, ignoring key order", () => {
		expect(
			deepEqual(
				{ a: 1, b: [1, { c: "x" }], d: { e: null } },
				{ d: { e: null }, b: [1, { c: "x" }], a: 1 }
			)
		).toBe(true)
		expect(deepEqual({ a: [1, 2] }, { a: [2, 1] })).toBe(false)
		expect(deepEqual([1, 2], [1, 2, 3])).toBe(false)
		expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false)
	})

	it("treats an absent key and an undefined one alike", () => {
		expect(deepEqual({ a: 1, b: undefined }, { a: 1 })).toBe(true)
	})

	it("never confuses an array with an object, or an object with null", () => {
		expect(deepEqual([], {})).toBe(false)
		expect(deepEqual({}, null)).toBe(false)
	})
})
