import { describe, expect, it } from "vitest"

import {
	outwardAlignmentFor,
	resolveOutwardAlignment,
} from "./polarLabelAlignment"

const deg = (d: number) => (d * Math.PI) / 180

describe("outwardAlignmentFor", () => {
	it("hangs text away from the center: left-aligned on the right side, right-aligned on the left", () => {
		expect(outwardAlignmentFor(deg(45))).toBe("left")
		expect(outwardAlignmentFor(deg(90))).toBe("left")
		expect(outwardAlignmentFor(deg(135))).toBe("left")
		expect(outwardAlignmentFor(deg(225))).toBe("right")
		expect(outwardAlignmentFor(deg(270))).toBe("right")
		expect(outwardAlignmentFor(deg(315))).toBe("right")
	})

	it("centers within the band around straight up and straight down", () => {
		expect(outwardAlignmentFor(0)).toBe("center")
		expect(outwardAlignmentFor(deg(180))).toBe("center")
		expect(outwardAlignmentFor(deg(9))).toBe("center")
		expect(outwardAlignmentFor(deg(-9))).toBe("center")
		expect(outwardAlignmentFor(deg(171))).toBe("center")
		// Just past the band → a side.
		expect(outwardAlignmentFor(deg(11))).toBe("left")
		expect(outwardAlignmentFor(deg(349))).toBe("right")
	})
})

describe("resolveOutwardAlignment", () => {
	it("resolves outward to the anchor's side, else centered; leaves the rest alone", () => {
		expect(resolveOutwardAlignment("outward", "left")).toBe("left")
		expect(resolveOutwardAlignment("outward", undefined)).toBe("center")
		expect(resolveOutwardAlignment("right", "left")).toBe("right")
		expect(resolveOutwardAlignment(undefined, "left")).toBeUndefined()
	})
})
