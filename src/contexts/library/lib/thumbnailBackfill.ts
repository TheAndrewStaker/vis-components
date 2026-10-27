/** Offscreen thumbnail (re)generation for the library page.
 *
 * Three callers share it: the library's automatic refresh (every listed
 * visual whose preview is missing or provably stale — see
 * `thumbnailIsStale`), the header's bulk "Regenerate N previews" button
 * (missing ones only), and the per-card hover button (forces a fresh capture
 * of one visual). Each candidate is booted in a hidden same-origin
 * `/embed/<id>?part=chart` iframe (the same mechanism the Export modal's
 * preview uses), polled until its serialized chart SVG *stabilizes* (not just
 * mounts — see STABLE_POLLS), captured via the shared thumbnail pipeline,
 * and handed back to the caller to store.
 *
 * Runs are serialized through a module-level queue, and strictly one visual
 * at a time within a run: the capture selectors are per-document so parallel
 * iframes would work, but each embed boots a full React + Jotai app and
 * re-renders the chart — N at once would peg the main thread, and the
 * automatic refresh is background work the user shouldn't feel.
 *
 * The embed page persists whatever visual it loads over the draft-editor
 * localStorage keys, so every run brackets itself with a draft-state
 * snapshot/restore — without it, the user's unsaved editor draft would be
 * silently replaced by the last visual rendered. An aborted run restores
 * SYNCHRONOUSLY inside `abort()` (see `runSequentially`). */

import {
	MAX_THUMBNAIL_DIM,
	STABLE_POLLS,
	chartLayoutReady,
	serializeChartSvg,
	thumbnailFromChartSvgText,
} from "../../chartBuilder/lib/captureThumbnail"
import { pngDataUrlDimensions } from "../../chartBuilder/lib/pngDimensions"
import {
	restoreDraftState,
	snapshotDraftState,
} from "../../chartBuilder/lib/storage"
import type { DatasetLike } from "../../chartBuilder/lib/datasetMeta"
import type { Visual } from "../../chartBuilder/lib/types"

export type BackfillProgress = { done: number; total: number }
export type BackfillResult = { regenerated: number; failed: number }
export type BackfillRunOptions = {
	/** Aborting stops the run after at most one poll interval: the current
	 *  iframe is torn down and the draft-state snapshot restored at once. */
	signal?: AbortSignal
}

const latestVersionCreatedAt = (dataset: DatasetLike): number | undefined =>
	dataset.versions.find((v) => v.id === dataset.latestVersionId)?.createdAt

/** The data set this visual would render from, if it can be rendered
 *  offscreen at all. A visual whose data set was deleted can never produce
 *  a chart — including it would just burn the full capture timeout. */
const renderSource = (
	visual: Visual,
	datasets: Record<string, DatasetLike>
): DatasetLike | undefined =>
	visual.datasetId === null ? undefined : datasets[visual.datasetId]

/** A stored picture this much smaller than a capture of the chart could
 *  be is a capture of something else. Ratio, not pixels: a legitimately
 *  small fixed canvas captures small (margins come off its edges too),
 *  while a collapsed frame is a fraction of ANY real chart. */
const TRUNCATED_CAPTURE_RATIO = 0.6

/** Whether the stored picture is far too small to be a capture of this
 *  chart. Before captures refused it (see `UNMEASURED_ATTR` in
 *  captureThumbnail.ts), an autosave could snapshot the plot SVG in the one
 *  frame before its container was measured: the solver had no room, the
 *  canvas collapsed to its chrome, and a ~150px box of giant clipped text
 *  was stored WITH a current stamp. The capture never scales up, so such a
 *  picture is a fraction of the `MAX_THUMBNAIL_DIM` longest edge every
 *  real capture has — or, for a fixed canvas smaller than that, of the
 *  canvas's own longest edge. Undecodable pictures (a URL, a foreign
 *  format) are not judged: they are whatever the store holds. */
const thumbnailLooksTruncated = (visual: Visual): boolean => {
	if (!visual.thumbnail) return false
	const dims = pngDataUrlDimensions(visual.thumbnail)
	if (!dims) return false
	const canvas = visual.channelConfigs?.canvasSize
	const expected =
		canvas?.enabled && canvas.width > 0 && canvas.height > 0
			? Math.min(MAX_THUMBNAIL_DIM, Math.max(canvas.width, canvas.height))
			: MAX_THUMBNAIL_DIM
	return (
		Math.max(dims.width, dims.height) < expected * TRUNCATED_CAPTURE_RATIO
	)
}

/** Whether `visual`'s preview is missing, or provably older than what the
 *  visual draws today. The stamp (`thumbnailAt`) moves only with a capture
 *  that produced a picture, so three situations read as stale:
 *   - stamp behind `updatedAt` — the save's capture came back null (chart
 *     mid-render, rows still loading) and the old picture was kept;
 *   - stamp behind the data set's latest version — new data was appended
 *     and the visual draws it, but no capture has seen it;
 *   - no stamp at all — saved before stamps existed, never verified.
 *  A fourth reads as stale whatever the stamp says: a picture far too small
 *  to be a capture of the chart (`thumbnailLooksTruncated`), which an older
 *  autosave could store from the chart's unmeasured first frame. The
 *  offscreen re-render replaces it with a full-size one, and the stamp
 *  moves. A visual without a renderable data set is never stale: nothing
 *  could replace its picture anyway. */
export const thumbnailIsStale = (
	visual: Visual,
	datasets: Record<string, DatasetLike>
): boolean => {
	const dataset = renderSource(visual, datasets)
	if (!dataset) return false
	if (!visual.thumbnail) return true
	const stamp = visual.thumbnailAt
	if (stamp === undefined || stamp < visual.updatedAt) return true
	const dataAt = latestVersionCreatedAt(dataset)
	if (dataAt !== undefined && stamp < dataAt) return true
	return thumbnailLooksTruncated(visual)
}

/** Visuals the bulk header button acts on: no thumbnail at all, and a data
 *  set that still exists to render from. */
export const backfillCandidates = (
	visuals: Visual[],
	datasets: Record<string, DatasetLike>
): Visual[] =>
	visuals.filter((v) => !v.thumbnail && renderSource(v, datasets) !== undefined)

/** Visuals the automatic refresh acts on, in the order it takes them:
 *  previews that are missing outright first (a blank card is worse than a
 *  dated one), then the stale ones, most recently edited first. */
export const staleThumbnailCandidates = (
	visuals: Visual[],
	datasets: Record<string, DatasetLike>
): Visual[] =>
	visuals
		.filter((v) => thumbnailIsStale(v, datasets))
		.sort((a, b) => {
			const aMissing = a.thumbnail ? 1 : 0
			const bMissing = b.thumbnail ? 1 : 0
			return aMissing - bMissing || b.updatedAt - a.updatedAt
		})

/** The visual with a freshly captured preview. `updatedAt` stays put —
 *  regenerating a preview isn't an edit — but the stamp moves, which is
 *  what retires the visual from `thumbnailIsStale`. */
export const withFreshThumbnail = (
	visual: Visual,
	thumbnail: string,
	now = Date.now()
): Visual => ({ ...visual, thumbnail, thumbnailAt: now })

/** Matches the Export modal's embed-boot allowance: cold-start hydration +
 *  IndexedDB dataset load + ResizeObserver-driven mount can take seconds. */
const CAPTURE_TIMEOUT_MS = 15_000
const POLL_INTERVAL_MS = 150

/** Offscreen render size. The capture downscales to a 480px longest edge, so
 *  this only sets the thumbnail's aspect and detail level; 4:3-ish matches
 *  the library card boxes. */
const RENDER_WIDTH = 800
const RENDER_HEIGHT = 600

/** Sleep that also wakes on abort, so an aborted poll loop exits now rather
 *  than after its interval. */
const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
	new Promise((resolve) => {
		let timer = 0
		const done = () => {
			window.clearTimeout(timer)
			signal?.removeEventListener("abort", done)
			resolve()
		}
		timer = window.setTimeout(done, ms)
		signal?.addEventListener("abort", done, { once: true })
	})

/** Boot one visual's embed in a hidden iframe and capture its chart as a PNG
 *  data URL. Resolves `null` on timeout, abort or capture failure; never
 *  throws. */
const captureVisualOffscreen = async (
	visualId: string,
	signal?: AbortSignal
): Promise<string | null> => {
	if (signal?.aborted) return null
	const iframe = document.createElement("iframe")
	// table=off: a preview is the chart alone, never the data table under it.
	iframe.src = `${window.location.origin}/embed/${visualId}?part=chart&table=off`
	// Offscreen but NOT display:none / visibility:hidden — the chart sizes
	// itself with ResizeObserver and needs real layout to mount at all.
	iframe.style.position = "fixed"
	iframe.style.left = "-10000px"
	iframe.style.top = "0"
	iframe.style.width = `${RENDER_WIDTH}px`
	iframe.style.height = `${RENDER_HEIGHT}px`
	iframe.style.border = "0"
	iframe.style.pointerEvents = "none"
	iframe.setAttribute("aria-hidden", "true")
	iframe.tabIndex = -1
	document.body.append(iframe)
	// Tear the embed down inside abort() itself, not a poll later: once the
	// run has restored the draft-state keys (its own abort listener runs
	// first), a still-live embed would persist over them again.
	const onAbort = () => iframe.remove()
	signal?.addEventListener("abort", onAbort, { once: true })
	try {
		const deadline = Date.now() + CAPTURE_TIMEOUT_MS
		let lastSvgText: string | null = null
		let matchingPolls = 0
		while (Date.now() < deadline && !signal?.aborted) {
			const doc = iframe.contentDocument
			// Also hold off while webfonts are still streaming in — tick-label
			// margins are measured from live font metrics, so a fallback-font
			// layout serializes cleanly but renders with the wrong spacing.
			const fontsSettled = !doc?.fonts || doc.fonts.status !== "loading"
			const svgText =
				doc && fontsSettled && chartLayoutReady(doc)
					? serializeChartSvg(doc)
					: null
			if (svgText !== null && svgText === lastSvgText) {
				matchingPolls++
				if (matchingPolls >= STABLE_POLLS) {
					const thumbnail = await thumbnailFromChartSvgText(svgText, {
						allowNetwork: true,
					})
					if (thumbnail) return thumbnail
					// Rasterization failed on a stable frame — keep polling; a
					// later pass may produce loadable markup.
					matchingPolls = 0
				}
			} else {
				matchingPolls = 0
			}
			lastSvgText = svgText
			await sleep(POLL_INTERVAL_MS, signal)
		}
		if (signal?.aborted) return null
		// Deadline hit without stability — the chart may be animating or the
		// machine is slow. A last-known frame beats "No preview".
		return lastSvgText
			? await thumbnailFromChartSvgText(lastSvgText, { allowNetwork: true })
			: null
	} catch {
		return null
	} finally {
		signal?.removeEventListener("abort", onAbort)
		iframe.remove()
	}
}

const runSequentially = async (
	candidates: Array<Pick<Visual, "id">>,
	callbacks: {
		onProgress: (progress: BackfillProgress) => void
		onCaptured: (visualId: string, thumbnail: string) => void
	},
	signal?: AbortSignal
): Promise<BackfillResult> => {
	if (signal?.aborted) return { regenerated: 0, failed: 0 }
	const draftSnapshot = snapshotDraftState()
	let restored = false
	const restore = () => {
		if (restored) return
		restored = true
		restoreDraftState(draftSnapshot)
	}
	// Restore synchronously inside abort(): the library page aborts from its
	// unmount cleanup, and the editor mounting in that same commit is about
	// to write its own draft keys — a restore deferred to the async `finally`
	// below would land on top of them.
	signal?.addEventListener("abort", restore, { once: true })
	let regenerated = 0
	let failed = 0
	try {
		for (const [index, visual] of candidates.entries()) {
			if (signal?.aborted) break
			callbacks.onProgress({ done: index, total: candidates.length })
			const thumbnail = await captureVisualOffscreen(visual.id, signal)
			if (thumbnail) {
				callbacks.onCaptured(visual.id, thumbnail)
				regenerated++
			} else if (!signal?.aborted) {
				failed++
			}
		}
		callbacks.onProgress({
			done: candidates.length,
			total: candidates.length,
		})
	} finally {
		signal?.removeEventListener("abort", restore)
		restore()
	}
	return { regenerated, failed }
}

/** Runs queue behind one another so two callers (the automatic refresh and
 *  a hover button, say) never boot embeds side by side. */
let queue: Promise<unknown> = Promise.resolve()

/** Regenerate thumbnails for `candidates`, one at a time. `onCaptured` fires
 *  per success so each thumbnail persists as it lands (an interrupted run
 *  keeps its progress); `onProgress` drives the button label. Only ids are
 *  read, so single-visual callers don't need to hold a full Visual. Never
 *  rejects; an aborted run resolves with what it finished. */
export const runThumbnailBackfill = (
	candidates: Array<Pick<Visual, "id">>,
	callbacks: {
		onProgress: (progress: BackfillProgress) => void
		onCaptured: (visualId: string, thumbnail: string) => void
	},
	options: BackfillRunOptions = {}
): Promise<BackfillResult> => {
	const run = queue.then(() =>
		runSequentially(candidates, callbacks, options.signal)
	)
	// A rejected link would otherwise poison every later run.
	queue = run.catch(() => undefined)
	return run
}
