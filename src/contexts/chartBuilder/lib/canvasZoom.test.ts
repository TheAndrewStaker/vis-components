import { describe, expect, it } from "vitest"
import {
	MAX_ZOOM,
	MIN_ZOOM,
	fitZoom,
	formatZoom,
	resolveCanvasZoom,
	zoomInFrom,
	zoomOutFrom,
} from "./canvasZoom"

const canvas = { width: 2000, height: 1000 }

describe("fitZoom", () => {
	it("fits the tighter dimension", () => {
		expect(fitZoom({ width: 1000, height: 1000 }, canvas)).toBe(0.5)
		expect(fitZoom({ width: 2000, height: 250 }, canvas)).toBe(0.25)
	})
	it("never exceeds 100%", () => {
		expect(fitZoom({ width: 5000, height: 5000 }, canvas)).toBe(MAX_ZOOM)
	})
	it("floors at the minimum zoom", () => {
		expect(fitZoom({ width: 10, height: 10 }, canvas)).toBe(MIN_ZOOM)
	})
	it("is 100% before the viewport is measured", () => {
		expect(fitZoom({ width: 0, height: 0 }, canvas)).toBe(MAX_ZOOM)
	})
})

describe("resolveCanvasZoom", () => {
	const avail = { width: 1000, height: 250 }
	it("auto is 100% on wide layouts", () => {
		expect(resolveCanvasZoom(null, { narrow: false, avail, canvas })).toBe(1)
	})
	it("auto fits WIDTH on narrow layouts", () => {
		expect(resolveCanvasZoom(null, { narrow: true, avail, canvas })).toBe(0.5)
	})
	it("fit uses both dimensions", () => {
		expect(resolveCanvasZoom("fit", { narrow: false, avail, canvas })).toBe(
			0.25
		)
	})
	it("clamps explicit scales to (min, 100%]", () => {
		expect(resolveCanvasZoom(3, { narrow: false, avail, canvas })).toBe(1)
		expect(resolveCanvasZoom(0, { narrow: false, avail, canvas })).toBe(
			MIN_ZOOM
		)
	})
})

describe("zoom steps", () => {
	it("steps out and in through the step list", () => {
		expect(zoomOutFrom(1)).toBe(0.9)
		expect(zoomInFrom(0.9)).toBe(1)
		expect(zoomOutFrom(0.5)).toBe(0.33)
	})
	it("steps from an off-list scale to the neighboring steps", () => {
		expect(zoomOutFrom(0.6)).toBe(0.5)
		expect(zoomInFrom(0.6)).toBe(0.67)
	})
	it("treats a near-step scale as on the step", () => {
		expect(zoomOutFrom(2 / 3)).toBe(0.5)
		expect(zoomInFrom(2 / 3)).toBe(0.75)
	})
	it("caps at 100% and floors at the minimum", () => {
		expect(zoomInFrom(1)).toBe(1)
		expect(zoomOutFrom(MIN_ZOOM)).toBe(MIN_ZOOM)
	})
	it("formats whole percents", () => {
		expect(formatZoom(2 / 3)).toBe("67%")
	})
})
