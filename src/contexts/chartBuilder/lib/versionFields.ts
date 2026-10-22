/** Per-version column lists.
 *
 *  `Dataset.fields` describes the LATEST version, and every version that
 *  carries no `fields` of its own shares it — the invariant the additive
 *  upload path checks new uploads against. A change that alters the table's
 *  shape — a reshape, a derived variable added or removed, a hand edit that
 *  drops a column — would otherwise leave the earlier versions described by
 *  columns they never had (or missing ones they have): {@link withNextFields}
 *  gives each of them the list as it stood before the change, so previewing
 *  an older version still shows its own table. A rename reaches those lists
 *  too ({@link renameFieldInVersions}), so an older version keeps answering
 *  to the current name; and when the latest version is deleted, its
 *  predecessor's list becomes the data set's ({@link normalizeVersionFields}). */

import { renameDatasetField } from "./renameField"
import type { Dataset, DatasetVersion, Field } from "./types"
import { renameFieldInTransform } from "./versionTransforms"

const sameNames = (a: string[] | undefined, b: string[] | undefined): boolean =>
	(a ?? []).length === (b ?? []).length &&
	(a ?? []).every((n, i) => (b ?? [])[i] === n)

/** Column-for-column equality of what a data set STORES about its fields:
 *  name, type and former names, in order. View-time annotations (format
 *  hints, the derived marker) don't count. */
export const sameFieldList = (
	a: readonly Field[],
	b: readonly Field[]
): boolean =>
	a.length === b.length &&
	a.every((f, i) => {
		const g = b[i]
		return (
			g !== undefined &&
			f.name === g.name &&
			f.inferredType === g.inferredType &&
			sameNames(f.sourceNames, g.sourceNames)
		)
	})

/** The columns a version has: its own list, else the data set's. */
export const fieldsOfVersion = (
	dataset: { fields: Field[]; versions: ReadonlyArray<{ id: string; fields?: Field[] }> },
	versionId: string
): Field[] =>
	dataset.versions.find((v) => v.id === versionId)?.fields ?? dataset.fields

/** Move the data set's columns to `nextFields` ahead of appending a version
 *  that has them. Every version that shared the old list keeps it as its
 *  own (a version with a list of its own keeps that); when nothing changes
 *  the data set is returned as it is. Call BEFORE adding the new version,
 *  which then shares the new list. */
export const withNextFields = (dataset: Dataset, nextFields: Field[]): Dataset => {
	if (sameFieldList(dataset.fields, nextFields)) return dataset
	return {
		...dataset,
		fields: nextFields,
		versions: dataset.versions.map((v) =>
			v.fields ? v : { ...v, fields: dataset.fields }
		),
	}
}

/** Re-establish the invariant after versions change: the data set's list is
 *  the latest version's, and no version carries a list of its own that
 *  equals it. Same reference when nothing changes. */
export const normalizeVersionFields = (dataset: Dataset): Dataset => {
	const latest =
		dataset.versions.find((v) => v.id === dataset.latestVersionId) ??
		dataset.versions.at(-1)
	const fields = latest?.fields ?? dataset.fields
	let changed = fields !== dataset.fields
	const versions = dataset.versions.map((v): DatasetVersion => {
		if (!v.fields || !sameFieldList(v.fields, fields)) return v
		const { fields: _own, ...rest } = v
		changed = true
		return rest
	})
	return changed ? { ...dataset, fields, versions } : dataset
}

/** A field rename over every version's own column list and stored
 *  transform, so an older version still answers to the current name (its
 *  rows keep the old key; `sourceNames` remaps it at view time) and the
 *  derived variable that made a renamed column still finds it. Same
 *  reference when no version mentions the old name. The data set's own
 *  `fields` are the caller's (`renameDatasetField`). */
export const renameFieldInVersions = <
	V extends { fields?: Field[]; transform?: Dataset["versions"][number]["transform"] },
>(
	versions: V[],
	oldName: string,
	newName: string
): V[] => {
	let changed = false
	const out = versions.map((v) => {
		let next = v
		if (v.fields?.some((f) => f.name === oldName))
			next = { ...next, fields: renameDatasetField(v.fields, oldName, newName) }
		if (v.transform) {
			const transform = renameFieldInTransform(v.transform, oldName, newName)
			if (transform !== v.transform) next = { ...next, transform }
		}
		if (next !== v) changed = true
		return next
	})
	return changed ? out : versions
}
