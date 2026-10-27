import { axisFieldsFor } from "./axisFields"
import type { ChartModeDef } from "./chartModes/types"
import type { HistogramMeasure } from "./histogramMeasure"
import type { Encodings } from "./types"

/** The text each axis title falls back to when the user hasn't typed one —
 *  the SAME text the renderers resolve inline as `labels.<axis>Title ??
 *  <field>`, so the Labels panel can show it as the box's real value and
 *  what the user reads in the box is what the figure draws:
 *    - a cartesian axis reads its field per `axisFieldsFor` (the measure
 *      field on a bar / area's measure axis, the position channel else);
 *    - a histogram's measure axis has no field — BarPlot titles it
 *      "Count" / "Density" after the histogram mode;
 *    - the radar's R axis reads `xAxisTitle` (RadarPlot's `rLabel`), so x
 *      falls back to the R field there; y has nothing to title.
 *  An axis the mode doesn't draw, or one with nothing mapped, is `""`. */
export const defaultAxisTitles = (
	mode: Pick<ChartModeDef, "id" | "canvas">,
	encodings: Encodings,
	histMeasure: HistogramMeasure | null
): { x: string; y: string } => {
	if (mode.id === "radar") {
		return { x: encodings.r?.field ?? "", y: "" }
	}
	const fields = axisFieldsFor(mode, encodings)
	const titles = { x: fields.xField ?? "", y: fields.yField ?? "" }
	if (histMeasure && mode.canvas.measureAxis) {
		titles[mode.canvas.measureAxis] =
			histMeasure.mode === "density" ? "Density" : "Count"
	}
	return titles
}
