import {
	isPixelSystem,
	percentToPixelX,
	percentToPixelY,
	pixelToPercentX,
	pixelToPercentY,
	type AnnotationCoordSystem,
} from "../../../lib/annotationPixels"
import type { FieldType } from "../../../lib/types"

/** Resolved per-axis info used by the panel to pick number-input vs.
 *  category-dropdown for `values` mode. Mirrors the resolution PlotCanvas
 *  does at render time so the panel and the renderer agree on what each
 *  axis represents in the current chart mode. */
export type AxisInfo = {
	field: string | null
	type: FieldType | null
	categories: string[] | null
	/** Data min for numeric/temporal axes. Stored as a number (timestamp
	 *  in ms for temporal) so the percent↔values conversion below can lerp
	 *  uniformly. `null` when the axis is categorical or empty. */
	dataMin: number | null
	dataMax: number | null
}

/** Round `n` to a short, human-readable representation. Strips trailing
 *  zeros that JavaScript's float arithmetic introduces (e.g.,
 *  `12.34 / 100 * 100 = 12.339999999`) so the position-adjuster inputs
 *  don't fill up with noise after a blur/round-trip. */
export const cleanNumber = (n: number): number => {
	if (!Number.isFinite(n)) return n
	// `toPrecision(10)` keeps enough digits for any reasonable axis value
	// while parseFloat re-parses to drop trailing zeros from the string.
	return parseFloat(n.toPrecision(10))
}

/** Coerce a stored value to a number for percent-mode math. Strings
 *  (left over from a previous values-mode setting on a categorical
 *  axis) coerce to 0 here — the user's display in percent mode is
 *  meaningless on those anyway. */
export const toNumber = (v: number | string): number => {
	if (typeof v === "number") return v
	const n = Number(v)
	return Number.isFinite(n) ? n : 0
}

/** Convert a stored percent coord (0–1) to a data-mode value using the
 *  axis info. Categorical axes pick the category at that position;
 *  numeric/temporal lerp between data min and max. Returns the original
 *  value unchanged when conversion isn't possible (no axis info). */
export const percentToValue = (
	percent: number,
	axis: AxisInfo,
): number | string => {
	if (axis.categories && axis.categories.length > 0) {
		const idx = Math.max(
			0,
			Math.min(
				axis.categories.length - 1,
				Math.round(percent * (axis.categories.length - 1)),
			),
		)
		return axis.categories[idx] ?? ""
	}
	if (axis.dataMin !== null && axis.dataMax !== null) {
		const lerped = axis.dataMin + percent * (axis.dataMax - axis.dataMin)
		return cleanNumber(lerped)
	}
	return percent
}

/** Inverse of `percentToValue` — convert a data-mode value back to its
 *  0–1 position on the axis so the percent boxes show the live numbers
 *  after a toggle. */
export const valueToPercent = (
	value: number | string,
	axis: AxisInfo,
): number => {
	if (axis.categories && axis.categories.length > 0) {
		const idx = axis.categories.indexOf(String(value))
		if (idx < 0) return 0
		return axis.categories.length <= 1
			? 0.5
			: idx / (axis.categories.length - 1)
	}
	if (axis.dataMin !== null && axis.dataMax !== null) {
		const num = typeof value === "number" ? value : Number(value)
		if (!Number.isFinite(num)) return 0
		if (axis.dataMax === axis.dataMin) return 0.5
		return (num - axis.dataMin) / (axis.dataMax - axis.dataMin)
	}
	return typeof value === "number" ? value : 0
}

/** Convert a percent-mode radius (fraction of the radius-axis extent) to a
 *  data-unit radius along that axis. Falls back to the raw fraction when the
 *  axis has no numeric span (categorical / empty). */
export const radiusToValues = (fraction: number, axis: AxisInfo): number => {
	if (axis.dataMin === null || axis.dataMax === null) return fraction
	return cleanNumber(fraction * (axis.dataMax - axis.dataMin))
}

/** Inverse of `radiusToValues` — data-unit radius back to a 0–1 fraction of
 *  the axis extent so the percent box shows a sensible number after toggling. */
export const radiusToPercent = (units: number, axis: AxisInfo): number => {
	if (axis.dataMin === null || axis.dataMax === null) return units
	const span = axis.dataMax - axis.dataMin
	if (span === 0) return 0
	return cleanNumber(units / span)
}

/** Suggestion (placeholder) label for the Nth annotation of a kind:
 *  "Rectangle", "Rectangle 2", "Rectangle 3", … Shown as light placeholder
 *  text so the user can tell the shapes apart, but is nudged to type a more
 *  descriptive name (which replaces the suggestion). */
export const nameSuggestion = (base: string, index: number): string =>
	`${base} ${index + 1}`

/** The default name for a NEW annotation of one kind: "<Kind> N" where N
 *  starts at one past the kind's current count and skips any number already
 *  taken (so removing "Circle 1" and adding again doesn't mint a second
 *  "Circle 3"). Stored on the annotation at creation, so names stay put when
 *  earlier siblings are removed. */
export const nextAnnotationName = (
	base: string,
	existing: ReadonlyArray<{ name: string }>
): string => {
	const taken = new Set(existing.map((a) => a.name.trim().toLowerCase()))
	let n = existing.length + 1
	while (taken.has(`${base} ${n}`.toLowerCase())) n += 1
	return `${base} ${n}`
}

/** The rendered plot rect's size, from `currentRenderedPanelInnerDimsAtom`.
 *  Null before the first layout pass — pixel conversions then leave the
 *  stored number alone rather than guess an extent. */
export type PlotDims = { widthPx: number; heightPx: number } | null

const extentOf = (dims: PlotDims, dim: "x" | "y"): number | null =>
	dims === null ? null : dim === "x" ? dims.widthPx : dims.heightPx

/** Convert one stored coordinate between the three coordinate systems so
 *  the annotation stays where it is when the user switches "Adjust by".
 *  Every path goes through the percent (0–1) form: values ↔ percent via the
 *  axis's data span (or category index), pixels ↔ percent via the plot's
 *  extent on that axis (pixels count from the chosen corner, +x right and
 *  +y up; the pixel corners convert between each other through percent
 *  too). */
export const convertCoord = (
	value: number | string,
	from: AnnotationCoordSystem,
	to: AnnotationCoordSystem,
	axis: AxisInfo,
	dim: "x" | "y",
	dims: PlotDims,
): number | string => {
	if (from === to) return value
	const extent = extentOf(dims, dim)
	const toPercent = (): number => {
		if (from === "values") return valueToPercent(value, axis)
		if (isPixelSystem(from)) {
			if (extent === null) return toNumber(value)
			return dim === "x"
				? pixelToPercentX(toNumber(value), extent, from)
				: pixelToPercentY(toNumber(value), extent, from)
		}
		return toNumber(value)
	}
	const fraction = toPercent()
	if (to === "values") return percentToValue(fraction, axis)
	if (isPixelSystem(to)) {
		if (extent === null) return cleanNumber(fraction)
		return cleanNumber(
			Math.round(
				dim === "x"
					? percentToPixelX(fraction, extent, to)
					: percentToPixelY(fraction, extent, to),
			),
		)
	}
	return cleanNumber(fraction)
}

/** `convertCoord` for a circle's radius: a fraction of the radius axis's
 *  extent (percent), data units along it (values), or on-screen px. */
export const convertRadius = (
	value: number,
	from: AnnotationCoordSystem,
	to: AnnotationCoordSystem,
	axis: AxisInfo,
	extentPx: number | null,
): number => {
	if (from === to) return value
	const fraction =
		from === "values"
			? radiusToPercent(value, axis)
			: isPixelSystem(from)
				? extentPx !== null && extentPx > 0
					? value / extentPx
					: value
				: value
	if (to === "values") return radiusToValues(fraction, axis)
	if (isPixelSystem(to))
		return extentPx !== null ? Math.round(fraction * extentPx) : cleanNumber(fraction)
	return cleanNumber(fraction)
}
