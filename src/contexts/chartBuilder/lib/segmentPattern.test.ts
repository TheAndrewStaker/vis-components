import { describe, expect, it } from "vitest"
import {
	DEFAULT_CONNECTION_CONFIG,
	DEFAULT_LENGTH_CONFIG,
	DEFAULT_PATTERN_CONFIG,
} from "./channelConfig"
import { patternTileSide } from "./patternDefs"
import { PATTERN_PALETTE } from "./patterns"
import {
	chartLevelTileSide,
	resolveSegmentPatternContext,
	resolveSegmentPatternMode,
	segmentDashArray,
	segmentsDrawn,
} from "./segmentPattern"

describe("segmentsDrawn", () => {
	it("needs a mark-role mode and a length variable or default length", () => {
		expect(segmentsDrawn("mark", { length: { field: "v" } }, {})).toBe(true)
		expect(segmentsDrawn("mark", {}, { defaultLength: 20 })).toBe(true)
		expect(segmentsDrawn("mark", {}, {})).toBe(false)
		expect(segmentsDrawn("measure", { length: { field: "v" } }, {})).toBe(false)
		expect(segmentsDrawn("none", {}, { defaultLength: 20 })).toBe(false)
	})
})

describe("resolveSegmentPatternMode", () => {
	it("auto: fill once the stroke holds one tile, else dash", () => {
		expect(
			resolveSegmentPatternMode({ configured: null, thickness: 44, tileSide: 10 })
		).toBe("fill")
		expect(
			resolveSegmentPatternMode({ configured: null, thickness: 10, tileSide: 10 })
		).toBe("fill")
		expect(
			resolveSegmentPatternMode({ configured: null, thickness: 3, tileSide: 10 })
		).toBe("dash")
	})
	it("an explicit pick wins over the thickness", () => {
		expect(
			resolveSegmentPatternMode({ configured: "dash", thickness: 44, tileSide: 10 })
		).toBe("dash")
		expect(
			resolveSegmentPatternMode({ configured: "fill", thickness: 3, tileSide: 10 })
		).toBe("fill")
	})
})

describe("chartLevelTileSide", () => {
	it("no variable: the default pattern's tile at its scale", () => {
		expect(chartLevelTileSide(undefined, 2, false)).toBe(patternTileSide(2))
		expect(
			chartLevelTileSide({ ...DEFAULT_PATTERN_CONFIG, defaultScale: 2 }, 0, false)
		).toBe(patternTileSide(0, 2))
	})
	it("variable mapped: the largest tile at the largest category scale", () => {
		const base = chartLevelTileSide(DEFAULT_PATTERN_CONFIG, null, true)
		expect(base).toBe(10)
		expect(
			chartLevelTileSide(
				{ ...DEFAULT_PATTERN_CONFIG, scales: { a: 3, b: 0.5 } },
				null,
				true
			)
		).toBe(Math.max(...PATTERN_PALETTE.map((_, i) => patternTileSide(i, 3))))
	})
})

describe("resolveSegmentPatternContext", () => {
	const encodings = { length: { field: "v" } }
	it("is null when no segments draw", () => {
		expect(
			resolveSegmentPatternContext({
				lengthRole: "measure",
				encodings,
				channelConfigs: { defaultPattern: 1 },
				patternMapped: false,
			})
		).toBeNull()
	})
	it("resolves the mode for the base thickness and reports the cap", () => {
		expect(
			resolveSegmentPatternContext({
				lengthRole: "mark",
				encodings,
				channelConfigs: {
					defaultPattern: 1,
					length: {
						...DEFAULT_LENGTH_CONFIG,
						segmentThickness: 44,
						segmentLineCap: "square",
					},
				},
				patternMapped: false,
			})
		).toEqual({ thickness: 44, cap: "butt", mode: "fill", tileSide: patternTileSide(1) })
		expect(
			resolveSegmentPatternContext({
				lengthRole: "mark",
				encodings,
				channelConfigs: {},
				patternMapped: true,
			})
		).toEqual({ thickness: 3, cap: "round", mode: "dash", tileSide: 10 })
	})
})

describe("segmentDashArray", () => {
	const conn = { ...DEFAULT_CONNECTION_CONFIG }
	it("auto-cycles the dash by the value's position in the domain", () => {
		expect(
			segmentDashArray({
				patternValue: "b",
				domain: ["a", "b"],
				patternCfg: DEFAULT_PATTERN_CONFIG,
				connectionCfg: conn,
			})
		).toBe("2,6")
	})
	it("per-category custom dasharray and swatch override win", () => {
		const patternCfg = {
			...DEFAULT_PATTERN_CONFIG,
			dashOverrides: { a: "none" as const },
			customDashOverrides: { b: "1 9" },
		}
		expect(
			segmentDashArray({ patternValue: "a", domain: ["a", "b"], patternCfg, connectionCfg: conn })
		).toBeNull()
		expect(
			segmentDashArray({ patternValue: "b", domain: ["a", "b"], patternCfg, connectionCfg: conn })
		).toBe("1,9")
	})
	it("no variable: the connection config's default dash, custom first", () => {
		expect(
			segmentDashArray({ patternValue: null, domain: [], patternCfg: undefined, connectionCfg: conn })
		).toBeNull()
		expect(
			segmentDashArray({
				patternValue: null,
				domain: [],
				patternCfg: undefined,
				connectionCfg: { ...conn, defaultDashPattern: "dashed" },
			})
		).toBe("8,7")
		expect(
			segmentDashArray({
				patternValue: null,
				domain: [],
				patternCfg: undefined,
				connectionCfg: { ...conn, defaultDashPattern: "dashed", customDashPattern: "3 3" },
			})
		).toBe("3,3")
	})
})
