import { useAtomCallback } from "jotai/utils"
import { useCallback } from "react"
import { EDITED_DATA_FILENAME, planEditedFields } from "../lib/datasetEdits"
import { datasetRejectMessage, datasetSizeIssue } from "../lib/datasetLimits"
import { storedFields } from "../lib/materializeTransforms"

import { currentDatasetIdAtom, datasetIndexAtom } from "./atoms"
import {
	commitDatasetVersion,
	saveModeFor,
	type CommitResult,
} from "./commitDatasetVersion"
import { parsePastedData } from "./useCreateNewDataset"
import { currentRawDatasetViewAtom } from "./useCurrentDatasetView"

export type EditDataResult = CommitResult

/** How the Edit dialog's save lands — see `saveModeFor`: the first change
 *  to imported data FORKS a working copy, a change to a working copy
 *  APPENDS a version. */
export const editSaveMode = saveModeFor

/** Options `planEditedFields` takes for each save mode: a fork is a new
 *  data set and may drop columns and retype them; an appended version shares
 *  the data set's field list, so dropped columns stay and types are pinned. */
export const planOptionsFor = (mode: "fork" | "append") =>
	mode === "fork"
		? { keepDropped: false, keepTypes: false }
		: { keepDropped: true, keepTypes: true }

/** Save the Edit dialog's text as the data the visualization draws: a new
 *  data version through `commitDatasetVersion` (a fork of imported data, an
 *  append to a working copy). The edited rows are stored as typed, keyed by
 *  the edited headers; a changed header is a variable rename the field
 *  remembers (`sourceNames`), and the plan's renames ride along so the
 *  editor's atoms — and, on an append, sibling visuals — follow it. */
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
				if (rawName.trim() === "") return { ok: false, error: "Enter a data set name." }

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

				const meta = get(datasetIndexAtom)[datasetId]
				const mode = meta ? saveModeFor(meta) : "fork"
				// Planned against the columns of the version SHOWN (what the grid
				// held), stripped of their view-time annotations.
				const plan = planEditedFields(
					storedFields(view.fields),
					parsed.fields,
					planOptionsFor(mode)
				)
				return commitDatasetVersion(
					get,
					set,
					{
						fields: plan.fields,
						rows: parsed.rows,
						filename: EDITED_DATA_FILENAME,
						renames: plan.renames,
					},
					rawName
				)
			},
			[]
		)
	)
