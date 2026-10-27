/** Column order is a property of the DATA SET, like a field's name: the
 *  Fields panel and the data tray reorder `Dataset.fields` by drag, and
 *  every version that keeps a column list of its own follows the same
 *  order, so previewing an older version shows its columns the way the
 *  user arranged them. Rows are never touched — they are keyed by name. */

import type { Dataset, Field } from "./types"

/** `names` with `name` moved so that it sits just before `before` (at the
 *  end when `before` is null). Same reference when nothing moves, or when
 *  either name is unknown. */
export const moveNameBefore = (
	names: readonly string[],
	name: string,
	before: string | null
): readonly string[] => {
	if (name === before) return names
	const from = names.indexOf(name)
	if (from < 0) return names
	const rest = names.filter((n) => n !== name)
	const at = before === null ? rest.length : rest.indexOf(before)
	if (at < 0) return names
	const next = [...rest.slice(0, at), name, ...rest.slice(at)]
	return next.every((n, i) => n === names[i]) ? names : next
}

/** `fields` sorted into the order `names` gives, stably: a field whose
 *  name the order doesn't mention keeps its place relative to the others
 *  it is listed with and lands after every ordered one. Same reference
 *  when the order already holds. */
export const reorderFieldsByNames = (
	fields: Field[],
	names: readonly string[]
): Field[] => {
	const rank = new Map(names.map((n, i) => [n, i]))
	const ranked = fields.map((f, i) => ({ f, i, r: rank.get(f.name) ?? Infinity }))
	ranked.sort((a, b) => (a.r === b.r ? a.i - b.i : a.r - b.r))
	return ranked.every((x, i) => x.f === fields[i]) ? fields : ranked.map((x) => x.f)
}

/** The data set's columns, and every version's own list, in the order
 *  `names` gives. Same reference when nothing changes. */
export const reorderDatasetFields = (dataset: Dataset, names: readonly string[]): Dataset => {
	const fields = reorderFieldsByNames(dataset.fields, names)
	let changed = fields !== dataset.fields
	const versions = dataset.versions.map((v) => {
		if (!v.fields) return v
		const own = reorderFieldsByNames(v.fields, names)
		if (own === v.fields) return v
		changed = true
		return { ...v, fields: own }
	})
	return changed ? { ...dataset, fields, versions } : dataset
}
