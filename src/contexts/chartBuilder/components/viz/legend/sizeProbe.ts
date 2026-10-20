// DOM probes behind the legend's fixed width / height. All synchronous (run
// from a layout effect, before paint), and every probe restores the styles
// and classes it touches.

const GAP_VAR = "--vc-legend-row-gap"
/** The stacked-entry gap a legend has without a fixed height (`gap-1`). */
const DEFAULT_GAP = 4
const PROBE_GAP = 14

/** Narrowest outer width (px) the legend box can shrink to before it stops
 * changing: binary-search the outer width for the smallest one where the box
 * still follows (padding / swatches stop it) and nothing overflows it, with
 * labels wrapping only between words — narrower than the widest word just
 * breaks labels letter by letter. Laid out as a fixed width lays it out (wrap
 * class, inner filling the outer). Null when even the natural width reads as
 * overflowing (nothing to bound). */
export const measureLegendMinWidth = (
	el: HTMLElement,
	outer: HTMLElement,
): number | null => {
	const hadWrapClass = el.classList.contains("vc-legend-fixed-width")
	const prev = {
		outerWidth: outer.style.width,
		outerMaxWidth: outer.style.maxWidth,
		innerWidth: el.style.width,
		innerMaxWidth: el.style.maxWidth,
	}
	el.classList.add("vc-legend-fixed-width", "vc-legend-word-floor")
	// An inside legend's inline-block would otherwise keep its content width.
	el.style.width = "100%"
	el.style.maxWidth = "100%"
	outer.style.maxWidth = "none"

	// "Overflows" is judged per element against the box's CONTENT area —
	// centered rows spill out both sides (scrollWidth only sees the right) —
	// and per label against its own box, which clips (`truncate`). Each
	// element's overhang at the natural width is its baseline, so designed
	// overhang (gradient end labels) doesn't read as overflow.
	const parts = Array.from(el.querySelectorAll<HTMLElement>("*")).filter(
		(e) => e instanceof HTMLElement,
	)
	const labels = el.querySelectorAll<HTMLElement>(".truncate, .vc-legend-label")
	const overhangs = (): number[] => {
		const b = el.getBoundingClientRect()
		const cs = window.getComputedStyle(el)
		const left =
			b.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft)
		const right =
			b.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight)
		return parts.map((e) => {
			const r = e.getBoundingClientRect()
			if (r.width === 0 && r.height === 0) return 0
			return Math.max(0, left - r.left, r.right - right)
		})
	}
	// Text extent via a Range: fractional, where scrollWidth rounds — a
	// 71.4px word in a 71px label reads as fitting, then wraps for real.
	const range = document.createRange()
	const labelsFit = (): boolean => {
		for (const l of labels) {
			range.selectNodeContents(l)
			const t = range.getBoundingClientRect()
			const r = l.getBoundingClientRect()
			if (t.width > 0 && (t.left < r.left - 0.01 || t.right > r.right + 0.01))
				return false
		}
		return true
	}

	outer.style.width = "max-content"
	let hi = Math.ceil(outer.getBoundingClientRect().width)
	outer.style.width = `${hi}px`
	const baseline = overhangs()
	const fits = (w: number): boolean => {
		outer.style.width = `${w}px`
		if (el.offsetWidth > w || !labelsFit()) return false
		return overhangs().every((o, k) => o <= baseline[k] + 0.02)
	}
	let result: number | null = null
	if (hi > 0 && fits(hi)) {
		let lo = 0
		while (hi - lo > 1) {
			const mid = Math.floor((lo + hi) / 2)
			if (fits(mid)) hi = mid
			else lo = mid
		}
		result = hi
	}

	outer.style.width = prev.outerWidth
	outer.style.maxWidth = prev.outerMaxWidth
	el.style.width = prev.innerWidth
	el.style.maxWidth = prev.innerMaxWidth
	el.classList.remove("vc-legend-word-floor")
	if (!hadWrapClass) el.classList.remove("vc-legend-fixed-width")
	return result
}

/** The legend's content height as a line in the stacked-entry gap. */
export type RowGapLine = {
	/** Content height (px) at the default gap — the natural height. */
	h0: number
	/** Height change per px of gap = the gaps in the tallest stack (which
	 *  entry columns and multiple sections make hard to count directly). */
	slope: number
	/** Tightest allowed gap (px, ≤ 0). */
	floor: number
}

/** Content height is piecewise LINEAR in the gap, so measure it at two gaps
 * with the box's height released. */
export const probeRowGapLine = (el: HTMLElement): RowGapLine => {
	const hadHeightClass = el.classList.contains("vc-legend-fixed-height")
	const prevHeight = el.style.height
	el.classList.add("vc-legend-fixed-height")
	el.style.height = "auto"
	el.style.setProperty(GAP_VAR, `${DEFAULT_GAP}px`)
	const h0 = el.offsetHeight
	el.style.setProperty(GAP_VAR, `${PROBE_GAP}px`)
	const h1 = el.offsetHeight
	el.style.height = prevHeight
	if (!hadHeightClass) el.classList.remove("vc-legend-fixed-height")
	// Rows may overlap their boxes a little (their line boxes carry air above
	// and below the glyphs) but never by more than 30% of one text line — the
	// shortest row, or a row's line height when its label wraps onto several —
	// so labels can't pile onto each other.
	const rows = el.querySelectorAll<HTMLElement>(".vc-legend-rows > *")
	const minLine = Array.from(rows).reduce((m, r) => {
		if (r.offsetHeight <= 0) return m
		const cs = window.getComputedStyle(r)
		const line =
			parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2 || Infinity
		return Math.min(m, r.offsetHeight, line)
	}, Infinity)
	return {
		h0,
		slope: (h1 - h0) / (PROBE_GAP - DEFAULT_GAP),
		floor: Number.isFinite(minLine) ? -0.3 * minLine : 0,
	}
}

/** Shortest box (px) the legend can shrink to: its height with the rows at
 * their tightest gap (just the natural height when there are no row gaps). */
export const rowGapMinHeight = ({ h0, slope, floor }: RowGapLine): number =>
	Math.ceil(slope > 0 ? h0 + slope * (floor - DEFAULT_GAP) : h0)

/** Set the row gap that makes the content fill a fixed height (clamped at
 * the floor), or clear it for an auto height. Written straight to the DOM —
 * React's style never names the variable, so re-renders leave it alone. */
export const applyLegendRowGap = (
	el: HTMLElement,
	fixedHeight: number | null,
	{ h0, slope, floor }: RowGapLine,
): void => {
	if (fixedHeight == null) {
		el.style.removeProperty(GAP_VAR)
		return
	}
	const gap =
		slope > 0
			? Math.max(floor, DEFAULT_GAP + (fixedHeight - h0) / slope)
			: DEFAULT_GAP
	el.style.setProperty(GAP_VAR, `${Math.round(gap * 100) / 100}px`)
}
