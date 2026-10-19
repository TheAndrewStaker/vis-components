import { parseValue } from "./scales"
import type { FieldType } from "./types"

/** How a cell becomes the string that identifies its level.
 *
 *  - `{ type }` — PARSED: `String(parseValue(cell, type))`. This is the
 *    scale / legend convention: ordinal "1.0" and "1" collapse to "1",
 *    quantitative text normalizes, temporal cells become `String(Date)`,
 *    and blank / whitespace-only / unparseable cells drop out (`parseValue`
 *    returns null for them).
 *  - `{ skipBlank }` — RAW: `String(cell)` with `undefined` / `null` dropped.
 *    `skipBlank: true` also drops cells whose string is exactly "" (NOT
 *    trimmed — a whitespace-only cell is kept, unlike parsed mode). Used
 *    where the renderer keys on the raw cell text. */
export type UniqueValuesOptions =
	| { type: FieldType; skipBlank?: never }
	| { type?: never; skipBlank: boolean }

const levelKey = (raw: unknown, options: UniqueValuesOptions): string | null => {
	if (options.type !== undefined) {
		const parsed = parseValue(raw, options.type)
		return parsed === null ? null : String(parsed)
	}
	if (raw === undefined || raw === null) return null
	const s = String(raw)
	return options.skipBlank && s === "" ? null : s
}

/** Distinct level strings of `values`, in FIRST-SEEN order (never sorted —
 *  the per-value color / opacity / shape scales are built in discovery
 *  order, and a user's pinned Fields-panel order is applied by the caller
 *  via `applyLevelOrder` / `orderedLevels`). See `UniqueValuesOptions` for
 *  how a cell is stringified and which cells are skipped. */
export const uniqueValues = (
	values: Iterable<unknown>,
	options: UniqueValuesOptions
): string[] => {
	const seen = new Set<string>()
	const out: string[] = []
	for (const raw of values) {
		const key = levelKey(raw, options)
		if (key === null || seen.has(key)) continue
		seen.add(key)
		out.push(key)
	}
	return out
}

/** `uniqueValues` over one column of `rows`. */
export const uniqueFieldValues = (
	rows: ReadonlyArray<Record<string, unknown>>,
	field: string,
	options: UniqueValuesOptions
): string[] => uniqueValues(rows.map((r) => r[field]), options)
