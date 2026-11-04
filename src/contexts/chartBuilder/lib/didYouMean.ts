/** `; did you mean "x"?` for the closest candidate by edit distance
 * (case-insensitive, at most a third of the name's length), else "". Shared
 * by the chart-spec and settings problems lists. */
export const didYouMean = (name: string, candidates: readonly string[]): string => {
	const a = name.toLowerCase()
	let best: string | null = null
	let bestDist = Math.max(2, Math.ceil(a.length / 3)) + 1
	for (const c of candidates) {
		const b = c.toLowerCase()
		let row = Array.from({ length: b.length + 1 }, (_, j) => j)
		for (let i = 1; i <= a.length; i++) {
			const next = [i]
			for (let j = 1; j <= b.length; j++)
				next.push(
					Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
				)
			row = next
		}
		if (row[b.length] < bestDist) [best, bestDist] = [c, row[b.length]]
	}
	return best === null ? "" : `; did you mean "${best}"?`
}
