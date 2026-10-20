import type { TextColorRule } from "./channelConfig"

type Op = ">" | "<" | ">=" | "<=" | "==" | "!="

/** Pick out the first comparison operator that begins the trimmed condition.
 *  Longer operators (`>=`, `<=`, `==`, `!=`) take precedence over their
 *  single-character prefixes so `>=` doesn't parse as `>`. */
const matchOp = (s: string): { op: Op; rest: string } | null => {
	const two = s.slice(0, 2)
	if (two === ">=" || two === "<=" || two === "==" || two === "!=") {
		return { op: two as Op, rest: s.slice(2) }
	}
	const one = s[0]
	if (one === ">" || one === "<") {
		return { op: one as Op, rest: s.slice(1) }
	}
	return null
}

/** Strip a single pair of matching surrounding quotes, so `=="A"` and `==A`
 *  both compare against the bare value `A`. */
const unquote = (s: string): string => {
	if (s.length >= 2) {
		const first = s[0]
		const last = s[s.length - 1]
		if ((first === '"' || first === "'") && first === last)
			return s.slice(1, -1)
	}
	return s
}

/** Parse a freeform condition string into an `(op, operand)` pair. The operand
 *  keeps both a numeric reading (`num`, `null` when non-numeric) and the raw
 *  string form (`text`, with surrounding quotes stripped) so callers can do
 *  either a numeric comparison or a categorical string match. Returns `null`
 *  when the input doesn't match — unparseable rules just don't fire.
 *
 *  A condition may open with a `{Variable}` token (`{Region} == West`,
 *  `{Profit} < 0`) — the same single-brace field reference as the label
 *  templates and derived variables — and then tests THAT variable's value in
 *  the mark's rows instead of the implicit labeled / outline value. `field`
 *  is the referenced name, absent for the implicit form.
 *
 *  Examples: `">0"` → {op:">", num:0}, `=="A"` → {op:"==", num:null, text:"A"},
 *  `"{Region} == West"` → {field:"Region", op:"==", num:null, text:"West"}. */
export const parseRule = (
	condition: string
): { field?: string; op: Op; num: number | null; text: string } | null => {
	let trimmed = condition.trim()
	if (trimmed === "") return null
	let field: string | undefined
	if (trimmed.startsWith("{")) {
		const end = trimmed.indexOf("}")
		if (end === -1) return null
		field = trimmed.slice(1, end)
		if (field.trim() === "") return null
		trimmed = trimmed.slice(end + 1).trim()
	}
	const m = matchOp(trimmed)
	if (!m) return null
	const rest = m.rest.trim()
	// Reject "> " on its own — an unfinished rule should never silently match.
	if (rest === "") return null
	const text = unquote(rest)
	const num = Number(text)
	const parsed = { op: m.op, num: Number.isFinite(num) ? num : null, text }
	return field === undefined ? parsed : { field, ...parsed }
}

type ParsedRule = NonNullable<ReturnType<typeof parseRule>>

/** One value against one parsed comparison. Ordering operators (`>`, `<`,
 *  `>=`, `<=`) are numeric-only. Equality operators (`==`, `!=`) compare
 *  numerically when both sides are numbers, and otherwise fall back to a
 *  categorical string match — so `=="A"` fires for a categorical value `A`.
 *  Nullish / empty values (e.g. heatmap blank cells) never pass, even `!=`. */
const valuePasses = (value: unknown, rule: ParsedRule): boolean => {
	let text: string
	let num: number | null
	if (typeof value === "number") {
		num = Number.isFinite(value) ? value : null
		text = String(value)
	} else if (typeof value === "string" && value.trim() !== "") {
		text = value.trim()
		const parsed = Number(text)
		num = Number.isFinite(parsed) ? parsed : null
	} else {
		return false
	}
	const { op } = rule
	if (op === "==" || op === "!=") {
		// Numeric equality when both sides read as numbers; else string match.
		const equal =
			num !== null && rule.num !== null ? num === rule.num : text === rule.text
		return op === "==" ? equal : !equal
	}
	// Ordering comparisons are numeric-only.
	if (num === null || rule.num === null) return false
	return op === ">"
		? num > rule.num
		: op === "<"
			? num < rule.num
			: op === ">="
				? num >= rule.num
				: num <= rule.num
}

/** The dataset rows behind one mark, for `{Variable}` rules: one row for a
 *  point / map shape / unaggregated label, every aggregated row for a bar
 *  slice, an area layer, a pie wedge. `undefined` / empty = the caller has no
 *  rows (a legend swatch), so `{Variable}` rules never fire there. */
export type RuleRows = readonly Record<string, unknown>[] | undefined

/** Walk `rules` top-to-bottom; first one whose comparison passes wins. An
 *  implicit rule (`> 0`) compares against `value`; a `{Variable}` rule
 *  compares against that variable in `rows` and passes only when EVERY row
 *  does — so `{Region} == West` colors a bar only when the whole bar is West
 *  rows, never by guessing from one of them. Generic over the rule's payload
 *  — text-color rules carry a color, position rules carry X/Y offsets — so
 *  every conditional-rule feature matches identically. */
export const firstMatchingRule = <T extends { condition: string }>(
	rules: readonly T[] | undefined,
	value: unknown,
	rows?: RuleRows
): T | null => {
	if (!rules || rules.length === 0) return null
	for (const rule of rules) {
		const parsed = parseRule(rule.condition)
		if (!parsed) continue
		const { field } = parsed
		const passes =
			field === undefined
				? valuePasses(value, parsed)
				: rows !== undefined &&
					rows.length > 0 &&
					rows.every((r) => valuePasses(r[field], parsed))
		if (passes) return rule
	}
	return null
}

/** First matching rule's color, or `null` when nothing matches — the
 *  text-color-specific face of `firstMatchingRule`. */
export const resolveRuleColor = (
	rules: readonly TextColorRule[] | undefined,
	value: unknown,
	rows?: RuleRows
): string | null => firstMatchingRule(rules, value, rows)?.color ?? null
