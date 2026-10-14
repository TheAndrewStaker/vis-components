import { useEffect, useRef, useState } from "react"
import { useAtomValue, useSetAtom } from "jotai"
import { isEphemeralSeedId } from "../../chartBuilder/lib/exampleOverlay"
import type { DatasetLike } from "../../chartBuilder/lib/datasetMeta"
import type { Visual } from "../../chartBuilder/lib/types"
import {
	thumbnailsHydratedAtom,
	visualsAtom,
} from "../../chartBuilder/store/atoms"
import {
	runThumbnailBackfill,
	staleThumbnailCandidates,
	withFreshThumbnail,
} from "../lib/thumbnailBackfill"

/** One attempt per visual per session — per (save, data version), so an
 *  edit or a new upload mid-session re-queues it — whether or not the
 *  capture succeeded. A visual that can't render (and so never earns a
 *  fresh stamp) would otherwise burn its full timeout on every visit. */
const attemptKey = (
	visual: Visual,
	datasets: Record<string, DatasetLike>
): string =>
	`${visual.id}:${visual.updatedAt}:${
		visual.datasetId ? (datasets[visual.datasetId]?.latestVersionId ?? "") : ""
	}`

const nextCandidate = (
	visible: Visual[],
	datasets: Record<string, DatasetLike>,
	attempted: Set<string>
): Visual | undefined =>
	staleThumbnailCandidates(visible, datasets).find(
		(v) =>
			// Session-only example visuals carry their picture inline and can't
			// persist a stamp, so they'd read as "never verified" every boot.
			!isEphemeralSeedId(v.id) && !attempted.has(attemptKey(v, datasets))
	)

/**
 * Keeps the previews of the visuals currently listed in the library fresh
 * without the user asking: whenever the listing changes (a folder is
 * opened, a filter or search narrows it, a visual lands in it), every
 * listed visual whose preview is missing or provably stale (see
 * `thumbnailIsStale`) is re-rendered offscreen, one at a time, and its new
 * picture stored. Returns the id of the visual being re-rendered right now
 * so the card can show it.
 *
 * Waits for the thumbnail side-table to merge in (`thumbnailsHydratedAtom`)
 * — before that every local-mode visual reads as preview-less. A listing
 * change while a run is in flight doesn't restart it: the loop re-reads the
 * latest listing before each capture, so typing in the search box never
 * throws away a half-finished render. Unmounting aborts the run at once.
 */
export const useAutoRefreshThumbnails = (
	visible: Visual[],
	datasets: Record<string, DatasetLike>
): string | null => {
	const hydrated = useAtomValue(thumbnailsHydratedAtom)
	const setVisuals = useSetAtom(visualsAtom)
	const [refreshingId, setRefreshingId] = useState<string | null>(null)
	const attemptedRef = useRef(new Set<string>())
	const latestRef = useRef({ visible, datasets })
	const runningRef = useRef(false)
	const abortRef = useRef<AbortController | null>(null)

	useEffect(() => {
		latestRef.current = { visible, datasets }
	})

	// What's stale in the listing, as a key: the effect below runs when it
	// changes and is a no-op while a loop is already draining it. Keyed by
	// attempt (id + save + data version) so an edit to a visual the loop
	// already tried re-queues it. Already-attempted visuals are NOT filtered
	// out here (that would read the ref during render); the loop skips them,
	// and a key made only of attempted visuals simply starts a loop that
	// finds nothing to do.
	const pendingKey = hydrated
		? staleThumbnailCandidates(visible, datasets)
				.filter((v) => !isEphemeralSeedId(v.id))
				.map((v) => attemptKey(v, datasets))
				.join("|")
		: ""

	useEffect(() => {
		if (pendingKey === "" || runningRef.current) return
		const controller = new AbortController()
		abortRef.current = controller
		runningRef.current = true
		void (async () => {
			try {
				while (!controller.signal.aborted) {
					const latest = latestRef.current
					const next = nextCandidate(
						latest.visible,
						latest.datasets,
						attemptedRef.current
					)
					if (!next) break
					attemptedRef.current.add(attemptKey(next, latest.datasets))
					setRefreshingId(next.id)
					await runThumbnailBackfill(
						[{ id: next.id }],
						{
							onProgress: () => {},
							onCaptured: (id, thumbnail) => {
								// Functional update over the FULL list (trash included)
								// — see the visualsAtom / liveVisualsAtom split.
								setVisuals((prev) =>
									prev.map((v) =>
										v.id === id ? withFreshThumbnail(v, thumbnail) : v
									)
								)
							},
						},
						{ signal: controller.signal }
					)
				}
			} finally {
				runningRef.current = false
				if (!controller.signal.aborted) setRefreshingId(null)
			}
		})()
	}, [pendingKey, setVisuals])

	useEffect(() => () => abortRef.current?.abort(), [])

	return refreshingId
}
