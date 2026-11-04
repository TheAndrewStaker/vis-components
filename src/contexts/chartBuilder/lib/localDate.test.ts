import { describe, expect, it } from "vitest"

import { formatLocalDate, parseLocalDate } from "./localDate"

describe("parseLocalDate / formatLocalDate", () => {
	it("reads a date-only string as LOCAL midnight, not UTC", () => {
		expect(parseLocalDate("1949-01-01")).toBe(new Date(1949, 0, 1).getTime())
		expect(parseLocalDate(" 2024-07-01 ")).toBe(new Date(2024, 6, 1).getTime())
	})

	it("reads a bare year or year-month as local midnight of its first day", () => {
		// Data cells: a Year column read as temporal, or monthly "2024-07".
		expect(parseLocalDate("2010")).toBe(new Date(2010, 0, 1).getTime())
		expect(parseLocalDate("2024-07")).toBe(new Date(2024, 6, 1).getTime())
		expect(parseLocalDate("2024-13")).toBeNaN()
	})

	it("leaves non-ISO shapes to Date parsing, which already reads them as local", () => {
		expect(parseLocalDate("Mar 2024")).toBe(new Date("Mar 2024").getTime())
		expect(parseLocalDate("3/1/2024")).toBe(new Date(2024, 2, 1).getTime())
	})

	it("round-trips through the date input's value", () => {
		expect(formatLocalDate(parseLocalDate("1949-01-01"))).toBe("1949-01-01")
		expect(formatLocalDate(new Date(2019, 11, 31, 23, 59).getTime())).toBe("2019-12-31")
	})

	it("rejects impossible calendar dates instead of rolling them over", () => {
		expect(parseLocalDate("2024-02-31")).toBeNaN()
		expect(parseLocalDate("nonsense")).toBeNaN()
		expect(parseLocalDate("")).toBeNaN()
	})

	it("passes strings with a time part through to Date parsing", () => {
		expect(parseLocalDate("2024-07-01T12:30")).toBe(new Date("2024-07-01T12:30").getTime())
	})
})

describe("localMidnight / short years", () => {
	it("keeps a two-digit year as typed (native date inputs report 0002 mid-typing)", () => {
		expect(formatLocalDate(parseLocalDate("0002-01-01"))).toBe("0002-01-01")
		expect(formatLocalDate(parseLocalDate("0020-01-01"))).toBe("0020-01-01")
		expect(new Date(parseLocalDate("0002-01-01")).getFullYear()).toBe(2)
	})
})
