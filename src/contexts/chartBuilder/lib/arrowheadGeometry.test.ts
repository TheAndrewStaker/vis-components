import { describe, expect, it } from "vitest"

import {
	ARROWHEAD_STYLES,
	DEFAULT_LINE_END_STYLE,
	newLineSegment,
	type LineSegmentAnnotation,
} from "./annotationsConfig"
import {
	capOverhang,
	computeArrowhead,
	lineCapToSvg,
	resolveLineEnds,
} from "./arrowheadGeometry"

/** A 2px horizontal segment ending at (100, 50): the default-scale head is
 *  8px long and 8px wide, so its base sits at x = 92. */
const horizontal = (
	over: Partial<Parameters<typeof computeArrowhead>[0]> = {}
) =>
	computeArrowhead({
		x1: 0,
		y1: 50,
		x2: 100,
		y2: 50,
		thickness: 2,
		style: "triangle",
		scale: 1,
		lineCap: "square",
		...over,
	})

describe("computeArrowhead", () => {
	it("puts a filled triangle's tip ON the end point with its base one head length back", () => {
		const head = horizontal()!
		expect(head.filled).toBe(true)
		expect(head.d).toBe("M100,50L92,54L92,46Z")
		// The line's stroke stops at the base — a flush cap paints nothing
		// past it, so no doubling under a semi-transparent head.
		expect(head.lineEnd).toEqual({ x: 92, y: 50 })
		expect(head.bbox).toEqual({ left: 92, top: 46, right: 100, bottom: 54 })
	})

	it("grows with the line thickness and with the scale multiplier alike", () => {
		expect(horizontal({ thickness: 4 })!.lineEnd.x).toBe(100 - 16)
		const scaled = horizontal({ scale: 2 })!
		expect(scaled.lineEnd.x).toBe(100 - 16)
		expect(scaled.bbox.top).toBe(50 - 8)
		expect(scaled.bbox.bottom).toBe(50 + 8)
	})

	it("floors the size unit at 1px so a hairline still gets a visible head", () => {
		expect(horizontal({ thickness: 0.5 })!.lineEnd.x).toBe(100 - 4)
	})

	it("backs the line end off by a round cap's overhang so the cap lands on the base", () => {
		expect(horizontal({ lineCap: "round" })!.lineEnd.x).toBe(92 - 1)
		expect(capOverhang("round", 2)).toBe(1)
		expect(capOverhang("square", 2)).toBe(0)
	})

	it("points along the segment's own direction", () => {
		// Straight up in SVG terms (y decreasing).
		const up = computeArrowhead({
			x1: 10,
			y1: 100,
			x2: 10,
			y2: 20,
			thickness: 2,
			style: "triangle",
			scale: 1,
			lineCap: "square",
		})!
		expect(up.lineEnd).toEqual({ x: 10, y: 28 })
		expect(up.bbox).toEqual({ left: 6, top: 20, right: 14, bottom: 28 })
	})

	it("runs the line to the tip under an open chevron, which is stroked rather than filled", () => {
		const open = horizontal({ style: "open" })!
		expect(open.filled).toBe(false)
		expect(open.d).toBe("M92,54L100,50L92,46")
		expect(open.lineEnd).toEqual({ x: 100, y: 50 })
		// The arms' miter at the tip paints past the vertex; the box allows
		// for it so the reserve never clips the point.
		expect(open.bbox.right).toBeGreaterThan(100)
		expect(open.bbox.top).toBeLessThan(46)
	})

	it("stops the line at the stealth head's notch, not at its barbs", () => {
		const stealth = horizontal({ style: "stealth" })!
		expect(stealth.lineEnd.x).toBeCloseTo(100 - 0.65 * 8)
		expect(stealth.lineEnd.x).toBeGreaterThan(92)
		expect(stealth.bbox).toEqual({ left: 92, top: 46, right: 100, bottom: 54 })
	})

	it("sizes the diamond and the circle to the same head length", () => {
		const diamond = horizontal({ style: "diamond" })!
		expect(diamond.lineEnd.x).toBe(92)
		expect(diamond.bbox).toEqual({ left: 92, top: 46, right: 100, bottom: 54 })
		const circle = horizontal({ style: "circle" })!
		expect(circle.lineEnd.x).toBe(92)
		expect(circle.bbox).toEqual({ left: 92, top: 46, right: 100, bottom: 54 })
		expect(circle.d.endsWith("Z")).toBe(true)
	})

	it("never pushes the line end past the line's start on a segment shorter than its head", () => {
		const short = computeArrowhead({
			x1: 0,
			y1: 0,
			x2: 3,
			y2: 0,
			thickness: 2,
			style: "triangle",
			scale: 1,
			lineCap: "round",
		})!
		expect(short.lineEnd).toEqual({ x: 0, y: 0 })
	})

	it("returns null with no direction to point in or no size to draw at", () => {
		expect(
			computeArrowhead({
				x1: 5,
				y1: 5,
				x2: 5,
				y2: 5,
				thickness: 2,
				style: "triangle",
				scale: 1,
				lineCap: "square",
			})
		).toBeNull()
		expect(horizontal({ scale: 0 })).toBeNull()
	})

	it("builds every style the picker offers, each ending at the tip", () => {
		for (const style of ARROWHEAD_STYLES) {
			const head = horizontal({ style })
			expect(head, style).not.toBeNull()
			expect(head!.style, style).toBe(style)
			expect(head!.bbox.right, style).toBeGreaterThanOrEqual(100)
			expect(head!.bbox.left, style).toBeLessThan(100)
			expect(head!.lineEnd.x, style).toBeLessThanOrEqual(100)
		}
	})
})

describe("line end resolution", () => {
	it("reads absent fields as a flush cap and no arrowhead — what older lines always drew", () => {
		const legacy: LineSegmentAnnotation = { ...newLineSegment("l") }
		delete legacy.lineCap
		delete legacy.arrowhead
		delete legacy.arrowheadStyle
		delete legacy.arrowheadScale
		expect(resolveLineEnds(legacy)).toEqual(DEFAULT_LINE_END_STYLE)
		expect(DEFAULT_LINE_END_STYLE.lineCap).toBe("square")
		expect(DEFAULT_LINE_END_STYLE.arrowhead).toBe(false)
	})

	it("maps Square to SVG's flush butt cap, like the Connection line cap", () => {
		expect(lineCapToSvg("square")).toBe("butt")
		expect(lineCapToSvg("round")).toBe("round")
	})
})
