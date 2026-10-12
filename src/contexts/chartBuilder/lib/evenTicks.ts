/**
 * Evenly spaced tick positions for a continuous axis whose BOTH bounds the
 * user pinned (Scale range min + max). d3's `scale.ticks(n)` treats `n` as
 * a density hint and snaps to "nice" 1/2/5 steps, so a pinned 0.04–0.24
 * axis asked for 6 ticks yields 0.05, 0.10, 0.15, 0.20 — neither the count
 * nor the ends the user typed. When the ends are deliberate, the honest
 * layout is `count` ticks from min to max inclusive, both ends included.
 *
 * Values are rounded to 12 significant digits so `0.04 + 2 × 0.04` reads
 * `0.12`, not `0.12000000000000001`. Temporal callers pass epoch ms and
 * wrap the result back into Dates.
 */
import { localMidnight } from "./localDate"

export const evenlySpacedTicks = (
	lo: number,
	hi: number,
	count: number
): number[] => {
	if (!Number.isFinite(lo) || !Number.isFinite(hi)) return []
	const n = Math.floor(count)
	if (n <= 0) return []
	if (n === 1 || lo === hi) return [lo]
	const step = (hi - lo) / (n - 1)
	const out: number[] = []
	for (let i = 0; i < n; i++) {
		// Land the last tick exactly on `hi` rather than on `lo + (n-1)·step`,
		// which can drift a hair off after float accumulation.
		const v = i === n - 1 ? hi : lo + i * step
		out.push(Number(v.toPrecision(12)))
	}
	return out
}

const MS_SECOND = 1000
const MS_MINUTE = 60 * MS_SECOND
const MS_HOUR = 60 * MS_MINUTE
const MS_DAY = 24 * MS_HOUR

type CalendarUnit = "year" | "month" | "day" | "hour" | "minute" | "second" | "ms"

/** The calendar unit a tick step "reads as": a step of ten years snaps to
 *  year starts, a step of six weeks to month starts, and so on. The
 *  thresholds sit a little under each unit so a step that falls short
 *  through leap days / month lengths still snaps to the unit it means. */
const unitForStep = (stepMs: number): CalendarUnit => {
	const step = Math.abs(stepMs)
	if (step >= 300 * MS_DAY) return "year"
	if (step >= 25 * MS_DAY) return "month"
	if (step >= 20 * MS_HOUR) return "day"
	if (step >= 50 * MS_MINUTE) return "hour"
	if (step >= 50 * MS_SECOND) return "minute"
	if (step >= 500) return "second"
	return "ms"
}

/** Same calendar day as `d`, at the given local clock time. */
const atTime = (d: Date, h: number, mi: number, s: number): Date => {
	const out = localMidnight(d.getFullYear(), d.getMonth(), d.getDate())
	out.setHours(h, mi, s, 0)
	return out
}

/** Start of the unit containing `d`, in LOCAL time — the same clock
 *  d3's `scaleTime` lays its own ticks and labels on. */
const floorToUnit = (ms: number, unit: CalendarUnit): Date => {
	const d = new Date(ms)
	switch (unit) {
		case "year":
			return localMidnight(d.getFullYear(), 0, 1)
		case "month":
			return localMidnight(d.getFullYear(), d.getMonth(), 1)
		case "day":
			return localMidnight(d.getFullYear(), d.getMonth(), d.getDate())
		case "hour":
			return atTime(d, d.getHours(), 0, 0)
		case "minute":
			return atTime(d, d.getHours(), d.getMinutes(), 0)
		case "second":
			return atTime(d, d.getHours(), d.getMinutes(), d.getSeconds())
		case "ms":
			return new Date(Math.round(ms))
	}
}

/** The unit boundary right after `floor`. */
const nextUnitStart = (floor: Date, unit: CalendarUnit): Date => {
	const d = new Date(floor.getTime())
	switch (unit) {
		case "year":
			d.setFullYear(d.getFullYear() + 1)
			return d
		case "month":
			d.setMonth(d.getMonth() + 1)
			return d
		case "day":
			d.setDate(d.getDate() + 1)
			return d
		case "hour":
			return new Date(d.getTime() + MS_HOUR)
		case "minute":
			return new Date(d.getTime() + MS_MINUTE)
		case "second":
			return new Date(d.getTime() + MS_SECOND)
		case "ms":
			return new Date(d.getTime() + 1)
	}
}

/** Nearest `unit` boundary to `ms` (local time). */
const roundToUnit = (ms: number, unit: CalendarUnit): number => {
	const lo = floorToUnit(ms, unit)
	const hi = nextUnitStart(lo, unit)
	return ms - lo.getTime() < hi.getTime() - ms ? lo.getTime() : hi.getTime()
}

/** `d` moved by `k` whole units (local calendar arithmetic). */
const addUnits = (ms: number, unit: CalendarUnit, k: number): number => {
	const d = new Date(ms)
	switch (unit) {
		case "year":
			d.setFullYear(d.getFullYear() + k)
			return d.getTime()
		case "month":
			d.setMonth(d.getMonth() + k)
			return d.getTime()
		case "day":
			d.setDate(d.getDate() + k)
			return d.getTime()
		case "hour":
			return ms + k * MS_HOUR
		case "minute":
			return ms + k * MS_MINUTE
		case "second":
			return ms + k * MS_SECOND
		case "ms":
			return ms + k
	}
}

/** Whole `unit`s from `lo` to `hi` (floor). */
const unitsBetween = (lo: number, hi: number, unit: CalendarUnit): number => {
	let n = 0
	let cursor = lo
	// Bounded walk: a pinned axis never spans more than a few thousand of
	// its own tick unit before the step would have read as a coarser one.
	while (n < 100_000) {
		const next = addUnits(cursor, unit, 1)
		if (next > hi) break
		cursor = next
		n++
	}
	return n
}

/**
 * Temporal counterpart of `evenlySpacedTicks` for a pinned date axis.
 * Spreading `count` ticks evenly in raw milliseconds lands them hours off
 * the calendar — 1949→2019 in 8 steps by ten years each, except leap days
 * make the step 3652.43 days, so the ticks fall at odd times of day and
 * d3's multi-scale formatter labels them "05 PM" / ".571" instead of
 * "1959". Here the ticks step by a WHOLE number of the calendar unit the
 * even step reads as (years for a ten-year step, months for a six-week
 * one, …), from the first boundary at or after min, in local time like
 * `scaleTime`'s own ticks: 1950→2019 asked for 8 reads 1950, 1960 … 2010,
 * 2019 — never 1980, 1989, 1999 from rounding a 9.86-year step tick by
 * tick.
 *
 * The two ends are always ticked. An end snaps onto a boundary within a
 * hair of it (0.1% of the span — a bound saved at UTC midnight sits a few
 * hours off the local boundary, and the tick then draws at most a
 * sub-pixel past the plot edge); otherwise — a deliberate mid-year pin —
 * it keeps its exact value. Coincident ticks draw once, so the result can
 * hold one more or one fewer tick than `count`: regular calendar spacing
 * beats an exact count on a date axis.
 */
export const evenlySpacedTimeTicks = (
	lo: number,
	hi: number,
	count: number
): number[] => {
	const even = evenlySpacedTicks(lo, hi, count)
	if (even.length <= 1) return even
	const min = Math.min(lo, hi)
	const max = Math.max(lo, hi)
	const unit = unitForStep((max - min) / (even.length - 1))
	const slack = (max - min) * 0.001
	// Ends: snap when a boundary is within a hair, else keep the exact pin.
	const snapEnd = (v: number): number => {
		const snapped = roundToUnit(v, unit)
		return Math.abs(snapped - v) <= slack ? snapped : v
	}
	const first = snapEnd(min)
	const last = snapEnd(max)
	// Interior ticks: whole-unit steps from the first boundary at or after
	// the start, the step chosen so about `count` ticks span the axis.
	const start = roundToUnit(min, unit) >= min ? roundToUnit(min, unit) : addUnits(floorToUnit(min, unit).getTime(), unit, 1)
	const span = unitsBetween(start, max, unit)
	const step = Math.max(1, Math.round(span / (even.length - 1)))
	const out: number[] = [first]
	const push = (v: number) => {
		if (v > min && v < max && !out.includes(v)) out.push(v)
	}
	for (let v = start, i = 0; v < max && i < 100_000; v = addUnits(v, unit, step), i++) push(v)
	if (!out.includes(last)) out.push(last)
	return out.sort((a, b) => a - b)
}
