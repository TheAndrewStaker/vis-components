/** Structural equality for plain JSON-like data — objects, arrays and
 *  primitives, compared by value at every depth. Key order doesn't matter,
 *  and a key that's absent equals one set to `undefined`, the way a
 *  JSON round-trip treats it. Not for class instances, Dates or Maps. */
export const deepEqual = (a: unknown, b: unknown): boolean => {
	if (a === b) return true
	if (typeof a === "number" && typeof b === "number")
		return Number.isNaN(a) && Number.isNaN(b)
	if (
		typeof a !== "object" ||
		typeof b !== "object" ||
		a === null ||
		b === null
	)
		return false
	if (Array.isArray(a) || Array.isArray(b)) {
		if (!Array.isArray(a) || !Array.isArray(b)) return false
		return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]))
	}
	const ao = a as Record<string, unknown>
	const bo = b as Record<string, unknown>
	const keys = new Set([...Object.keys(ao), ...Object.keys(bo)])
	for (const k of keys) if (!deepEqual(ao[k], bo[k])) return false
	return true
}
