import { timeFormat } from "d3-time-format"

import { parseValue } from "./scales"

/**
 * What a date column's cells LOOK like — the tick Format's "Literal" on a
 * date axis. Literal means the value straight from the data column: a
 * column of "1947", "1948" … labels its ticks "1949", "1959" (never
 * "1949-01" or "Jan 1949"), a column of "7/15/1988" labels them in that
 * same M/D/YYYY shape. A date axis's ticks are instants the scale lays
 * out, not cells, so the column's text SHAPE is inferred from its cells
 * and every tick prints in it; a tick that lands exactly on a cell prints
 * that cell; only a column whose shape isn't recognised falls back to ISO
 * text at the tick set's granularity.
 */
export type DateColumnText = {
	/** Each cell's text keyed by the instant it parses to; first cell wins. */
	byTime: ReadonlyMap<number, string>
	/** Formatter printing any date in the column's own text shape, or null
	 *  when the cells don't share a recognised shape. */
	format: ((d: Date) => string) | null
}

/** Recognised cell shapes, first match (over EVERY parseable cell) wins. */
const SHAPES: Array<{ test: RegExp; format: (d: Date) => string }> = [
	{ test: /^\d{4}$/, format: timeFormat("%Y") },
	{ test: /^\d{4}-\d{2}$/, format: timeFormat("%Y-%m") },
	{ test: /^\d{4}-\d{2}-\d{2}$/, format: timeFormat("%Y-%m-%d") },
	{ test: /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}$/, format: timeFormat("%Y-%m-%d %H:%M") },
	{ test: /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/, format: timeFormat("%Y-%m-%d %H:%M:%S") },
	{ test: /^\d{4}\/\d{2}$/, format: timeFormat("%Y/%m") },
	{ test: /^\d{4}\/\d{2}\/\d{2}$/, format: timeFormat("%Y/%m/%d") },
	{ test: /^\d{1,2}\/\d{4}$/, format: timeFormat("%-m/%Y") },
	{ test: /^\d{1,2}\/\d{1,2}\/\d{4}$/, format: timeFormat("%-m/%-d/%Y") },
	{ test: /^\d{1,2}\/\d{1,2}\/\d{2}$/, format: timeFormat("%-m/%-d/%y") },
	{ test: /^[A-Za-z]{3} \d{4}$/, format: timeFormat("%b %Y") },
	{ test: /^[A-Za-z]{4,} \d{4}$/, format: timeFormat("%B %Y") },
	{ test: /^[A-Za-z]{3} \d{1,2},? \d{4}$/, format: timeFormat("%b %-d, %Y") },
	{ test: /^[A-Za-z]{4,} \d{1,2},? \d{4}$/, format: timeFormat("%B %-d, %Y") },
	{ test: /^\d{1,2} [A-Za-z]{3} \d{4}$/, format: timeFormat("%-d %b %Y") },
	{ test: /^\d{1,2} [A-Za-z]{4,} \d{4}$/, format: timeFormat("%-d %B %Y") },
]

/** Read a date column's cells: their text by parsed instant, and the one
 *  text shape they all share (null when they don't). Cells that don't
 *  parse as dates are skipped. */
export const dateColumnText = (
	rows: ReadonlyArray<Record<string, unknown>>,
	field: string
): DateColumnText => {
	const byTime = new Map<number, string>()
	const texts: string[] = []
	for (const row of rows) {
		const raw = row[field]
		const d = parseValue(raw, "temporal")
		if (!(d instanceof Date)) continue
		const text = String(raw).trim()
		texts.push(text)
		const ms = d.getTime()
		if (!byTime.has(ms)) byTime.set(ms, text)
	}
	const shape =
		texts.length === 0 ? undefined : SHAPES.find((s) => texts.every((t) => s.test.test(t)))
	return { byTime, format: shape?.format ?? null }
}

/** Literal label text for a date tick: the column's text shape when it
 *  has one, else the cell behind a tick landing exactly on a data value,
 *  else `fallback` (ISO text at the tick set's granularity). */
export const literalTimeLabel = (
	column: DateColumnText | undefined,
	fallback: (d: Date) => string
): ((d: Date) => string) =>
	(d) => column?.format?.(d) ?? column?.byTime.get(d.getTime()) ?? fallback(d)
