import { describe, expect, it } from "vitest"

import {
	BAR_TOTAL_FIELD,
	barLedgerKey,
	barTotalFieldName,
	barTotalsByLedger,
	withBarTotals,
} from "./barTotalLabel"

describe("barTotalFieldName", () => {
	it("offers the derived name unless a column already carries it", () => {
		expect(barTotalFieldName(["cat", "val"])).toBe(BAR_TOTAL_FIELD)
		expect(barTotalFieldName(["cat", BAR_TOTAL_FIELD])).toBeNull()
	})
})

describe("barTotalsByLedger", () => {
	it("sums per leaf sub-band and sign side", () => {
		const t = barTotalsByLedger([
			{ leafIndex: 0, value: 10 },
			{ leafIndex: 0, value: 30 },
			{ leafIndex: 1, value: 5 },
			{ leafIndex: 0, value: -4 },
			{ leafIndex: 0, value: -6 },
		])
		expect(t.get(barLedgerKey(0, 1))).toBe(40)
		expect(t.get(barLedgerKey(1, 1))).toBe(5)
		expect(t.get(barLedgerKey(0, -1))).toBe(-10)
		expect(t.get(barLedgerKey(1, -1))).toBeUndefined()
	})
})

describe("withBarTotals", () => {
	const rows = [
		{ cat: "A", g: "n", val: "10", panel: "p1" },
		{ cat: "A", g: "s", val: "30", panel: "p1" },
		{ cat: "A", g: "n", val: "7", panel: "p2" },
		{ cat: "B", g: "n", val: "", panel: "p1" },
		{ cat: "B", g: "s", val: "-5", panel: "p1" },
	]

	it("totals per category and facet panel across the layers, keeping sign sides apart", () => {
		const out = withBarTotals(rows, BAR_TOTAL_FIELD, {
			keyFields: ["cat", "panel"],
			lengthField: "val",
		})
		expect(out[0]?.[BAR_TOTAL_FIELD]).toBe(40)
		expect(out[1]?.[BAR_TOTAL_FIELD]).toBe(40)
		expect(out[2]?.[BAR_TOTAL_FIELD]).toBe(7)
		expect(out[4]?.[BAR_TOTAL_FIELD]).toBe(-5)
	})

	it("a blank contribution gets no total — its slice draws no label either", () => {
		const out = withBarTotals(rows, BAR_TOTAL_FIELD, {
			keyFields: ["cat", "panel"],
			lengthField: "val",
		})
		expect(out[3]).not.toHaveProperty(BAR_TOTAL_FIELD)
	})

	it("a group-mode field splits the band into bars of their own", () => {
		const out = withBarTotals(rows, BAR_TOTAL_FIELD, {
			keyFields: ["cat", "panel", "g"],
			lengthField: "val",
		})
		expect(out[0]?.[BAR_TOTAL_FIELD]).toBe(10)
		expect(out[1]?.[BAR_TOTAL_FIELD]).toBe(30)
	})

	it("counts rows when there is no length field (histograms, categorical length)", () => {
		const out = withBarTotals(rows, BAR_TOTAL_FIELD, {
			keyFields: ["cat", "panel"],
			lengthField: null,
		})
		expect(out[0]?.[BAR_TOTAL_FIELD]).toBe(2)
		expect(out[3]?.[BAR_TOTAL_FIELD]).toBe(2)
	})

	it("leaves the input rows untouched", () => {
		withBarTotals(rows, BAR_TOTAL_FIELD, {
			keyFields: ["cat"],
			lengthField: "val",
		})
		expect(rows[0]).not.toHaveProperty(BAR_TOTAL_FIELD)
	})
})
