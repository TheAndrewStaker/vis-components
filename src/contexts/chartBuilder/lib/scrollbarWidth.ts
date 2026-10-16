/** Width in px of a classic (space-taking) scrollbar in this browser, 0 for
 *  overlay scrollbars (macOS default without a mouse, most mobile) and
 *  outside a DOM. Measured once with a throwaway scrolling box and cached:
 *  the value is a platform setting, not per element.
 *
 *  Used by the scroll wrapper around the chart SVG: a canvas that overflows
 *  the container on ONE axis gets a scrollbar that eats this many px of the
 *  other axis, and a canvas solved to the full container width then
 *  overflows by exactly that much — a second, useless scrollbar. The caller
 *  re-solves the layout with the gutter taken out instead. */
let cached: number | null = null

export const measureScrollbarWidth = (): number => {
	if (cached != null) return cached
	if (typeof document === "undefined") return 0
	const probe = document.createElement("div")
	probe.style.cssText =
		"position:absolute;top:-9999px;left:-9999px;width:100px;height:100px;overflow:scroll;visibility:hidden;pointer-events:none"
	document.body.appendChild(probe)
	const width = probe.offsetWidth - probe.clientWidth
	document.body.removeChild(probe)
	// jsdom lays nothing out (0 − 0); a real browser with overlay scrollbars
	// also reports 0. Either way there is no gutter to reserve.
	cached = Number.isFinite(width) && width > 0 ? width : 0
	return cached
}

/** Test seam: forget the cached measurement. */
export const resetScrollbarWidthForTests = (): void => {
	cached = null
}
