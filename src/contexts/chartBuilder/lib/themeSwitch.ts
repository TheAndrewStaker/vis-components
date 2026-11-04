/** What picking a theme in the Theme panel does to a visual's saved
 * slices: ONLY the fields the theme drives (fonts, palettes, default
 * colors) are re-seeded from it; titles, alignments, per-category
 * overrides and hue configurations stay. Shared by the Theme panel and
 * `editVisual`, so a chart re-themed from a spec matches one re-themed by
 * hand. Pure. */

import type { CaptionConfig } from "./captionConfig"
import type { ChannelConfigs, DataLabelsConfig } from "./channelConfig"
import type { LabelsConfig, LegendConfig } from "./labelsConfig"
import {
	captionConfigFromTheme,
	configsFromTheme,
	dataLabelsConfigFromTheme,
	labelsFromTheme,
	legendConfigFromTheme,
} from "./themeConfig"
import type { Theme } from "./types"

export const rethemeChannelConfigs = (prev: ChannelConfigs, theme: Theme): ChannelConfigs => {
	const fromTheme = configsFromTheme(theme)
	return {
		...prev,
		// Theme-controlled defaults (overwritten).
		defaultFill: fromTheme.defaultFill,
		defaultRadius: fromTheme.defaultRadius,
		defaultOpacity: fromTheme.defaultOpacity,
		defaultShape: fromTheme.defaultShape,
		categoricalPaletteId: fromTheme.categoricalPaletteId,
		categoricalPalette: fromTheme.categoricalPalette,
		categoricalPalettePatternInks: fromTheme.categoricalPalettePatternInks,
		ordinalPaletteId: fromTheme.ordinalPaletteId,
		ordinalPalette: fromTheme.ordinalPalette,
		ordinalPalettePatternInks: fromTheme.ordinalPalettePatternInks,
		defaultGradientId: fromTheme.defaultGradientId,
		defaultGradientColors: fromTheme.defaultGradientColors,
		patternInkColor: fromTheme.patternInkColor,
		defaultPatternInk: fromTheme.defaultPatternInk,
		// Chart background follows the theme like the legend background
		// does: a theme that declares a background should not leave the
		// chart transparent after a switch (Aesthetics ▸ Chart background
		// reads the theme as its baseline, so this also keeps its "changed"
		// dot honest).
		backgroundColor: fromTheme.backgroundColor,
		// Nested configs merge so user overrides survive.
		shape: prev.shape
			? {
					...prev.shape,
					outlineColor: fromTheme.shape?.outlineColor ?? prev.shape.outlineColor,
					outlineWidth: fromTheme.shape?.outlineWidth ?? prev.shape.outlineWidth,
				}
			: fromTheme.shape,
		// The Background is theme-driven: the new theme's override, or null
		// (tile over each mark's fill) — not the old theme's leftover.
		pattern: prev.pattern
			? {
					...prev.pattern,
					backgroundColor: fromTheme.pattern?.backgroundColor ?? null,
				}
			: fromTheme.pattern,
		text: prev.text
			? {
					...prev.text,
					color: fromTheme.text?.color ?? prev.text.color,
					palette: fromTheme.text?.palette ?? prev.text.palette,
				}
			: fromTheme.text,
	}
}

export const rethemeLabels = (prev: LabelsConfig, theme: Theme): LabelsConfig => ({
	...prev,
	baseFont: labelsFromTheme(theme).baseFont,
})

/** Legend layout (position, orientation, enabled, border) is user-driven;
 * only the theme-default background color flows through. */
export const rethemeLegend = (prev: LegendConfig, theme: Theme): LegendConfig => ({
	...prev,
	backgroundColor: legendConfigFromTheme(theme).backgroundColor,
})

/** Only the theme-driven font knobs (plus the single fallback color and the
 * map leader-line stroke) flow through; label encodings, per-value color
 * overrides, offsets and templates are user-driven. */
export const rethemeDataLabels = (prev: DataLabelsConfig, theme: Theme): DataLabelsConfig => {
	const fromTheme = dataLabelsConfigFromTheme(theme)
	return {
		...prev,
		color: fromTheme.color,
		fontFamily: fromTheme.fontFamily,
		fontSize: fromTheme.fontSize,
		fontWeight: fromTheme.fontWeight,
		italic: fromTheme.italic,
		underline: fromTheme.underline,
		leaderLineColor: fromTheme.leaderLineColor,
		leaderLineWidth: fromTheme.leaderLineWidth,
	}
}

/** Only the theme-driven text knobs flow through; the caption text, its
 * position / size nudges, padding and the box are user-driven. */
export const rethemeCaption = (prev: CaptionConfig, theme: Theme): CaptionConfig => {
	const fromTheme = captionConfigFromTheme(theme)
	return {
		...prev,
		fontFamily: fromTheme.fontFamily,
		fontSize: fromTheme.fontSize,
		fontWeight: fromTheme.fontWeight,
		textColor: fromTheme.textColor,
		align: fromTheme.align,
	}
}
