import { useAtomCallback } from "jotai/utils"
import { useCallback } from "react"
import type { Setter } from "jotai"
import {
	DEFAULT_DERIVED_VARIABLES_CONFIG,
	type DerivedVariable,
} from "../lib/derivedVariables"
import {
	bakeTransforms,
	dropColumn,
	moveField,
	storedField,
	storedFields,
	type Baked,
} from "../lib/materializeTransforms"
import type { PivotConfig } from "../lib/pivot"
import { renameDatasetField } from "../lib/renameField"
import { DEFAULT_RESHAPE_CONFIG, type ReshapeConfig } from "../lib/reshape"
import type { Field, VersionTransform } from "../lib/types"
import {
	DERIVED_DATA_FILENAME,
	RESHAPED_DATA_FILENAME,
} from "../lib/versionTransforms"

import {
	currentDerivedVariablesAtom,
	currentFieldOverridesAtom,
	currentReshapeConfigAtom,
} from "./atoms"
import { commitDatasetVersion, type CommitResult } from "./commitDatasetVersion"
import { currentRawDatasetViewAtom } from "./useCurrentDatasetView"

/** Saving a reshape or a derived variable as a new data VERSION.
 *
 *  Neither is applied live any more: the Reshape panel's "Apply" and the
 *  derived-variable popup's "Save" bake the result into stored rows
 *  (`lib/materializeTransforms.ts`) and commit it through the one path
 *  every change to the data takes (`commitDatasetVersion`: a fork of
 *  imported data, an append to a working copy). Visuals saved before this
 *  — whose reshape and derived variables still live in per-visual config
 *  and apply at view time — are folded in on the way: the first version
 *  saved from such a visual carries their results, and the live config is
 *  cleared of everything that applied. */

/** Which derived variable the popup is editing: one still living in this
 *  visual's config (an older visual), or one a data version made. */
export type DerivedTarget =
	| { kind: "legacy"; variable: DerivedVariable }
	| { kind: "materialized"; variable: DerivedVariable }

/** After a bake landed: the live config loses what the version now holds.
 *  A legacy variable that could NOT apply (a broken reference) stays live —
 *  its editor keeps warning about it rather than losing it silently. A
 *  live melt also clears when a PIVOT lands: the user reshaped the other
 *  way instead, and the melt's columns are gone from the version. */
const clearFolded = (set: Setter, baked: Baked, legacyVariables: DerivedVariable[]) => {
	if (baked.reshaped || baked.pivoted)
		set(currentReshapeConfigAtom, DEFAULT_RESHAPE_CONFIG)
	const applied = new Set(baked.variables.map((v) => v.id))
	const remaining = legacyVariables.filter((v) => !applied.has(v.id))
	set(
		currentDerivedVariablesAtom,
		remaining.length === 0
			? DEFAULT_DERIVED_VARIABLES_CONFIG
			: { variables: remaining }
	)
}

/** The transform a baked version records: the reshape (melt or pivot) when
 *  it applied, and the legacy variables folded in as added columns. */
const foldedTransform = (
	baked: Baked,
	reshape: ReshapeConfig,
	foldedIds: ReadonlySet<string>,
	pivot?: PivotConfig
): VersionTransform => {
	const added = baked.variables.filter((v) => foldedIds.has(v.id))
	return {
		...(baked.reshaped ? { reshape } : {}),
		...(baked.pivoted && pivot ? { pivot } : {}),
		...(added.length > 0 ? { added } : {}),
	}
}

/** What the Reshape panel applies: a wide→long melt or a long→wide pivot. */
export type ReshapeDraft =
	| { kind: "melt"; config: ReshapeConfig }
	| { kind: "pivot"; config: PivotConfig }

/** The Reshape panel's Apply: reshape the version shown by `draft` — a
 *  melt or a pivot, together with this visual's live derived variables, if
 *  it still has any — and save the result as a new version. */
export const useApplyReshape = () =>
	useAtomCallback(
		useCallback(
			async (get, set, draft: ReshapeDraft, name: string): Promise<CommitResult> => {
				const raw = get(currentRawDatasetViewAtom)
				if (!raw) return { ok: false, error: "No data set is loaded." }
				const legacy = get(currentDerivedVariablesAtom)
				const reshape = draft.kind === "melt" ? draft.config : DEFAULT_RESHAPE_CONFIG
				const pivot = draft.kind === "pivot" ? draft.config : undefined
				const baked = bakeTransforms(
					raw,
					get(currentFieldOverridesAtom),
					reshape,
					legacy,
					pivot
				)
				if (draft.kind === "melt" && !baked.reshaped)
					return { ok: false, error: "Check at least one Combine column." }
				if (draft.kind === "pivot" && !baked.pivoted)
					return {
						ok: false,
						error: "Check a column to split out and a column to fill with.",
					}
				const result = await commitDatasetVersion(
					get,
					set,
					{
						fields: baked.fields,
						rows: baked.rows,
						filename: RESHAPED_DATA_FILENAME,
						transform: foldedTransform(
							baked,
							reshape,
							new Set(legacy.variables.map((v) => v.id)),
							pivot
						),
					},
					name
				)
				if (result.ok) clearFolded(set, baked, legacy.variables)
				return result
			},
			[]
		)
	)

/** The derived-variable popup's Save: compute `draft` over the version
 *  shown and save the result as a new version — a new column, or the
 *  recomputed column of the variable being edited (kept in place; a changed
 *  name is a variable rename the encodings follow). An older visual's live
 *  reshape and variables are folded into the same version. */
export const useSaveDerivedVariable = () =>
	useAtomCallback(
		useCallback(
			async (
				get,
				set,
				draft: DerivedVariable,
				existing: DerivedTarget | null,
				name: string
			): Promise<CommitResult> => {
				const raw = get(currentRawDatasetViewAtom)
				if (!raw) return { ok: false, error: "No data set is loaded." }
				const overrides = get(currentFieldOverridesAtom)
				const reshape = get(currentReshapeConfigAtom)
				const legacy = get(currentDerivedVariablesAtom)
				const legacyIds = new Set(legacy.variables.map((v) => v.id))

				if (existing?.kind === "legacy") {
					// Still per-visual config: the edited definition replaces the
					// stored one, and the whole live set is baked.
					const variables = legacy.variables.map((v) =>
						v.id === existing.variable.id ? draft : v
					)
					const baked = bakeTransforms(raw, overrides, reshape, { variables })
					if (!baked.variables.some((v) => v.id === draft.id))
						return { ok: false, error: "This variable can't be computed from the data." }
					const previous = existing.variable.name
					const result = await commitDatasetVersion(
						get,
						set,
						{
							fields: baked.fields,
							rows: baked.rows,
							filename: DERIVED_DATA_FILENAME,
							transform: foldedTransform(baked, reshape, legacyIds),
							...(previous !== draft.name
								? { renames: [{ from: previous, to: draft.name }] }
								: {}),
						},
						name
					)
					if (result.ok) clearFolded(set, baked, variables)
					return result
				}

				if (existing?.kind === "materialized") {
					// A column a version made: recompute it over the rows as shown,
					// minus itself (a variable never reads its own column), and put
					// the result back where the column was.
					const column = existing.variable.name
					const index = raw.fields.findIndex((f) => f.name === column)
					const original = raw.fields[index]
					if (!original)
						return { ok: false, error: "This derived variable no longer exists." }
					// Rows too: the key leaves with the column, so a renamed column
					// doesn't leave its old key behind in storage.
					const without = { ...raw, ...dropColumn(raw, column) }
					const baked = bakeTransforms(without, overrides, reshape, {
						variables: [...legacy.variables, draft],
					})
					const computed = baked.variables.find((v) => v.id === draft.id)
					if (!computed)
						return { ok: false, error: "This variable can't be computed from the data." }
					const fresh = baked.fields.find((f) => f.name === computed.name)
					const renamed = computed.name !== column
					// The column keeps its identity (former names included) and
					// takes the recomputed cells' type.
					const kept: Field = {
						...(renamed
							? (renameDatasetField([storedField(original)], column, computed.name)[0] ??
								storedField(original))
							: storedField(original)),
						inferredType: fresh?.inferredType ?? original.inferredType,
					}
					const fields = moveField(
						baked.fields.map((f) => (f === fresh ? kept : f)),
						computed.name,
						index
					)
					const result = await commitDatasetVersion(
						get,
						set,
						{
							fields,
							rows: baked.rows,
							filename: DERIVED_DATA_FILENAME,
							transform: {
								...foldedTransform(baked, reshape, legacyIds),
								recomputed: [computed],
							},
							...(renamed ? { renames: [{ from: column, to: computed.name }] } : {}),
						},
						name
					)
					if (result.ok) clearFolded(set, baked, legacy.variables)
					return result
				}

				const baked = bakeTransforms(raw, overrides, reshape, {
					variables: [...legacy.variables, draft],
				})
				const computed = baked.variables.find((v) => v.id === draft.id)
				if (!computed)
					return { ok: false, error: "This variable can't be computed from the data." }
				const folded = foldedTransform(baked, reshape, legacyIds)
				const result = await commitDatasetVersion(
					get,
					set,
					{
						fields: baked.fields,
						rows: baked.rows,
						filename: DERIVED_DATA_FILENAME,
						transform: { ...folded, added: [...(folded.added ?? []), computed] },
					},
					name
				)
				if (result.ok) clearFolded(set, baked, legacy.variables)
				return result
			},
			[]
		)
	)

export type RemoveResult = CommitResult | { ok: true; mode: "config" }

/** The popup's Delete. A column a version made leaves in a new version
 *  (anything mapped to it falls back to the missing-field behavior); a
 *  variable still living in this visual's config simply leaves the config —
 *  the stored data never had its column. */
export const useRemoveDerivedVariable = () =>
	useAtomCallback(
		useCallback(
			async (get, set, existing: DerivedTarget, name: string): Promise<RemoveResult> => {
				if (existing.kind === "legacy") {
					const legacy = get(currentDerivedVariablesAtom)
					const variables = legacy.variables.filter(
						(v) => v.id !== existing.variable.id
					)
					set(
						currentDerivedVariablesAtom,
						variables.length === 0
							? DEFAULT_DERIVED_VARIABLES_CONFIG
							: { variables }
					)
					return { ok: true, mode: "config" }
				}
				const raw = get(currentRawDatasetViewAtom)
				if (!raw) return { ok: false, error: "No data set is loaded." }
				const column = existing.variable.name
				const table = dropColumn(
					{ fields: storedFields(raw.fields), rows: raw.rows },
					column
				)
				return commitDatasetVersion(
					get,
					set,
					{
						...table,
						filename: DERIVED_DATA_FILENAME,
						transform: { removed: [column] },
					},
					name
				)
			},
			[]
		)
	)
