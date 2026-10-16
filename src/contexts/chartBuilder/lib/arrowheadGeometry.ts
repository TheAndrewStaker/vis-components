import {
	DEFAULT_LINE_END_STYLE,
	type ArrowheadStyle,
	type LineCapStyle,
	type LineEndStyle,
	type LineSegmentAnnotation,
} from "./annotationsConfig"

/** Geometry for the arrowhead a line-segment annotation can carry at its
 *  end point, plus the cap bookkeeping the line's own stroke needs around
 *  it. Pure math over canvas px so the renderer (`annotations.tsx`) and the
 *  layout reserve (`annotationLayout.ts`) draw and measure the same shape.
 *
 *  The head is explicit path geometry rather than an SVG `<marker>`: the
 *  SVG download is opened in PowerPoint & co., which don't honor markers
 *  (see `lib/portableSvg.ts`), and a plain `<path>` also keeps the head
 *  inside the per-panel clip and the polar scale transform like any other
 *  annotation shape.
 *
 *  Size follows the line: one "unit" is the stroke thickness (floored at
 *  1px so a hairline still gets a visible head), the head is
 *  `ARROWHEAD_LENGTH_PER_PX` units long and `2 × ARROWHEAD_HALF_WIDTH_PER_PX`
 *  units wide, and `arrowheadScale` multiplies both. So a thicker line
 *  grows its head with it and the user's scale is a proportion, not a px
 *  count that goes stale when the thickness changes. */

/** Head length, in multiples of the line thickness (× scale). */
export const ARROWHEAD_LENGTH_PER_PX = 4
/** Head half-width, in multiples of the line thickness (× scale) — the
 *  head is as wide as it is long. */
export const ARROWHEAD_HALF_WIDTH_PER_PX = 2
/** Stealth notch depth: the barbs' inner corner sits this fraction of the
 *  head length back from the tip (the rest of the way to the base is the
 *  barbs' sweep). */
const STEALTH_NOTCH = 0.65
/** How far an open chevron's stroke can paint past its vertex at the tip:
 *  a miter join on a ~53° tip extends ≈1.12× the stroke width. */
const OPEN_TIP_OVERHANG = 1.2

export type Point = { x: number; y: number }

/** Axis-aligned bounds in canvas px, including the stroke of an open head. */
export type ArrowheadBBox = {
	left: number
	top: number
	right: number
	bottom: number
}

export type ArrowheadGeometry = {
	style: ArrowheadStyle
	/** SVG path data in canvas px. A closed polygon / circle for the filled
	 *  styles; an open polyline for `open`. */
	d: string
	/** Filled with the line color (true) or stroked in the line's stroke
	 *  (false — the `open` chevron). */
	filled: boolean
	/** Where the line's own stroke must END so its cap meets the head
	 *  instead of painting through it: the head's base for the filled
	 *  styles (so a dash gap or a round cap never shows past a head
	 *  narrower than the line is long), the tip for the open chevron.
	 *  Already backed off by the cap's own overhang, so a round cap lands
	 *  exactly on the base. (The renderer puts the line's opacity on the
	 *  group, so what overlap remains — the line under a chevron's arms —
	 *  composites once.) */
	lineEnd: Point
	bbox: ArrowheadBBox
}

/** The annotation's end styling with the built-in seed behind absent fields
 *  (lines saved before caps / arrowheads existed). */
export const resolveLineEnds = (line: LineSegmentAnnotation): LineEndStyle => ({
	lineCap: line.lineCap ?? DEFAULT_LINE_END_STYLE.lineCap,
	arrowhead: line.arrowhead ?? DEFAULT_LINE_END_STYLE.arrowhead,
	arrowheadStyle: line.arrowheadStyle ?? DEFAULT_LINE_END_STYLE.arrowheadStyle,
	arrowheadScale: line.arrowheadScale ?? DEFAULT_LINE_END_STYLE.arrowheadScale,
})

/** SVG `stroke-linecap` for a cap choice. "square" is a FLUSH end (SVG's
 *  butt cap), the same mapping the Connection / segment line caps use — a
 *  projecting square cap would push the visible end past the endpoint the
 *  user positioned. */
export const lineCapToSvg = (cap: LineCapStyle): "round" | "butt" =>
	cap === "round" ? "round" : "butt"

/** How far (px) a cap paints past the geometric endpoint along the line. */
export const capOverhang = (cap: LineCapStyle, thickness: number): number =>
	cap === "round" ? Math.max(0, thickness) / 2 : 0

const round3 = (n: number): number => Math.round(n * 1000) / 1000

const fmt = (p: Point): string => `${round3(p.x)},${round3(p.y)}`

const boundsOf = (pts: readonly Point[], grow: number): ArrowheadBBox => {
	let left = Infinity
	let top = Infinity
	let right = -Infinity
	let bottom = -Infinity
	for (const p of pts) {
		if (p.x < left) left = p.x
		if (p.y < top) top = p.y
		if (p.x > right) right = p.x
		if (p.y > bottom) bottom = p.y
	}
	return {
		left: left - grow,
		top: top - grow,
		right: right + grow,
		bottom: bottom + grow,
	}
}

/** Place an arrowhead at the end (x2, y2) of the segment (x1, y1)→(x2, y2),
 *  pointing along it. `null` when there is no direction to point in (a
 *  zero-length or non-finite segment) or no size to draw at (scale ≤ 0). */
export const computeArrowhead = ({
	x1,
	y1,
	x2,
	y2,
	thickness,
	style,
	scale,
	lineCap,
}: {
	x1: number
	y1: number
	x2: number
	y2: number
	/** The line's stroke width — the head's size unit and the open
	 *  chevron's stroke. */
	thickness: number
	style: ArrowheadStyle
	/** `arrowheadScale`: multiplies the thickness-derived size. */
	scale: number
	/** The line's cap, so `lineEnd` can back off by its overhang. */
	lineCap: LineCapStyle
}): ArrowheadGeometry | null => {
	const dx = x2 - x1
	const dy = y2 - y1
	const len = Math.hypot(dx, dy)
	if (!Number.isFinite(len) || len <= 0) return null
	const unit = Math.max(thickness, 1) * scale
	if (!Number.isFinite(unit) || unit <= 0) return null
	const headLen = ARROWHEAD_LENGTH_PER_PX * unit
	const halfW = ARROWHEAD_HALF_WIDTH_PER_PX * unit
	// Unit vector along the line toward the tip, and its left-hand normal.
	const ux = dx / len
	const uy = dy / len
	const nx = -uy
	const ny = ux
	/** A point `back` px behind the tip along the line and `side` px off it. */
	const at = (back: number, side: number): Point => ({
		x: x2 - ux * back + nx * side,
		y: y2 - uy * back + ny * side,
	})
	const overhang = capOverhang(lineCap, thickness)
	/** The line's geometric end for a head whose base sits `base` px behind
	 *  the tip — never past the line's own start (a segment shorter than its
	 *  head collapses to a zero-length line under the head). */
	const endBehind = (base: number): Point => at(Math.min(base + overhang, len), 0)
	const polygon = (pts: readonly Point[]): string =>
		`M${pts.map(fmt).join("L")}Z`

	switch (style) {
		case "triangle": {
			const pts = [at(0, 0), at(headLen, halfW), at(headLen, -halfW)]
			return {
				style,
				d: polygon(pts),
				filled: true,
				lineEnd: endBehind(headLen),
				bbox: boundsOf(pts, 0),
			}
		}
		case "stealth": {
			const notch = STEALTH_NOTCH * headLen
			const pts = [
				at(0, 0),
				at(headLen, halfW),
				at(notch, 0),
				at(headLen, -halfW),
			]
			return {
				style,
				d: polygon(pts),
				filled: true,
				lineEnd: endBehind(notch),
				bbox: boundsOf(pts, 0),
			}
		}
		case "diamond": {
			const pts = [
				at(0, 0),
				at(headLen / 2, halfW),
				at(headLen, 0),
				at(headLen / 2, -halfW),
			]
			return {
				style,
				d: polygon(pts),
				filled: true,
				lineEnd: endBehind(headLen),
				bbox: boundsOf(pts, 0),
			}
		}
		case "circle": {
			// A disc whose far edge is the tip; its diameter is the head length.
			const r = halfW
			const c = at(r, 0)
			const d =
				`M${round3(c.x - r)},${round3(c.y)}` +
				`a${round3(r)},${round3(r)} 0 1,0 ${round3(2 * r)},0` +
				`a${round3(r)},${round3(r)} 0 1,0 ${round3(-2 * r)},0Z`
			return {
				style,
				d,
				filled: true,
				lineEnd: endBehind(2 * r),
				bbox: {
					left: c.x - r,
					top: c.y - r,
					right: c.x + r,
					bottom: c.y + r,
				},
			}
		}
		case "open": {
			// Two arms meeting at the tip, stroked like the line. The line runs
			// to the tip under them; its cap is covered by the arms' stroke.
			const pts = [at(headLen, halfW), at(0, 0), at(headLen, -halfW)]
			return {
				style,
				d: `M${pts.map(fmt).join("L")}`,
				filled: false,
				lineEnd: endBehind(0),
				bbox: boundsOf(pts, Math.max(0, thickness) * OPEN_TIP_OVERHANG),
			}
		}
	}
}
