/** The keys a chart's `*` setting paths take: what `list_settings` shows
 * for a chart so a patch can name a real level, field, label or panel. */

import { ALL_ENCODING_CHANNELS } from "./channels"
import { effectiveComposedLabels } from "./dataLabelsSelection"
import type { FieldType, Visual } from "./types"
import { uniqueFieldValues } from "./uniqueFieldValues"

/** The levels listed per field, at most. */
const LEVEL_CAP = 200

export type SettingKeys = {
	/** Every field of the data set. */
	fields: string[]
	/** The levels of each mapped categorical / ordinal field (and the facet
	 *  fields), in first-appearance order, capped. */
	levels: Record<string, string[]>
	/** The ids of the composed data labels (`dataLabelsConfig.field*` and
	 *  `pieces` key on these). */
	composedLabels: string[]
	/** The wrap facet's panel keys (`panelAxisOverrides`, `panelOrder`). */
	facetPanels: string[]
	/** The row and column facet values (`gridPanelAxisOverrides` row, then
	 *  column; `rowAxisOverrides` / `colAxisOverrides`). */
	facetRows: string[]
	facetCols: string[]
	/** The data table's columns (`dataTableConfig.columnAlign`). */
	columns: string[]
}

export const composedLabelIds = (visual: Visual): string[] => {
	const value = visual.dataLabelsEncodings?.value
	if (!visual.dataLabelsConfig || !value) return []
	return effectiveComposedLabels(visual.dataLabelsConfig, value.fields ?? []).map((l) => l.id)
}

export const settingKeysOf = (
	visual: Visual,
	fields: ReadonlyArray<{ name: string; type: FieldType }>,
	rows: ReadonlyArray<Record<string, unknown>>
): SettingKeys => {
	const typeOf = (name: string) => visual.fieldTypeOverrides?.[name] ?? fields.find((f) => f.name === name)?.type
	const levels: Record<string, string[]> = {}
	const levelsOf = (name: string | null | undefined): string[] => {
		if (!name) return []
		if (!levels[name]) {
			const type = typeOf(name) ?? "categorical"
			levels[name] = uniqueFieldValues(rows, name, { type }).slice(0, LEVEL_CAP)
		}
		return levels[name]
	}
	for (const ch of ALL_ENCODING_CHANNELS) {
		const field = visual.encodings[ch]?.field
		const type = field ? typeOf(field) : undefined
		if (field && (type === "categorical" || type === "ordinal")) levelsOf(field)
	}
	const enc = visual.encodings
	return {
		fields: fields.map((f) => f.name),
		levels,
		composedLabels: composedLabelIds(visual),
		facetPanels: levelsOf(enc.facet?.field),
		facetRows: levelsOf(enc.facetRow?.field),
		facetCols: levelsOf(enc.facetCol?.field),
		columns: fields.map((f) => f.name),
	}
}
