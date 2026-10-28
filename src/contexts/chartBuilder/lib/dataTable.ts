// ---------------------------------------------------------------------------
// Data table rows + columns (pure)
// ---------------------------------------------------------------------------
//
// What the optional data table under the chart shows (see
// `dataTableConfig.ts` and APPLICATION.md "Data table"):
//
//  - ROWS are the view rows the marks are drawn from — after reshape, the
//    cell conversions and derived variables (`currentDatasetViewAtom`). A
//    chart type that AGGREGATES (bars, histograms, areas, pies, heatmap
//    tiles, hexbins, box / violin, trees, flows) lists its aggregated marks
//    instead — `plottedRows` (`plottedData.ts`) computes them through the
//    renderers' own aggregation code and is passed in as `plotted`.
//  - COLUMNS are the encoded fields in encoding order (positions first, then
//    the remaining mapped channels, facets last), or every view column.
//    Headers are the fields' CURRENT (renamed) names — the view already
//    carries them.
//  - CELL TEXT inherits each variable's format exactly as the tooltip does
//    (`tooltipFormats.ts`); a variable formatted nowhere falls back to its
//    dollar / percent cell hint, then to its raw cell.
//  - ROW ORDER follows the chart's level order where one exists — a pinned
//    order (Fields panel) or an ordinal field's smart sort — on the shown
//    columns in column order; otherwise data order.

import { unparse as papaUnparse } from "papaparse"

import type { EncodingChannel } from "./channelNames"
import type { DataTableColumns } from "./dataTableConfig"
import { effectiveType } from "./fieldType"
import { hintedFormats } from "./formatHintDefaults"
import type { PlottedData } from "./plottedData"
import { applyLevelOrder } from "./smartSort"
import { formatTooltipValue, type TooltipFormats } from "./tooltipFormats"
import type { DatasetView, Encodings, FieldType } from "./types"

/** Encoding order for the "encoded" column set: position channels, then the
 *  remaining mark channels, facets last. */
export const DATA_TABLE_CHANNEL_ORDER: readonly EncodingChannel[] = [
	"x",
	"y",
	"r",
	"length",
	"angle",
	"area",
	"hue",
	"outlineHue",
	"saturation",
	"brightness",
	"opacity",
	"shape",
	"pattern",
	"connection",
	"text",
	"facet",
	"facetRow",
	"facetCol",
]

export type DataTableColumn = {
	/** The field's current name — the header text. */
	name: string
	type: FieldType
	/** Quantitative. Numbers and dates align per the Numbers & dates
	 *  default unless the column has its own alignment (`columnAlign`). */
	numeric: boolean
}

export type DataTableCell = {
	/** The view's cell, unformatted — what the CSV download carries. */
	raw: string
	/** The cell as printed — the inherited format applied. */
	text: string
}

export type DataTableRow = {
	/** The row's index in the view — a stable React key. */
	index: number
	/** One cell per column, in column order. */
	cells: DataTableCell[]
}

export type DataTableModel = {
	columns: DataTableColumn[]
	rows: DataTableRow[]
	/** One line for under the table — what an aggregated row is, or that a
	 *  drawn curve is computed from the rows. Null = nothing to say. */
	note: string | null
}

/** The column names the table shows, in order. "select" lists the
 *  `selected` variables in the view's order (one no longer in the view —
 *  removed or renamed — is skipped; none left falls back to "encoded").
 *  "encoded" lists the
 *  DIMENSIONS (categorical / ordinal / temporal) first, then the MEASURES
 *  (quantitative), each group in encoding order — so a horizontal chart
 *  whose x is the measure still reads "Category, …, Value". `typeOf`
 *  resolves a field's effective type (overrides included); without it
 *  every field counts as a dimension. "encoded" with nothing mapped falls
 *  back to every column — an empty table describes nothing. */
export const dataTableColumnNames = (
	view: Pick<DatasetView, "fields">,
	encodings: Partial<Encodings>,
	mode: DataTableColumns,
	typeOf: (field: string) => FieldType = () => "categorical",
	selected: readonly string[] = []
): string[] => {
	const all = view.fields.map((f) => f.name)
	if (mode === "all") return all
	if (mode === "select") {
		const pick = new Set(selected)
		const picked = all.filter((f) => pick.has(f))
		if (picked.length > 0) return picked
	}
	const present = new Set(all)
	const out: string[] = []
	for (const ch of DATA_TABLE_CHANNEL_ORDER) {
		const field = encodings[ch]?.field
		if (field && present.has(field) && !out.includes(field)) out.push(field)
	}
	if (out.length === 0) return all
	const isMeasure = (f: string) => typeOf(f) === "quantitative"
	return [...out.filter((f) => !isMeasure(f)), ...out.filter(isMeasure)]
}

/** Stable sort of row indices by the level order of every shown column that
 *  HAS one (pinned, or ordinal smart-sort), in column order. */
const orderRows = (
	rows: ReadonlyArray<Record<string, string>>,
	columns: readonly DataTableColumn[],
	fieldLevelOrders: Readonly<Record<string, readonly string[]>>
): number[] => {
	const rankers: Array<(row: Record<string, string>) => number> = []
	for (const col of columns) {
		const pinned = fieldLevelOrders[col.name]
		const hasPin = !!pinned && pinned.length > 0
		if (!hasPin && col.type !== "ordinal") continue
		if (col.type === "quantitative" || col.type === "temporal") continue
		const seen: string[] = []
		const seenSet = new Set<string>()
		for (const r of rows) {
			const v = r[col.name] ?? ""
			if (!seenSet.has(v)) {
				seenSet.add(v)
				seen.push(v)
			}
		}
		const order = applyLevelOrder(seen, col.type, pinned)
		const rank = new Map(order.map((v, i) => [v, i]))
		rankers.push((r) => rank.get(r[col.name] ?? "") ?? order.length)
	}
	const idx = rows.map((_, i) => i)
	if (rankers.length === 0) return idx
	// Ranks precomputed per row, so the comparator never re-indexes rows.
	const ranks = rows.map((r) => rankers.map((rankOf) => rankOf(r)))
	return idx.sort((a, b) => {
		const ra = ranks[a] ?? []
		const rb = ranks[b] ?? []
		for (let k = 0; k < rankers.length; k++) {
			const d = (ra[k] ?? 0) - (rb[k] ?? 0)
			if (d !== 0) return d
		}
		return a - b
	})
}

/** Indices of the aggregated columns the table keeps. Hiding every one
 *  is ignored — an empty table describes nothing. */
const keptPlottedColumns = (
	columns: readonly { name: string }[],
	hidden: readonly string[] = []
): number[] => {
	const all = columns.map((_, i) => i)
	const kept = all.filter((i) => !hidden.includes(columns[i]?.name ?? ""))
	return kept.length > 0 ? kept : all
}

type ColumnArgs = {
	view: DatasetView
	encodings: Partial<Encodings>
	columns: DataTableColumns
	/** The "select" mode's checked variables. */
	selectedColumns?: readonly string[]
	/** Aggregated tables only: computed columns left out, by header. */
	hiddenPlottedColumns?: readonly string[]
	overrides: Record<string, FieldType>
	/** `plottedRows(...)` for the current chart. Aggregated → the table is
	 *  its columns + rows, less `hiddenPlottedColumns` (the "Columns" option
	 *  doesn't apply: an aggregate has no other variables to add). Absent / not aggregated → view rows. */
	plotted?: PlottedData
}

/** The table's columns alone, without building any rows — what the
 *  sidebar's per-column alignment list shows. `buildDataTable` uses the
 *  same function, so the two can't disagree. */
export const dataTableColumns = (args: ColumnArgs): DataTableColumn[] => {
	const { view, encodings, overrides, plotted } = args
	if (plotted?.aggregated)
		return keptPlottedColumns(plotted.columns, args.hiddenPlottedColumns).flatMap((ci) => {
			const c = plotted.columns[ci]
			return c ? [{ name: c.name, type: c.type, numeric: c.type === "quantitative" }] : []
		})
	return dataTableColumnNames(
		view,
		encodings,
		args.columns,
		(name) => effectiveType(view, name, overrides),
		args.selectedColumns
	).map((name) => {
		const type = effectiveType(view, name, overrides)
		return { name, type, numeric: type === "quantitative" }
	})
}

export const buildDataTable = (
	args: ColumnArgs & {
		fieldLevelOrders: Readonly<Record<string, readonly string[]>>
		/** `tooltipFieldFormatsAtom` — the tooltip's inherited formats. */
		formats: TooltipFormats
	}
): DataTableModel => {
	const { view, fieldLevelOrders, formats, plotted } = args
	const hinted = hintedFormats(view)
	const columns = dataTableColumns(args)
	if (plotted?.aggregated) {
		const kept = keptPlottedColumns(plotted.columns, args.hiddenPlottedColumns)
		// Aggregate columns inherit their MEASURE's format; Count / Share
		// fall back to their fixed integer / percent format.
		const specs = plotted.columns.map((c) =>
			c.formatField
				? (formats.get(c.formatField) ?? hinted.get(c.formatField) ?? c.format)
				: c.format
		)
		return {
			columns,
			rows: plotted.rows.map((cells, index): DataTableRow => ({
				index,
				cells: kept.map((ci) => {
					const v = cells[ci] ?? null
					const raw = v === null ? "" : String(v)
					return { raw, text: raw === "" ? "" : formatTooltipValue(v, specs[ci]) }
				}),
			})),
			note: plotted.note,
		}
	}
	const order = orderRows(view.rows, columns, fieldLevelOrders)
	const specs = columns.map((c) => formats.get(c.name) ?? hinted.get(c.name))
	const rows = order.map((i): DataTableRow => {
		const row = view.rows[i] ?? {}
		return {
			index: i,
			cells: columns.map((c, ci) => {
				const raw = row[c.name] ?? ""
				const spec = specs[ci]
				return { raw, text: raw === "" ? "" : formatTooltipValue(raw, spec) }
			}),
		}
	})
	return { columns, rows, note: plotted?.note ?? null }
}

/** The table as CSV: headers + RAW cells (machine-readable, unformatted),
 *  every row regardless of the "Max rows" cut. Quoted by papaparse. */
export const dataTableToCsv = (model: DataTableModel): string =>
	papaUnparse(
		{
			fields: model.columns.map((c) => c.name),
			data: model.rows.map((r) => r.cells.map((cell) => cell.raw)),
		},
		{ newline: "\n" }
	)
