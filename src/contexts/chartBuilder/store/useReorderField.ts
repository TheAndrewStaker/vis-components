import { useAtomCallback } from "jotai/utils"
import { useCallback } from "react"
import { withFreshContentHash } from "../lib/datasetDedupe"
import { moveNameBefore, reorderDatasetFields } from "../lib/reorderFields"

import { currentDatasetIdAtom, datasetIndexAtom, mutateDatasetBodyAtom } from "./atoms"

/** Move a variable of the CURRENT data set so it sits just before `before`
 *  (at the end for null) — the Fields panel's and the data tray's drag
 *  reorder. Column order is a property of the data set (`Dataset.fields`,
 *  and every version's own list, `lib/reorderFields.ts`), so every visual
 *  bound to it sees the new order; nothing in any visual's config stores a
 *  column position, so no config is rewritten. Resolves false when the
 *  data set couldn't be loaded. */
export const useReorderField = () => {
	return useAtomCallback(
		useCallback(async (get, set, name: string, before: string | null): Promise<boolean> => {
			const datasetId = get(currentDatasetIdAtom)
			if (!datasetId) return false
			const names = (get(datasetIndexAtom)[datasetId]?.fields ?? []).map((f) => f.name)
			const order = moveNameBefore(names, name, before)
			if (order === names) return true
			return set(mutateDatasetBodyAtom, datasetId, (d) => {
				const next = reorderDatasetFields(d, order)
				return next === d ? d : withFreshContentHash(next)
			})
		}, [])
	)
}
