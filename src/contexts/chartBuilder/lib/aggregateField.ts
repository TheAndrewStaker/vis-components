// One field summarized over the rows behind a mark — the rule every slice
// label follows: numeric cells SUM (blanks stay missing — `parseNumericCell`,
// not `Number`, so `""` isn't 0), otherwise the first non-empty value. It is
// the aggregator's own `textValue` rule (`aggregators/stacks.ts`), shared by
// the bar / pie anchor builders for the data-label size field and the
// multi-field label row so every renderer labels a slice the same way.

import { parseNumericCell } from "./scales"

export const aggregateField = (
	rows: readonly Record<string, unknown>[],
	field: string
): number | string | undefined => {
	let sum = 0
	let foundNumeric = false
	let firstNonNumeric: string | undefined
	for (const row of rows) {
		const raw = row[field]
		const n = parseNumericCell(raw)
		if (n !== null) {
			sum += n
			foundNumeric = true
		} else if (
			firstNonNumeric === undefined &&
			raw != null &&
			String(raw).trim() !== ""
		) {
			firstNonNumeric = String(raw)
		}
	}
	return foundNumeric ? sum : firstNonNumeric
}
