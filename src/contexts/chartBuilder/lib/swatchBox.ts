import { glyphExtent, type ResolvedGlyph } from "./customGlyphs"

/** What a legend swatch box holds: a resolved glyph, a `SHAPE_PALETTE`
 * index (the hue-legend swatch shape), or the "line" swatch. */
export type SwatchGlyph = ResolvedGlyph | number | "line"

/** Breathing room (px) between a circle swatch's edge and its box. The
 * historical box, `(r + 3) * 2`, is what every circle swatch still draws
 * in. */
export const SWATCH_BOX_PAD = 3

/** Stroke width (px) of the "line" swatch glyph for swatch radius `r`. */
export const lineSwatchStrokeWidth = (r: number): number =>
	Math.max(2, Math.round(r / 2))

/** Side (px) of the square SVG box a legend swatch glyph draws in.
 *
 * One rule for every swatch: the historical `(r + 3) * 2` box, grown only
 * when the glyph's ink — its fill extent plus half its stroke — would
 * otherwise be cut off, and then to 1px past that ink. A circle (the shape
 * the historical box was sized for) never grows; d3 sizes symbols by AREA,
 * so a star's tips reach ~1.67× the circle-equivalent radius and its box
 * widens to fit them (see `symbolExtent`). The "line" glyph's ink is its
 * own stroke (round caps reach past the endpoints), so `strokeWidth` is
 * ignored for it. */
export const swatchGlyphBox = (
	glyph: SwatchGlyph,
	r: number,
	strokeWidth = 0,
): number => {
	const ink =
		glyph === "line"
			? r + lineSwatchStrokeWidth(r) / 2
			: glyphExtent(
					typeof glyph === "number" ? { kind: "symbol", idx: glyph } : glyph,
					r,
				) +
				strokeWidth / 2
	const half = Math.max(r + SWATCH_BOX_PAD, ink + 1)
	// Whole pixels; the epsilon keeps an exact integer (16 for r = 5) from
	// rounding up on float noise.
	return Math.ceil(2 * half - 1e-6)
}
