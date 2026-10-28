/** Column order is a property of the VISUAL: the Fields panel and the data
 *  tray reorder by drag into `Visual.fieldOrder`, a list of names applied
 *  as the last stage of the view chain — so it places every column the
 *  table shows, a reshape's minted columns and live derived columns
 *  included. Rows are never touched — they are keyed by name. */

import type { DatasetView, Field } from "./types"

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

/** `view` with its columns in the order `names` gives (see
 *  {@link reorderFieldsByNames}). Same reference when the order already
 *  holds, so the view keeps its identity for a visual that never reordered. */
export const applyFieldOrder = <V extends DatasetView | undefined>(
	view: V,
	names: readonly string[]
): V => {
	if (!view || names.length === 0) return view
	const fields = reorderFieldsByNames(view.fields, names)
	return fields === view.fields ? view : { ...view, fields }
}
