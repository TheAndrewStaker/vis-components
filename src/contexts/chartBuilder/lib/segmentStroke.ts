import { DEFAULT_SEGMENT_THICKNESS, type LengthConfig } from "./channelConfig"
import { MIN_LINE_THICKNESS } from "./connectionThickness"

/** Single source of truth for a scatter line segment's stroke width.
 *  Precedence:
 *   1. `segmentThicknessByValue[String(row[field])]` — per-level override
 *      (clamped to the input floor) when a Vary-by field is set.
 *   2. `segmentThickness` — the single value.
 *   3. `DEFAULT_SEGMENT_THICKNESS`.
 *  Keys match `resolveConnectionThickness`'s convention (stringified raw
 *  cell), so the sidebar's level rows and the drawn marks agree. */
export const resolveSegmentThickness = (
	cfg: LengthConfig | undefined,
	row: Record<string, unknown>
): number => {
	const single = cfg?.segmentThickness ?? DEFAULT_SEGMENT_THICKNESS
	const field = cfg?.segmentThicknessField
	if (!field) return single
	const raw = row[field]
	if (raw === undefined || raw === null) return single
	const override = cfg?.segmentThicknessByValue?.[String(raw)]
	if (override === undefined) return single
	return Math.max(MIN_LINE_THICKNESS, override)
}

/** SVG stroke-linecap for segments. "square" maps to SVG's butt cap so the
 *  segment ends flush at its endpoints (mirrors Connection's Line cap). */
export const segmentStrokeLinecap = (
	cfg: LengthConfig | undefined
): "round" | "butt" => (cfg?.segmentLineCap === "square" ? "butt" : "round")
