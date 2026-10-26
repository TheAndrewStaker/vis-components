import type { AestheticScales } from "../store/useAestheticScales"

import type {
	ChannelConfigs,
	DataLabelLayer,
	DataLabelsConfig,
} from "./channelConfig"
import { comboOverlayChannel } from "./chartModes/families"
import { resolveConnectionStroke } from "./connectionStroke"
import { resolveSlotColor } from "./resolveLayerColor"
import { parseNumericCell } from "./scales"
import type { Encodings } from "./types"

/** The finite numeric extent of one column — the span a combo chart's marks
 * layer adds to the bars' measure axis, so the axis covers the marks as
 * well as the bars. Null when the column has no finite value. Shared by
 * BarPlot (its own panel), the shared-axis bounds (faceted combos) and the
 * layout solver's tick-label estimate, so all three see the same axis. */
export const overlayMeasureExtent = (
	rows: ReadonlyArray<Record<string, unknown>>,
	field: string
): { min: number; max: number } | null => {
	let min = Infinity
	let max = -Infinity
	for (const row of rows) {
		const v = parseNumericCell(row[field])
		if (v === null || !Number.isFinite(v)) continue
		if (v < min) min = v
		if (v > max) max = v
	}
	return min <= max ? { min, max } : null
}

/** The color a combo's marks-layer point FILLS with, per row. The Point
 * fill slot (`colorSlots.comboPointFill`) owns it when configured — "vary
 * by" a field runs its scale, "single color" is that color. Unconfigured
 * ("Auto"), a point takes its LINE's color: the same connection-stroke
 * chain the line it sits on resolves (Line slot → per-value override →
 * line palette → stroke override → theme connection color), keyed by the
 * row's Connection value — never the bars' Color mapping, which the points
 * would otherwise inherit from the shared mark pipeline. Palette indices
 * count over the Connection values in encounter order, as the line
 * renderer's do, so a palette-colored line and its points agree. */
export const comboPointFillResolver = ({
	rows,
	encodings,
	channelConfigs,
	aestheticScales,
	connectionColor,
}: {
	rows: ReadonlyArray<Record<string, unknown>>
	encodings: Encodings
	channelConfigs: ChannelConfigs
	aestheticScales: AestheticScales
	connectionColor: string
}): ((row: Record<string, unknown>) => string) => {
	const connectionField = encodings.connection?.field ?? null
	const groupKeys: string[] = []
	if (connectionField) {
		const seen = new Set<string>()
		for (const row of rows) {
			const k = String(row[connectionField] ?? "")
			if (seen.has(k)) continue
			seen.add(k)
			groupKeys.push(k)
		}
	}
	const cfg = channelConfigs.connection
	const lineOf = (row: Record<string, unknown>): string => {
		const groupKey = connectionField ? String(row[connectionField] ?? "") : null
		return resolveConnectionStroke({
			groupKey,
			lineColors: cfg?.lineColors ?? {},
			linePalette: cfg?.linePalette ?? null,
			paletteIdx: groupKey === null ? 0 : Math.max(0, groupKeys.indexOf(groupKey)),
			strokeColor: cfg?.strokeColor ?? null,
			fallback: connectionColor,
			lineSlotCfg: channelConfigs.colorSlots?.line,
			lineSlot: aestheticScales.colorSlots.line,
			slotRow: row,
		})
	}
	const pointCfg = channelConfigs.colorSlots?.comboPointFill
	if (!pointCfg) return lineOf
	const pointSlot = aestheticScales.colorSlots.comboPointFill ?? null
	return (row) => resolveSlotColor(pointSlot, pointCfg, row, lineOf(row))
}

/** The variables a combo's MARKS layer is about: the position variable
 * drawn as marks, the Connection field that names each line, and the
 * fields the Line / Point-fill color slots vary by. A data label showing
 * any of them annotates the marks by default (`dataLabelLayerFor`). Empty
 * outside the combo modes. */
export const comboMarksFields = (
	mode: string,
	encodings: Encodings,
	channelConfigs: ChannelConfigs
): ReadonlySet<string> => {
	const overlay = comboOverlayChannel(mode)
	if (!overlay) return new Set()
	return new Set(
		[
			encodings[overlay]?.field,
			encodings.connection?.field,
			channelConfigs.colorSlots?.line?.field,
			channelConfigs.colorSlots?.comboPointFill?.field,
		].filter((f): f is string => !!f)
	)
}

/** Which combo layer one data label annotates: its own `fieldLayers`
 * entry, else the bars unless any variable it shows is one of the marks'
 * (`comboMarksFields`). `key` is the label's key (a composed label's id;
 * the single-field label's value field); `fields` the variables its text
 * shows. Every reader — the renderer, the layout reserve, the panel —
 * resolves through here so they agree. */
export const dataLabelLayerFor = (
	cfg: Pick<DataLabelsConfig, "fieldLayers">,
	key: string | null,
	fields: ReadonlyArray<string>,
	marksFields: ReadonlySet<string>
): DataLabelLayer => {
	const own = cfg.fieldLayers?.[key ?? fields[0] ?? ""]
	if (own) return own
	return fields.some((f) => marksFields.has(f)) ? "marks" : "bars"
}
