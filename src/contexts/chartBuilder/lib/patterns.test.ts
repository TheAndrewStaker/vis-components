import { describe, expect, it } from "vitest"

import { DEFAULT_PATTERN_CONFIG, PATTERN_SCALE_MAX } from "./channelConfig"
import {
	buildThemeInkFallback,
	effectivePatternScale,
	inkForHueColor,
	PATTERN_NONE,
	PATTERN_SCALE_RENDER_MIN,
	resolveDefaultPatternForMark,
	resolvePatternForMark,
} from "./patterns"
import { polygonPatternView } from "./resolveLayerColor"

describe("resolvePatternForMark", () => {
	it("returns a pattern spec for categories without an override", () => {
		const result = resolvePatternForMark("A", 0, "#ff0000", {
			...DEFAULT_PATTERN_CONFIG,
		})
		expect(result).not.toBeNull()
		expect(result?.paletteIdx).toBe(0)
		expect(result?.bgColor).toBe("#ff0000")
		expect(result?.svgId).toMatch(/^vc-pat-/)
	})

	it("returns null when the category override is PATTERN_NONE", () => {
		const result = resolvePatternForMark("A", 0, "#ff0000", {
			...DEFAULT_PATTERN_CONFIG,
			overrides: { A: PATTERN_NONE },
		})
		expect(result).toBeNull()
	})

	it("respects PATTERN_NONE per-category — other categories still get patterns", () => {
		const config = {
			...DEFAULT_PATTERN_CONFIG,
			overrides: { A: PATTERN_NONE, B: 2 } as Record<
				string,
				number | typeof PATTERN_NONE
			>,
		}
		expect(resolvePatternForMark("A", 0, "#fff", config)).toBeNull()
		const b = resolvePatternForMark("B", 1, "#fff", config)
		expect(b).not.toBeNull()
		expect(b?.paletteIdx).toBe(2)
	})
})

describe("PATTERN_NONE", () => {
	it('is the literal string "none"', () => {
		expect(PATTERN_NONE).toBe("none")
	})
})

describe("pattern scale", () => {
	it("renders at ×1 with the pre-Scale id when the category has no stored scale", () => {
		const r = resolvePatternForMark("A", 0, "#ff0000", {
			...DEFAULT_PATTERN_CONFIG,
		})
		expect(r?.scale).toBe(1)
		expect(r?.svgId).toBe("vc-pat-0-ff0000-0f172a")
	})

	it("carries the category's scale and bakes it into the def id", () => {
		const r = resolvePatternForMark("A", 0, "#ff0000", {
			...DEFAULT_PATTERN_CONFIG,
			scales: { A: 2.5 },
		})
		expect(r?.scale).toBe(2.5)
		expect(r?.svgId).toBe("vc-pat-0-ff0000-0f172a-x2p5")
	})

	it("ignores another category's scale", () => {
		const r = resolvePatternForMark("B", 1, "#ff0000", {
			...DEFAULT_PATTERN_CONFIG,
			scales: { A: 2.5 },
		})
		expect(r?.scale).toBe(1)
	})

	it("floors a stored 0 at the render minimum and caps at the max", () => {
		expect(effectivePatternScale(0)).toBe(PATTERN_SCALE_RENDER_MIN)
		expect(effectivePatternScale(-3)).toBe(PATTERN_SCALE_RENDER_MIN)
		expect(effectivePatternScale(99)).toBe(PATTERN_SCALE_MAX)
		expect(effectivePatternScale(2)).toBe(2)
		expect(effectivePatternScale(null)).toBe(1)
		expect(effectivePatternScale(undefined)).toBe(1)
		expect(effectivePatternScale(Number.NaN)).toBe(1)
		expect(
			resolvePatternForMark("A", 0, "#fff", {
				...DEFAULT_PATTERN_CONFIG,
				scales: { A: 0 },
			})?.scale
		).toBe(PATTERN_SCALE_RENDER_MIN)
	})

	it("resolveDefaultPatternForMark applies the default scale (null = ×1)", () => {
		const r = resolveDefaultPatternForMark("#ffffff", 3, "#000000", 1.5)
		expect(r?.paletteIdx).toBe(3)
		expect(r?.inkColor).toBe("#000000")
		expect(r?.scale).toBe(1.5)
		expect(r?.svgId).toMatch(/-x1p5$/)
		const unscaled = resolveDefaultPatternForMark("#ffffff", 3, "#000000", null)
		expect(unscaled?.scale).toBe(1)
		expect(unscaled?.svgId).toBe("vc-pat-3-ffffff-000000")
	})

	it("polygonPatternView re-points the scale maps at the polygon picks", () => {
		const view = polygonPatternView({
			pattern: {
				...DEFAULT_PATTERN_CONFIG,
				scales: { A: 2 },
				defaultScale: 1.5,
				polygonScales: { A: 3 },
				defaultPolygonScale: 0.5,
			},
		})
		expect(view.pattern.scales).toEqual({ A: 3 })
		expect(view.pattern.defaultScale).toBe(0.5)
		// Absent polygon picks → ×1, never the point-fill scales.
		const bare = polygonPatternView({
			pattern: { ...DEFAULT_PATTERN_CONFIG, scales: { A: 2 }, defaultScale: 2 },
		})
		expect(bare.pattern.scales).toEqual({})
		expect(bare.pattern.defaultScale).toBeNull()
	})
})

describe("buildThemeInkFallback", () => {
	const pal = (
		id: string,
		colors: string[],
		patternInks?: Array<string | null>
	) => ({ id, name: id, colors, patternInks })

	it("flattens every palette's paired inks, skipping unset entries", () => {
		const table = buildThemeInkFallback({
			categoricalPalettes: [pal("a", ["#111111", "#222222"], ["#aaa", null])],
			ordinalPalettes: [pal("b", ["#333333"], ["#bbb"])],
		})
		expect(table).toEqual({ "#111111": "#aaa", "#333333": "#bbb" })
	})

	it("lowercases keys and keeps the FIRST palette's ink for a duplicated hex", () => {
		const table = buildThemeInkFallback({
			categoricalPalettes: [
				pal("a", ["#ABCDEF"], ["#first"]),
				pal("b", ["#abcdef"], ["#second"]),
			],
			ordinalPalettes: [],
		})
		expect(table).toEqual({ "#abcdef": "#first" })
	})

	it("returns an empty table when no palette pairs inks", () => {
		expect(
			buildThemeInkFallback({
				categoricalPalettes: [pal("a", ["#111111"])],
				ordinalPalettes: [],
			})
		).toEqual({})
	})
})

describe("inkForHueColor", () => {
	const palette = ["#e0f2fe", "#7dd3fc"]
	const inks = ["#ff0000", null]

	it("returns the active palette's paired ink when the color is a swatch", () => {
		expect(inkForHueColor("#E0F2FE", palette, inks)).toBe("#ff0000")
	})

	it("returns null off-palette with no fallback table", () => {
		expect(inkForHueColor("#123456", palette, inks)).toBeNull()
	})

	it("falls back to the cross-palette table for off-palette colors", () => {
		expect(
			inkForHueColor("#123456", palette, inks, { "#123456": "#ababab" })
		).toBe("#ababab")
	})

	it("active palette pairing wins over the fallback table", () => {
		expect(
			inkForHueColor("#e0f2fe", palette, inks, { "#e0f2fe": "#ababab" })
		).toBe("#ff0000")
	})

	it("falls back when the swatch is on-palette but its ink is unset", () => {
		expect(
			inkForHueColor("#7dd3fc", palette, inks, { "#7dd3fc": "#ababab" })
		).toBe("#ababab")
	})
})
