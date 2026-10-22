/** Width, in px, that a scroll region with `scrollbar-gutter: stable`
 *  reserves for its vertical scrollbar in this browser: 0 where scrollbars
 *  overlay the content (macOS with a trackpad, phones), ~15 on macOS with a
 *  mouse or "Show scroll bars: Always", 17 on Windows. A platform setting
 *  rather than a per-element one, so it is measured once, from a hidden probe
 *  styled like the regions that use it — the probe's own `scrollbar-gutter:
 *  stable` is what makes the number match what they reserve (headless
 *  Chrome, for one, hides scrollbars yet still reserves the gutter). 0
 *  outside a DOM (tests). A layout that gives such a region a minimum width
 *  adds this on top, since the gutter is paid out of the region's client
 *  width. */
let cached: number | null = null

export const scrollbarGutter = (): number => {
	if (cached !== null) return cached
	if (typeof document === "undefined") return 0
	const probe = document.createElement("div")
	probe.style.cssText =
		"position:absolute;top:-9999px;left:-9999px;width:100px;height:100px;overflow:auto;scrollbar-gutter:stable;visibility:hidden;pointer-events:none"
	document.body.appendChild(probe)
	cached = probe.offsetWidth - probe.clientWidth
	probe.remove()
	return cached
}
