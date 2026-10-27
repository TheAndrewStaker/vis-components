import type { ConnectionConfig } from "./channelConfig"

/** Geometry for Connection's `"tick"` line cap: a perpendicular tick mark
 *  centered on each OPEN end of a polyline — the whisker ends of a
 *  box-and-whisker plot, the ends of a range / dumbbell line. The line
 *  itself ends flush (SVG `butt`, like "square") so the tick's inner half
 *  sits exactly on the data position and the end reads as a crisp T. */

export type LineEndTick = {
	x1: number
	y1: number
	x2: number
	y2: number
}

/** Minimum auto tick length so hairline strokes still get a readable tick. */
export const MIN_AUTO_TICK_LENGTH = 8
/** Auto tick length per px of stroke width. */
export const TICK_LENGTH_PER_PX = 4

/** The tick length (full span, px) for a line of `thickness` when the user
 *  hasn't typed one. */
export const autoLineEndTickLength = (thickness: number): number =>
	Math.max(MIN_AUTO_TICK_LENGTH, TICK_LENGTH_PER_PX * thickness)

/** Resolved tick length: the typed override (floored at 0) else auto. */
export const resolveLineEndTickLength = (
	cfg: Pick<ConnectionConfig, "lineCapTickLength"> | undefined,
	thickness: number
): number => {
	const typed = cfg?.lineCapTickLength
	return typed === null || typed === undefined
		? autoLineEndTickLength(thickness)
		: Math.max(0, typed)
}

/** SVG `stroke-linecap` for a Connection line-cap choice. "square" AND
 *  "tick" are flush ends (SVG's butt cap); only "round" extends past the
 *  endpoint. */
export const connectionStrokeLinecap = (
	cap: ConnectionConfig["lineCap"] | undefined
): "round" | "butt" => (cap === "square" || cap === "tick" ? "butt" : "round")

/** Unit vector perpendicular to the direction from `a` to `b`; null when
 *  the two points coincide (no direction to be perpendicular to). */
const perpendicular = (
	a: { x: number; y: number },
	b: { x: number; y: number }
): { x: number; y: number } | null => {
	const dx = b.x - a.x
	const dy = b.y - a.y
	const len = Math.hypot(dx, dy)
	if (!(len > 0)) return null
	return { x: -dy / len, y: dx / len }
}

/** The two end ticks of `points` (first and last point), each `length` px
 *  long and centered on its endpoint, perpendicular to the adjacent
 *  segment. Walks inward past coincident points to find a direction; a
 *  polyline with no extent at all (all points equal) gets no ticks. */
export const lineEndTicks = (
	points: ReadonlyArray<{ x: number; y: number }>,
	length: number
): LineEndTick[] => {
	if (points.length < 2 || !(length > 0)) return []
	const half = length / 2
	const tickAt = (
		end: { x: number; y: number },
		toward: ReadonlyArray<{ x: number; y: number }>
	): LineEndTick | null => {
		for (const p of toward) {
			const n = perpendicular(end, p)
			if (n) {
				return {
					x1: end.x - n.x * half,
					y1: end.y - n.y * half,
					x2: end.x + n.x * half,
					y2: end.y + n.y * half,
				}
			}
		}
		return null
	}
	const first = points[0]
	const last = points[points.length - 1]
	const inwardFromFirst = points.slice(1)
	const inwardFromLast = [...points.slice(0, -1)].reverse()
	const ticks: LineEndTick[] = []
	const t0 = tickAt(first, inwardFromFirst)
	if (t0) ticks.push(t0)
	const t1 = tickAt(last, inwardFromLast)
	if (t1) ticks.push(t1)
	return ticks
}
