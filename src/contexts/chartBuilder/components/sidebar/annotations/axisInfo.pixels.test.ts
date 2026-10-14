import { describe, expect, it } from "vitest"
import { convertCoord, convertRadius, type AxisInfo } from "./axisInfo"

/** The sidebar's unit toggle: switching "Adjust by" rewrites the stored
 *  numbers so the annotation stays put. Pixels count from the plot's
 *  top-left (or bottom-left) corner, +x right and +y up. */

const axis: AxisInfo = {
	field: "val",
	type: "quantitative",
	categories: null,
	dataMin: 0,
	dataMax: 50,
}
const dims = { widthPx: 400, heightPx: 200 }

describe("convertCoord", () => {
	it("percent → pixels counts from the top-left corner", () => {
		expect(convertCoord(1.12, "percent", "pixels", axis, "y", dims)).toBe(24)
		expect(convertCoord(0, "percent", "pixels", axis, "y", dims)).toBe(-200)
		expect(convertCoord(-0.02, "percent", "pixels", axis, "x", dims)).toBe(-8)
	})

	it("pixels → percent is the inverse", () => {
		expect(convertCoord(24, "pixels", "percent", axis, "y", dims)).toBeCloseTo(1.12)
		expect(convertCoord(-8, "pixels", "percent", axis, "x", dims)).toBeCloseTo(-0.02)
	})

	it("percent ↔ bottom-left pixels counts from the bottom edge", () => {
		// 7% below the bottom spine of a 200px-tall plot is 14px below it.
		expect(convertCoord(-0.07, "percent", "pixelsBottomLeft", axis, "y", dims)).toBe(-14)
		expect(convertCoord(1, "percent", "pixelsBottomLeft", axis, "y", dims)).toBe(200)
		expect(convertCoord(-0.02, "percent", "pixelsBottomLeft", axis, "x", dims)).toBe(-8)
		expect(convertCoord(-14, "pixelsBottomLeft", "percent", axis, "y", dims)).toBeCloseTo(-0.07)
	})

	it("percent ↔ right-hand pixels counts from the right edge", () => {
		// 3% past the right edge of a 400px plot is 12px right of the corner.
		expect(convertCoord(1.03, "percent", "pixelsTopRight", axis, "x", dims)).toBe(12)
		expect(convertCoord(0, "percent", "pixelsBottomRight", axis, "x", dims)).toBe(-400)
		expect(convertCoord(12, "pixelsTopRight", "percent", axis, "x", dims)).toBeCloseTo(1.03)
		// y follows the corner's top / bottom edge.
		expect(convertCoord(1.12, "percent", "pixelsTopRight", axis, "y", dims)).toBe(24)
		expect(convertCoord(-0.07, "percent", "pixelsBottomRight", axis, "y", dims)).toBe(-14)
	})

	it("switching corners keeps the annotation where it is", () => {
		// 24px above the top of a 200px plot = 224px above the bottom.
		expect(convertCoord(24, "pixels", "pixelsBottomLeft", axis, "y", dims)).toBe(224)
		expect(convertCoord(224, "pixelsBottomLeft", "pixels", axis, "y", dims)).toBe(24)
		// 14px below the bottom = 214px below the top.
		expect(convertCoord(-14, "pixelsBottomLeft", "pixels", axis, "y", dims)).toBe(-214)
		// x is shared between the left-hand corners...
		expect(convertCoord(-8, "pixels", "pixelsBottomLeft", axis, "x", dims)).toBe(-8)
		// ...and shifts by the plot width to a right-hand one: 8px left of
		// the spine is 408px left of the right edge.
		expect(convertCoord(-8, "pixels", "pixelsTopRight", axis, "x", dims)).toBe(-408)
		expect(convertCoord(-408, "pixelsBottomRight", "pixelsBottomLeft", axis, "x", dims)).toBe(-8)
		expect(convertCoord(24, "pixelsTopRight", "pixelsBottomRight", axis, "y", dims)).toBe(224)
	})

	it("values ↔ pixels go through the axis span and the plot extent", () => {
		// 25 of 0..50 is half-way: 200px of 400 from the left.
		expect(convertCoord(25, "values", "pixels", axis, "x", dims)).toBe(200)
		expect(convertCoord(200, "pixels", "values", axis, "x", dims)).toBe(25)
	})

	it("leaves the number alone when the plot hasn't been measured", () => {
		expect(convertCoord(0.5, "percent", "pixels", axis, "x", null)).toBe(0.5)
		expect(convertCoord(14, "pixels", "percent", axis, "y", null)).toBe(14)
		expect(convertCoord(14, "pixels", "pixelsBottomLeft", axis, "y", null)).toBe(14)
	})

	it("is the identity within a system", () => {
		expect(convertCoord("A", "values", "values", axis, "x", dims)).toBe("A")
	})
})

describe("convertRadius", () => {
	it("scales a fraction of the radius axis to px and back", () => {
		expect(convertRadius(0.2, "percent", "pixels", axis, 400)).toBe(80)
		expect(convertRadius(80, "pixels", "percent", axis, 400)).toBeCloseTo(0.2)
		// 10 data units of a 50-unit axis over 400px = 80px.
		expect(convertRadius(10, "values", "pixels", axis, 400)).toBe(80)
		// Both pixel corners share the on-screen radius.
		expect(convertRadius(80, "pixels", "pixelsBottomLeft", axis, 400)).toBe(80)
		expect(convertRadius(0.2, "percent", "pixelsBottomLeft", axis, 400)).toBe(80)
	})
})
