import type { CSSProperties } from "react"
import type { LegendConfig } from "../../../lib/labelsConfig"

/** How much taller a legend's section titles are than single lines, in px.
 *
 *  A title wraps when the user breaks it with Shift+Enter or sets a fixed
 *  legend width narrower than the text. A legend anchored at its TOP edge
 *  (right / left, which land on the plot's top edge) would push its entries
 *  down by the extra lines; `Legend` lifts the box by this amount instead
 *  (`liftLegendBox`) so every title's bottom line and the entries stay where
 *  a single-line title would put them — the title grows up, exactly like the
 *  chart titles (LAYOUT.md §7). Measured from the rendered boxes so CSS
 *  wrapping counts too, not just `\n`.
 *
 *  `root` is the legend's inner box; the titles are the `[data-legend-title]`
 *  blocks `LegendSection` renders. Returns 0 when nothing wraps, and before
 *  layout (empty rects). */
export const measureLegendTitleGrowth = (root: Element): number => {
	let growth = 0
	for (const title of root.querySelectorAll<HTMLElement>("[data-legend-title]")) {
		const height = title.getBoundingClientRect().height
		if (height <= 0) continue
		growth += Math.max(0, height - singleLineHeightPx(title))
	}
	return Math.round(growth)
}

/** One line box of `el` in px: its computed line-height, or the CSS
 *  `normal` approximation (1.2 × font size) when none resolves. */
const singleLineHeightPx = (el: HTMLElement): number => {
	const cs = window.getComputedStyle(el)
	const lh = parseFloat(cs.lineHeight)
	if (Number.isFinite(lh) && lh > 0) return lh
	const fs = parseFloat(cs.fontSize)
	return Number.isFinite(fs) && fs > 0 ? fs * 1.2 : 0
}

/** Lift a legend box by its titles' extra height so it grows up. A right /
 *  left box reaches the plot's top edge through its outer `paddingTop`, so
 *  it lifts by giving that padding back (never past the canvas top: the
 *  lift clamps at 0 and any remainder flows down as before). Every other
 *  position is returned untouched: a bottom legend already grows upward
 *  (its box is flush with the canvas bottom), a top legend has nothing
 *  above it to grow into, and an inside legend is pinned to the user's
 *  coordinates by its top edge. */
export const liftLegendBox = (
	style: CSSProperties | undefined,
	position: LegendConfig["position"],
	growth: number,
): CSSProperties | undefined => {
	if (growth <= 0 || !style) return style
	if (position !== "left" && position !== "right") return style
	const pad = typeof style.paddingTop === "number" ? style.paddingTop : 0
	return { ...style, paddingTop: Math.max(0, pad - growth) }
}
