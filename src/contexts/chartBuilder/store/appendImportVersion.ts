import type { Getter, Setter } from "jotai"
import { useAtomCallback } from "jotai/utils"
import { useCallback } from "react"
import { describeDiff, versionKeyAliases } from "../lib/datasetCompat"
import { withFreshContentHash } from "../lib/datasetDedupe"
import { resolveDatasetView } from "../lib/resolveDatasetVersion"
import type { Dataset, DatasetVersion, Field } from "../lib/types"
import { normalizeVersionFields, withNextFields } from "../lib/versionFields"
import { previewImport, runReplayStep } from "../lib/versionReplay"

import {
	currentDatasetIdAtom,
	currentFieldOverridesAtom,
	datasetIndexAtom,
	mutateDatasetBodyAtom,
	previewVersionIdAtom,
} from "./atoms"
import { newDatasetVersionId } from "./useCreateNewDataset"

/** Uploading a file as a new version of the bound data set.
 *
 *  The upload is checked against the columns of the IMPORT the data set's
 *  current chain descends from (`lib/versionReplay.ts`, `previewImport`),
 *  appended as an imported version, and then every reshape and derived
 *  variable of that chain is re-done over it, one new version per step in
 *  chain order, hand-edited versions skipped — so a fresher file of the
 *  same shape snaps into the working copy's functional changes, and the
 *  latest version is the fully re-applied table. The raw upload sits
 *  below it in the version list, ready to download as imported. A step the
 *  fresh data can't feed is left out, named on the last version made
 *  (`transform.skipped`) and returned to the caller. A data set holding
 *  only imports has no steps: the upload simply becomes the latest, as it
 *  always did. */

export type ParsedImport = {
	filename: string
	fields: Field[]
	rows: Array<Record<string, string>>
	note?: string
}

export type AppendImportResult =
	| {
			ok: true
			/** The raw upload's version id. */
			importedVersionId: string
			/** How many versions the replay made after it. */
			replayed: number
			/** What couldn't be re-applied (variable names, or the reshape). */
			skipped: string[]
	  }
	| { ok: false; error: string }

export const appendImportVersion = async (
	get: Getter,
	set: Setter,
	datasetId: string,
	parsed: ParsedImport
): Promise<AppendImportResult> => {
	const meta = get(datasetIndexAtom)[datasetId]
	if (!meta) return { ok: false, error: "The data set no longer exists." }
	const preview = previewImport(meta, parsed)
	if (!preview.compatible)
		return {
			ok: false,
			error: `Cannot add as a new version: ${describeDiff(preview.diff)}.`,
		}
	// The cell conversions a Math formula evaluates against follow the open
	// visual's type overrides, as when the variable was first saved.
	const overrides = get(currentFieldOverridesAtom)
	// Ambiguous former-name matches (a renamed field bound to its old-name
	// column while a same-named column is also present — the type tiebreak)
	// are pinned on the version so the view reads the matched column.
	const keyAliases = versionKeyAliases(preview.rootFields, parsed.fields)
	const now = Date.now()
	const imported: DatasetVersion = {
		id: newDatasetVersionId(),
		filename: parsed.filename,
		rows: parsed.rows,
		createdAt: now,
		...(parsed.note !== undefined ? { note: parsed.note } : {}),
		...(Object.keys(keyAliases).length > 0 ? { keyAliases } : {}),
	}

	let replayed = 0
	let skipped: string[] = []
	// Appending needs the FULL body — the new versions join the existing
	// ones. `mutateDatasetBodyAtom` loads it lazily and applies the change to
	// the freshest body, so nothing that landed during the await is lost.
	const applied = await set(mutateDatasetBodyAtom, datasetId, (d) => {
		skipped = []
		const made: DatasetVersion[] = []
		// The import's columns are the root's plus any net-new ones; the
		// versions before it keep the columns they had.
		let ds: Dataset = withNextFields(d, preview.rawFields)
		ds = { ...ds, versions: [...ds.versions, imported], latestVersionId: imported.id }
		let prevId = imported.id
		for (const step of preview.steps) {
			if (!step.transform) continue
			// The table as the previous version shows it: renamed fields
			// remapped to their current names, as every bake reads them.
			const view = resolveDatasetView(ds, prevId)
			if (!view) break
			const result = runReplayStep(
				view,
				{ fields: view.fields, rows: view.rows },
				step.transform,
				overrides
			)
			for (const part of result.skipped) skipped.push(part.name)
			if (!result.applied) continue
			const version: DatasetVersion = {
				id: newDatasetVersionId(),
				filename: step.filename,
				rows: result.table.rows,
				createdAt: now + made.length + 1,
				editedFrom: prevId,
				transform: result.applied,
			}
			ds = withNextFields(ds, result.table.fields)
			ds = { ...ds, versions: [...ds.versions, version], latestVersionId: version.id }
			made.push(version)
			prevId = version.id
		}
		const last = made.at(-1)
		if (skipped.length > 0 && last?.transform) {
			const tagged: DatasetVersion = {
				...last,
				transform: { ...last.transform, skipped: [...skipped] },
			}
			ds = {
				...ds,
				versions: ds.versions.map((v) => (v.id === last.id ? tagged : v)),
			}
		}
		replayed = made.length
		return withFreshContentHash(normalizeVersionFields(ds))
	})
	if (!applied)
		return {
			ok: false,
			error:
				"Couldn't load the existing data set to update it. Check your connection and try again.",
		}
	set(currentDatasetIdAtom, datasetId)
	set(previewVersionIdAtom, null)
	return { ok: true, importedVersionId: imported.id, replayed, skipped }
}

export const useAppendImportVersion = () =>
	useAtomCallback(
		useCallback(
			(get, set, datasetId: string, parsed: ParsedImport) =>
				appendImportVersion(get, set, datasetId, parsed),
			[]
		)
	)
