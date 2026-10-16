/** Reusable canvas context for text measurement. Created lazily so we
 *  don't allocate during SSR. Subsequent measurements reuse the same
 *  context (cheap), only re-setting the font when it changes. */
let _measureCtx: CanvasRenderingContext2D | null = null
const getMeasureContext = (): CanvasRenderingContext2D | null => {
	if (typeof document === "undefined") return null
	if (!_measureCtx) {
		const canvas = document.createElement("canvas")
		_measureCtx = canvas.getContext("2d")
	}
	return _measureCtx
}

/** Measure the widest label in `labels` using canvas measureText with
 *  the chart's actual tick-font. Returns 0 when the canvas API isn't
 *  available (SSR / non-DOM env) — the solver then falls back to its
 *  character-count estimate. Accurate widths matter for y-title
 *  positioning: the title sits a fixed gap from the rendered label
 *  edge, so a 30% over-estimate (the 0.55-char-width heuristic on
 *  narrow fonts) shows up as visible "weird gap" between title and
 *  labels (user-reported May 2026).
 *
 *  Multi-line (wrapped, `\n`-joined) labels measure their widest LINE —
 *  the rendered bounding box of stacked tspans is the widest line. */
export const measureMaxLabelWidth = (
	labels: readonly string[],
	fontFamily: string | null | undefined,
	fontSize: number,
	fontWeight?: number,
	italic?: boolean,
): number => {
	const ctx = getMeasureContext()
	if (!ctx || labels.length === 0) return 0
	// Match the RENDERED font — weight and style included. Omitting the
	// weight made a 600-weight "$140,000" measure narrower than it draws,
	// so the reserved right margin landed on the glyph edge and clipped the
	// last character. Canvas font shorthand: `[style] [weight] size family`.
	const stylePrefix = italic ? "italic " : ""
	const weightPrefix = fontWeight ? `${fontWeight} ` : ""
	ctx.font = `${stylePrefix}${weightPrefix}${fontSize}px ${fontFamily ?? "sans-serif"}`
	let max = 0
	for (const label of labels) {
		for (const line of label.split("\n")) {
			const w = ctx.measureText(line).width
			if (w > max) max = w
		}
	}
	return max
}

/** Per-label widths (same order as `labels`), for the categorical
 *  x-axis auto-rotate check, which compares NEIGHBORS rather than the
 *  widest label. Multi-line labels report their widest line. Returns an
 *  empty array when the canvas API isn't available, so callers fall back
 *  to the char-count estimate. Same font-shorthand rules as
 *  `measureMaxLabelWidth`. */
export const measureLabelWidths = (
	labels: readonly string[],
	fontFamily: string | null | undefined,
	fontSize: number,
	fontWeight?: number,
	italic?: boolean,
): number[] => {
	const ctx = getMeasureContext()
	if (!ctx || labels.length === 0) return []
	const stylePrefix = italic ? "italic " : ""
	const weightPrefix = fontWeight ? `${fontWeight} ` : ""
	ctx.font = `${stylePrefix}${weightPrefix}${fontSize}px ${fontFamily ?? "sans-serif"}`
	return labels.map((label) => {
		let max = 0
		for (const line of label.split("\n")) {
			const w = ctx.measureText(line).width
			if (w > max) max = w
		}
		return max
	})
}

/** Font fields that affect a measured width (a `FontConfig` satisfies it). */
export type MeasureFont = {
	family: string | null | undefined
	size: number
	weight?: number
	italic?: boolean
}

/** Widest rendered line of a chart-level title, px. The chart title's first
 *  line carries its prefix run the way `renderMultilineTspans` draws it: the
 *  prefix in its own font, then one space plus the line in the title font.
 *  0 when the canvas API isn't available (SSR / non-DOM env), which the
 *  solver reads as "unmeasured" and leaves the title's anchor as aligned. */
export const measureTitleWidth = (
	text: string,
	font: MeasureFont,
	prefix?: (MeasureFont & { text: string }) | null,
): number => {
	const lines = text.split("\n")
	const widths = measureLabelWidths(
		lines,
		font.family,
		font.size,
		font.weight,
		font.italic,
	)
	if (widths.length === 0) return 0
	if (prefix) {
		const [prefixWidth = 0] = measureLabelWidths(
			[prefix.text],
			prefix.family,
			prefix.size,
			prefix.weight,
			prefix.italic,
		)
		const [firstWithGap = 0] = measureLabelWidths(
			[` ${lines[0]}`],
			font.family,
			font.size,
			font.weight,
			font.italic,
		)
		widths[0] = prefixWidth + firstWithGap
	}
	return Math.max(...widths)
}
