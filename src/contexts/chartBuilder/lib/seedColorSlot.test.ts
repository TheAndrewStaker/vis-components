import { describe, expect, it } from "vitest"

import { buildQuantHueConfigFromTheme } from "./hueDefaults"
import { DEFAULT_CATEGORICAL_HUE_CONFIG } from "./channelConfig"
import {
	seedColorSlot,
	seedHueChannel,
	seedOutlineHueChannel,
} from "./seedColorSlot"
import { LIGHT_THEME_BASE as theme } from "./systemThemes"
import { resolveTextPalettePick } from "./themeConfig"

const ordinal = theme.ordinalPalettes.find(
	(p) => p.id === theme.defaultOrdinalPaletteId
)
const categorical = theme.categoricalPalettes.find(
	(p) => p.id === theme.defaultCategoricalPaletteId
)

describe("seedColorSlot", () => {
	it("seeds the theme gradient for a continuous field", () => {
		expect(seedColorSlot("sales", "quantitative", theme)).toEqual({
			field: "sales",
			hue: buildQuantHueConfigFromTheme(theme),
		})
	})

	it("seeds a copy of the ordinal ramp for an ordinal field", () => {
		const slot = seedColorSlot("size", "ordinal", theme)
		expect(slot.paletteId).toBe(ordinal?.id)
		expect(slot.palette).toEqual(ordinal?.colors)
		expect(slot.palette).not.toBe(ordinal?.colors)
		expect(slot.hue).toMatchObject({ kind: "categorical", colors: {} })
	})

	it("seeds a copy of the categorical palette for a categorical field", () => {
		const slot = seedColorSlot("region", "categorical", theme)
		expect(slot.paletteId).toBe(categorical?.id)
		expect(slot.palette).toEqual(categorical?.colors)
		expect(slot.palette).not.toBe(categorical?.colors)
	})

	it("leads with the text palette for a text slot", () => {
		const slot = seedColorSlot("region", "categorical", theme, "text")
		const pick = resolveTextPalettePick(theme)
		expect(slot.paletteId).toBe(pick.id)
		expect(slot.palette).toEqual(pick.colors)
	})
})

describe("seedHueChannel / seedOutlineHueChannel", () => {
	const quant = buildQuantHueConfigFromTheme(theme)
	const cat = { ...DEFAULT_CATEGORICAL_HUE_CONFIG, colors: { a: "#000" } }

	it("swaps hue kinds through the stashes, the way the shelf does", () => {
		const toQuant = seedHueChannel({ hue: cat }, "temporal", theme)
		expect(toQuant).toEqual({ hue: quant, hueCategoricalStash: cat })
		const back = seedHueChannel(toQuant, "categorical", theme)
		expect(back).toEqual({ hue: cat, hueCategoricalStash: cat, hueQuantStash: quant })
		expect(seedHueChannel(back, "ordinal", theme)).toBe(back)
	})

	it("seeds a continuous outline from the theme and drops it for a discrete one", () => {
		expect(seedOutlineHueChannel({}, "quantitative", theme)).toEqual({ outlineHue: quant })
		expect(seedOutlineHueChannel({ outlineHue: quant }, "categorical", theme)).toEqual({
			outlineHue: undefined,
		})
	})
})
