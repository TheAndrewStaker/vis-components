import { describe, expect, it } from "vitest"

import { formatLocalDate, parseLocalDate } from "./localDate"

describe("parseLocalDate / formatLocalDate", () => {
	it("reads a date-only string as LOCAL midnight, not UTC", () => {
		expect(parseLocalDate("1949-01-01")).toBe(new Date(1949, 0, 1).getTime())
		expect(parseLocalDate(" 2024-07-01 ")).toBe(new Date(2024, 6, 1).getTime())
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
