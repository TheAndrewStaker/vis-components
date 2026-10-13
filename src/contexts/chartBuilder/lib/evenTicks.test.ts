import { describe, expect, it } from "vitest"

import { evenlySpacedTicks, evenlySpacedTimeTicks } from "./evenTicks"

describe("evenlySpacedTicks", () => {
	it("returns exactly `count` ticks from min to max inclusive", () => {
		// The user-reported case: pinned 0.04–0.24, Count 6 → 0.04 steps.
		expect(evenlySpacedTicks(0.04, 0.24, 6)).toEqual([
			0.04, 0.08, 0.12, 0.16, 0.2, 0.24,
		])
	})

	it("strips float accumulation noise from interior ticks", () => {
		for (const v of evenlySpacedTicks(0.04, 0.24, 6)) {
			expect(String(v).length).toBeLessThanOrEqual(4)
		}
		expect(evenlySpacedTicks(0, 1, 4)).toEqual([0, 0.333333333333, 0.666666666667, 1])
	})

	it("handles descending bounds without reordering (caller owns direction)", () => {
		expect(evenlySpacedTicks(10, 0, 3)).toEqual([10, 5, 0])
	})

	it("degenerate counts: 0 → none, 1 → just min", () => {
		expect(evenlySpacedTicks(0, 100, 0)).toEqual([])
		expect(evenlySpacedTicks(0, 100, 1)).toEqual([0])
		expect(evenlySpacedTicks(5, 5, 4)).toEqual([5])
	})

	it("rejects non-finite bounds", () => {
		expect(evenlySpacedTicks(Number.NaN, 1, 3)).toEqual([])
	})
})

describe("evenlySpacedTimeTicks", () => {
	const local = (y: number, m = 0, d = 1, h = 0) => new Date(y, m, d, h).getTime()
	const years = (ms: number[]) => ms.map((v) => new Date(v).getFullYear())

	it("snaps a decade step to year starts (leap days would land hours off)", () => {
		// The user-reported case: 1949-01-01 → 2019-01-01, Count 8.
		const out = evenlySpacedTimeTicks(local(1949), local(2019), 8)
		expect(years(out)).toEqual([1949, 1959, 1969, 1979, 1989, 1999, 2009, 2019])
		for (const v of out) {
			const d = new Date(v)
			expect([d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([0, 1, 0, 0])
		}
	})

	it("snaps a ~six-week step to month starts and de-dups coincident ticks", () => {
		const out = evenlySpacedTimeTicks(local(2024, 0), local(2024, 6), 5)
		for (const v of out) {
			const d = new Date(v)
			expect([d.getDate(), d.getHours()]).toEqual([1, 0])
		}
		expect(new Set(out).size).toBe(out.length)
		expect(out[0]).toBe(local(2024, 0))
		expect(out[out.length - 1]).toBe(local(2024, 6))
	})

	it("snaps a daily step to local midnight", () => {
		const out = evenlySpacedTimeTicks(local(2024, 2, 1), local(2024, 2, 8), 8)
		expect(out).toHaveLength(8)
		for (const v of out) expect(new Date(v).getHours()).toBe(0)
	})

	it("snaps an end sitting hours off a boundary onto it, even just past the axis", () => {
		// Bounds saved at UTC midnight read as the previous evening on a US
		// clock. The min's boundary lies inside the axis …
		const lo = local(1948, 11, 31, 18)
		const hi = local(2018, 11, 31, 18)
		const out = evenlySpacedTimeTicks(lo, hi, 8)
		expect(out[0]).toBe(local(1949))
		// … and the max's six hours past it; both still read as years.
		expect(out[out.length - 1]).toBe(local(2019))
		expect(years(out)).toEqual([1949, 1959, 1969, 1979, 1989, 1999, 2009, 2019])
	})

	it("keeps a deliberately mid-year pinned end at its own value", () => {
		const hi = local(2018, 6, 1)
		const out = evenlySpacedTimeTicks(local(1949), hi, 8)
		expect(out[out.length - 1]).toBe(hi)
		expect(out[0]).toBe(local(1949))
	})

	it("steps by whole calendar units, so a 69-year span never rounds tick by tick", () => {
		// 1950 → 2019 asked for 8: a 9.86-year step rounded per tick gave
		// 1950, 1960, 1970, 1980, 1989, 1999, 2009, 2019.
		const out = evenlySpacedTimeTicks(local(1950), local(2019), 8)
		expect(years(out)).toEqual([1950, 1960, 1970, 1980, 1990, 2000, 2010, 2019])
	})

	it("a legacy UTC-midnight max still yields whole decades plus the end", () => {
		const out = evenlySpacedTimeTicks(local(1950), local(2018, 11, 31, 18), 8)
		expect(years(out)).toEqual([1950, 1960, 1970, 1980, 1990, 2000, 2010, 2019])
	})

	it("drops an interior tick that would crowd the end tick", () => {
		// 1950 → 2019 asked for 5: 17-year steps land on 2018, a year short
		// of the end — the end tick alone marks that stretch.
		expect(years(evenlySpacedTimeTicks(local(1950), local(2019), 5))).toEqual([
			1950, 1967, 1984, 2001, 2019,
		])
	})

	it("degenerate counts pass through", () => {
		expect(evenlySpacedTimeTicks(local(2000), local(2010), 0)).toEqual([])
		expect(evenlySpacedTimeTicks(local(2000), local(2010), 1)).toEqual([local(2000)])
	})
})
