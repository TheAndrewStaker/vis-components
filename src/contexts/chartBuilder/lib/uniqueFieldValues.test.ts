import { describe, expect, it } from "vitest"

import { uniqueFieldValues, uniqueValues } from "./uniqueFieldValues"

describe("uniqueValues", () => {
	describe("ordering", () => {
		it("keeps first-seen order and never sorts", () => {
			expect(
				uniqueValues(["b", "a", "b", "c", "a"], { type: "categorical" })
			).toEqual(["b", "a", "c"])
			expect(uniqueValues(["10", "2", "10", "1"], { type: "ordinal" })).toEqual([
				"10",
				"2",
				"1",
			])
			expect(uniqueValues(["z", "y", "z"], { skipBlank: true })).toEqual(["z", "y"])
		})

		it("accepts any iterable", () => {
			expect(uniqueValues(new Set(["a", "b"]), { type: "categorical" })).toEqual([
				"a",
				"b",
			])
		})
	})

	describe("blanks and nulls (parsed mode)", () => {
		it("drops undefined, null, empty and whitespace-only cells", () => {
			expect(
				uniqueValues(["b", "", null, undefined, "   ", "a"], { type: "categorical" })
			).toEqual(["b", "a"])
		})

		it("drops unparseable quantitative cells", () => {
			expect(uniqueValues(["1", "x", "2", "NaN"], { type: "quantitative" })).toEqual([
				"1",
				"2",
			])
		})
	})

	describe("blanks and nulls (raw mode)", () => {
		it("always drops undefined and null", () => {
			expect(uniqueValues([null, "a", undefined], { skipBlank: false })).toEqual([
				"a",
			])
		})

		it("skipBlank drops exactly-empty strings but keeps whitespace-only cells", () => {
			expect(uniqueValues(["", "a", " ", ""], { skipBlank: true })).toEqual([
				"a",
				" ",
			])
		})

		it("skipBlank: false keeps the empty string as a level", () => {
			expect(uniqueValues(["", "a", ""], { skipBlank: false })).toEqual(["", "a"])
		})
	})

	describe("stringification", () => {
		it("parsed ordinal collapses numeric spellings; raw keeps the cell text", () => {
			expect(uniqueValues(["1", "1.0", "01", "x"], { type: "ordinal" })).toEqual([
				"1",
				"x",
			])
			expect(uniqueValues(["1", "1.0", "01"], { skipBlank: true })).toEqual([
				"1",
				"1.0",
				"01",
			])
		})

		it("parsed quantitative normalizes numeric text", () => {
			expect(uniqueValues(["1", "1.0", "2"], { type: "quantitative" })).toEqual([
				"1",
				"2",
			])
		})

		it("parsed categorical keeps the cell text verbatim (no trim)", () => {
			expect(uniqueValues([" a", "a", "a "], { type: "categorical" })).toEqual([
				" a",
				"a",
				"a ",
			])
		})

		it("raw mode stringifies numbers with String()", () => {
			expect(uniqueValues([1, 1.0, 2, "2"], { skipBlank: false })).toEqual(["1", "2"])
		})
	})

	describe("dates", () => {
		it("parsed temporal keys on String(Date), so equivalent spellings collapse", () => {
			const iso = "2024-01-15T00:00:00.000Z"
			const epoch = new Date(iso).getTime()
			const out = uniqueValues([iso, epoch, "not a date", iso], { type: "temporal" })
			expect(out).toEqual([String(new Date(iso))])
		})

		it("raw mode stringifies a Date object with String()", () => {
			const d = new Date("2024-01-15T00:00:00.000Z")
			expect(uniqueValues([d, d], { skipBlank: false })).toEqual([String(d)])
		})
	})
})

describe("uniqueFieldValues", () => {
	const rows = [
		{ k: "b", n: "2" },
		{ k: "a", n: "1.0" },
		{ k: "", n: "" },
		{ k: "b", n: "1" },
		{ n: "3" },
	]

	it("reads one column and applies the same rules", () => {
		expect(uniqueFieldValues(rows, "k", { type: "categorical" })).toEqual(["b", "a"])
		expect(uniqueFieldValues(rows, "n", { type: "ordinal" })).toEqual(["2", "1", "3"])
		expect(uniqueFieldValues(rows, "n", { skipBlank: true })).toEqual([
			"2",
			"1.0",
			"1",
			"3",
		])
		expect(uniqueFieldValues(rows, "k", { skipBlank: false })).toEqual(["b", "a", ""])
	})

	it("returns [] for an absent column or no rows", () => {
		expect(uniqueFieldValues(rows, "missing", { type: "categorical" })).toEqual([])
		expect(uniqueFieldValues([], "k", { type: "categorical" })).toEqual([])
	})
})
