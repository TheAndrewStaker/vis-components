import { useAtomCallback } from "jotai/utils"
import { useCallback } from "react"
import { datasetContentHash, withFreshContentHash } from "../lib/datasetDedupe"
import {
	EDITED_DATA_FILENAME,
	isHandEditedDataset,
	planEditedFields,
	type FieldPlan,
} from "../lib/datasetEdits"
import { datasetRejectMessage, datasetSizeIssue } from "../lib/datasetLimits"
import { renameDatasetField, renameFieldInVisual } from "../lib/renameField"
import type { Dataset, DatasetVersion, Field } from "../lib/types"

import {
	currentDatasetIdAtom,
	getDatasetBody,
	loadedDatasetsAtom,
	mutateDatasetBodyAtom,
	previewVersionIdAtom,
	visualsAtom,
} from "./atoms"
import {
	newDatasetId,
	newDatasetVersionId,
	parsePastedData,
} from "./useCreateNewDataset"
import { currentRawDatasetViewAtom } from "./useCurrentDatasetView"
import { renameFieldAcrossEditorAtoms } from "./useRenameField"

export type EditDataResult =
	| { ok: true; mode: "fork" | "append"; datasetId: string }
	| { ok: false; error: string }

/** How the Edit dialog's save lands, decided from the data set's history:
 *  the first edit of imported data FORKS a new data set, an edit of a data
 *  set that already holds hand-edited versions APPENDS one. */
export const editSaveMode = (
	dataset: Parameters<typeof isHandEditedDataset>[0]
): "fork" | "append" => (isHandEditedDataset(dataset) ? "append" : "fork")

/** Options `planEditedFields` takes for each save mode: a fork is a new
 *  data set and may drop columns and retype them; an appended version shares
 *  the data set's field list, so dropped columns stay and types are pinned. */
export const planOptionsFor = (mode: "fork" | "append") =>
	mode === "fork"
		? { keepDropped: false, keepTypes: false }
		: { keepDropped: true, keepTypes: true }

/** Save the Edit dialog's text as the data the visualization draws.
 *
 *  Fork (the data set has no hand-edited version yet): a NEW data set whose
 *  v1 is a copy of the version shown — rows reused by reference, same file
 *  name, note and upload time — and whose v2 is the edited rows, marked
 *  `editedFrom` v1. The editor rebinds to it; every draft atom is left
 *  alone, so the visualization simply continues on the edited data
 *  (derived variables, reshape and encodings included). The imported data
 *  set is untouched — other visuals keep it, and the orphan sweep takes it
 *  if none does.
 *
 *  Append (the data set is already a hand-edited copy): the edited rows
 *  join it as a new version marked `editedFrom` the version shown, and the
 *  name box renames the data set when changed.
 *
 *  Either way a changed header is a variable rename: the field remembers
 *  the old name (`sourceNames`), and the open editor's atoms — plus, on an
 *  append, every saved visual bound to the data set — get the same rewrite
 *  the Fields-panel rename applies. */
export const useSaveEditedData = () =>
	useAtomCallback(
		useCallback(
			async (get, set, text: string, rawName: string): Promise<EditDataResult> => {
				const bytes = new TextEncoder().encode(text).byteLength
				if (datasetSizeIssue(bytes) === "reject")
					return { ok: false, error: datasetRejectMessage(bytes) }
				const datasetId = get(currentDatasetIdAtom)
				const view = get(currentRawDatasetViewAtom)
				if (!datasetId || !view)
					return { ok: false, error: "No data set is loaded." }
				const name = rawName.trim()
				if (name === "") return { ok: false, error: "Enter a data set name." }

				let parsed
				try {
					parsed = parsePastedData(text)
				} catch (error) {
					return {
						ok: false,
						error:
							error instanceof Error
								? error.message
								: "Couldn't parse the edited data.",
					}
				}

				let body: Dataset | null
				try {
					body = await getDatasetBody(get, datasetId)
				} catch {
					body = null
				}
				if (!body)
					return {
						ok: false,
						error:
							"Couldn't load the data set to edit it. Check your connection and try again.",
					}
				const source = body.versions.find((v) => v.id === view.versionId)
				if (!source)
					return { ok: false, error: "The version shown no longer exists." }

				const mode = editSaveMode(body)
				const plan = planEditedFields(
					body.fields,
					parsed.fields,
					planOptionsFor(mode)
				)
				const now = Date.now()
				const edited: DatasetVersion = {
					id: newDatasetVersionId(),
					filename: EDITED_DATA_FILENAME,
					rows: parsed.rows,
					createdAt: now,
					editedFrom: source.id,
				}

				if (mode === "fork") {
					const baseId = newDatasetVersionId()
					const base: DatasetVersion = {
						id: baseId,
						filename: source.filename,
						rows: source.rows,
						createdAt: source.createdAt,
						...(source.note !== undefined ? { note: source.note } : {}),
						...(source.keyAliases
							? { keyAliases: keyAliasesAfterRenames(source.keyAliases, plan) }
							: {}),
					}
					const id = newDatasetId()
					const dataset: Dataset = {
						id,
						name,
						fields: plan.fields,
						versions: [base, { ...edited, editedFrom: baseId }],
						latestVersionId: edited.id,
						createdAt: now,
						contentHash: "",
					}
					dataset.contentHash = datasetContentHash(dataset)
					void set(loadedDatasetsAtom, (prev) => ({ ...prev, [id]: dataset }))
					set(currentDatasetIdAtom, id)
					set(previewVersionIdAtom, null)
					applyRenamesToEditor(get, set, body.fields, plan)
					return { ok: true, mode, datasetId: id }
				}

				const applied = await set(mutateDatasetBodyAtom, datasetId, (d) =>
					withFreshContentHash({
						...d,
						name,
						fields: plan.fields,
						versions: [...d.versions, edited],
						latestVersionId: edited.id,
					})
				)
				if (!applied)
					return {
						ok: false,
						error:
							"Couldn't load the data set to update it. Check your connection and try again.",
					}
				set(previewVersionIdAtom, null)
				applyRenamesToEditor(get, set, body.fields, plan)
				if (plan.renames.length > 0) {
					// Sibling visuals bound to this (hand-edited) data set follow the
					// rename, as after a Fields-panel rename.
					const visuals = get(visualsAtom)
					let anyChanged = false
					const next = visuals.map((v) => {
						if (v.datasetId !== datasetId) return v
						let fields = body.fields
						let out = v
						for (const { from, to } of plan.renames) {
							out = renameFieldInVisual(out, fields, from, to)
							fields = renameDatasetField(fields, from, to)
						}
						if (out !== v) anyChanged = true
						return out
					})
					if (anyChanged) set(visualsAtom, next)
				}
				return { ok: true, mode, datasetId }
			},
			[]
		)
	)

/** Rewrite the open editor's atoms for each rename, in order, each against
 *  the field list as it stood before that rename (what decides melted vs.
 *  standard mode). */
const applyRenamesToEditor = (
	get: Parameters<typeof renameFieldAcrossEditorAtoms>[0],
	set: Parameters<typeof renameFieldAcrossEditorAtoms>[1],
	sourceFields: Field[],
	plan: FieldPlan
): void => {
	let fields = sourceFields
	for (const { from, to } of plan.renames) {
		renameFieldAcrossEditorAtoms(get, set, fields, from, to)
		fields = renameDatasetField(fields, from, to)
	}
}

/** A copied base version's `keyAliases` record is keyed by field CURRENT
 *  name; a field the edit renamed must keep its pin under the new name. */
const keyAliasesAfterRenames = (
	keyAliases: Record<string, string>,
	plan: FieldPlan
): Record<string, string> => {
	const to = new Map(plan.renames.map((r) => [r.from, r.to]))
	return Object.fromEntries(
		Object.entries(keyAliases).map(([field, key]) => [to.get(field) ?? field, key])
	)
}
