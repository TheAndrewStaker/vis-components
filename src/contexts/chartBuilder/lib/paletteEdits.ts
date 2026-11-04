/** Palette picks as the Color panels write them, shared with the settings
 * path: a pick resets the per-value colors and writes the palette's
 * colors (and pattern inks) beside its id. */

import {
	DEFAULT_CATEGORICAL_HUE_CONFIG,
	type ChannelConfigs,
	type ColorSlotConfig,
	type DataLabelsConfig,
} from "./channelConfig"
import { CATEGORICAL_HUE_PALETTE } from "./scales"
import { preserveStackMode } from "./stackMode"
import type { FieldType, Theme } from "./types"

type Palette = { id: string; name?: string; colors: string[]; patternInks?: Array<string | null> }

/** The palettes the Fill panel offers a field of `type`. */
export const palettesFor = (theme: Theme, type: FieldType | null): Palette[] =>
	type === "ordinal" ? [...theme.ordinalPalettes, ...theme.categoricalPalettes] : theme.categoricalPalettes

const inksFor = (pal: Palette | undefined, fallback: readonly string[]): Array<string | null> => {
	const colors = pal?.colors ?? fallback
	const inks = pal?.patternInks ?? []
	return colors.map((_, i) => inks[i] ?? null)
}

/** The Fill panel's palette pick for the hue channel. */
export const pickHuePalette = (
	prev: ChannelConfigs,
	theme: Theme,
	paletteId: string,
	type: FieldType | null
): ChannelConfigs => {
	const pal = palettesFor(theme, type).find((p) => p.id === paletteId)
	const hue = preserveStackMode(prev.hue, { ...DEFAULT_CATEGORICAL_HUE_CONFIG, colors: {} })
	const colors = [...(pal?.colors ?? CATEGORICAL_HUE_PALETTE)]
	const inks = inksFor(pal, CATEGORICAL_HUE_PALETTE)
	return type === "ordinal"
		? { ...prev, hue, ordinalPaletteId: paletteId, ordinalPalette: colors, ordinalPalettePatternInks: inks }
		: {
				...prev,
				hue,
				categoricalPaletteId: paletteId,
				categoricalPalette: colors,
				categoricalPalettePatternInks: inks,
			}
}

/** A color slot's (Line, Rug, Stem, …) palette pick. */
export const pickSlotPalette = (
	theme: Theme,
	paletteId: string,
	type: FieldType | null
): Pick<ColorSlotConfig, "paletteId" | "palette" | "hue"> => {
	const pal = (type === "ordinal" ? theme.ordinalPalettes : theme.categoricalPalettes).find(
		(p) => p.id === paletteId
	)
	return {
		paletteId,
		palette: [...(pal?.colors ?? CATEGORICAL_HUE_PALETTE)],
		hue: { ...DEFAULT_CATEGORICAL_HUE_CONFIG, colors: {} },
	}
}

/** The Data Labels palette pick (a theme palette by id). */
export const pickLabelPalette = (
	theme: Theme,
	paletteId: string
): Pick<DataLabelsConfig, "paletteId" | "palette" | "colorOverrides"> => {
	const pal = theme.categoricalPalettes.find((p) => p.id === paletteId)
	return { paletteId, palette: [...(pal?.colors ?? CATEGORICAL_HUE_PALETTE)], colorOverrides: {} }
}

/** The ids a theme's palettes answer to, for a refusal message. */
export const paletteIdsOf = (theme: Theme): string[] =>
	[...theme.categoricalPalettes, ...theme.ordinalPalettes].map((p) => p.id)
