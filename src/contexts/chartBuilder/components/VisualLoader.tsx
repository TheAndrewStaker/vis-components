import { useEffect } from "react"
import { useParams, useNavigate, useSearch } from "@tanstack/react-router"
import { useAtomValue, useSetAtom } from "jotai"
import {
	currentDatasetIdAtom,
	currentVisualNameAtom,
	newVisualFolderIdAtom,
	visualsHydratedAtom,
} from "../store/atoms"
import { useLoadVisual, useResetVisual } from "../store/saveVisual"

import { EditorLayout } from "./EditorLayout"
import { PublishedEditGate } from "./PublishedEditGate"

export const VisualLoaderForNew = () => {
	const reset = useResetVisual()
	// Optional search params: `/editor/new?datasetId=<id>` preserves a dataset
	// binding across the route change (used by the Header's "With this data
	// set" flow); `?folderId=<id>` and `?name=…` are the destination folder
	// and name the same menu asked for. After reset clears state, we re-apply
	// all three — before React renders, so the undo baseline includes them.
	const { datasetId, folderId, name } = useSearch({ from: "/editor/new" })
	const setDatasetId = useSetAtom(currentDatasetIdAtom)
	const setFolderId = useSetAtom(newVisualFolderIdAtom)
	const setName = useSetAtom(currentVisualNameAtom)
	useEffect(() => {
		;(async () => {
			await reset()
			if (datasetId) setDatasetId(datasetId)
			if (folderId) setFolderId(folderId)
			if (name) setName(name.trim())
		})()
	}, [reset, datasetId, folderId, name, setDatasetId, setFolderId, setName])
	return <EditorLayout />
}

export const VisualLoaderForExisting = () => {
	const { visualId } = useParams({ from: "/editor/$visualId" })
	const load = useLoadVisual()
	const navigate = useNavigate()
	// Server mode fills the visuals list asynchronously; until it lands, the
	// list is empty and says nothing about whether `visualId` exists. Deciding
	// "not found" off that pre-hydration read sent every cold deep link to the
	// library. Subscribing here is also what mounts the visuals atom and
	// starts the fetch on a direct /editor/$visualId load.
	const hydrated = useAtomValue(visualsHydratedAtom)

	useEffect(() => {
		if (!hydrated) return
		let cancelled = false
		;(async () => {
			const ok = await load(visualId)
			if (!cancelled && !ok) {
				await navigate({ to: "/" })
			}
		})()
		return () => {
			cancelled = true
		}
	}, [hydrated, visualId, load, navigate])

	return (
		<>
			{/* Only an existing visual can be published — the new-visual route
			 *  has nothing to warn about. */}
			<PublishedEditGate />
			<EditorLayout />
		</>
	)
}
