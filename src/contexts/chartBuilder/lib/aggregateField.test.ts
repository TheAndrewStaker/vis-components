import { describe, expect, it } from "vitest"

import { aggregateField } from "./aggregateField"

describe("aggregateField", () => {
	it("sums numeric cells and ignores blanks", () => {
		expect(
			aggregateField(
				[{ v: "3" }, { v: "" }, { v: 4.5 }, { v: null }],
				"v"
			)
		).toBe(7.5)
	})

	it("falls back to the first non-empty text when nothing is numeric", () => {
		expect(
			aggregateField([{ r: "" }, { r: " " }, { r: "Fair" }, { r: "Good" }], "r")
		).toBe("Fair")
	})

	it("is undefined for no rows or an unknown field", () => {
		expect(aggregateField([], "v")).toBeUndefined()
		expect(aggregateField([{ v: "1" }], "other")).toBeUndefined()
	})
})
