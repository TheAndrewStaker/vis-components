// Heatmap (tile) cell aggregation — pure, shared by the tile renderer and
// the data table (`lib/plottedData.ts`) so the table lists exactly the
// values the tiles are colored by.

import { parseNumericCell } from "./scales"

export type CellAggregation = {
	xKey: string
	yKey: string
	count: number
	/** Most-recent representative value for the hue field (mean for
	 * quantitative, mode for categorical). `null` when hue is unmapped. */
	hueValue: unknown
	/** Numeric value used for text labels. Defaults to the cell row count when
	 * no other quantity makes sense. */
	textValue: number | string
}

/** Mode (most frequent value) for a list of strings, falling back to the
 * first entry when there's no clear winner. */
const modeValue = (values: string[]): string | null => {
	if (values.length === 0) return null
	const counts = new Map<string, number>()
	let bestKey = values[0] as string
	let bestCount = 0
	for (const v of values) {
		const next = (counts.get(v) ?? 0) + 1
		counts.set(v, next)
		if (next > bestCount) {
			bestCount = next
			bestKey = v
		}
	}
	return bestKey
}

/** One cell per (x, y) pair with any row: its row count and the hue
 * field's aggregate — the MEAN for a quantitative hue (blanks skipped),
 * the most common value for a categorical one. */
export const aggregateCells = (
	rows: Array<Record<string, unknown>>,
	xField: string,
	yField: string,
	hueField: string | null,
	hueIsQuantitative: boolean
): CellAggregation[] => {
	const buckets = new Map<string, Array<Record<string, unknown>>>()
	for (const row of rows) {
		const xRaw = row[xField]
		const yRaw = row[yField]
		if (
			xRaw === undefined ||
			xRaw === null ||
			yRaw === undefined ||
			yRaw === null ||
			String(xRaw) === "" ||
			String(yRaw) === ""
		) {
			continue
		}
		const key = `${String(xRaw)}\u001F${String(yRaw)}`
		const list = buckets.get(key) ?? []
		list.push(row)
		buckets.set(key, list)
	}

	const cells: CellAggregation[] = []
	for (const [key, bucket] of buckets) {
		const sep = key.indexOf("\u001F")
		const xKey = key.slice(0, sep)
		const yKey = key.slice(sep + 1)

		let hueValue: unknown = null
		if (hueField) {
			if (hueIsQuantitative) {
				let sum = 0
				let n = 0
				for (const r of bucket) {
					// parseNumericCell, not Number: blanks are missing data and
					// must not enter the mean as 0 (`Number("") === 0`).
					const v = parseNumericCell(r[hueField])
					if (v !== null) {
						sum += v
						n += 1
					}
				}
				hueValue = n > 0 ? sum / n : null
			} else {
				hueValue = modeValue(
					bucket
						.map((r) => r[hueField])
						.filter((v) => v !== undefined && v !== null)
						.map(String)
				)
			}
		}

		// Text value default: prefer the aggregated hue value when present,
		// otherwise fall back to the row count (classic "n per cell" heatmap).
		const textValue =
			typeof hueValue === "number" && Number.isFinite(hueValue)
				? hueValue
				: typeof hueValue === "string"
					? hueValue
					: bucket.length

		cells.push({ xKey, yKey, count: bucket.length, hueValue, textValue })
	}
	return cells
}

