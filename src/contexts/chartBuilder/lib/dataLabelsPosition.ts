import type { DataLabelsEncodings, Encodings } from "./types"

/** The Data Labels position channels that inherit the chart's own mapping. */
export const DATA_LABEL_POSITION_CHANNELS = ["x", "y", "angle"] as const
export type DataLabelPositionChannel =
	(typeof DATA_LABEL_POSITION_CHANNELS)[number]

/** Data labels almost always sit where the marks do, so an UNSET label
 *  position (X / Y, or Angle on a pie) follows the chart's own
 *  encoding of that channel — live, so re-mapping the chart's X moves the
 *  labels with it. A field the user picks on the Data Labels shelf wins;
 *  "— none —" there is stored as `none: true` (an unset slot already means
 *  "inherit") and keeps the slot empty. Labels still need a Value before
 *  they draw, so the inherited position alone shows nothing. */
export const resolveDataLabelPositions = (
	labels: DataLabelsEncodings,
	chart: Pick<Encodings, DataLabelPositionChannel>,
): DataLabelsEncodings => {
	let out = labels
	for (const ch of DATA_LABEL_POSITION_CHANNELS) {
		const slot = labels[ch] as DataLabelsEncodings[typeof ch] | undefined
		if (slot?.field || slot?.none) continue
		const inherited = chart[ch]?.field ?? null
		if (!inherited) continue
		if (out === labels) out = { ...labels }
		out[ch] = { field: inherited }
	}
	return out
}
