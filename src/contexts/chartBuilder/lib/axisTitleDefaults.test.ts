import { describe, expect, it } from "vitest"

// Prime the module graph in the order the sibling chartModes tests use.
import "./chartMode"
import { defaultAxisTitles } from "./axisTitleDefaults"
import { BarsXMode } from "./chartModes/barsX"
import { PiesMode } from "./chartModes/pies"
import { PiesXMode } from "./chartModes/piesX"
import { RadarMode } from "./chartModes/radar"
import { ScatterMode } from "./chartModes/scatter"
import { emptyEncodings } from "./types"

const enc = (overrides: Record<string, string>) => {
	const e = emptyEncodings()
	for (const [ch, field] of Object.entries(overrides)) {
		;(e as Record<string, { field: string | null }>)[ch] = { field }
	}
	return e
}

describe("defaultAxisTitles", () => {
	it("scatter: each axis reads its own position field; unmapped → empty", () => {
		expect(
			defaultAxisTitles(ScatterMode, enc({ x: "height", y: "weight" }), null)
		).toEqual({ x: "height", y: "weight" })
		expect(defaultAxisTitles(ScatterMode, enc({ x: "height" }), null)).toEqual({
			x: "height",
			y: "",
		})
	})

	it("vertical bars: the measure axis reads the Length field", () => {
		expect(
			defaultAxisTitles(BarsXMode, enc({ x: "region", length: "sales" }), null)
		).toEqual({ x: "region", y: "sales" })
	})

	it("histogram: the measure axis titles Count / Density after the mode", () => {
		const e = enc({ x: "price" })
		const hist = { categoryChannel: "x" as const, categoryField: "price" }
		expect(
			defaultAxisTitles(BarsXMode, e, { ...hist, mode: "count" })
		).toEqual({ x: "price", y: "Count" })
		expect(
			defaultAxisTitles(BarsXMode, e, { ...hist, mode: "density" })
		).toEqual({ x: "price", y: "Density" })
	})

	it("radar: x falls back to the R field (the R axis reads xAxisTitle)", () => {
		expect(
			defaultAxisTitles(RadarMode, enc({ angle: "metric", r: "score" }), null)
		).toEqual({ x: "score", y: "" })
	})

	it("pies: the band axis reads its category field; a lone pie has none", () => {
		expect(
			defaultAxisTitles(PiesXMode, enc({ x: "year", angle: "share" }), null)
		).toEqual({ x: "year", y: "" })
		expect(defaultAxisTitles(PiesMode, enc({ angle: "share" }), null)).toEqual({
			x: "",
			y: "",
		})
	})
})
