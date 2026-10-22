// The bar-only derived label value: a slice's BAR TOTAL — the sum of the
// layers in its physical bar. Offered under Data Labels → Value, and in the
// "Multiple variables…" checklist, wherever the "Stack" scope is (bars
// layered by a stack- / overlay-mode channel), as the bars' counterpart of
// the flow diagrams' Node total (`lib/flowNodeLabels.ts`): the same string
// is the dropdown entry, the `{Bar total}` token and the key in the
// per-variable format / style maps. A data set column of that name wins —
// the derived value isn't offered — so a mapped name never means two things.
//
// A "bar" is one leaf sub-band (group-mode channels split the category band
// into sub-bands) on one sign side: a mirrored or diverging bar's two sides
// are separate stacks, as the data-label "stack" scope treats them. Every
// layer carries its bar's total, so `{value} of {Bar total}` composes on
// each slice; the panel seeds a fresh Bar total label to the LAST layer of
// each stack, outside its end — where a total reads as the bar's.

import { parseNumericCell } from "./scales"

export const BAR_TOTAL_FIELD = "Bar total"

/** The derived name offered beside the data set's variables, or null when
 *  a column already carries it. */
export const barTotalFieldName = (
	datasetFieldNames: readonly string[]
): string | null =>
	datasetFieldNames.includes(BAR_TOTAL_FIELD) ? null : BAR_TOTAL_FIELD

/** Unit separator — can't collide with a data value. */
const SEP = String.fromCharCode(0x1f)

/** The ledger a slice totals into: its leaf sub-band and its sign side. */
export const barLedgerKey = (leafIndex: number, value: number): string =>
	`${leafIndex}${SEP}${value < 0 ? "-" : "+"}`

/** The bar totals of one category band: the slice values summed per
 *  ledger (`barLedgerKey`). */
export const barTotalsByLedger = (
	slices: ReadonlyArray<{ leafIndex: number; value: number }>
): Map<string, number> => {
	const totals = new Map<string, number>()
	for (const s of slices) {
		const k = barLedgerKey(s.leafIndex, s.value)
		totals.set(k, (totals.get(k) ?? 0) + s.value)
	}
	return totals
}

/** Rows extended with their bar's total under `totalField`, for the code
 *  that composes labels from ROWS (the solver's margin reserve). A row's
 *  bar is the tuple of `keyFields` — the category, the facet fields, the
 *  group-mode channels' fields — plus its sign side; its contribution is
 *  its `lengthField` cell (one per row when null — a count), and a row
 *  with no numeric contribution (a blank cell) gets no total, as its slice
 *  gets no label. Mirrors the renderer's sum per leaf and sign over raw
 *  rows instead of slices. A mirrored axis negates one direction at render
 *  time; here both directions sum into one total — a wider string, never a
 *  narrower one, so a reserve built on it stays safe. The input rows are
 *  left untouched. */
export const withBarTotals = (
	rows: ReadonlyArray<Record<string, unknown>>,
	totalField: string,
	opts: { keyFields: readonly string[]; lengthField: string | null }
): Record<string, unknown>[] => {
	const contributionOf = (row: Record<string, unknown>): number | null =>
		opts.lengthField === null ? 1 : parseNumericCell(row[opts.lengthField])
	const keyOf = (row: Record<string, unknown>, contribution: number): string =>
		[
			...opts.keyFields.map((f) => String(row[f] ?? "")),
			contribution < 0 ? "-" : "+",
		].join(SEP)
	const contributions = rows.map(contributionOf)
	const totals = new Map<string, number>()
	rows.forEach((row, i) => {
		const c = contributions[i]
		if (c === null || c === undefined) return
		const k = keyOf(row, c)
		totals.set(k, (totals.get(k) ?? 0) + c)
	})
	return rows.map((row, i) => {
		const c = contributions[i]
		return c === null || c === undefined
			? { ...row }
			: { ...row, [totalField]: totals.get(keyOf(row, c)) }
	})
}
