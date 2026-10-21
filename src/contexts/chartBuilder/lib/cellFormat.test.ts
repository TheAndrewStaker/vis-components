import { describe, expect, it } from "vitest"
import { conformToFormat, detectColumnFormat } from "./cellFormat"

describe("detectColumnFormat", () => {
	it("reads comma grouping, dollars, accounting negatives and shared decimals", () => {
		expect(detectColumnFormat(["2,123,123", "", "45", "1,000"])).toEqual({
			kind: "number",
			grouped: true,
			dollar: false,
			parenNegative: false,
			decimals: 0,
		})
		expect(detectColumnFormat(["$1,234.56", "$0.50", "($12.00)"])).toEqual({
			kind: "number",
			grouped: true,
			dollar: true,
			parenNegative: true,
			decimals: 2,
		})
		// Decimal places that vary are left to the typist.
		expect(detectColumnFormat(["$5", "$2.50"])?.decimals).toBeNull()
	})

	it("reads percent columns", () => {
		expect(detectColumnFormat(["14%", "2.5%", ""])).toEqual({
			kind: "percent",
			decimals: null,
		})
		expect(detectColumnFormat(["14%", "25%"])).toEqual({ kind: "percent", decimals: 0 })
	})

	it("has nothing to enforce on plain numbers, text or a mixed column", () => {
		expect(detectColumnFormat(["1234", "5", "6.5"])).toBeNull()
		expect(detectColumnFormat(["Lima", "Quito"])).toBeNull()
		expect(detectColumnFormat(["1,234", "n/a"])).toBeNull()
		expect(detectColumnFormat(["1,234", "14%"])).toBeNull()
		expect(detectColumnFormat([])).toBeNull()
	})
})

describe("conformToFormat", () => {
	const grouped = detectColumnFormat(["2,123,123", "45"])
	const dollars = detectColumnFormat(["$1,234.56", "($12.00)"])
	const percent = detectColumnFormat(["14%", "25%"])

	it("adds the commas to a plain number typed into a grouped column", () => {
		expect(conformToFormat("2222", grouped)).toBe("2,222")
		expect(conformToFormat("2222222.5", grouped)).toBe("2,222,222.5")
		expect(conformToFormat("-1234", grouped)).toBe("-1,234")
		expect(conformToFormat("45", grouped)).toBe("45")
		expect(conformToFormat("1,234", grouped)).toBe("1,234")
	})

	it("writes dollars with the column's decimals, more when typed, never fewer", () => {
		expect(conformToFormat("5", dollars)).toBe("$5.00")
		expect(conformToFormat("$2222", dollars)).toBe("$2,222.00")
		expect(conformToFormat("1234.567", dollars)).toBe("$1,234.567")
		expect(conformToFormat("-7", dollars)).toBe("($7.00)")
		expect(conformToFormat("(7)", dollars)).toBe("($7.00)")
	})

	it("writes percents", () => {
		expect(conformToFormat("5", percent)).toBe("5%")
		expect(conformToFormat("5%", percent)).toBe("5%")
		expect(conformToFormat("2.5 %", percent)).toBe("2.5%")
		expect(conformToFormat("1,000", percent)).toBe("1000%")
	})

	it("leaves text, blanks and unformatted columns as typed", () => {
		expect(conformToFormat("n/a", grouped)).toBe("n/a")
		expect(conformToFormat("", grouped)).toBe("")
		expect(conformToFormat("  ", grouped)).toBe("  ")
		expect(conformToFormat("2222", null)).toBe("2222")
		expect(conformToFormat("12,34", grouped)).toBe("12,34")
	})
})
