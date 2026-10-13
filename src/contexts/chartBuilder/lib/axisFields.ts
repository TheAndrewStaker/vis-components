import type { ChartModeDef } from "./chartModes/types"
import type { Encodings, FieldType } from "./types"

/** The slice of a mode def the axis helpers read — pass the whole def or
 *  just its canvas traits. */
export type AxisTraits = Pick<ChartModeDef, "canvas">

/** Resolve which encoding field drives each axis for a given chart mode.
 *  `null` means that axis doesn't exist in this mode (e.g. y in pies-x)
 *  OR that the relevant encoding isn't mapped.
 *
 *  Trait-driven, never by mode id:
 *    - an axis the mode doesn't draw (`canvas.cartesianAxes`) → null —
 *      the pie bands, radar, geo, and the axis-less structure layouts;
 *    - the mode's MEASURE axis (`canvas.measureAxis`) reads the measure
 *      field (`length` for bars / areas, via `resolveMeasureField`) —
 *      null on a histogram, whose count axis has no field;
 *    - any other drawn axis reads its own position channel.
 *
 *  This is the single source of truth for "what field is the x-axis
 *  reading from?" — used for shared axis titles, annotation scale
 *  lookup, and any other code that needs to map mode → axis field. */
export const axisFieldsFor = (
	mode: AxisTraits,
	encodings: Encodings,
): { xField: string | null; yField: string | null } => {
	const { cartesianAxes, measureAxis, resolveMeasureField } = mode.canvas
	const fieldFor = (axis: "x" | "y"): string | null => {
		if (!cartesianAxes[axis]) return null
		if (measureAxis === axis) return resolveMeasureField?.(encodings) ?? null
		return encodings[axis]?.field ?? null
	}
	return { xField: fieldFor("x"), yField: fieldFor("y") }
}

/** True when this chart mode draws a cartesian x-axis at all — false for
 *  pies-y, the single pie, radar, every geo mode and the axis-less
 *  structure layouts, regardless of encoding mapping. */
export const hasXAxis = (mode: AxisTraits): boolean =>
	mode.canvas.cartesianAxes.x

/** True when this chart mode draws a cartesian y-axis at all. */
export const hasYAxis = (mode: AxisTraits): boolean =>
	mode.canvas.cartesianAxes.y

/** Whether a facet panel's axis-RANGE editor (overall / per-row / per-panel
 *  min-max) applies to `axis`. True when the field the axis actually reads
 *  (per `axisFieldsFor` — Length for a vertical bar's y, not Y position) is
 *  quantitative / temporal, or when the axis is the mode's MEASURE axis,
 *  which is continuous by construction even with no field behind it (a
 *  histogram's count axis). Mirrors `yIsMeasureAxis` / `xIsMeasureAxis` in
 *  the panel render loop, so the sidebar never hides an editor whose bounds
 *  the renderer would honor. Reading the raw `encodings.y` field instead
 *  hid the editor on every length-encoded bar chart. An axis the mode
 *  doesn't draw is never continuous. */
export const axisRangeIsContinuous = (
	mode: AxisTraits,
	axis: "x" | "y",
	encodings: Encodings,
	getType: ((field: string) => FieldType) | null,
): boolean => {
	if (!mode.canvas.cartesianAxes[axis]) return false
	if (mode.canvas.measureAxis === axis) return true
	const fields = axisFieldsFor(mode, encodings)
	const field = axis === "x" ? fields.xField : fields.yField
	const type = field && getType ? getType(field) : null
	return type === "quantitative" || type === "temporal"
}
