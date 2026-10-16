import { describe, expect, it } from "vitest"
import { exprToSource, parseExpression } from "./derivedExpression"
import {
	comparisonText,
	joinComparison,
	levelLabel,
	levelSource,
	makeLevelLookup,
	operandSource,
	splitComparison,
} from "./derivedRuleForm"

const roundTrip = (src: string): string => {
	const parsed = parseExpression(src)
	if (!parsed.ok) throw new Error(parsed.error)
	return exprToSource(parsed.expr)
}

describe("exprToSource", () => {
	it("re-parenthesizes only where the tree needs it", () => {
		expect(roundTrip("({A} - {B}) * 100")).toBe("({A} - {B}) * 100")
		expect(roundTrip("{A} + {B} + {C}")).toBe("{A} + {B} + {C}")
		expect(roundTrip("{A} - ({B} + {C})")).toBe("{A} - ({B} + {C})")
		expect(roundTrip("-({A} + 1)")).toBe("-({A} + 1)")
		expect(roundTrip("-5")).toBe("-5")
	})

	it("keeps logic and comparison structure", () => {
		expect(roundTrip("{B} == 1 and {C} > 3 or {D} < 2")).toBe(
			"{B} == 1 AND {C} > 3 OR {D} < 2"
		)
		expect(roundTrip("({B} == 1 or {C} > 3) and {D} < 2")).toBe(
			"({B} == 1 OR {C} > 3) AND {D} < 2"
		)
	})

	it("quotes strings in whichever style they don't contain", () => {
		expect(roundTrip(`{R} == "it's"`)).toBe(`{R} == "it's"`)
		expect(roundTrip(`{R} == 'say "hi"'`)).toBe(`{R} == 'say "hi"'`)
	})

	it("produces source the parser accepts again", () => {
		for (const src of [
			"({A} - {B}) * 100 >= -3",
			"{A} / ({B} * {C}) != 'x'",
			"1 < {B} OR {B} < 2",
		])
			expect(roundTrip(roundTrip(src))).toBe(roundTrip(src))
	})
})

describe("operandSource", () => {
	it("keeps variables, numbers, and quoted text as typed", () => {
		expect(operandSource("{Sales}")).toEqual({ ok: true, source: "{Sales}" })
		expect(operandSource(" 12.5 ")).toEqual({ ok: true, source: "12.5" })
		expect(operandSource("-3")).toEqual({ ok: true, source: "-3" })
		expect(operandSource(`"West"`)).toEqual({ ok: true, source: `"West"` })
	})

	it("quotes plain text so users never type quotes", () => {
		expect(operandSource("West")).toEqual({ ok: true, source: `"West"` })
		expect(operandSource("North East")).toEqual({
			ok: true,
			source: `"North East"`,
		})
		expect(operandSource("O'Brien")).toEqual({ ok: true, source: `"O'Brien"` })
		expect(operandSource("3 apples")).toEqual({ ok: true, source: `"3 apples"` })
	})

	it("parenthesizes compound expressions so the comparator binds last", () => {
		expect(operandSource("{A} / {B}")).toEqual({
			ok: true,
			source: "({A} / {B})",
		})
	})

	it("reports a parse error when braces are involved", () => {
		const res = operandSource("{Sales} /")
		expect(res.ok).toBe(false)
		expect(operandSource("")).toEqual({ ok: false, error: "needs a value" })
		expect(operandSource(`it's "x"`).ok).toBe(false)
	})
})

describe("joinComparison / splitComparison", () => {
	it("composes the stored condition string", () => {
		expect(joinComparison({ left: "{Region}", op: "==", right: "West" })).toEqual(
			{ ok: true, condition: `{Region} == "West"` }
		)
		expect(
			joinComparison({ left: "{A} / {C}", op: ">=", right: "0.5" })
		).toEqual({ ok: true, condition: "({A} / {C}) >= 0.5" })
	})

	it("treats a fully blank row as scaffolding and a half-filled one as an error", () => {
		expect(joinComparison({ left: "", op: "==", right: "" })).toEqual({
			ok: true,
			condition: "",
		})
		expect(joinComparison({ left: "{A}", op: "==", right: "" })).toEqual({
			ok: false,
			error: "Both sides of the comparison need a value.",
		})
		const bad = joinComparison({ left: "{A} /", op: "==", right: "1" })
		expect(bad.ok).toBe(false)
		if (!bad.ok) expect(bad.error.startsWith("Left side:")).toBe(true)
	})

	it("splits a stored comparison back into the three boxes", () => {
		expect(splitComparison(`{Region} == "West"`)).toEqual({
			left: "{Region}",
			op: "==",
			right: "West",
		})
		expect(splitComparison("({A} / {C}) >= 0.5")).toEqual({
			left: "{A} / {C}",
			op: ">=",
			right: "0.5",
		})
		expect(splitComparison("")).toEqual({ left: "", op: "==", right: "" })
	})

	it("keeps quotes on a string that would otherwise read as something else", () => {
		expect(splitComparison(`{A} == "5"`)?.right).toBe(`"5"`)
		expect(splitComparison(`{A} == "{B}"`)?.right).toBe(`"{B}"`)
		// The blank literal too — bare, it would read as an empty box.
		expect(splitComparison(`{A} == ""`)?.right).toBe(`""`)
		expect(joinComparison({ left: "{A}", op: "!=", right: `""` })).toEqual({
			ok: true,
			condition: `{A} != ""`,
		})
	})

	it("round-trips through the editor's boxes", () => {
		for (const condition of [
			`{Region} == "West"`,
			"{Sales} > 100",
			"(({A} - {B}) * 100) <= -3",
			`{Name} != "O'Brien"`,
			`{Region} == ""`,
		]) {
			const parts = splitComparison(condition)
			expect(parts).not.toBeNull()
			if (parts) expect(joinComparison(parts)).toEqual({ ok: true, condition })
		}
	})

	it("refuses conditions that aren't a single comparison", () => {
		expect(splitComparison("{B} == 1 AND {C} > 3")).toBeNull()
		expect(splitComparison("{B} +")).toBeNull()
	})
})

describe("comparisonText", () => {
	it("composes what the boxes hold; a blank side is left out, an unreadable one kept as typed", () => {
		expect(comparisonText({ left: "{A}", op: "==", right: "West" })).toBe(
			'{A} == "West"'
		)
		expect(comparisonText({ left: "{A}", op: ">", right: "" })).toBe("{A} >")
		expect(comparisonText({ left: "{A} /", op: "==", right: "1" })).toBe(
			"{A} / == 1"
		)
		expect(comparisonText({ left: "", op: "==", right: "" })).toBe("")
	})
})

describe("makeLevelLookup", () => {
	const rows = [
		{ region: " West ", sales: "1" },
		{ region: "East", sales: "2" },
		{ region: "", sales: "3" },
		{ region: "West", sales: "4" },
	]
	const typeOf = (f: string) => (f === "region" ? "categorical" : "quantitative")

	it("lists trimmed distinct levels in discovery order, blank included", () => {
		expect(makeLevelLookup(rows, typeOf)("region")).toEqual(["West", "East", ""])
		expect(makeLevelLookup(rows.slice(0, 2), typeOf)("region")).toEqual([
			"West",
			"East",
		])
	})

	it("spells the blank level as the empty text literal, labelled (blank)", () => {
		expect(levelSource("")).toBe(`""`)
		expect(levelLabel("")).toBe("(blank)")
		expect(levelSource("West")).toBe("West")
		expect(levelLabel("West")).toBe("West")
	})

	it("offers nothing for a numeric column or past the cap", () => {
		expect(makeLevelLookup(rows, typeOf)("sales")).toBeNull()
		expect(makeLevelLookup(rows, typeOf, 1)("region")).toBeNull()
	})
})
