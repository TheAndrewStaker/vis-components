// Display zoom for a fixed canvas (Aesthetics → Canvas size). Purely a
// view setting: the canvas still LAYS OUT at its true size and is shrunk
// with a CSS transform, so exports, embeds, thumbnails and margins never
// see it. Zoom never exceeds 100% — a fixed canvas is shown at most 1:1.

/** `null` = automatic (100% on wide layouts, fit-to-width on narrow ones),
 *  `"fit"` = shrink so the whole canvas fits the viewport (tracks resizes),
 *  a number = an explicit scale in (0, 1]. */
export type CanvasZoom = number | "fit" | null

/** The − / + buttons step through these. */
export const ZOOM_STEPS = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1] as const

export const MIN_ZOOM = ZOOM_STEPS[0]
export const MAX_ZOOM = 1

// Treat scales within this of a step as ON the step, so 0.6667 from a fit
// steps to 0.5 rather than to 0.67.
const EPS = 0.005

type Size = { width: number; height: number }

const clampZoom = (s: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, s))

/** Largest scale (≤ 100%) at which `canvas` fits inside `avail`. Falls back
 *  to 100% before the viewport has been measured. */
export const fitZoom = (avail: Size, canvas: Size): number => {
	if (avail.width <= 0 || avail.height <= 0) return MAX_ZOOM
	if (canvas.width <= 0 || canvas.height <= 0) return MAX_ZOOM
	return clampZoom(
		Math.min(avail.width / canvas.width, avail.height / canvas.height)
	)
}

/** Scale to fit the canvas's WIDTH only — the narrow-layout default, so a
 *  phone scrolls a tall canvas vertically instead of shrinking it twice. */
export const fitWidthZoom = (availWidth: number, canvasWidth: number) =>
	availWidth > 0 && canvasWidth > 0
		? clampZoom(availWidth / canvasWidth)
		: MAX_ZOOM

/** The scale actually applied for a zoom setting. */
export const resolveCanvasZoom = (
	zoom: CanvasZoom,
	opts: { narrow: boolean; avail: Size; canvas: Size }
): number => {
	if (zoom === "fit") return fitZoom(opts.avail, opts.canvas)
	if (typeof zoom === "number") return clampZoom(zoom)
	return opts.narrow
		? fitWidthZoom(opts.avail.width, opts.canvas.width)
		: MAX_ZOOM
}

/** Next step below `current` (stays at the floor). */
export const zoomOutFrom = (current: number): number => {
	const below = ZOOM_STEPS.filter((step) => step < current - EPS)
	return below.at(-1) ?? MIN_ZOOM
}

/** Next step above `current`, capped at 100%. */
export const zoomInFrom = (current: number): number => {
	for (const step of ZOOM_STEPS) if (step > current + EPS) return step
	return MAX_ZOOM
}

/** "67%" — whole percents. */
export const formatZoom = (scale: number) => `${Math.round(scale * 100)}%`
