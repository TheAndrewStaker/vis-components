import { useAtomCallback } from "jotai/utils"
import { useCallback } from "react"
import { moveNameBefore } from "../lib/reorderFields"

import { currentFieldOrderAtom } from "./atoms"
import { currentDatasetViewAtom } from "./useCurrentDatasetView"

/** Move a column of the table the editor shows so it sits just before
 *  `before` (at the end for null) — the Fields panel's and the data tray's
 *  drag reorder. Column order is a property of the VISUAL
 *  (`currentFieldOrderAtom`, applied last in the view chain), so any column
 *  shown moves — a reshape's minted columns and live derived columns too —
 *  and other visuals on the same data set keep their own order. The whole
 *  shown order is written, so the drop lands where the user saw it. */
export const useReorderField = () => {
	return useAtomCallback(
		useCallback((get, set, name: string, before: string | null): void => {
			const names = (get(currentDatasetViewAtom)?.fields ?? []).map((f) => f.name)
			const order = moveNameBefore(names, name, before)
			if (order === names) return
			set(currentFieldOrderAtom, [...order])
		}, [])
	)
}
