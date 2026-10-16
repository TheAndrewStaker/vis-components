/** The structured face of an If/else rule's condition: `left`, a comparator,
 * `right`. Storage stays the free-text condition string
 * (`DerivedRule.condition`) so evaluation and field renames are untouched;
 * this module converts between that string and the editor's three boxes.
 *
 * Each side is "a variable or just a value": the box text is used as an
 * expression when it parses (`{A}`, `12`, `{A} / {B}`), and plain text that
 * doesn't parse — `West`, `North East` — is quoted into a string literal so
 * users never type quotes. */

import {
	exprToSource,
	parseExpression,
	quoteStringLiteral,
	type ComparisonOp,
	type Expr,
} from "./derivedExpression"
import type { FieldType } from "./types"

export type ComparisonParts = {
	left: string
	op: ComparisonOp
	right: string
}

/** Dropdown rows for the comparator, in the order Nancy listed them. */
export const COMPARISON_OPTIONS: ReadonlyArray<{
	value: ComparisonOp
	label: string
	title: string
}> = [
	{ value: "==", label: "=", title: "equals" },
	{ value: "!=", label: "≠", title: "does not equal" },
	{ value: ">", label: ">", title: "greater than" },
	{ value: "<", label: "<", title: "less than" },
	{ value: ">=", label: "≥", title: "greater than or equal to" },
	{ value: "<=", label: "≤", title: "less than or equal to" },
]

const isAtom = (e: Expr): boolean =>
	e.kind === "num" || e.kind === "str" || e.kind === "field" || e.kind === "negate"

/** One side's box text → expression source. Parseable text is kept (wrapped
 * in parentheses when it's compound, so the comparator binds last); text
 * that doesn't parse and names no `{variable}` becomes a string literal. */
export const operandSource = (
	text: string
): { ok: true; source: string } | { ok: false; error: string } => {
	const trimmed = text.trim()
	if (trimmed === "") return { ok: false, error: "needs a value" }
	const parsed = parseExpression(trimmed)
	if (parsed.ok)
		return { ok: true, source: isAtom(parsed.expr) ? trimmed : `(${trimmed})` }
	// Braces mean the user meant an expression — surface the parse error
	// instead of silently quoting a typo like "{Sales} /".
	if (trimmed.includes("{")) return { ok: false, error: parsed.error }
	const quoted = quoteStringLiteral(trimmed)
	return quoted === null
		? { ok: false, error: `text can't contain both " and ' quotes` }
		: { ok: true, source: quoted }
}

/** Three boxes → the stored condition string. Both sides blank composes to
 * "" (an untouched scaffold row); one side blank, or a side that can't be
 * read, is an error for the row. */
export const joinComparison = (
	parts: ComparisonParts
): { ok: true; condition: string } | { ok: false; error: string } => {
	const leftBlank = parts.left.trim() === ""
	const rightBlank = parts.right.trim() === ""
	if (leftBlank && rightBlank) return { ok: true, condition: "" }
	if (leftBlank || rightBlank)
		return { ok: false, error: "Both sides of the comparison need a value." }
	const left = operandSource(parts.left)
	if (!left.ok) return { ok: false, error: `Left side: ${left.error}` }
	const right = operandSource(parts.right)
	if (!right.ok) return { ok: false, error: `Right side: ${right.error}` }
	return { ok: true, condition: `${left.source} ${parts.op} ${right.source}` }
}

/** Three boxes → the text a single condition box starts with when a row is
 * switched to "Formula…". Unlike `joinComparison` this never fails: a side
 * that can't be read goes in as typed and a blank side is left out, so a
 * half-filled "{A} >" row becomes "{A} >" for the user to finish. */
export const comparisonText = (parts: ComparisonParts): string => {
	const side = (text: string): string => {
		const trimmed = text.trim()
		if (trimmed === "") return ""
		const source = operandSource(trimmed)
		return source.ok ? source.source : trimmed
	}
	const left = side(parts.left)
	const right = side(parts.right)
	if (left === "" && right === "") return ""
	return `${left} ${parts.op} ${right}`.trim()
}

/** A side's box text for a parsed operand: a plain string literal shows
 * unquoted (the way the user would type it), unless its bare text would
 * read as something else ("5", "{B}") — then the quotes stay so the round
 * trip keeps it a string. The blank literal keeps its quotes too: bare, it
 * would read as an empty box. */
const sideText = (e: Expr): string =>
	e.kind === "str" && e.value.trim() !== "" && !parseExpression(e.value).ok
		? e.value
		: exprToSource(e)

/** Stored condition → three boxes, or `null` when the condition isn't a
 * single comparison (an older free-text rule with AND / OR, or one that
 * doesn't parse) and must stay a text box. A blank condition is a blank
 * row. */
export const splitComparison = (condition: string): ComparisonParts | null => {
	if (condition.trim() === "") return { left: "", op: "==", right: "" }
	const parsed = parseExpression(condition)
	if (!parsed.ok || parsed.expr.kind !== "compare") return null
	return {
		left: sideText(parsed.expr.left),
		op: parsed.expr.op,
		right: sideText(parsed.expr.right),
	}
}

/** A categorical / ordinal variable with more distinct levels than this gets
 * no dropdown — a list of thousands of IDs helps nobody. */
export const MAX_LEVEL_OPTIONS = 200

/** A lookup of a column's distinct levels (trimmed, discovery order —
 * matching the legend and the Fields panel) for the right-side dropdown.
 * Blank is a level too when the column has blank cells (`""`, listed where
 * the legend would skip it): the dropdown offers it as "(blank)". `null`
 * for a column that isn't categorical / ordinal, or holds more than `max`
 * levels. Scanned lazily, once per column: the editor calls this on every
 * keystroke, the data doesn't change under it. */
export const makeLevelLookup = (
	rows: ReadonlyArray<Record<string, string>>,
	typeOf: (fieldName: string) => FieldType,
	max = MAX_LEVEL_OPTIONS
): ((fieldName: string) => string[] | null) => {
	const cache = new Map<string, string[] | null>()
	return (fieldName) => {
		const cached = cache.get(fieldName)
		if (cached !== undefined) return cached
		const type = typeOf(fieldName)
		let levels: string[] | null = null
		if (type === "categorical" || type === "ordinal") {
			const seen = new Set<string>()
			for (const row of rows) {
				seen.add((row[fieldName] ?? "").trim())
				if (seen.size > max) break
			}
			levels = seen.size > max ? null : [...seen]
		}
		cache.set(fieldName, levels)
		return levels
	}
}

/** How the right box spells the blank level: the empty text literal, which
 * `==` / `!=` evaluate as the blank test (see derivedExpression). */
export const BLANK_LEVEL_SOURCE = '""'

/** A level's right-box text — the blank level is written as `""`, every
 * other level as its own text. */
export const levelSource = (level: string): string =>
	level === "" ? BLANK_LEVEL_SOURCE : level

/** A level's dropdown label. */
export const levelLabel = (level: string): string =>
	level === "" ? "(blank)" : level
