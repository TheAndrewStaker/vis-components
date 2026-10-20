import { describe, expect, it } from "vitest"
import {
	baseToPercentX,
	baseToPercentY,
	coordCornerOf,
	coordSystemFor,
	coordUnitOf,
	isPercentSystem,
	isPixelSystem,
	percentToBaseX,
	percentToBaseY,
	type AnnotationCoordSystem,
	percentToPixelX,
	percentToPixelY,
	pixelToCanvasX,
	pixelToCanvasY,
	pixelToPercentX,
	pixelToPercentY,
} from "./annotationPixels"

const inner = { x: 100, y: 50, width: 400, height: 200 }

describe("pixel coords → canvas", () => {
	it("counts +x right and +y up from the plot's top-left corner", () => {
		expect(pixelToCanvasX(inner, 10)).toBe(110)
		expect(pixelToCanvasY(inner, 14)).toBe(36) // 14px above the top
		expect(pixelToCanvasY(inner, -20)).toBe(70) // 20px into the plot
	})

	it("counts +y up from the plot's BOTTOM edge in the bottom-left system", () => {
		expect(pixelToCanvasX(inner, 10)).toBe(110)
		expect(pixelToCanvasY(inner, -14, "pixelsBottomLeft")).toBe(264) // 14px below
		expect(pixelToCanvasY(inner, 20, "pixelsBottomLeft")).toBe(230) // 20px into the plot
		// The two corners agree on the same canvas point.
		expect(pixelToCanvasY(inner, 20, "pixelsBottomLeft")).toBe(
			pixelToCanvasY(inner, 20 - inner.height, "pixels")
		)
	})

	it("holds a below-the-plot note at the same depth under panels of different heights", () => {
		// The facet-grid case: two stacked panels, the top one taller. A note
		// 14px under each plot must sit 14px under EACH bottom edge.
		const tall = { x: 100, y: 50, width: 400, height: 300 }
		const short = { x: 100, y: 400, width: 400, height: 120 }
		expect(pixelToCanvasY(tall, -14, "pixelsBottomLeft") - (tall.y + tall.height)).toBe(14)
		expect(pixelToCanvasY(short, -14, "pixelsBottomLeft") - (short.y + short.height)).toBe(14)
		// Measured from the top, the same number lands at a different depth.
		expect(pixelToCanvasY(tall, -314, "pixels") - (tall.y + tall.height)).toBe(14)
		expect(pixelToCanvasY(short, -314, "pixels") - (short.y + short.height)).toBe(194)
	})
})

describe("right-hand corners", () => {
	it("count +x right from the plot's RIGHT edge, so inside the plot is negative x", () => {
		const right = inner.x + inner.width // 500
		expect(pixelToCanvasX(inner, 10, "pixelsTopRight")).toBe(right + 10)
		expect(pixelToCanvasX(inner, -30, "pixelsBottomRight")).toBe(right - 30)
		// y follows the corner's top/bottom edge, as for the left-hand corners.
		expect(pixelToCanvasY(inner, 14, "pixelsTopRight")).toBe(36)
		expect(pixelToCanvasY(inner, -14, "pixelsBottomRight")).toBe(264)
	})

	it("hold a fixed gap beside the right edge as the panel width changes", () => {
		const wide = { x: 100, y: 50, width: 600, height: 200 }
		const narrow = { x: 100, y: 50, width: 150, height: 200 }
		const gapRight = (p: typeof wide) =>
			pixelToCanvasX(p, 12, "pixelsTopRight") - (p.x + p.width)
		expect(gapRight(wide)).toBe(12)
		expect(gapRight(narrow)).toBe(12)
	})

	it("round-trip percent ↔ px", () => {
		for (const sys of ["pixelsTopRight", "pixelsBottomRight"] as const) {
			for (const f of [-0.2, 0, 0.3, 1, 1.12]) {
				expect(pixelToPercentX(percentToPixelX(f, inner.width, sys), inner.width, sys)).toBeCloseTo(f)
				expect(pixelToPercentY(percentToPixelY(f, inner.height, sys), inner.height, sys)).toBeCloseTo(f)
			}
		}
		// 3% past the right edge of a 400px plot is 12px right of the corner.
		expect(percentToPixelX(1.03, inner.width, "pixelsTopRight")).toBeCloseTo(12)
		expect(pixelToPercentX(12, inner.width, "pixelsBottomRight")).toBeCloseTo(1.03)
		expect(pixelToPercentX(12, 0, "pixelsTopRight")).toBe(0)
	})
})

describe("isPixelSystem", () => {
	it("narrows to the four pixel corners", () => {
		expect(isPixelSystem("pixels")).toBe(true)
		expect(isPixelSystem("pixelsBottomLeft")).toBe(true)
		expect(isPixelSystem("pixelsTopRight")).toBe(true)
		expect(isPixelSystem("pixelsBottomRight")).toBe(true)
		expect(isPixelSystem("percent")).toBe(false)
		expect(isPixelSystem("values")).toBe(false)
	})
})

describe("percent ↔ pixel conversion", () => {
	it("round-trips", () => {
		for (const f of [-0.2, 0, 0.3, 1, 1.12]) {
			expect(pixelToPercentX(percentToPixelX(f, inner.width), inner.width)).toBeCloseTo(f)
			expect(pixelToPercentY(percentToPixelY(f, inner.height), inner.height)).toBeCloseTo(f)
			expect(
				pixelToPercentY(
					percentToPixelY(f, inner.height, "pixelsBottomLeft"),
					inner.height,
					"pixelsBottomLeft"
				)
			).toBeCloseTo(f)
		}
	})

	it("bottom-left px is the plain fraction of the height", () => {
		expect(percentToPixelY(-0.07, inner.height, "pixelsBottomLeft")).toBeCloseTo(-14)
		expect(percentToPixelY(1, inner.height, "pixelsBottomLeft")).toBe(200)
		expect(pixelToPercentY(-14, inner.height, "pixelsBottomLeft")).toBeCloseTo(-0.07)
	})

	it("agrees with the canvas placement", () => {
		// The same fraction, expressed in px, lands on the same canvas point
		// percent mode would.
		expect(pixelToCanvasY(inner, percentToPixelY(1.12, inner.height))).toBeCloseTo(
			inner.y + inner.height * (1 - 1.12)
		)
		expect(pixelToCanvasX(inner, percentToPixelX(-0.02, inner.width))).toBeCloseTo(
			inner.x + inner.width * -0.02
		)
		expect(
			pixelToCanvasY(
				inner,
				percentToPixelY(-0.07, inner.height, "pixelsBottomLeft"),
				"pixelsBottomLeft"
			)
		).toBeCloseTo(inner.y + inner.height * (1 - -0.07))
	})

	it("maps everything to 0 on a zero-size plot instead of NaN", () => {
		expect(pixelToPercentX(14, 0)).toBe(0)
		expect(pixelToPercentY(14, 0)).toBe(0)
		expect(pixelToPercentY(14, 0, "pixelsBottomLeft")).toBe(0)
	})
})

describe("percent corners", () => {
	it("splits every system into a unit + corner and recombines it", () => {
		const all: AnnotationCoordSystem[] = [
			"values",
			"percent",
			"percentTopLeft",
			"percentTopRight",
			"percentBottomRight",
			"pixels",
			"pixelsBottomLeft",
			"pixelsTopRight",
			"pixelsBottomRight",
		]
		for (const s of all) {
			expect(coordSystemFor(coordUnitOf(s), coordCornerOf(s))).toBe(s)
		}
		// Legacy "percent" is the bottom-left corner; "pixels" the top-left.
		expect(coordCornerOf("percent")).toBe("bottomLeft")
		expect(coordCornerOf("pixels")).toBe("topLeft")
		expect(coordSystemFor("percent", null)).toBe("percent")
		expect(coordSystemFor("pixels", null)).toBe("pixels")
		expect(isPercentSystem("percentTopRight")).toBe(true)
		expect(isPercentSystem("pixels")).toBe(false)
	})

	it("offsets a far-edge corner by one full plot, directions unchanged", () => {
		// 10% left of the right edge, 20% below the top.
		expect(percentToBaseX(-0.1, "percentTopRight")).toBeCloseTo(0.9)
		expect(percentToBaseY(-0.2, "percentTopRight")).toBeCloseTo(0.8)
		expect(percentToBaseX(-0.1, "percentBottomRight")).toBeCloseTo(0.9)
		expect(percentToBaseY(0.2, "percentBottomRight")).toBeCloseTo(0.2)
		expect(percentToBaseY(0.05, "percentTopLeft")).toBeCloseTo(1.05)
		// Bottom-left percent and the values fallback read as-is.
		expect(percentToBaseX(0.3, "percent")).toBe(0.3)
		expect(percentToBaseY(0.3, "values")).toBe(0.3)
		expect(baseToPercentX(0.9, "percentTopRight")).toBeCloseTo(-0.1)
		expect(baseToPercentY(1.05, "percentTopLeft")).toBeCloseTo(0.05)
		expect(baseToPercentY(0.4, "percent")).toBe(0.4)
	})
})
