import { describe, expect, it } from "vitest"

import { SHAPE_PALETTE, symbolExtent, symbolPath } from "./scales"
import { swatchGlyphBox } from "./swatchBox"

/** Largest |coordinate| in a path: the triangle / diamond / cross / star
 *  symbols emit absolute M/L points, so this is their true reach. */
const pathReach = (d: string): number =>
	Math.max(
		...(d.match(/-?\d+(\.\d+)?(e-?\d+)?/g) ?? []).map((n) => Math.abs(Number(n)))
	)

describe("symbolExtent", () => {
	it("is the radius for the circle and reaches past it for pointed symbols", () => {
		expect(symbolExtent(0, 10)).toBeCloseTo(10)
		// The square sits inside the circle-equivalent radius.
		expect(symbolExtent(1, 10)).toBeLessThan(10)
		expect(symbolExtent(2, 10)).toBeGreaterThan(10)
		// Star tips: d3 sizes by area, so they sit ~1.67× out.
		expect(symbolExtent(5, 10)).toBeCloseTo(16.73, 1)
	})

	it("matches the farthest point of the symbol's path", () => {
		expect(SHAPE_PALETTE.length).toBe(6)
		for (const idx of [2, 3, 4, 5]) {
			expect(pathReach(symbolPath(idx, 20))).toBeCloseTo(symbolExtent(idx, 20), 6)
		}
	})
})

describe("swatchGlyphBox", () => {
	it("keeps the historical (r + 3) * 2 box for circles, thin strokes included", () => {
		expect(swatchGlyphBox(0, 5)).toBe(16)
		expect(swatchGlyphBox(0, 5, 1)).toBe(16)
		expect(swatchGlyphBox(0, 12, 1.5)).toBe(30)
		expect(swatchGlyphBox({ kind: "text", text: "A" }, 5, 1)).toBe(16)
		expect(swatchGlyphBox("line", 5)).toBe(16)
	})

	it("grows for a star so its tips and outline fit, with 1px of room past the ink", () => {
		const r = 20
		const box = swatchGlyphBox(5, r, 2)
		expect(box).toBeGreaterThan((r + 3) * 2)
		const ink = symbolExtent(5, r) + 1
		expect(box / 2).toBeGreaterThanOrEqual(ink + 1)
		expect(box / 2).toBeLessThan(ink + 2)
	})

	it("grows for a thick outline on a circle and for the line glyph's round caps", () => {
		// 5 + 8/2 = 9 of ink, +1 → half 10.
		expect(swatchGlyphBox(0, 5, 8)).toBe(20)
		// r = 20 line: stroke 10, caps reach 25 → half 26.
		expect(swatchGlyphBox("line", 20)).toBe(52)
	})
})
