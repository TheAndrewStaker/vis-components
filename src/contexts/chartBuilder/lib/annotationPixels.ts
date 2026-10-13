/** The "Pixels" coordinate system for annotations: whole-pixel coordinates
 *  measured from the TOP-LEFT corner of the panel's plot rect, +x to the
 *  right and +y UP (the same directions percent mode uses, so a positive y
 *  still reads "higher"; inside the plot y is negative).
 *
 *  Why a pixel unit at all: percent is a fraction of the plot, so a label at
 *  `y = 112%` sits 12% of the PLOT HEIGHT above the top edge and drifts
 *  across the fixed-height chrome up there (facet-label band, title band)
 *  as the viewport changes — "14px above the top-left corner" is 14px on
 *  every viewport. Top-left because that's where the drift bites: the
 *  things people place outside a plot are headings and notes above it or
 *  beside the y-axis.
 *
 *  Pure math, shared by the geometry helpers (position → canvas px) and the
 *  sidebar (unit toggles convert the stored numbers so the annotation
 *  doesn't move). */

export type AnnotationCoordSystem = "percent" | "values" | "pixels"

type Inner = { x: number; y: number; width: number; height: number }

/** Canvas x of a pixel coordinate: right of the plot's left edge. */
export const pixelToCanvasX = (inner: Inner, px: number): number =>
	inner.x + px

/** Canvas y of a pixel coordinate: UP from the plot's top edge, so the
 *  value is subtracted from the top's SVG (top-down) y. */
export const pixelToCanvasY = (inner: Inner, px: number): number =>
	inner.y - px

/** A percent coordinate (fraction of the plot, origin bottom-left) as a
 *  pixel coordinate, given the plot's extent on that axis. */
export const percentToPixelX = (fraction: number, widthPx: number): number =>
	fraction * widthPx
export const percentToPixelY = (fraction: number, heightPx: number): number =>
	fraction * heightPx - heightPx

/** Inverse of `percentToPixelX` / `percentToPixelY`. A zero-size plot
 *  (unmeasured first paint) maps everything to 0 rather than NaN. */
export const pixelToPercentX = (px: number, widthPx: number): number =>
	widthPx > 0 ? px / widthPx : 0
export const pixelToPercentY = (px: number, heightPx: number): number =>
	heightPx > 0 ? (px + heightPx) / heightPx : 0
