import { scaleOrdinal } from "d3-scale"
import { describe, expect, it } from "vitest"
import type { AestheticScales } from "../store/useAestheticScales"

import {
	DEFAULT_PATTERN_CONFIG,
	DEFAULT_SHAPE_CONFIG,
	EMPTY_CHANNEL_CONFIGS,
} from "./channelConfig"
import {
	layerFillProp,
	resolveLayerColor,
	resolvePatternDefForItem,
	resolvePolygonPatternDef,
	resolveSlotColor,
} from "./resolveLayerColor"

/** AestheticScales with every channel un-mapped (the "no encoding"
 *  baseline). Each test below populates only the channel(s) it exercises. */
const emptyScales: AestheticScales = {
	hue: null,
	outlineHue: null,
	saturation: null,
	brightness: null,
	pattern: null,
	colorSlots: {},
	opacitySlots: {},
	opacity: null,
	area: null,
	shape: null,
	length: null,
	angle: null,
}

describe("resolveLayerColor", () => {
	it("returns the default fill / opacity when nothing is mapped", () => {
		const r = resolveLayerColor({
			groupValues: {},
			defaultFill: "#abcdef",
			patternBgOverride: "#e2e8f0",
			aestheticScales: emptyScales,
			channelConfigs: EMPTY_CHANNEL_CONFIGS,
		})
		expect(r.fill).toBe("#abcdef")
		expect(r.opacity).toBe(1)
		expect(r.patternId).toBeNull()
	})

	it("applies the hue scale when hue is mapped and the row has a value", () => {
		// `applyHueScale` (called inside `resolveLayerColor`) requires a
		// real `HueScale` discriminated union — the categorical variant
		// wraps a d3 `scaleOrdinal`.
		const scales: AestheticScales = {
			...emptyScales,
			hue: {
				field: { name: "category", type: "categorical" },
				scale: {
					kind: "categorical",
					scale: scaleOrdinal<string, string>()
						.domain(["A", "B"])
						.range(["#ff0000", "#00ff00"]),
				},
			},
		}
		const r = resolveLayerColor({
			groupValues: { hue: "A" },
			defaultFill: "#000",
			patternBgOverride: "#fff",
			aestheticScales: scales,
			channelConfigs: EMPTY_CHANNEL_CONFIGS,
		})
		expect(r.fill).toBe("#ff0000")
	})

	it("falls back to defaultFill when the hue scale's lookup yields no color", () => {
		// scaleOrdinal returns "" (empty string) for unknown domain values
		// when the range is empty — and `applyHueScale` returns null when
		// `parseValue` can't coerce the input. We exercise the parseValue-
		// null path by passing a non-stringifiable hue value.
		const scales: AestheticScales = {
			...emptyScales,
			hue: {
				field: { name: "category", type: "quantitative" },
				scale: {
					kind: "categorical",
					scale: scaleOrdinal<string, string>()
						.domain(["A"])
						.range(["#ff0000"]),
				},
			},
		}
		const r = resolveLayerColor({
			// quantitative type but a non-numeric value → parseValue → null.
			groupValues: { hue: "not-a-number" },
			defaultFill: "#deadbe",
			patternBgOverride: "#fff",
			aestheticScales: scales,
			channelConfigs: EMPTY_CHANNEL_CONFIGS,
		})
		expect(r.fill).toBe("#deadbe")
	})

	it("uses channel-config defaults when sat/bri channels aren't mapped", () => {
		// modulateColor is deterministic for given (color, sat, bri) inputs.
		// We don't assert the exact output color (that's modulateColor's
		// contract) — just that ANY modulation happened (output differs
		// from input) when the default sat/bri are non-null.
		const r = resolveLayerColor({
			groupValues: {},
			defaultFill: "#888888",
			patternBgOverride: "#fff",
			aestheticScales: emptyScales,
			channelConfigs: {
				...EMPTY_CHANNEL_CONFIGS,
				defaultSaturation: 0.4,
				defaultBrightness: 0.7,
			},
		})
		// Modulation produced a different color (proves the default sat/bri
		// flowed into modulateColor, not that the output is a specific hex).
		expect(r.fill).not.toBe("#888888")
	})

	it("returns opacity 1 when no opacity is mapped and no default is set", () => {
		const r = resolveLayerColor({
			groupValues: {},
			defaultFill: "#fff",
			patternBgOverride: "#fff",
			aestheticScales: emptyScales,
			channelConfigs: EMPTY_CHANNEL_CONFIGS,
		})
		expect(r.opacity).toBe(1)
	})

	it("uses defaultOpacity from channelConfigs when opacity isn't mapped", () => {
		const r = resolveLayerColor({
			groupValues: {},
			defaultFill: "#fff",
			patternBgOverride: "#fff",
			aestheticScales: emptyScales,
			channelConfigs: { ...EMPTY_CHANNEL_CONFIGS, defaultOpacity: 0.3 },
		})
		expect(r.opacity).toBe(0.3)
	})

	it("falls back to defaultOpacity when the mapped opacity scale can't resolve", () => {
		// UNIFIED CONVENTION (2026-08): mapped-but-unresolvable values fall
		// back to the channel's DEFAULT level — the same rule hue follows with
		// `defaultFill`, shared with the per-row `resolveMarkAesthetics` so
		// row- and group-based renderers can't drift apart again.
		const scales: AestheticScales = {
			...emptyScales,
			opacity: {
				field: { name: "op", type: "quantitative" },
				scale: () => null,
			},
		}
		const r = resolveLayerColor({
			groupValues: { opacity: "junk" },
			defaultFill: "#fff",
			patternBgOverride: "#fff",
			aestheticScales: scales,
			channelConfigs: { ...EMPTY_CHANNEL_CONFIGS, defaultOpacity: 0.3 },
		})
		expect(r.opacity).toBe(0.3)
	})

	it("falls back to defaultSaturation when the mapped saturation scale can't resolve", () => {
		// Same unified convention for sat/bri: unresolvable-mapped degrades to
		// the channel default (modulation still applies) rather than silently
		// skipping modulation for one slice.
		const scales: AestheticScales = {
			...emptyScales,
			saturation: {
				field: { name: "sat", type: "quantitative" },
				scale: () => null,
			},
		}
		const r = resolveLayerColor({
			groupValues: { saturation: "junk" },
			defaultFill: "#6699cc",
			patternBgOverride: "#fff",
			aestheticScales: scales,
			channelConfigs: { ...EMPTY_CHANNEL_CONFIGS, defaultSaturation: 0.9 },
		})
		// Modulation at the default level happened (fill left the base color).
		expect(r.fill).not.toBe("#6699cc")
	})

	it("returns patternId=null when pattern channel isn't mapped", () => {
		const r = resolveLayerColor({
			groupValues: { pattern: "X" },
			defaultFill: "#fff",
			patternBgOverride: "#fff",
			aestheticScales: emptyScales,
			channelConfigs: EMPTY_CHANNEL_CONFIGS,
		})
		expect(r.patternId).toBeNull()
	})

	it("honors defaultPattern when the renderer opts in via patternOptions", () => {
		// UNIFIED CONVENTION (2026-08): the configured default pattern (no
		// pattern field mapped) applies to every mark-fill renderer — bars,
		// areas, pies AND scatter — via the same `includeDefaultPattern`
		// opt-in ScatterPlot already used. Without the opt-in (geo/structure
		// renderers keep their own pattern semantics) nothing changes.
		const configs = { ...EMPTY_CHANNEL_CONFIGS, defaultPattern: 3 }
		const withOptIn = resolveLayerColor({
			groupValues: {},
			defaultFill: "#fff",
			patternBgOverride: "#fff",
			aestheticScales: emptyScales,
			channelConfigs: configs,
			patternOptions: { includeDefaultPattern: true },
		})
		expect(withOptIn.patternId).toContain("vc-pat-3")
		const withoutOptIn = resolveLayerColor({
			groupValues: {},
			defaultFill: "#fff",
			patternBgOverride: "#fff",
			aestheticScales: emptyScales,
			channelConfigs: configs,
		})
		expect(withoutOptIn.patternId).toBeNull()
	})

	it("defaultToNone suppresses auto-cycled field-mapped patterns (line-chart context)", () => {
		const scales: AestheticScales = {
			...emptyScales,
			pattern: {
				field: { name: "p", type: "categorical" },
				categories: ["A", "B"],
			},
		}
		const base = {
			groupValues: { pattern: "A" },
			defaultFill: "#fff",
			patternBgOverride: "#fff",
			aestheticScales: scales,
			channelConfigs: EMPTY_CHANNEL_CONFIGS,
		}
		// Without the flag the palette auto-cycles by category position…
		expect(resolveLayerColor(base).patternId).not.toBeNull()
		// …with it, no per-category override means no pattern.
		expect(
			resolveLayerColor({
				...base,
				patternOptions: { defaultToNone: true },
			}).patternId
		).toBeNull()
	})

	it("keeps the palette-paired pattern ink when sat/bri modulation rewrites the fill", () => {
		// Regression: the ink lookup matches the theme palette's exact swatch
		// hexes. A theme-driven defaultSaturation modulates the fill hex out of
		// the palette; the lookup must key on the PRE-modulation hue color or
		// every mark falls back to the near-black default ink.
		const palette = ["#e0f2fe", "#7dd3fc"]
		const scales: AestheticScales = {
			...emptyScales,
			hue: {
				field: { name: "grp", type: "categorical" },
				scale: {
					kind: "categorical",
					scale: scaleOrdinal<string, string>()
						.domain(["A", "B"])
						.range(palette),
				},
			},
			pattern: {
				field: { name: "grp", type: "categorical" },
				categories: ["A", "B"],
			},
		}
		const r = resolveLayerColor({
			groupValues: { hue: "A", pattern: "A" },
			defaultFill: "#000",
			patternBgOverride: "#fff",
			aestheticScales: scales,
			channelConfigs: {
				...EMPTY_CHANNEL_CONFIGS,
				categoricalPalette: palette,
				categoricalPalettePatternInks: ["#ff0000", "#00ff00"],
				// Well BELOW the 0.5 anchor: levels are relative now, so a
				// level near the anchor barely moves a near-white swatch's
				// hex — this one has to actually leave the palette.
				defaultSaturation: 0.1,
			},
		})
		// Fill got modulated off the palette swatch…
		expect(r.fill).not.toBe(palette[0])
		// …but the pattern still carries the swatch's paired ink.
		expect(r.patternId).toContain("ff0000")
	})

	it("resolves the ink through the cross-palette table for hue colors off the active palette", () => {
		// A per-value hue override borrowed from another theme palette isn't
		// in the ACTIVE categorical palette; its paired ink must come from
		// the theme-wide table instead of the near-black default.
		const palette = ["#e0f2fe", "#7dd3fc"]
		const scales: AestheticScales = {
			...emptyScales,
			hue: {
				field: { name: "grp", type: "categorical" },
				scale: {
					kind: "categorical",
					// "A" carries an override color from another palette (the
					// hue scale bakes per-value overrides into its range).
					scale: scaleOrdinal<string, string>()
						.domain(["A", "B"])
						.range(["#123456", palette[1]]),
				},
			},
			pattern: {
				field: { name: "grp", type: "categorical" },
				categories: ["A", "B"],
			},
			themeInkFallback: { "#123456": "#ababab" },
		}
		const r = resolveLayerColor({
			groupValues: { hue: "A", pattern: "A" },
			defaultFill: "#000",
			patternBgOverride: "#fff",
			aestheticScales: scales,
			channelConfigs: {
				...EMPTY_CHANNEL_CONFIGS,
				categoricalPalette: palette,
				categoricalPalettePatternInks: ["#ff0000", "#00ff00"],
			},
		})
		expect(r.patternId).toContain("ababab")
	})

	// Conditional outline rules test the mapped outline variable's value and
	// override the outlineHue scale color when one matches. Only fire when an
	// outline field is mapped.
	const outlineScales: AestheticScales = {
		...emptyScales,
		outlineHue: {
			field: { name: "value", type: "quantitative" },
			scale: {
				kind: "categorical",
				scale: scaleOrdinal<string, string>()
					.domain(["20"])
					.range(["#0000ff"]),
			},
		},
	}

	it("a matching outline rule overrides the outlineHue scale color", () => {
		const r = resolveLayerColor({
			groupValues: { outlineHue: "20" },
			defaultFill: "#fff",
			patternBgOverride: "#fff",
			aestheticScales: outlineScales,
			channelConfigs: {
				...EMPTY_CHANNEL_CONFIGS,
				shape: {
					...DEFAULT_SHAPE_CONFIG,
					outlineColorRules: [{ condition: "> 15", color: "#ff0000" }],
				},
			},
		})
		expect(r.outline).toBe("#ff0000")
	})

	it("keeps the scale color when no outline rule matches", () => {
		const r = resolveLayerColor({
			groupValues: { outlineHue: "20" },
			defaultFill: "#fff",
			patternBgOverride: "#fff",
			aestheticScales: outlineScales,
			channelConfigs: {
				...EMPTY_CHANNEL_CONFIGS,
				shape: {
					...DEFAULT_SHAPE_CONFIG,
					outlineColorRules: [{ condition: "> 50", color: "#ff0000" }],
				},
			},
		})
		expect(r.outline).toBe("#0000ff")
	})

	it("ignores outline rules when no outline field is mapped", () => {
		const r = resolveLayerColor({
			groupValues: {},
			defaultFill: "#fff",
			patternBgOverride: "#fff",
			aestheticScales: emptyScales,
			channelConfigs: {
				...EMPTY_CHANNEL_CONFIGS,
				shape: {
					...DEFAULT_SHAPE_CONFIG,
					outlineColorRules: [{ condition: "> 0", color: "#ff0000" }],
				},
			},
		})
		expect(r.outline).toBeNull()
	})

	it("a {Variable} outline rule fires with NO outline field mapped, testing the rows", () => {
		const configs = {
			...EMPTY_CHANNEL_CONFIGS,
			shape: {
				...DEFAULT_SHAPE_CONFIG,
				outlineColorRules: [{ condition: "{profit} < 0", color: "#ff0000" }],
			},
		}
		const loss = resolveLayerColor({
			groupValues: {},
			defaultFill: "#fff",
			patternBgOverride: "#fff",
			aestheticScales: emptyScales,
			channelConfigs: configs,
			rows: [{ profit: -5 }, { profit: -1 }],
		})
		expect(loss.outline).toBe("#ff0000")
		// Every-row semantics: one profitable row keeps the bar off the rule.
		const mixed = resolveLayerColor({
			groupValues: {},
			defaultFill: "#fff",
			patternBgOverride: "#fff",
			aestheticScales: emptyScales,
			channelConfigs: configs,
			rows: [{ profit: -5 }, { profit: 3 }],
		})
		expect(mixed.outline).toBeNull()
	})
})

describe("resolveLayerColor — fill color rules", () => {
	const hueScales: AestheticScales = {
		...emptyScales,
		hue: {
			field: { name: "value", type: "quantitative" },
			scale: {
				kind: "categorical",
				scale: scaleOrdinal<string, string>()
					.domain(["20", "5"])
					.range(["#0000ff", "#00ff00"]),
			},
		},
	}
	const rules = [{ condition: "> 15", color: "#ff0000" }]

	it("a matching implicit rule replaces the hue scale color", () => {
		const r = resolveLayerColor({
			groupValues: { hue: "20" },
			defaultFill: "#fff",
			patternBgOverride: "#fff",
			aestheticScales: hueScales,
			channelConfigs: { ...EMPTY_CHANNEL_CONFIGS, fillColorRules: rules },
		})
		expect(r.fill).toBe("#ff0000")
		// The rule color is the pre-modulation hue too (pattern-ink key).
		expect(r.preModulationHue).toBe("#ff0000")
	})

	it("keeps the scale color when no rule matches", () => {
		const r = resolveLayerColor({
			groupValues: { hue: "5" },
			defaultFill: "#fff",
			patternBgOverride: "#fff",
			aestheticScales: hueScales,
			channelConfigs: { ...EMPTY_CHANNEL_CONFIGS, fillColorRules: rules },
		})
		expect(r.fill).toBe("#00ff00")
	})

	it("an implicit rule never fires without a Color variable; a {Variable} rule does", () => {
		const base = {
			defaultFill: "#abcdef",
			patternBgOverride: "#fff",
			aestheticScales: emptyScales,
		}
		const implicit = resolveLayerColor({
			...base,
			groupValues: {},
			channelConfigs: { ...EMPTY_CHANNEL_CONFIGS, fillColorRules: rules },
			rows: [{ value: 99 }],
		})
		expect(implicit.fill).toBe("#abcdef")
		const byVariable = resolveLayerColor({
			...base,
			groupValues: {},
			channelConfigs: {
				...EMPTY_CHANNEL_CONFIGS,
				fillColorRules: [{ condition: "{value} > 15", color: "#ff0000" }],
			},
			rows: [{ value: 99 }],
		})
		expect(byVariable.fill).toBe("#ff0000")
	})

	it("the rule color is modulated by a mapped brightness like any fill", () => {
		const r = resolveLayerColor({
			groupValues: { hue: "20" },
			defaultFill: "#fff",
			patternBgOverride: "#fff",
			aestheticScales: hueScales,
			channelConfigs: {
				...EMPTY_CHANNEL_CONFIGS,
				fillColorRules: rules,
				defaultBrightness: 0.9,
			},
		})
		expect(r.preModulationHue).toBe("#ff0000")
		expect(r.fill).not.toBe("#ff0000")
	})
})

describe("resolveSlotColor — slot color rules", () => {
	const lineSlot = {
		field: { name: "grp", type: "categorical" as const },
		scale: {
			kind: "categorical" as const,
			scale: scaleOrdinal<string, string>()
				.domain(["A", "B"])
				.range(["#0000ff", "#00ff00"]),
		},
	}

	it("a matching implicit rule beats the slot's scale color", () => {
		const cfg = {
			field: "grp",
			singleColor: "#111111",
			colorRules: [{ condition: "== A", color: "#ff0000" }],
		}
		expect(resolveSlotColor(lineSlot, cfg, { grp: "A" }, "#999")).toBe("#ff0000")
		expect(resolveSlotColor(lineSlot, cfg, { grp: "B" }, "#999")).toBe("#00ff00")
	})

	it("a {Variable} rule beats the single color and tests every row of the mark", () => {
		const cfg = {
			field: null,
			singleColor: "#111111",
			colorRules: [{ condition: "{profit} < 0", color: "#ff0000" }],
		}
		const row = { grp: "A", profit: -1 }
		expect(resolveSlotColor(null, cfg, row, "#999")).toBe("#ff0000")
		expect(
			resolveSlotColor(null, cfg, row, "#999", [row, { grp: "A", profit: 2 }])
		).toBe("#111111")
	})

	it("an empty rule list changes nothing", () => {
		const cfg = { field: null, singleColor: "#111111", colorRules: [] }
		expect(resolveSlotColor(null, cfg, { grp: "A" }, "#999")).toBe("#111111")
	})
})

describe("layerFillProp", () => {
	it("returns the base fill when no pattern is applied", () => {
		expect(
			layerFillProp({ fill: "#123456", preModulationHue: "#123456", opacity: 1, patternId: null, outline: null })
		).toBe("#123456")
	})

	it("returns a url(#id) reference when a pattern is applied", () => {
		expect(
			layerFillProp({ fill: "#123456", preModulationHue: "#123456", opacity: 1, patternId: "pat-7", outline: null })
		).toBe("url(#pat-7)")
	})
})

describe("resolvePolygonPatternDef (radar polygon fill)", () => {
	const item = {
		patternValue: undefined,
		fill: "#fff",
		preModulationHue: "#fff",
		satUnit: null,
		briUnit: null,
	}

	it("returns null when no polygon pattern is configured — even with a POINT default pattern set", () => {
		// The polygon pick is separate from the points': `defaultPattern`
		// alone must not pattern the polygon body.
		const configs = { ...EMPTY_CHANNEL_CONFIGS, defaultPattern: 2 }
		expect(resolvePolygonPatternDef(item, emptyScales, configs, "#fff")).toBeNull()
	})

	it("honors pattern.defaultPolygonPattern (+ its ink) with no pattern variable mapped", () => {
		const configs = {
			...EMPTY_CHANNEL_CONFIGS,
			pattern: {
				...DEFAULT_PATTERN_CONFIG,
				defaultPolygonPattern: 4,
				defaultPolygonPatternInk: "#123456",
			},
		}
		const d = resolvePolygonPatternDef(item, emptyScales, configs, "#fff")
		expect(d?.paletteIdx).toBe(4)
		expect(d?.inkColor).toBe("#123456")
	})

	it("with a pattern variable mapped, only categories with a polygon pick get a def (opt-in, like point fills under a connection)", () => {
		const scales: AestheticScales = {
			...emptyScales,
			pattern: {
				field: { name: "p", type: "categorical" },
				categories: ["A", "B"],
			},
		}
		const configs = {
			...EMPTY_CHANNEL_CONFIGS,
			pattern: {
				...DEFAULT_PATTERN_CONFIG,
				// A POINT-fill pick for B must not leak onto the polygon.
				overrides: { B: 1 },
				polygonOverrides: { A: 3 },
			},
		}
		const a = resolvePolygonPatternDef(
			{ ...item, patternValue: "A" },
			scales,
			configs,
			"#fff"
		)
		const b = resolvePolygonPatternDef(
			{ ...item, patternValue: "B" },
			scales,
			configs,
			"#fff"
		)
		expect(a?.paletteIdx).toBe(3)
		expect(b).toBeNull()
	})
})

describe("patterns tile over the mark's own fill when hue is unmapped", () => {
	// A bar with no Color variable keeps its default fill under the pattern,
	// and the ink pairs with that fill through the palette — the gray tile
	// that used to replace the fill is gone (an explicit Background override
	// still replaces it).
	const palette = ["#ef476f", "#118ab2"]
	const configs = {
		...EMPTY_CHANNEL_CONFIGS,
		categoricalPalette: palette,
		categoricalPalettePatternInks: ["#8a0023", "#073b55"],
		patternInkColor: "#000000",
		defaultPattern: 1,
	}
	const item = { patternValue: undefined, fill: "#ef476f", preModulationHue: "#ef476f" }
	const optIn = { includeDefaultPattern: true }

	it("default pattern: the tile is the default fill and the ink its paired ink", () => {
		const def = resolvePatternDefForItem(item, emptyScales, configs, null, optIn)
		expect(def?.bgColor).toBe("#ef476f")
		expect(def?.inkColor).toBe("#8a0023")
		// The GroupValues pipeline resolves to the same def.
		const r = resolveLayerColor({
			groupValues: {},
			defaultFill: "#ef476f",
			patternBgOverride: null,
			aestheticScales: emptyScales,
			channelConfigs: configs,
			patternOptions: optIn,
		})
		expect(r.patternId).toBe(def?.svgId)
	})

	it("a fill off every palette falls back to the theme's pattern ink", () => {
		const def = resolvePatternDefForItem(
			{ ...item, fill: "#123456", preModulationHue: "#123456" },
			emptyScales,
			configs,
			null,
			optIn
		)
		expect(def?.bgColor).toBe("#123456")
		expect(def?.inkColor).toBe("#000000")
	})

	it("an explicit default-pattern ink wins over the pairing", () => {
		const def = resolvePatternDefForItem(
			item,
			emptyScales,
			{ ...configs, defaultPatternInk: "#ffffff" },
			null,
			optIn
		)
		expect(def?.inkColor).toBe("#ffffff")
	})

	it("a stored legacy Background override is inert: the tile stays the mark's fill with its paired ink", () => {
		// The Pattern panel's Background swatch is gone (2026-11-04); call
		// sites still thread a stored `pattern.backgroundColor` through, and
		// it must change nothing — the visual follows its Color-menu fill.
		const def = resolvePatternDefForItem(item, emptyScales, configs, "#118ab2", optIn)
		expect(def?.bgColor).toBe("#ef476f")
		expect(def?.inkColor).toBe("#8a0023")
		expect(def).toEqual(
			resolvePatternDefForItem(item, emptyScales, configs, null, optIn)
		)
	})

	it("a field-mapped pattern tiles over the fill the same way", () => {
		const scales: AestheticScales = {
			...emptyScales,
			pattern: { field: { name: "p", type: "categorical" }, categories: ["A"] },
		}
		const def = resolvePatternDefForItem(
			{ ...item, patternValue: "A" },
			scales,
			{ ...configs, defaultPattern: null },
			null
		)
		expect(def?.bgColor).toBe("#ef476f")
		expect(def?.inkColor).toBe("#8a0023")
	})

	it("with hue mapped, the default pattern pairs its ink per hue color", () => {
		const scales: AestheticScales = {
			...emptyScales,
			hue: {
				field: { name: "grp", type: "categorical" },
				scale: {
					kind: "categorical",
					scale: scaleOrdinal<string, string>().domain(["A", "B"]).range(palette),
				},
			},
		}
		const r = resolveLayerColor({
			groupValues: { hue: "B" },
			defaultFill: "#000",
			// The override is ignored while hue drives the fill.
			patternBgOverride: "#ffffff",
			aestheticScales: scales,
			channelConfigs: configs,
			patternOptions: optIn,
		})
		expect(r.fill).toBe("#118ab2")
		expect(r.patternId).toContain("118ab2-073b55")
	})
})
