import { PLOT_SVG_ID } from "../../lib/captureThumbnail"
import {
	colorAlpha,
	type AccessibilityTarget,
	type BackgroundLayer,
	type Box,
	type TextRole,
	type TextSample,
} from "../../lib/accessibilityCheck"

/* The DOM half of the accessibility check: reads the RENDERED chart (the
 * plot SVG, the HTML legend and facet titles) into the pure engine's
 * `TextSample`s and highlight targets. Strictly read-only — it never adds,
 * moves or restyles anything inside the chart, so the layout solver (which
 * samples rendered tick labels) and the thumbnail / export capture never
 * see it. Fill and color are read from computed styles, which CSS filters
 * (the black-and-white preview) don't change. */

export type CollectedDom = {
	texts: TextSample[]
	/** Live elements behind every target id, so a highlight can re-measure
	 *  after a scroll. */
	elements: Map<string, Element>
	plotTargets: AccessibilityTarget[]
	legendTargets: AccessibilityTarget[]
	/** Legend entry targets keyed by their text (a categorical level). */
	legendEntryTargets: Map<string, AccessibilityTarget[]>
	/** Whether any data-label text is drawn. */
	dataLabelsDrawn: boolean
	/** Whether a legend is drawn. */
	legendDrawn: boolean
}

/** Shapes that can paint behind text. */
const SHAPE_SELECTOR = "rect,path,circle,ellipse,polygon"
/** Subtrees that define paint rather than paint it. */
const NON_PAINTED = "defs,clipPath,mask,pattern,marker,symbol"

const isTransparent = (c: string | null | undefined): boolean =>
	!c || c === "none" || c === "transparent" || colorAlpha(c) === 0

const num = (s: string | null | undefined, fallback: number): number => {
	const n = Number.parseFloat(s ?? "")
	return Number.isFinite(n) ? n : fallback
}

/** Product of `opacity` from `el` up to (and including) `stop`. */
const opacityChain = (el: Element, stop: Element | null): number => {
	let a = 1
	let cur: Element | null = el
	while (cur) {
		a *= num(window.getComputedStyle(cur).opacity, 1)
		if (cur === stop) break
		cur = cur.parentElement
	}
	return a
}

const isHidden = (el: Element): boolean => {
	const s = window.getComputedStyle(el)
	return s.display === "none" || s.visibility === "hidden"
}

const relBox = (r: DOMRect, origin: DOMRect): Box => ({
	x: r.left - origin.left,
	y: r.top - origin.top,
	width: r.width,
	height: r.height,
})

const svgTextRole = (el: Element): TextRole => {
	if (el.closest("[data-vc-tick-label]")) return "tick label"
	if (el.closest("[data-vc-data-labels]")) return "data label"
	if (el.closest("[data-annotation],[data-annotation-text],[data-annotation-text-box]")) {
		return "annotation"
	}
	if (el.closest("[data-caption]")) return "caption"
	if (el.closest("[data-legend-root]")) return "legend text"
	return "text"
}

const shapeLabel = (el: Element, panelRects: DOMRect[], r: DOMRect): string => {
	if (el.closest("[data-vc-data-labels]")) return "its label background"
	if (el.closest("[data-annotation],[data-annotation-text-box]")) {
		return "the annotation box"
	}
	if (el.closest("[data-legend-root]")) return "its legend swatch"
	if (el.closest("[data-caption]")) return "the caption box"
	// A shape enclosing a whole panel is the panel's own background.
	const covers = panelRects.some(
		(p) =>
			p.width > 0 &&
			r.left <= p.left + 2 &&
			r.top <= p.top + 2 &&
			r.right >= p.right - 2 &&
			r.bottom >= p.bottom - 2
	)
	if (covers) return "the plot background"
	if (el.localName === "rect") return "the bar or tile behind it"
	if (el.localName === "circle" || el.localName === "ellipse") return "the point behind it"
	return "the mark behind it"
}

type ShapeEntry = { el: SVGGeometryElement; rect: DOMRect | null }

/** Painted SVG layers under a client point, top first, stopping at the
 *  first opaque one. Null = a gradient / pattern fill is in the way, so the
 *  background can't be known and the text is skipped. */
const svgLayersAt = (
	x: number,
	y: number,
	shapes: ShapeEntry[],
	svg: SVGSVGElement,
	panelRects: DOMRect[]
): { layers: BackgroundLayer[]; opaque: boolean } | null => {
	const layers: BackgroundLayer[] = []
	for (let k = shapes.length - 1; k >= 0; k--) {
		const s = shapes[k]
		if (!s) continue
		s.rect ??= s.el.getBoundingClientRect()
		const r = s.rect
		if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue
		if (r.width === 0 || r.height === 0) continue
		const st = window.getComputedStyle(s.el)
		const fill = st.fill
		if (isTransparent(fill)) continue
		if (st.display === "none" || st.visibility === "hidden") continue
		if (typeof s.el.isPointInFill === "function") {
			const ctm = s.el.getScreenCTM()
			if (ctm) {
				const p = new DOMPoint(x, y).matrixTransform(ctm.inverse())
				if (!s.el.isPointInFill(p)) continue
			}
		}
		if (fill.startsWith("url(")) return null
		const alpha =
			colorAlpha(fill) * num(st.fillOpacity, 1) * opacityChain(s.el, svg)
		if (alpha < 0.02) continue
		layers.push({ color: fill, alpha, label: shapeLabel(s.el, panelRects, r) })
		if (alpha >= 0.999) return { layers, opaque: true }
	}
	return { layers, opaque: false }
}

/** Background layers from HTML ancestors (element itself first). */
const htmlLayers = (from: Element | null, label: (el: Element) => string): BackgroundLayer[] => {
	const layers: BackgroundLayer[] = []
	let cur: Element | null = from
	while (cur && cur !== document.documentElement) {
		const bg = window.getComputedStyle(cur).backgroundColor
		if (!isTransparent(bg)) {
			const alpha = colorAlpha(bg)
			layers.push({ color: bg, alpha, label: label(cur) })
			if (alpha >= 0.999) return layers
		}
		cur = cur.parentElement
	}
	layers.push({ color: "#ffffff", alpha: 1, label: "the page background" })
	return layers
}

const chartBgLabel = (el: Element): string =>
	el.closest("[data-legend-root]") ? "the legend background" : "the chart background"

/** Every text unit worth measuring inside a <text>: the text itself, or —
 *  when its tspans carry their own fills (styled label pieces) — each
 *  colored tspan. */
const textUnits = (text: SVGTextElement): SVGTextContentElement[] => {
	const colored = [...text.querySelectorAll<SVGTSpanElement>("tspan[fill]")]
	return colored.length > 0 ? colored : [text]
}

/** Collect the chart's measurable text and highlight targets. `viewport`
 *  is the editor's chart viewport (`[data-editor-chart-viewport]`); boxes
 *  are relative to its top-left. */
export const collectAccessibilityDom = (viewport: Element): CollectedDom => {
	const origin = viewport.getBoundingClientRect()
	const elements = new Map<string, Element>()
	let seq = 0
	const register = (el: Element, kind: "svg" | "html"): AccessibilityTarget => {
		const id = `a11y-${seq++}`
		elements.set(id, el)
		return { kind, id, bbox: relBox(el.getBoundingClientRect(), origin) }
	}
	const texts: TextSample[] = []

	const panels = [...viewport.querySelectorAll(`#${PLOT_SVG_ID} [data-panel]`)]
	const panelRects = panels.map((p) => p.getBoundingClientRect())

	// The plot SVG(s) plus any SVG inside the legend (gradient bar ticks).
	const svgs = [
		...viewport.querySelectorAll<SVGSVGElement>(`svg#${PLOT_SVG_ID}`),
		...viewport.querySelectorAll<SVGSVGElement>("[data-legend-root] svg"),
	]
	let dataLabelsDrawn = false
	for (const svg of svgs) {
		const shapes: ShapeEntry[] = [
			...svg.querySelectorAll<SVGGeometryElement>(SHAPE_SELECTOR),
		]
			.filter((el) => !el.closest(NON_PAINTED))
			.map((el) => ({ el, rect: null }))
		for (const text of svg.querySelectorAll<SVGTextElement>("text")) {
			if (text.closest(NON_PAINTED)) continue
			const role = svgTextRole(text)
			if (role === "data label" && text.textContent?.trim()) dataLabelsDrawn = true
			for (const unit of textUnits(text)) {
				const content = unit.textContent ?? ""
				if (!content.trim() || isHidden(unit)) continue
				const r = unit.getBoundingClientRect()
				if (r.width === 0 || r.height === 0) continue
				const st = window.getComputedStyle(unit)
				const fill = st.fill
				if (isTransparent(fill) || fill.startsWith("url(")) continue
				const alpha =
					colorAlpha(fill) * num(st.fillOpacity, 1) * opacityChain(unit, svg)
				if (alpha < 0.05) continue
				// A thick text stroke is a halo: it, not the shape beneath,
				// is what the glyphs sit on.
				const stroke = st.stroke
				const halo =
					!isTransparent(stroke) &&
					!stroke.startsWith("url(") &&
					num(st.strokeWidth, 0) >= 1.5
				const cx = r.left + r.width / 2
				const cy = r.top + r.height / 2
				let background: BackgroundLayer[]
				if (halo) {
					background = [{ color: stroke, alpha: 1, label: "its halo" }]
				} else {
					const svgPart = svgLayersAt(cx, cy, shapes, svg, panelRects)
					if (svgPart === null) continue
					background = svgPart.opaque
						? svgPart.layers
						: [...svgPart.layers, ...htmlLayers(svg.parentElement, chartBgLabel)]
				}
				const target = register(unit, "svg")
				texts.push({
					id: target.id ?? "",
					kind: "svg",
					text: content,
					role,
					bbox: target.bbox,
					color: fill,
					alpha,
					background,
					fontSizePx: num(st.fontSize, 16),
					bold: num(st.fontWeight, 400) >= 700,
				})
			}
		}
	}

	// HTML text: the legend and the facet titles. Only elements carrying
	// their own text node, so a wrapper isn't measured twice.
	const legendRoots = [...viewport.querySelectorAll("[data-legend-root]")]
	const htmlRoots = [
		...legendRoots,
		...viewport.querySelectorAll("[data-facet-title],[data-facet-subtitle],[data-facet-label]"),
	]
	const legendEntryTargets = new Map<string, AccessibilityTarget[]>()
	const seen = new Set<Element>()
	for (const root of htmlRoots) {
		const els = [root, ...root.querySelectorAll("*")]
		for (const el of els) {
			if (seen.has(el) || el instanceof SVGElement || el.closest("svg")) continue
			seen.add(el)
			const own = [...el.childNodes]
				.filter((n) => n.nodeType === Node.TEXT_NODE)
				.map((n) => n.textContent ?? "")
				.join("")
			if (!own.trim() || isHidden(el)) continue
			const r = el.getBoundingClientRect()
			if (r.width === 0 || r.height === 0) continue
			const st = window.getComputedStyle(el)
			const alpha = colorAlpha(st.color) * opacityChain(el, viewport)
			if (alpha < 0.05) continue
			const inLegend = !!el.closest("[data-legend-root]")
			const role: TextRole = inLegend
				? "legend text"
				: el.closest("[data-facet-label]")
					? "facet title"
					: "title"
			const target = register(el, "html")
			texts.push({
				id: target.id ?? "",
				kind: "html",
				text: own,
				role,
				bbox: target.bbox,
				color: st.color,
				alpha,
				background: htmlLayers(el, chartBgLabel),
				fontSizePx: num(st.fontSize, 16),
				bold: num(st.fontWeight, 400) >= 700,
			})
			if (inLegend) {
				const key = own.trim()
				// The entry row (swatch + label) is the better highlight.
				const row = el.parentElement && el.parentElement !== root ? el.parentElement : el
				const list = legendEntryTargets.get(key) ?? []
				list.push(row === el ? target : register(row, "html"))
				legendEntryTargets.set(key, list)
			}
		}
	}

	const plotTargets =
		panels.length > 0
			? panels.map((p) => register(p, "svg"))
			: [...viewport.querySelectorAll(`svg#${PLOT_SVG_ID}`)].map((s) => register(s, "svg"))
	const legendTargets = legendRoots.map((l) => register(l, "html"))

	return {
		texts,
		elements,
		plotTargets,
		legendTargets,
		legendEntryTargets,
		dataLabelsDrawn,
		legendDrawn: legendRoots.length > 0,
	}
}
