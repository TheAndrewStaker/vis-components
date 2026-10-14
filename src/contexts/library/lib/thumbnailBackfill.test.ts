import { afterEach, describe, expect, it, vi } from "vitest"

import { EMPTY_CHANNEL_CONFIGS } from "../../chartBuilder/lib/channelConfig"
import { DEFAULT_LABELS_CONFIG } from "../../chartBuilder/lib/labelsConfig"
import * as storage from "../../chartBuilder/lib/storage"
import type { Dataset, Visual } from "../../chartBuilder/lib/types"
import { emptyEncodings } from "../../chartBuilder/lib/types"
import {
	backfillCandidates,
	runThumbnailBackfill,
	staleThumbnailCandidates,
	thumbnailIsStale,
	withFreshThumbnail,
} from "./thumbnailBackfill"

const THUMB = "data:image/png;base64,x"

const mkVisual = (overrides: Partial<Visual> = {}): Visual => ({
	id: "vis-1",
	name: "Kinds of Cats",
	folderId: null,
	datasetId: "ds-cats",
	createdAtVersionId: "dv-1",
	fieldTypeOverrides: {},
	encodings: emptyEncodings(),
	channelConfigs: EMPTY_CHANNEL_CONFIGS,
	labelsConfig: DEFAULT_LABELS_CONFIG,
	thumbnail: null,
	createdAt: 1,
	updatedAt: 2,
	...overrides,
})

const mkDataset = (id: string, latestCreatedAt = 0): Dataset => ({
	id,
	name: id,
	fields: [{ name: "a", inferredType: "quantitative" }],
	versions: [
		{ id: "v1", filename: `${id}.csv`, rows: [{ a: "1" }], createdAt: 0 },
		{
			id: "v2",
			filename: `${id}.csv`,
			rows: [{ a: "2" }],
			createdAt: latestCreatedAt,
		},
	],
	latestVersionId: "v2",
	createdAt: 0,
})

const datasets = { "ds-cats": mkDataset("ds-cats") }

describe("backfillCandidates", () => {
	it("selects only thumbnail-less visuals whose dataset still exists", () => {
		const missing = mkVisual({ id: "missing" })
		const hasThumb = mkVisual({ id: "has-thumb", thumbnail: THUMB })
		const noDataset = mkVisual({ id: "no-dataset", datasetId: null })
		const deletedDataset = mkVisual({
			id: "deleted-dataset",
			datasetId: "ds-gone",
		})
		expect(
			backfillCandidates(
				[missing, hasThumb, noDataset, deletedDataset],
				datasets
			)
		).toEqual([missing])
	})
})

describe("thumbnailIsStale", () => {
	it("is stale with no thumbnail", () => {
		expect(thumbnailIsStale(mkVisual(), datasets)).toBe(true)
	})

	it("is stale with a thumbnail but no stamp (saved before stamps existed)", () => {
		expect(thumbnailIsStale(mkVisual({ thumbnail: THUMB }), datasets)).toBe(
			true
		)
	})

	it("is fresh when the stamp matches the last save and postdates the data", () => {
		expect(
			thumbnailIsStale(
				mkVisual({ thumbnail: THUMB, thumbnailAt: 2, updatedAt: 2 }),
				datasets
			)
		).toBe(false)
	})

	it("is stale when the stamp fell behind the last save (capture came back null)", () => {
		expect(
			thumbnailIsStale(
				mkVisual({ thumbnail: THUMB, thumbnailAt: 1, updatedAt: 2 }),
				datasets
			)
		).toBe(true)
	})

	it("is stale when the data set's latest version postdates the stamp", () => {
		const newer = { "ds-cats": mkDataset("ds-cats", 50) }
		expect(
			thumbnailIsStale(
				mkVisual({ thumbnail: THUMB, thumbnailAt: 10, updatedAt: 10 }),
				newer
			)
		).toBe(true)
	})

	it("is never stale without a renderable data set", () => {
		expect(thumbnailIsStale(mkVisual({ datasetId: null }), datasets)).toBe(
			false
		)
		expect(
			thumbnailIsStale(mkVisual({ datasetId: "ds-gone" }), datasets)
		).toBe(false)
	})
})

describe("staleThumbnailCandidates", () => {
	it("lists missing previews first, then stale ones most recently edited first", () => {
		const fresh = mkVisual({
			id: "fresh",
			thumbnail: THUMB,
			thumbnailAt: 9,
			updatedAt: 9,
		})
		const staleOld = mkVisual({
			id: "stale-old",
			thumbnail: THUMB,
			thumbnailAt: 1,
			updatedAt: 5,
		})
		const staleNew = mkVisual({
			id: "stale-new",
			thumbnail: THUMB,
			thumbnailAt: 1,
			updatedAt: 8,
		})
		const missing = mkVisual({ id: "missing", updatedAt: 3 })
		expect(
			staleThumbnailCandidates(
				[fresh, staleOld, missing, staleNew],
				datasets
			).map((v) => v.id)
		).toEqual(["missing", "stale-new", "stale-old"])
	})
})

describe("withFreshThumbnail", () => {
	it("stamps the capture time without touching updatedAt", () => {
		const next = withFreshThumbnail(mkVisual({ updatedAt: 7 }), THUMB, 99)
		expect(next.thumbnail).toBe(THUMB)
		expect(next.thumbnailAt).toBe(99)
		expect(next.updatedAt).toBe(7)
	})
})

describe("runThumbnailBackfill abort", () => {
	const callbacks = { onProgress: () => {}, onCaptured: vi.fn() }
	const tick = () =>
		new Promise<void>((resolve) => {
			setTimeout(resolve, 0)
		})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("resolves empty without booting an embed when already aborted", async () => {
		const controller = new AbortController()
		controller.abort()
		const result = await runThumbnailBackfill([{ id: "vis-1" }], callbacks, {
			signal: controller.signal,
		})
		expect(result).toEqual({ regenerated: 0, failed: 0 })
		expect(document.querySelector("iframe")).toBeNull()
	})

	it("tears the embed down and restores the draft snapshot inside abort()", async () => {
		const restore = vi.spyOn(storage, "restoreDraftState")
		const controller = new AbortController()
		const run = runThumbnailBackfill([{ id: "vis-1" }], callbacks, {
			signal: controller.signal,
		})
		await tick()
		expect(document.querySelector("iframe")).not.toBeNull()
		expect(restore).not.toHaveBeenCalled()

		controller.abort()
		// Both synchronous: the library page aborts from its unmount cleanup,
		// and the editor mounting in that same commit writes its own draft.
		expect(document.querySelector("iframe")).toBeNull()
		expect(restore).toHaveBeenCalledTimes(1)

		// The aborted capture counts as neither a success nor a failure, and
		// the restore isn't repeated when the run winds down.
		expect(await run).toEqual({ regenerated: 0, failed: 0 })
		expect(restore).toHaveBeenCalledTimes(1)
		expect(callbacks.onCaptured).not.toHaveBeenCalled()
	})
})
