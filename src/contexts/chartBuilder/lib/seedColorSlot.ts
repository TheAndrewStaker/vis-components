import {
	DEFAULT_CATEGORICAL_HUE_CONFIG,
	type ChannelConfigs,
	type ColorSlotConfig,
} from "./channelConfig"
import { buildQuantHueConfigFromTheme } from "./hueDefaults"
import { CATEGORICAL_HUE_PALETTE } from "./scales"
import { resolveTextPalettePick } from "./themeConfig"
import type { FieldType, Theme } from "./types"

/** The slot update a field pick makes: a continuous field seeds the theme
 * gradient, an ordinal one the theme's ordinal ramp, anything else the
 * theme's categorical palette (its TEXT palette when `paletteKind` is
 * `"text"`). `type` is the field's effective type. */
export const seedColorSlot = (
	fieldName: string,
	type: FieldType,
	theme: Theme,
	paletteKind: "categorical" | "text" = "categorical"
): Partial<ColorSlotConfig> => {
	if (type === "quantitative" || type === "temporal") {
		return { field: fieldName, hue: buildQuantHueConfigFromTheme(theme) }
	}
	if (type === "ordinal") {
		const pal = theme.ordinalPalettes.find(
			(p) => p.id === theme.defaultOrdinalPaletteId
		)
		return {
			field: fieldName,
			hue: { ...DEFAULT_CATEGORICAL_HUE_CONFIG, colors: {} },
			paletteId: pal?.id ?? null,
			palette: [...(pal?.colors ?? CATEGORICAL_HUE_PALETTE)],
		}
	}
	// A slot that colors TEXT leads with the theme's designated TEXT
	// palette — typically darker shades of the mark palette, chosen to
	// stay legible at text sizes, which the mark palette often isn't.
	// Ordinal fields above keep their ordered ramp: the order carries
	// meaning the text palette doesn't encode. Either way this is the
	// seeded DEFAULT — the Palette dropdown re-picks.
	const markPal = theme.categoricalPalettes.find(
		(p) => p.id === theme.defaultCategoricalPaletteId
	)
	const pal =
		paletteKind === "text"
			? resolveTextPalettePick(theme)
			: {
					id: markPal?.id ?? null,
					colors: [...(markPal?.colors ?? CATEGORICAL_HUE_PALETTE)],
				}
	return {
		field: fieldName,
		hue: { ...DEFAULT_CATEGORICAL_HUE_CONFIG, colors: {} },
		paletteId: pal.id,
		palette: pal.colors,
	}
}

const isContinuous = (type: FieldType) =>
	type === "quantitative" || type === "temporal"

/** The configs after a field of `type` lands on the Fill (`hue`) channel, as
 * the encoding shelf writes them: a continuous field restores a stashed
 * gradient (else seeds the theme's), a discrete one the stashed categorical
 * config; each kind switch stashes the outgoing config so a round trip keeps
 * the user's picks. */
export const seedHueChannel = (
	prev: ChannelConfigs,
	type: FieldType,
	theme: Theme
): ChannelConfigs => {
	if (isContinuous(type)) {
		return prev.hue?.kind === "quantitative"
			? prev
			: {
					...prev,
					hue: prev.hueQuantStash ?? buildQuantHueConfigFromTheme(theme),
					...(prev.hue?.kind === "categorical"
						? { hueCategoricalStash: prev.hue }
						: {}),
				}
	}
	return prev.hue?.kind === "categorical"
		? prev
		: {
				...prev,
				hue: prev.hueCategoricalStash,
				...(prev.hue?.kind === "quantitative" ? { hueQuantStash: prev.hue } : {}),
			}
}

/** The configs after a field of `type` lands on the Outline (`outlineHue`)
 * channel, as the Outline color picker writes them: a continuous field seeds
 * the theme gradient, a discrete one drops a leftover gradient. */
export const seedOutlineHueChannel = (
	prev: ChannelConfigs,
	type: FieldType,
	theme: Theme
): ChannelConfigs => {
	if (isContinuous(type)) {
		return prev.outlineHue?.kind === "quantitative"
			? prev
			: { ...prev, outlineHue: buildQuantHueConfigFromTheme(theme) }
	}
	return prev.outlineHue?.kind === "categorical"
		? prev
		: { ...prev, outlineHue: undefined }
}
