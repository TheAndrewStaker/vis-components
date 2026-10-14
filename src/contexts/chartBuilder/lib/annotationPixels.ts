/** The "Pixels" coordinate systems for annotations: whole-pixel coordinates
 *  measured from a corner of the panel's plot rect, +x to the right and +y
 *  UP (the same directions percent mode uses, so a positive y still reads
 *  "higher").
 *
 *  Four corners, and only the ORIGIN moves — the directions never do:
 *  - `"pixels"` — from the TOP-LEFT corner; inside the plot y is negative.
 *  - `"pixelsBottomLeft"` — from the BOTTOM-LEFT corner; inside the plot y
 *    is positive, and anything BELOW the plot is negative.
 *  - `"pixelsTopRight"` — from the TOP-RIGHT corner; inside the plot x and
 *    y are both negative, right of the plot x is positive.
 *  - `"pixelsBottomRight"` — from the BOTTOM-RIGHT corner; inside the plot
 *    x is negative and y positive.
 *
 *  Why a pixel unit at all: percent is a fraction of the plot, so a label at
 *  `y = 112%` sits 12% of the PLOT HEIGHT above the top edge and drifts
 *  across the fixed-height chrome up there (facet-label band, title band)
 *  as the viewport changes — "14px above the top-left corner" is 14px on
 *  every viewport.
 *
 *  Why four corners: a pixel placement is only viewport-invariant on the
 *  sides of the plot it's measured from. Something hung BELOW the plot in
 *  top-left px sits at `-(height + N)`, which scales with the plot again —
 *  and on a facet grid whose panels differ in height ("Label all facets"),
 *  the same stored coordinate lands at a different distance under each
 *  panel. Bottom-left px keeps a note under every panel the same N px
 *  below its own bottom edge; the right-hand corners do the same for notes
 *  beside the plot's right edge (and for panels of different widths).
 *
 *  Pure math, shared by the geometry helpers (position → canvas px) and the
 *  sidebar (unit toggles convert the stored numbers so the annotation
 *  doesn't move). */

export type PixelCoordSystem =
	| "pixels"
	| "pixelsBottomLeft"
	| "pixelsTopRight"
	| "pixelsBottomRight"
export type AnnotationCoordSystem = "percent" | "values" | PixelCoordSystem

const PIXEL_SYSTEMS: ReadonlySet<string> = new Set<PixelCoordSystem>([
	"pixels",
	"pixelsBottomLeft",
	"pixelsTopRight",
	"pixelsBottomRight",
])

/** Whether a coordinate system is one of the pixel corners (vs percent /
 *  values). Narrowing guard for the renderers and the unit converters. */
export const isPixelSystem = (
	system: AnnotationCoordSystem
): system is PixelCoordSystem => PIXEL_SYSTEMS.has(system)

/** Which edges the corner sits on. */
export const pixelOriginIsRight = (system: PixelCoordSystem): boolean =>
	system === "pixelsTopRight" || system === "pixelsBottomRight"
export const pixelOriginIsBottom = (system: PixelCoordSystem): boolean =>
	system === "pixelsBottomLeft" || system === "pixelsBottomRight"

type Inner = { x: number; y: number; width: number; height: number }

/** Canvas x of a pixel coordinate: RIGHT of the corner's edge (left for the
 *  left-hand corners, right for the right-hand ones), so the value is added
 *  to that edge's SVG x. */
export const pixelToCanvasX = (
	inner: Inner,
	px: number,
	system: PixelCoordSystem = "pixels"
): number =>
	(pixelOriginIsRight(system) ? inner.x + inner.width : inner.x) + px

/** Canvas y of a pixel coordinate: UP from the corner's edge (top for the
 *  top corners, bottom for the bottom ones), so the value is subtracted
 *  from that edge's SVG (top-down) y. */
export const pixelToCanvasY = (
	inner: Inner,
	px: number,
	system: PixelCoordSystem = "pixels"
): number =>
	(pixelOriginIsBottom(system) ? inner.y + inner.height : inner.y) - px

/** A percent coordinate (fraction of the plot, origin bottom-left) as a
 *  pixel coordinate, given the plot's extent on that axis. Measured from a
 *  far edge (right / top) the fraction is offset by one full extent. */
export const percentToPixelX = (
	fraction: number,
	widthPx: number,
	system: PixelCoordSystem = "pixels"
): number =>
	pixelOriginIsRight(system) ? fraction * widthPx - widthPx : fraction * widthPx
export const percentToPixelY = (
	fraction: number,
	heightPx: number,
	system: PixelCoordSystem = "pixels"
): number =>
	pixelOriginIsBottom(system)
		? fraction * heightPx
		: fraction * heightPx - heightPx

/** Inverse of `percentToPixelX` / `percentToPixelY`. A zero-size plot
 *  (unmeasured first paint) maps everything to 0 rather than NaN. */
export const pixelToPercentX = (
	px: number,
	widthPx: number,
	system: PixelCoordSystem = "pixels"
): number => {
	if (widthPx <= 0) return 0
	return pixelOriginIsRight(system) ? (px + widthPx) / widthPx : px / widthPx
}
export const pixelToPercentY = (
	px: number,
	heightPx: number,
	system: PixelCoordSystem = "pixels"
): number => {
	if (heightPx <= 0) return 0
	return pixelOriginIsBottom(system) ? px / heightPx : (px + heightPx) / heightPx
}
