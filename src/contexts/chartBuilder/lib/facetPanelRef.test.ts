import { describe, expect, it } from "vitest"

import {
	FACET_PANEL_ALL,
	facetPanelKeyOf,
	facetScopeIncludes,
	sameFacetPanelRef,
	structureFacetPanelRef,
	structureFacetPanelRefs,
} from "./facetPanelRef"

describe("facetPanelKeyOf", () => {
	it("a wrap reference IS the facet value; a grid pair maps onto the renderer's row|col key", () => {
		expect(facetPanelKeyOf("East")).toBe("East")
		expect(facetPanelKeyOf({ row: "East", col: "2024" })).toBe("East|2024")
		expect(facetPanelKeyOf({ row: FACET_PANEL_ALL, col: "Type of System" })).toBe(
			"__all__|Type of System"
		)
	})

	it("scope matching goes through the key, so a pair and its pre-pair string both match", () => {
		const grid = [{ row: "a", col: "x" }, "b|y"]
		expect(facetScopeIncludes(grid, "a|x")).toBe(true)
		expect(facetScopeIncludes(grid, "b|y")).toBe(true)
		expect(facetScopeIncludes(grid, "a|y")).toBe(false)
		expect(sameFacetPanelRef({ row: "a", col: "x" }, "a|x")).toBe(true)
	})
})

describe("structureFacetPanelRef", () => {
	it("in grid mode a string with exactly one | is the one certain split", () => {
		expect(structureFacetPanelRef("East|2024", true)).toEqual({
			row: "East",
			col: "2024",
		})
	})

	it("a full-grid key with two or more pipes has several readings and gets none guessed", () => {
		expect(structureFacetPanelRef("a|b|c", true)).toBe("a|b|c")
		// It still names its panel by key, so the chart renders as before.
		expect(facetScopeIncludes(["a|b|c"], "a|b|c")).toBe(true)
	})

	it("a known panel resolves a string exactly, whatever its values contain", () => {
		const panels = new Map([
			["a|b|c", { row: "a|b", col: "c" }],
			["x|y", { row: "x", col: "y" }],
		])
		expect(structureFacetPanelRef("a|b|c", true, panels)).toEqual({ row: "a|b", col: "c" })
		expect(structureFacetPanelRef("x|y", false, panels)).toEqual({ row: "x", col: "y" })
		// Not a rendered panel (a stale scope): falls back to the certain readings.
		expect(structureFacetPanelRef("p|q|r", true, panels)).toBe("p|q|r")
		expect(structureFacetPanelRef("p|q", true, panels)).toEqual({ row: "p", col: "q" })
	})

	it("outside grid mode a string is a wrap value and stays, even with a pipe in it", () => {
		expect(structureFacetPanelRef("East", false)).toBe("East")
		expect(structureFacetPanelRef("a|b", false)).toBe("a|b")
	})

	it("a row-only / col-only key is unambiguous in either mode: the placeholder gives it away", () => {
		expect(structureFacetPanelRef("__all__|Type of System", false)).toEqual({
			row: FACET_PANEL_ALL,
			col: "Type of System",
		})
		expect(structureFacetPanelRef("North|__all__", false)).toEqual({
			row: "North",
			col: FACET_PANEL_ALL,
		})
		// The other side is the whole value, pipes included.
		expect(structureFacetPanelRef("__all__|Type|of System", true)).toEqual({
			row: FACET_PANEL_ALL,
			col: "Type|of System",
		})
		expect(structureFacetPanelRef("a|b|__all__", true)).toEqual({
			row: "a|b",
			col: FACET_PANEL_ALL,
		})
	})

	it("a pair passes through, and a string without a pipe is never a grid key", () => {
		const pair = { row: "a", col: "x" }
		expect(structureFacetPanelRef(pair, true)).toBe(pair)
		expect(structureFacetPanelRef("solo", true)).toBe("solo")
	})
})

describe("structureFacetPanelRefs", () => {
	it("keeps the list reference when nothing changes, and null / undefined as they are", () => {
		const list = ["a", { row: "b", col: "y" }]
		expect(structureFacetPanelRefs(list, false)).toBe(list)
		expect(structureFacetPanelRefs(null, true)).toBeNull()
		expect(structureFacetPanelRefs(undefined, true)).toBeUndefined()
	})

	it("rewrites only the entries that need it", () => {
		expect(structureFacetPanelRefs(["a|x", { row: "b", col: "y" }], true)).toEqual([
			{ row: "a", col: "x" },
			{ row: "b", col: "y" },
		])
	})
})
