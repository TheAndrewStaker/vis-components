import { describe, expect, it } from "vitest"

import {
	literalDateText,
	timeGranularityOf,
	uniformTimeFormat,
	uniformTimeLiteral,
} from "./timeTickFormat"

const d = (y: number, m = 0, day = 1, h = 0, mi = 0, s = 0, ms = 0) =>
	new Date(y, m, day, h, mi, s, ms)

describe("uniformTimeFormat", () => {
	it("labels a set of year starts as bare years", () => {
		const ticks = [d(1949), d(1959), d(2019)]
		expect(timeGranularityOf(ticks)).toBe("year")
		expect(ticks.map(uniformTimeFormat(ticks))).toEqual(["1949", "1959", "2019"])
	})

	it("uses ONE format for the whole set once any tick is finer", () => {
		// d3's multi-scale formatter would print "1988", "Apr", "Jul", "Oct".
		const ticks = [d(1988), d(1988, 3), d(1988, 6), d(1988, 9)]
		expect(ticks.map(uniformTimeFormat(ticks))).toEqual([
			"Jan 1988", "Apr 1988", "Jul 1988", "Oct 1988",
		])
	})

	it("steps through day / minute / second / millisecond formats", () => {
		expect(uniformTimeFormat([d(2024, 2, 1), d(2024, 2, 5)])(d(2024, 2, 5))).toBe("Mar 5, 2024")
		expect(uniformTimeFormat([d(2024, 2, 5, 9), d(2024, 2, 5, 13, 30)])(d(2024, 2, 5, 9))).toBe(
			"Mar 5, 2024 09:00"
		)
		expect(uniformTimeFormat([d(2024, 2, 5, 9, 0, 15)])(d(2024, 2, 5, 9, 0, 15))).toBe(
			"Mar 5, 2024 09:00:15"
		)
		expect(uniformTimeFormat([d(2024, 2, 5, 9, 0, 0, 250)])(d(2024, 2, 5, 9, 0, 0, 250))).toBe(
			"Mar 5, 2024 09:00:00.250"
		)
	})

	it("an empty tick set formats as years", () => {
		expect(uniformTimeFormat([])(d(2000))).toBe("2000")
	})
})

describe("uniformTimeLiteral / literalDateText", () => {
	it("prints ISO text at the tick set's granularity", () => {
		const years = [d(1949), d(2019)]
		expect(years.map(uniformTimeLiteral(years))).toEqual(["1949", "2019"])
		const months = [d(1988), d(1988, 6)]
		expect(months.map(uniformTimeLiteral(months))).toEqual(["1988-01", "1988-07"])
		const days = [d(2024, 2, 1), d(2024, 2, 15)]
		expect(days.map(uniformTimeLiteral(days))).toEqual(["2024-03-01", "2024-03-15"])
	})

	it("a lone date prints at its own granularity", () => {
		expect(literalDateText(d(1988))).toBe("1988")
		expect(literalDateText(d(1988, 6))).toBe("1988-07")
		expect(literalDateText(d(1988, 6, 15, 9, 30))).toBe("1988-07-15 09:30")
	})
})
