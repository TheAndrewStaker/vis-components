/** The Legend panel's sparse setters: a value equal to the theme's or the
 * mode's default is stored as "unset", so a fresh chart stays silent. */

import {
	legendChannelHiddenByDefault,
	type LegendChannel,
	type LegendConfig,
	type LegendDefaultTraits,
	type LegendSwatchShapeChoice,
	type SwatchShapeChannel,
} from "./labelsConfig"
import type { Theme } from "./types"

export const legendHiddenPatch = (
	cfg: Pick<LegendConfig, "hidden">,
	channel: LegendChannel,
	hidden: boolean,
	traits: LegendDefaultTraits
): Pick<LegendConfig, "hidden"> => {
	const next = { ...cfg.hidden, [channel]: hidden }
	if (hidden === legendChannelHiddenByDefault(channel, traits)) delete next[channel]
	return { hidden: next }
}

export const swatchShapePatch = (
	cfg: Pick<LegendConfig, "swatchShapes" | "hueLegendSwatchShape">,
	ch: SwatchShapeChannel,
	shape: LegendSwatchShapeChoice | null,
	theme: Pick<Theme, "legendSwatchShape">
): Partial<LegendConfig> => {
	const next = { ...cfg.swatchShapes }
	if (shape === theme.legendSwatchShape) delete next[ch]
	else next[ch] = shape === null ? "rect" : shape
	return {
		swatchShapes: next,
		...(ch === "hue" && cfg.hueLegendSwatchShape != null ? { hueLegendSwatchShape: null } : {}),
	}
}

export const swatchSizePatch = (
	cfg: Pick<LegendConfig, "swatchSizes" | "hueLegendSwatchSize">,
	ch: SwatchShapeChannel,
	size: number,
	theme: Pick<Theme, "legendSwatchSize">
): Partial<LegendConfig> => {
	const next = { ...cfg.swatchSizes }
	if (size === theme.legendSwatchSize) delete next[ch]
	else next[ch] = size
	return {
		swatchSizes: next,
		...(ch === "hue" && cfg.hueLegendSwatchSize != null ? { hueLegendSwatchSize: null } : {}),
	}
}

export const swatchOutlineWidthPatch = (
	cfg: Pick<LegendConfig, "swatchOutlineWidths" | "swatchOutlineWidth">,
	ch: SwatchShapeChannel,
	width: number,
	theme: Pick<Theme, "legendSwatchOutlineWidth">
): Pick<LegendConfig, "swatchOutlineWidths"> => {
	const next = { ...cfg.swatchOutlineWidths }
	if (width === theme.legendSwatchOutlineWidth && cfg.swatchOutlineWidth == null) delete next[ch]
	else next[ch] = width
	return { swatchOutlineWidths: next }
}
