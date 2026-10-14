/** Ink measurement for fixed-canvas margins.
 *
 *  A canvas margin (Aesthetics → Canvas size → Margins) is the white space
 *  between the canvas edge and the nearest PAINTED content on that side.
 *  The layout solver leaves slack nobody asked for (title band leading,
 *  `BASE_MARGIN`, tick-label floors, the 12px chart pad), so a margin can't
 *  be honored by adding padding — it has to be measured against what
 *  actually rendered. `measureInkExtent` walks a chart box's DOM and unions
 *  the client rects of everything that paints, in the box's own layout px
 *  (CSS transforms undone), clamped to the box. `CanvasMarginFrame`
 *  (ChartCanvas) turns the per-side slack into a correction that shifts
 *  the box edges outward so the ink lands exactly at the margin. */

export type InkRect = { left: number; top: number; right: number; bottom: number }
export type SideValues = { top: number; right: number; bottom: number; left: number }

export const ZERO_SIDES: Readonly<SideValues> = {
	top: 0,
	right: 0,
	bottom: 0,
	left: 0,
}

/** SVG elements that paint geometry themselves. */
const SVG_LEAVES = new Set([
	"text",
	"rect",
	"circle",
	"ellipse",
	"line",
	"polyline",
	"polygon",
	"path",
	"image",
	"use",
	"foreignObject",
])
/** SVG subtrees that never paint on their own (referenced by others). */
const SVG_SKIP = new Set([
	"defs",
	"clipPath",
	"mask",
	"marker",
	"pattern",
	"symbol",
	"linearGradient",
	"radialGradient",
	"filter",
	"metadata",
	"title",
	"desc",
	"style",
	"script",
])
/** Leaves that always count as painted, whatever their paint attributes. */
const ALWAYS_PAINTS = new Set(["image", "use", "foreignObject"])
/** Shapes with no fill area: only their stroke paints. */
const OPEN_SHAPES = new Set(["line", "polyline"])

const CSS_TRANSPARENT = "rgba(0, 0, 0, 0)"

/** A style property with a fallback to the presentation attribute: browsers
 *  resolve SVG paint through computed style, happy-dom reports "" for it. */
const paintProp = (
	el: Element,
	style: CSSStyleDeclaration,
	prop: string,
	attr: string,
): string | null => {
	const v = style.getPropertyValue(prop)
	if (v && v.trim() !== "") return v.trim()
	return el.getAttribute(attr)
}

const isVisibleColor = (v: string | null): boolean =>
	v !== null && v !== "" && v !== "none" && v !== "transparent" && v !== CSS_TRANSPARENT

const numberOr = (v: string | null | undefined, fallback: number): number => {
	if (v == null || v === "") return fallback
	const n = Number.parseFloat(v)
	return Number.isFinite(n) ? n : fallback
}

type Rect = { left: number; top: number; right: number; bottom: number }

const union = (a: Rect | null, b: Rect): Rect =>
	a
		? {
				left: Math.min(a.left, b.left),
				top: Math.min(a.top, b.top),
				right: Math.max(a.right, b.right),
				bottom: Math.max(a.bottom, b.bottom),
			}
		: { ...b }

const intersect = (a: Rect, b: Rect): Rect | null => {
	const r = {
		left: Math.max(a.left, b.left),
		top: Math.max(a.top, b.top),
		right: Math.min(a.right, b.right),
		bottom: Math.min(a.bottom, b.bottom),
	}
	return r.right > r.left && r.bottom > r.top ? r : null
}

const fromDomRect = (r: DOMRect): Rect | null =>
	r.width > 0 || r.height > 0
		? { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
		: null

/** The geometry of an SVG element's own paint: its client rect, grown by
 *  half the stroke when stroked (Chrome's SVG `getBoundingClientRect` is the
 *  fill box). Null when the element doesn't paint — transparent hit
 *  targets, `fill="none"` hover rects, zero-width strokes. */
const svgLeafRect = (el: Element, style: CSSStyleDeclaration): Rect | null => {
	const name = el.localName
	// A blank title slot renders as whitespace-only text with a line box but
	// no glyphs — nothing to see, so nothing to keep a margin from.
	if (name === "text" && !(el.textContent ?? "").trim()) return null
	const box = fromDomRect(el.getBoundingClientRect())
	if (!box) return null
	if (ALWAYS_PAINTS.has(name)) return box
	// Unset fill defaults to black; unset stroke defaults to none.
	const fill = paintProp(el, style, "fill", "fill")
	const fillOn =
		(fill === null || isVisibleColor(fill)) &&
		numberOr(paintProp(el, style, "fill-opacity", "fill-opacity"), 1) > 0
	const stroke = paintProp(el, style, "stroke", "stroke")
	const strokeWidth = numberOr(
		paintProp(el, style, "stroke-width", "stroke-width"),
		1,
	)
	const strokeOn =
		isVisibleColor(stroke) &&
		strokeWidth > 0 &&
		numberOr(paintProp(el, style, "stroke-opacity", "stroke-opacity"), 1) > 0
	if (name === "text") return fillOn || strokeOn ? box : null
	if (!(fillOn && !OPEN_SHAPES.has(name)) && !strokeOn) return null
	if (!strokeOn) return box
	const half = strokeWidth / 2
	return {
		left: box.left - half,
		top: box.top - half,
		right: box.right + half,
		bottom: box.bottom + half,
	}
}

/** Resolve a `clip-path="url(#id)"` reference to the client rect of the
 *  plain `<rect>` inside that clipPath (the only shape the chart's clips
 *  use), via the SVG root's screen placement. Null when it can't be
 *  resolved — the clipped group then counts unclipped, which only ever
 *  over-reserves. */
const clipRectOf = (
	el: Element,
	svgRoot: SVGSVGElement,
	doc: Document,
): Rect | null => {
	const ref = el.getAttribute("clip-path") ?? ""
	const m = /url\(["']?#([^"')]+)["']?\)/.exec(ref)
	if (!m) return null
	const clip = doc.getElementById(m[1])
	const rect = clip?.querySelector("rect")
	if (!rect) return null
	const x = numberOr(rect.getAttribute("x"), 0)
	const y = numberOr(rect.getAttribute("y"), 0)
	const w = numberOr(rect.getAttribute("width"), 0)
	const h = numberOr(rect.getAttribute("height"), 0)
	if (w <= 0 || h <= 0) return null
	// The chart SVG has no viewBox: one user unit is one CSS px, scaled by
	// whatever CSS transform the editor applies (narrow-screen shrink).
	const svgRect = svgRoot.getBoundingClientRect()
	const svgW = numberOr(svgRoot.getAttribute("width"), svgRect.width)
	const scale = svgW > 0 ? svgRect.width / svgW : 1
	return {
		left: svgRect.left + x * scale,
		top: svgRect.top + y * scale,
		right: svgRect.left + (x + w) * scale,
		bottom: svgRect.top + (y + h) * scale,
	}
}

const isHidden = (el: Element, style: CSSStyleDeclaration): boolean =>
	paintProp(el, style, "display", "display") === "none" ||
	paintProp(el, style, "visibility", "visibility") === "hidden" ||
	numberOr(paintProp(el, style, "opacity", "opacity"), 1) === 0

/** Union of every painted rect inside `box`, in CLIENT coordinates. */
const collectInk = (box: HTMLElement, doc: Document): Rect | null => {
	const view = doc.defaultView
	if (!view) return null
	let ink: Rect | null = null
	const add = (r: Rect | null) => {
		if (r) ink = union(ink, r)
	}

	const walkSvg = (el: Element, svgRoot: SVGSVGElement, clip: Rect | null) => {
		const name = el.localName
		if (SVG_SKIP.has(name)) return
		const style = view.getComputedStyle(el)
		if (isHidden(el, style)) return
		let ownClip = clip
		if (el.hasAttribute("clip-path")) {
			const c = clipRectOf(el, svgRoot, doc)
			if (c) {
				ownClip = ownClip ? intersect(ownClip, c) : c
				if (ownClip === null) return // clip lies outside the parent clip
			}
		}
		if (SVG_LEAVES.has(name)) {
			const r = svgLeafRect(el, style)
			if (!r) return
			add(ownClip ? intersect(r, ownClip) : r)
			return
		}
		for (const child of el.children) walkSvg(child, svgRoot, ownClip)
	}

	const walkHtml = (el: Element, inLegend: boolean) => {
		if (el.localName === "svg") {
			walkSvg(el, el as SVGSVGElement, null)
			return
		}
		const style = view.getComputedStyle(el)
		if (isHidden(el, style)) return
		const legend = inLegend || el.hasAttribute("data-legend-root")
		// Only legend boxes paint their own background / border as ink: the
		// chart's layout wrappers carry the canvas background color, which
		// is the canvas, not content.
		if (legend) {
			const inline = (el as HTMLElement).style
			const borderWidth = numberOr(
				style.borderTopWidth || inline?.borderTopWidth,
				0,
			)
			const borderStyle = style.borderTopStyle || inline?.borderTopStyle
			const hasBorder =
				borderWidth > 0 &&
				borderStyle !== "none" &&
				isVisibleColor(style.borderTopColor || inline?.borderTopColor || null)
			const bgImage = style.backgroundImage || inline?.backgroundImage
			const hasBg =
				isVisibleColor(style.backgroundColor || inline?.backgroundColor || null) ||
				(!!bgImage && bgImage !== "none")
			if (hasBorder || hasBg) add(fromDomRect(el.getBoundingClientRect()))
		}
		for (const child of el.childNodes) {
			if (child.nodeType === Node.TEXT_NODE) {
				if (!(child.textContent ?? "").trim()) continue
				const range = doc.createRange()
				range.selectNodeContents(child)
				add(fromDomRect(range.getBoundingClientRect()))
			} else if (child.nodeType === Node.ELEMENT_NODE) {
				walkHtml(child as Element, legend)
			}
		}
	}

	for (const child of box.children) walkHtml(child, false)
	return ink
}

/** Measure the painted extent inside `box`, in the box's LAYOUT px (origin
 *  at the box's top-left, CSS transforms undone), clamped to the box. Null
 *  when the box has no layout size or nothing inside it paints. */
export const measureInkExtent = (
	box: HTMLElement,
	doc: Document = box.ownerDocument,
): InkRect | null => {
	const layoutW = box.offsetWidth
	const layoutH = box.offsetHeight
	if (layoutW <= 0 || layoutH <= 0) return null
	const boxRect = box.getBoundingClientRect()
	if (boxRect.width <= 0 || boxRect.height <= 0) return null
	const scale = boxRect.width / layoutW
	const ink = collectInk(box, doc)
	if (!ink) return null
	const toLocalX = (x: number) => (x - boxRect.left) / scale
	const toLocalY = (y: number) => (y - boxRect.top) / scale
	const r = {
		left: Math.max(0, toLocalX(ink.left)),
		top: Math.max(0, toLocalY(ink.top)),
		right: Math.min(layoutW, toLocalX(ink.right)),
		bottom: Math.min(layoutH, toLocalY(ink.bottom)),
	}
	return r.right > r.left && r.bottom > r.top ? r : null
}

/** Per-side white space between the box edge and the ink. */
export const inkSlack = (
	ink: InkRect,
	boxWidth: number,
	boxHeight: number,
): SideValues => ({
	top: ink.top,
	left: ink.left,
	right: boxWidth - ink.right,
	bottom: boxHeight - ink.bottom,
})

/** Sides settle once the measured slack is within this of the correction. */
export const MARGIN_TOLERANCE_PX = 0.5
/** Self-induced re-measure passes before the frame stops chasing a layout
 *  that flips (e.g. a tick label appearing/disappearing with the box size). */
export const MARGIN_MAX_PASSES = 4

/** The correction a margin frame should apply next: each SET side takes the
 *  slack measured under the CURRENT correction (the box edge then moves
 *  outward by exactly that slack, and the ink lands at the margin); auto
 *  sides stay 0. Returns null when every set side is already within
 *  tolerance of the current correction — the frame is settled. Pure so the
 *  convergence rule is testable without a DOM. */
export const nextMarginCorrection = (
	margins: Partial<SideValues>,
	measuredSlack: SideValues,
	current: SideValues,
): SideValues | null => {
	const next: SideValues = { ...ZERO_SIDES }
	let moved = false
	for (const side of ["top", "right", "bottom", "left"] as const) {
		if (margins[side] == null) {
			next[side] = 0
			if (current[side] !== 0) moved = true
			continue
		}
		next[side] = measuredSlack[side]
		if (Math.abs(next[side] - current[side]) > MARGIN_TOLERANCE_PX) moved = true
	}
	return moved ? next : null
}
