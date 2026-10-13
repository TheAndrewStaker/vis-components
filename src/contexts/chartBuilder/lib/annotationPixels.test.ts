import { describe, expect, it } from "vitest"
import {
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
})

describe("percent ↔ pixel conversion", () => {
	it("round-trips", () => {
		for (const f of [-0.2, 0, 0.3, 1, 1.12]) {
			expect(pixelToPercentX(percentToPixelX(f, inner.width), inner.width)).toBeCloseTo(f)
			expect(pixelToPercentY(percentToPixelY(f, inner.height), inner.height)).toBeCloseTo(f)
		}
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
	})

	it("maps everything to 0 on a zero-size plot instead of NaN", () => {
		expect(pixelToPercentX(14, 0)).toBe(0)
		expect(pixelToPercentY(14, 0)).toBe(0)
	})
})
