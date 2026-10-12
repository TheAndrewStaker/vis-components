import { describe, expect, it } from "vitest"

import { dateColumnText, literalTimeLabel } from "./rawTextByTime"
import { parseValue } from "./scales"

const rowsOf = (cells: string[]) => cells.map((d) => ({ d }))

describe("dateColumnText / literalTimeLabel", () => {
	it("a year-only column prints every tick as a bare year — even ticks between cells", () => {
		// The user-reported case: "Year" cells like 1947, pinned 1949–2019.
		// Cells parse as UTC midnight while ticks sit at LOCAL year starts,
		// so an exact-instant lookup never hits; the column's SHAPE does.
		const col = dateColumnText(rowsOf(["1947", "1948", "1949"]), "d")
		const label = literalTimeLabel(col, () => "fallback")
		expect(label(new Date(1949, 0, 1))).toBe("1949")
		expect(label(new Date(2019, 1, 1))).toBe("2019")
	})

	it("recognises common shapes and prints ticks in the same shape", () => {
		const cases: Array<[string[], Date, string]> = [
			[["2024-01", "2024-02"], new Date(2024, 6, 1), "2024-07"],
			[["2024-01-15"], new Date(2024, 6, 1), "2024-07-01"],
			[["7/15/1988", "8/1/1988"], new Date(1988, 0, 5), "1/5/1988"],
			[["Jan 2024"], new Date(2024, 6, 1), "Jul 2024"],
			[["January 2024"], new Date(2024, 6, 1), "July 2024"],
			[["Mar 5, 2024"], new Date(2024, 6, 1), "Jul 1, 2024"],
		]
		for (const [cells, tick, expected] of cases) {
			expect(literalTimeLabel(dateColumnText(rowsOf(cells), "d"), () => "?")(tick)).toBe(expected)
		}
	})

	it("mixed shapes have no column format; a tick on a cell prints that cell", () => {
		const cells = ["7/15/1988", "1989"]
		const col = dateColumnText(rowsOf(cells), "d")
		expect(col.format).toBeNull()
		const label = literalTimeLabel(col, (d) => `iso:${d.getFullYear()}`)
		expect(label(new Date("7/15/1988"))).toBe("7/15/1988")
		expect(label(new Date(1990, 0, 1))).toBe("iso:1990")
	})

	it("keys cells by the SAME parse the scale uses, trimmed, first cell wins", () => {
		const col = dateColumnText(rowsOf(["1949", " 1969 ", "1949", "not a date"]), "d")
		expect(col.byTime.get(new Date("1949").getTime())).toBe("1949")
		const padded = parseValue(" 1969 ", "temporal") as Date
		expect(col.byTime.get(padded.getTime())).toBe("1969")
		expect(col.byTime.size).toBe(2)
	})

	it("no column at all falls back", () => {
		expect(literalTimeLabel(undefined, () => "fallback")(new Date())).toBe("fallback")
	})
})
