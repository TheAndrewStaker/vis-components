import { meanByCategory } from "../../../lib/aggregators/distributions"
import type { DistributionOverlayConfig } from "../../../lib/channelConfig"
import { buildMarks, type BuildMarksArgs } from "./marks"
import type { Mark } from "./types"

/** Whether the box plot marks each box's mean with a point: the box is on,
 * the underlying data points are hidden (the option only shows then — with
 * the points visible the mean would be lost among them) and "Mark mean" is
 * checked. */
export const meanMarked = (overlay: DistributionOverlayConfig): boolean =>
	overlay.showBoxPlot && !overlay.showPoints && overlay.markMean === true

/** One scatter mark per box, placed at the category's mean. Each mean becomes
 * a synthetic row carrying only the category and the value, run through the
 * ordinary `buildMarks` pipeline — so the point takes its glyph and border
 * from the Shape panel, its fill / outline from the Color and Opacity panels
 * (per category when hue is mapped to the category field) and its size from
 * the Area panel's default point size, exactly as the hidden data points
 * would. A field mapped elsewhere (a different hue field, an area field) has
 * no value on the synthetic row and resolves to that channel's unmapped
 * fallback. The single-variable path passes an empty `categoryField`, and
 * its one row carries just the value. */
export const buildMeanMarks = (
	args: BuildMarksArgs & { categoryField: string; valueField: string }
): Mark[] => {
	const { categoryField, valueField, rowsForChart, ...rest } = args
	const rows = meanByCategory(rowsForChart, categoryField, valueField).map(
		({ category, mean }) =>
			categoryField
				? { [categoryField]: category, [valueField]: mean }
				: { [valueField]: mean }
	)
	return buildMarks({ ...rest, rowsForChart: rows })
}
