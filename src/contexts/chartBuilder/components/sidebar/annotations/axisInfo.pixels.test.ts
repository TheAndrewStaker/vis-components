import { describe, expect, it } from "vitest"
import { convertCoord, convertRadius, type AxisInfo } from "./axisInfo"

/** The sidebar's unit toggle: switching "Adjust by" rewrites the stored
 *  numbers so the annotation stays put. Pixels count from the plot's
 *  top-left corner, +x right and +y up. */

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

	it("values ↔ pixels go through the axis span and the plot extent", () => {
		// 25 of 0..50 is half-way: 200px of 400 from the left.
		expect(convertCoord(25, "values", "pixels", axis, "x", dims)).toBe(200)
		expect(convertCoord(200, "pixels", "values", axis, "x", dims)).toBe(25)
	})

	it("leaves the number alone when the plot hasn't been measured", () => {
		expect(convertCoord(0.5, "percent", "pixels", axis, "x", null)).toBe(0.5)
		expect(convertCoord(14, "pixels", "percent", axis, "y", null)).toBe(14)
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
	})
})
