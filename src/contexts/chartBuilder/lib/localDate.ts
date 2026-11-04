/**
 * Date strings ↔ epoch ms, in LOCAL time — for data cells and for the
 * sidebar's typed / picked dates (Scale range min + max, Custom breaks)
 * alike. `new Date("1949-01-01")` parses a bare ISO date as UTC
 * midnight, which in the Americas is the evening before on the local
 * clock `scaleTime` lays ticks and labels on — so a pinned "01/01/1949"
 * started the axis at "06 PM", the day displayed back could be off by
 * one, and a column of "2010" … "2021" cells sat hours before each New
 * Year: `nice()` floored the axis a whole empty year early on the left
 * while the last point touched the right edge (user-reported November
 * 2026 as "ordinal shifts the points"). The ISO date-only shapes — a
 * bare year, year-month, or year-month-day — are read and written as
 * local midnight instead; anything with a time part, and every other
 * shape (slash dates, month names), falls through to `Date` parsing,
 * which already reads those as local.
 */

/** Local midnight on a calendar day. NOT `new Date(y, m, d)`: that
 *  constructor maps years 0–99 onto 1900–1999, and a native date input
 *  reports "0002-01-01" while the year is being typed digit by digit —
 *  which would snap the controlled value to 1902 and eat the keystroke. */
export const localMidnight = (y: number, monthIndex: number, d: number): Date => {
	const date = new Date(0)
	date.setFullYear(y, monthIndex, d)
	date.setHours(0, 0, 0, 0)
	return date
}

const DATE_ONLY = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/

/** "YYYY-MM-DD", "YYYY-MM" or "YYYY" → epoch ms at local midnight of the
 *  first day; other strings → `Date` parsing; unparseable → NaN. */
export const parseLocalDate = (raw: string): number => {
	const m = DATE_ONLY.exec(raw.trim())
	if (!m) return new Date(raw).getTime()
	const [, y, mo = "01", d = "01"] = m
	const date = localMidnight(Number(y), Number(mo) - 1, Number(d))
	// Reject rolled-over inputs like 2024-02-31 rather than silently
	// landing on March 2.
	return date.getMonth() === Number(mo) - 1 && date.getDate() === Number(d)
		? date.getTime()
		: Number.NaN
}

/** Epoch ms → "YYYY-MM-DD" on the local calendar (the value a
 *  `type="date"` input takes). */
export const formatLocalDate = (ms: number): string => {
	const d = new Date(ms)
	const pad = (n: number) => String(n).padStart(2, "0")
	return `${String(d.getFullYear()).padStart(4, "0")}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
