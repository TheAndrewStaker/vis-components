import { atom, useAtomValue, useSetAtom } from "jotai"
import { useEffect } from "react"
import {
	alignEditedRows,
	editBaseVersionId,
	type EditedCells,
} from "../lib/datasetEdits"
import { datasetFromParts } from "../lib/datasetMeta"
import { resolveDatasetView } from "../lib/resolveDatasetVersion"

import {
	currentDatasetIdAtom,
	datasetIndexAtom,
	ensureVersionRowsLoadedAtom,
	loadedDatasetsAtom,
	loadedVersionRowsAtom,
	versionRowsKey,
} from "./atoms"
import { currentRawDatasetViewAtom } from "./useCurrentDatasetView"

/** The version the tray's current version was hand-edited from, when it
 *  was — the rows to outline differences against. Null for an imported
 *  version (nothing to outline). Answered from metadata, before any rows. */
const editBaseAtom = atom(
	(get): { datasetId: string; versionId: string } | null => {
		const datasetId = get(currentDatasetIdAtom)
		const view = get(currentRawDatasetViewAtom)
		if (!datasetId || !view) return null
		const meta = get(datasetIndexAtom)[datasetId]
		if (!meta) return null
		const versionId = editBaseVersionId(meta, view.versionId)
		return versionId ? { datasetId, versionId } : null
	}
)

/** The cells of the current RAW view that differ from its edit base, or
 *  null while there is no base or its rows haven't arrived. The base rows
 *  come from the whole body when this session holds it (a fresh fork does)
 *  and from the per-version cache otherwise — `useEditedCells` requests
 *  them. Base rows go through `resolveDatasetView` so a renamed field's
 *  values compare under the current name, like the view's own rows. */
export const editedCellsAtom = atom((get): EditedCells | null => {
	const base = get(editBaseAtom)
	const view = get(currentRawDatasetViewAtom)
	if (!base || !view) return null
	const meta = get(datasetIndexAtom)[base.datasetId]
	if (!meta) return null
	const rows =
		get(loadedDatasetsAtom)[base.datasetId]?.versions.find(
			(v) => v.id === base.versionId
		)?.rows ??
		get(loadedVersionRowsAtom)[versionRowsKey(base.datasetId, base.versionId)]
	if (!rows) return null
	const baseView = resolveDatasetView(
		datasetFromParts(meta, { [base.versionId]: rows }),
		base.versionId
	)
	if (!baseView) return null
	return alignEditedRows(
		baseView.rows,
		view.rows,
		view.fields.map((f) => f.name)
	)
})

/** The data table's hand-edit outlines: the edited cells of the current
 *  version, requesting the base version's rows when they aren't in memory
 *  yet (nothing is outlined until they are). */
export const useEditedCells = (): EditedCells | null => {
	const base = useAtomValue(editBaseAtom)
	const ensure = useSetAtom(ensureVersionRowsLoadedAtom)
	useEffect(() => {
		if (base) ensure(base.datasetId, base.versionId)
	}, [base, ensure])
	return useAtomValue(editedCellsAtom)
}
