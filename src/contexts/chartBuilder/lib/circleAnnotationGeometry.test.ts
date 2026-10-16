import { describe, expect, it } from "vitest"
import { newCircle, radiusUnitOf } from "./annotationsConfig"
import {
	computeCirclePixels,
	computePolarCirclePixels,
} from "./circleAnnotationGeometry"
import { makePositionScale } from "./scales"

const inner = { x: 100, y: 50, width: 400, height: 200 }
const noScales = {
	xScale: null,
	yScale: null,
	xType: null,
	yType: null,
}

describe("computeCirclePixels — percent mode", () => {
	it("places the center via plot-area-normalized coords (y flipped)", () => {
		const circle = newCircle("c1") // center (0.5, 0.5), radius 0.2, axis x
		const geo = computeCirclePixels(circle, inner, noScales)
		expect(geo).not.toBeNull()
		// cx = x + width * 0.5 = 100 + 200 = 300
		expect(geo?.cx).toBe(300)
		// cy = y + height * (1 - 0.5) = 50 + 100 = 150
		expect(geo?.cy).toBe(150)
	})

	it("scales radius off the x-axis extent (inner.width)", () => {
		const circle = { ...newCircle("c1"), radius: 0.25, radiusAxis: "x" as const }
		const geo = computeCirclePixels(circle, inner, noScales)
		// r = width * 0.25 = 100
		expect(geo?.r).toBe(100)
	})

	it("scales radius off the y-axis extent (inner.height) when axis=y", () => {
		const circle = { ...newCircle("c1"), radius: 0.25, radiusAxis: "y" as const }
		const geo = computeCirclePixels(circle, inner, noScales)
		// r = height * 0.25 = 50
		expect(geo?.r).toBe(50)
	})

	it("reads pixel coords from the top-left corner, radius in on-screen px", () => {
		const circle = {
			...newCircle("c1"),
			coordSystem: "pixels" as const,
			centerX: 30,
			centerY: -20,
			radius: 12,
		}
		const geo = computeCirclePixels(circle, inner, noScales)
		expect(geo?.cx).toBe(130) // left edge 100, 30px in
		expect(geo?.cy).toBe(70) // top 50, 20px down (+y is up)
		expect(geo?.r).toBe(12) // no axis involved
	})

	it("places a bottom-left pixel center from the plot's bottom-left corner", () => {
		const circle = {
			...newCircle("c1"),
			coordSystem: "pixelsBottomLeft" as const,
			centerX: 30,
			centerY: -20,
			radius: 12,
		}
		const geo = computeCirclePixels(circle, inner, noScales)
		expect(geo?.cx).toBe(130)
		expect(geo?.cy).toBe(inner.y + inner.height + 20) // 20px below the bottom
		expect(geo?.r).toBe(12)
	})

	it("respects a non-centered center with the bottom-up y convention", () => {
		const circle = {
			...newCircle("c1"),
			centerX: 0.25,
			centerY: 0, // bottom of plot
			radius: 0.1,
		}
		const geo = computeCirclePixels(circle, inner, noScales)
		expect(geo?.cx).toBe(100 + 400 * 0.25) // 200
		expect(geo?.cy).toBe(50 + 200) // bottom edge = y + height = 250
	})
})

describe("computeCirclePixels — values mode", () => {
	// x domain 0..100 over pixel range [100, 500]: 4 px per unit.
	const xScale = makePositionScale([0, 100], "quantitative", [
		inner.x,
		inner.x + inner.width,
	])
	// y domain 0..50 over INVERTED range [250, 50]: 4 px per unit.
	const yScale = makePositionScale([0, 50], "quantitative", [
		inner.y + inner.height,
		inner.y,
	])
	const ctx = {
		xScale,
		yScale,
		xType: "quantitative" as const,
		yType: "quantitative" as const,
	}

	it("maps the center through the x/y scales", () => {
		const circle = {
			...newCircle("c1"),
			coordSystem: "values" as const,
			centerX: 50,
			centerY: 25,
			radius: 10,
			radiusAxis: "x" as const,
		}
		const geo = computeCirclePixels(circle, inner, ctx)
		// xScale(50): domain niced to [0,100] → midpoint 300
		expect(geo?.cx).toBeCloseTo(300, 5)
		// yScale(25): midpoint of inverted range → 150
		expect(geo?.cy).toBeCloseTo(150, 5)
	})

	it("converts a data-unit radius through the chosen x-axis scale", () => {
		const circle = {
			...newCircle("c1"),
			coordSystem: "values" as const,
			centerX: 50,
			centerY: 25,
			radius: 10,
			radiusAxis: "x" as const,
		}
		const geo = computeCirclePixels(circle, inner, ctx)
		// 10 units * 4 px/unit = 40 px
		expect(geo?.r).toBeCloseTo(40, 5)
	})

	it("uses the y-axis scale for radius when radiusAxis=y", () => {
		const circle = {
			...newCircle("c1"),
			coordSystem: "values" as const,
			centerX: 50,
			centerY: 25,
			radius: 10,
			radiusAxis: "y" as const,
		}
		const geo = computeCirclePixels(circle, inner, ctx)
		// y scale is also 4 px/unit (50 units over 200 px) → 40, magnitude
		expect(geo?.r).toBeCloseTo(40, 5)
	})

	/** A categorical radius axis has no data units, so the circle's own
	 *  `radiusUnit` says what the number means: a fraction of that axis's
	 *  extent (the percent-mode reading, and the default) or on-screen px.
	 *  The circle renders either way instead of vanishing. */
	describe("radius axis without data units", () => {
		const catScaleX = makePositionScale(["a", "b", "c"], "categorical", [
			inner.x,
			inner.x + inner.width,
		])
		const catScaleY = makePositionScale(["p", "q"], "categorical", [
			inner.y + inner.height,
			inner.y,
		])
		const bothCategorical = {
			xScale: catScaleX,
			yScale: catScaleY,
			xType: "categorical" as const,
			yType: "categorical" as const,
		}
		const base = {
			...newCircle("c1"),
			coordSystem: "values" as const,
			centerX: "b",
			centerY: "q",
			radiusAxis: "x" as const,
		}

		it("reads the radius as a fraction of the axis extent by default", () => {
			expect(radiusUnitOf({})).toBe("percent")
			const geo = computeCirclePixels(
				{ ...base, radius: 0.25, radiusUnit: "percent" },
				inner,
				bothCategorical
			)
			// The center still lands on its category: "b" is the middle of three.
			expect(geo?.cx).toBeCloseTo(300, 5)
			// 0.25 × 400 (x extent)
			expect(geo?.r).toBeCloseTo(100, 5)
		})

		it("reads the radius as on-screen px when radiusUnit is px", () => {
			const geo = computeCirclePixels(
				{ ...base, radius: 37, radiusUnit: "px" },
				inner,
				bothCategorical
			)
			expect(geo?.r).toBe(37)
		})

		it("measures a percent radius against the y extent when radiusAxis=y", () => {
			const geo = computeCirclePixels(
				{ ...base, radius: 0.25, radiusAxis: "y", radiusUnit: "percent" },
				inner,
				bothCategorical
			)
			// 0.25 × 200 (y extent)
			expect(geo?.r).toBeCloseTo(50, 5)
		})

		it("applies the unit only when the CHOSEN radius axis lacks data units", () => {
			const mixed = {
				xScale: catScaleX,
				yScale,
				xType: "categorical" as const,
				yType: "quantitative" as const,
			}
			const circle = { ...base, centerY: 25, radius: 0.25, radiusUnit: "px" as const }
			// Radius on the categorical x axis: 0.25 is on-screen px.
			expect(computeCirclePixels(circle, inner, mixed)?.r).toBe(0.25)
			// Same circle measured on the quantitative y axis: 0.25 data units
			// at 4 px/unit — the unit is ignored.
			expect(
				computeCirclePixels({ ...circle, radiusAxis: "y" }, inner, mixed)?.r
			).toBeCloseTo(1, 5)
		})
	})
})

describe("computePolarCirclePixels — radar values mode", () => {
	const center = { cx: 300, cy: 200 }
	// Angle: 0 rad = 12 o'clock, clockwise. "north" at top, "east" at 3 o'clock.
	const angleScale = (raw: unknown): number | null => {
		if (raw === "north") return 0
		if (raw === "east") return Math.PI / 2
		return null
	}
	// r: 1 px per unit (rScale(v) = v).
	const rScale = (raw: unknown): number | null => {
		const n = typeof raw === "number" ? raw : Number(raw)
		return Number.isFinite(n) ? n : null
	}

	it("places the center via the angle + r scales (0 rad = 12 o'clock)", () => {
		const circle = {
			...newCircle("c1"),
			coordSystem: "values" as const,
			centerX: "north", // angle value
			centerY: 50, // r value → 50 px from center, straight up
			radius: 10,
		}
		const geo = computePolarCirclePixels(circle, {
			angleScale,
			rScale,
			center,
			rType: "quantitative",
		})
		expect(geo?.cx).toBeCloseTo(300, 5) // sin(0)=0 → no horizontal offset
		expect(geo?.cy).toBeCloseTo(150, 5) // cos(0)=1 → 50 px up from cy=200
		// radius: rScale(60) − rScale(50) = 10 px
		expect(geo?.r).toBeCloseTo(10, 5)
	})

	it("offsets along the angle (east = 3 o'clock)", () => {
		const circle = {
			...newCircle("c1"),
			coordSystem: "values" as const,
			centerX: "east",
			centerY: 50,
			radius: 5,
		}
		const geo = computePolarCirclePixels(circle, {
			angleScale,
			rScale,
			center,
			rType: "quantitative",
		})
		expect(geo?.cx).toBeCloseTo(350, 5) // sin(π/2)=1 → 50 px right
		expect(geo?.cy).toBeCloseTo(200, 5) // cos(π/2)=0 → level with center
		expect(geo?.r).toBeCloseTo(5, 5)
	})

	it("returns null when the angle value is unknown", () => {
		const circle = {
			...newCircle("c1"),
			coordSystem: "values" as const,
			centerX: "nowhere",
			centerY: 50,
			radius: 5,
		}
		expect(
			computePolarCirclePixels(circle, {
				angleScale,
				rScale,
				center,
				rType: "quantitative",
			})
		).toBeNull()
	})

	it("returns null when the r-axis is categorical (data-unit radius undefined)", () => {
		const circle = {
			...newCircle("c1"),
			coordSystem: "values" as const,
			centerX: "north",
			centerY: 50,
			radius: 5,
		}
		expect(
			computePolarCirclePixels(circle, {
				angleScale,
				rScale,
				center,
				rType: "categorical",
			})
		).toBeNull()
	})
})
