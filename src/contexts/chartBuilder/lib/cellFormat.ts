/** The way a column WRITES its numbers — "2,123,123", "$1,234.56",
 *  "(1,234)", "14%" — read off its imported cells, and applied to what the
 *  user types into the Edit dialog's grid so a "2222" typed into a
 *  comma-grouped column lands as "2,222" rather than as the one odd cell
 *  out. Text that isn't a number is left exactly as typed. */

import { parseDollarCell } from "./dollarCells"
import { parsePercentCell } from "./percentCells"

export type ColumnFormat =
	| {
			kind: "number"
			/** Thousands grouped with commas. */
			grouped: boolean
			/** A "$" in front. */
			dollar: boolean
			/** Negatives written "(1,234)" rather than "-1,234". */
			parenNegative: boolean
			/** Decimal places every cell shares, or null when they vary. */
			decimals: number | null
	  }
	| { kind: "percent"; decimals: number | null }

const PLAIN_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)$/

/** Digits after the decimal point in a cell's numeric text. */
const decimalsOf = (numeric: string): number => {
	const dot = numeric.indexOf(".")
	return dot === -1 ? 0 : numeric.length - dot - 1
}

/** The bare digits of a formatted cell: no sign, "$", parens, "%", spaces
 *  or grouping commas. */
const bareNumeric = (cell: string): string =>
	cell.replace(/[\s$%(),+-]/g, "")

/** Read a column's number format from its cells, or null when the column
 *  isn't a consistently written numeric column: any non-numeric text makes
 *  it a text column; a column of plain "1234"s has nothing to enforce. A
 *  single grouped or "$" cell among plain numbers is enough — that is also
 *  what makes the app read the column as formatted (`dollarCells.ts`). At
 *  most `sample` non-empty cells are read. */
export const detectColumnFormat = (
	cells: Iterable<string>,
	sample = 2000
): ColumnFormat | null => {
	let seen = 0
	let formatted = 0
	let plain = 0
	let percent = 0
	let grouped = false
	let dollar = false
	let parenNegative = false
	let decimals: number | null | undefined
	const noteDecimals = (n: number) => {
		if (decimals === undefined) decimals = n
		else if (decimals !== null && decimals !== n) decimals = null
	}
	for (const raw of cells) {
		const cell = raw.trim()
		if (cell === "") continue
		if (++seen > sample) break
		const pct = parsePercentCell(cell)
		if (pct !== null) {
			percent++
			noteDecimals(decimalsOf(bareNumeric(cell)))
			continue
		}
		const formattedCell = parseDollarCell(cell)
		if (formattedCell) {
			formatted++
			if (cell.includes(",")) grouped = true
			if (formattedCell.dollar) dollar = true
			if (cell.startsWith("(")) parenNegative = true
			noteDecimals(decimalsOf(bareNumeric(cell)))
			continue
		}
		if (PLAIN_RE.test(cell)) {
			plain++
			noteDecimals(decimalsOf(cell.replace(/^[+-]/, "")))
			continue
		}
		return null // text
	}
	const shared = decimals ?? null
	if (percent > 0 && formatted === 0 && percent >= plain)
		return { kind: "percent", decimals: shared }
	if (formatted > 0 && percent === 0)
		return { kind: "number", grouped, dollar, parenNegative, decimals: shared }
	return null
}

const group = (int: string): string => int.replace(/\B(?=(\d{3})+(?!\d))/g, ",")

/** Write `n` the column's way. Decimal places are the column's, or more
 *  when the user typed more (never rounded away). */
const writeNumber = (
	n: number,
	typedDecimals: number,
	fmt: Extract<ColumnFormat, { kind: "number" }>
): string => {
	const decimals =
		fmt.decimals === null ? typedDecimals : Math.max(fmt.decimals, typedDecimals)
	const fixed = Math.abs(n).toFixed(Math.min(decimals, 20))
	const [int = "0", frac] = fixed.split(".")
	const body =
		(fmt.dollar ? "$" : "") + (fmt.grouped ? group(int) : int) + (frac ? `.${frac}` : "")
	if (n < 0 || Object.is(n, -0)) return fmt.parenNegative ? `(${body})` : `-${body}`
	return body
}

/** The value a typed cell should be stored as under the column's format:
 *  a number in any spelling the column could hold ("2222", "2,222",
 *  "$2222", "(5)", "5%") is rewritten to match; anything else — text, an
 *  empty cell — is returned as typed. */
export const conformToFormat = (
	typed: string,
	fmt: ColumnFormat | null
): string => {
	if (!fmt) return typed
	const cell = typed.trim()
	if (cell === "") return typed
	if (fmt.kind === "percent") {
		const numeric = cell.endsWith("%") ? cell.slice(0, -1).trim() : cell
		const ungrouped = numeric.replace(/,/g, "")
		if (!PLAIN_RE.test(ungrouped)) return typed
		const n = Number(ungrouped)
		if (!Number.isFinite(n)) return typed
		const typedDecimals = decimalsOf(ungrouped.replace(/^[+-]/, ""))
		const decimals =
			fmt.decimals === null ? typedDecimals : Math.max(fmt.decimals, typedDecimals)
		return `${n.toFixed(Math.min(decimals, 20))}%`
	}
	const formatted = parseDollarCell(cell)
	if (formatted) return writeNumber(formatted.value, decimalsOf(bareNumeric(cell)), fmt)
	// A plain number, possibly in accounting parens: "2222", "-5", "(7)".
	const paren = /^\((.+)\)$/.exec(cell)
	const plain = (paren?.[1] ?? cell).trim()
	if (!PLAIN_RE.test(plain)) return typed
	const n = Number(plain) * (paren ? -1 : 1)
	if (!Number.isFinite(n)) return typed
	return writeNumber(n, decimalsOf(plain.replace(/^[+-]/, "")), fmt)
}
