// A variable's Format is set per CONTROL — the x / y axis's tick Format box,
// a quantitative legend's break Format, a data label's per-variable Format.
// The tooltip has no Format controls of its own, so without this it printed
// raw cells ("0.1432", "1234.5") beside an axis reading "14.32%" / "$1,235".
//
// Instead of a fourth place to set formats, the tooltip INHERITS: each field
// takes the format the user already assigned to it elsewhere. One variable
// can carry different formats in different controls (a share formatted
// ".0%" on the axis but ".2%" in its data labels), so the sources are
// ranked and the first one that has a format wins:
//
//   1. an AXIS (x / y / r, the radar / pie angle axis, the chord ring axis)
//   2. a quantitative LEGEND's break labels
//   3. a DATA LABEL's per-variable format
//
// Axes lead because they're the chart's own printed reference for that
// variable — the tooltip should read like the axis the user is comparing
// against. Nothing here writes config: it's a read-time lookup, so the
// Format boxes keep showing exactly what the user typed.

import type { ChannelConfigs, DataLabelsConfig } from "./channelConfig"
import { formatField } from "./dataLabelsStyle"
import { QUANTITATIVE_LEGEND_CHANNELS, type LegendConfig } from "./labelsConfig"
import type { Encodings } from "./types"

/** Field name → the stored format string (spec plus any Before / After
 * text) the tooltip should print that field with. Fields with no format
 * anywhere are absent — they keep printing their raw cell. */
export type TooltipFormats = ReadonlyMap<string, string>

export const tooltipFieldFormats = (args: {
	encodings: Encodings
	channelConfigs: ChannelConfigs
	legendConfig?: Pick<Partial<LegendConfig>, "channels"> | null
	dataLabels?: Pick<Partial<DataLabelsConfig>, "fieldFormats"> | null
}): TooltipFormats => {
	const { encodings, channelConfigs, legendConfig, dataLabels } = args
	const out = new Map<string, string>()
	/** First claim on a field wins, so sources are visited in rank order.
	 * A format that is Auto AND has no Before / After text claims nothing —
	 * a later source may still format the field. */
	const claim = (field: string | null | undefined, stored?: string | null) => {
		if (!field || !stored || stored.trim() === "") return
		if (!out.has(field)) out.set(field, stored)
	}

	// 1 — axes. A positional axis without its own field can still be the
	// MEASURE axis (bar-family charts encode the value on `length` and the
	// unmapped perpendicular axis renders it), exactly as the format hints
	// resolve it in `formatHintDefaults`.
	for (const ch of ["x", "y", "r"] as const)
		claim(
			encodings[ch]?.field ?? encodings.length?.field,
			channelConfigs[ch]?.customFormat,
		)
	claim(encodings.angle?.field, channelConfigs.angle?.customFormat)
	// The chord ring axis measures the flow value, which rides on `area`.
	claim(encodings.area?.field, channelConfigs.connection?.chordAxis?.customFormat)

	// 2 — quantitative legend break labels.
	for (const ch of QUANTITATIVE_LEGEND_CHANNELS)
		claim(encodings[ch]?.field, legendConfig?.channels?.[ch]?.format)

	// 3 — data labels, already keyed by field name.
	for (const [field, spec] of Object.entries(dataLabels?.fieldFormats ?? {}))
		claim(field, spec)

	return out
}

/** Print one hovered value through its inherited format. Reuses the data
 * label formatter, so every spec the Format boxes accept behaves the same
 * here: d3 number specs, d3 time specs, `literal`, the Before / After text
 * around them, and the label-only "full country name".
 *
 * Unformatted fields are stringified exactly as the tooltip always did. A
 * hovered value is the raw CELL, so a `literal` format on a date column
 * prints the cell's own text without any of the axis's tick-set
 * reconstruction (`rawTextByTime`). */
export const formatTooltipValue = (
	raw: unknown,
	stored: string | undefined,
): string => (stored ? formatField(raw, stored, null) : String(raw ?? ""))

/** Apply the inherited formats across a tooltip's field list. Identity
 * preserving when nothing applies. */
export const applyTooltipFormats = <T extends { name: string; value: unknown }>(
	fields: ReadonlyArray<T>,
	formats: TooltipFormats,
): ReadonlyArray<T> => {
	if (formats.size === 0) return fields
	let changed = false
	const out = fields.map((f) => {
		const stored = formats.get(f.name)
		if (!stored) return f
		changed = true
		return { ...f, value: formatTooltipValue(f.value, stored) }
	})
	return changed ? out : fields
}
