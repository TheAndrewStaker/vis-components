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

/** A PNG data URL whose header declares `width`×`height` (header only —
 *  `thumbnailIsStale` reads nothing past it). */
const png = (width: number, height: number): string => {
	const bytes = Buffer.alloc(32)
	Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0)
	bytes.writeUInt32BE(13, 8)
	bytes.write("IHDR", 12, "ascii")
	bytes.writeUInt32BE(width, 16)
	bytes.writeUInt32BE(height, 20)
	return `data:image/png;base64,${bytes.toString("base64")}`
}

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

	// Regression: an autosave used to snapshot the chart's one unmeasured
	// frame (solver with no room → canvas collapsed to its chrome) and store
	// a ~150px giant-text picture WITH a current stamp, so the stamp rules
	// alone never retired it.
	it("is stale when the picture is far too small to be a capture of the chart, whatever the stamp", () => {
		const fresh = { thumbnailAt: 10, updatedAt: 10 }
		expect(
			thumbnailIsStale(mkVisual({ ...fresh, thumbnail: png(120, 189) }), datasets)
		).toBe(true)
		// A real capture: the longest edge is the 480px ceiling.
		expect(
			thumbnailIsStale(mkVisual({ ...fresh, thumbnail: png(480, 348) }), datasets)
		).toBe(false)
		expect(
			thumbnailIsStale(mkVisual({ ...fresh, thumbnail: png(322, 480) }), datasets)
		).toBe(false)
	})

	it("judges a fixed canvas against its own size, so a small canvas is not re-rendered forever", () => {
		const fresh = { thumbnailAt: 10, updatedAt: 10 }
		const fixed = (width: number, height: number) => ({
			...EMPTY_CHANNEL_CONFIGS,
			canvasSize: { enabled: true, width, height },
		})
		// 200×150 canvas captured at 200×150 (minus nothing): a real capture.
		expect(
			thumbnailIsStale(
				mkVisual({ ...fresh, thumbnail: png(200, 150), channelConfigs: fixed(200, 150) }),
				datasets
			)
		).toBe(false)
		// A 1000×700 canvas whose picture is 150×100 was never that canvas.
		expect(
			thumbnailIsStale(
				mkVisual({ ...fresh, thumbnail: png(150, 100), channelConfigs: fixed(1000, 700) }),
				datasets
			)
		).toBe(true)
		// A disabled canvas size is a fluid chart.
		expect(
			thumbnailIsStale(
				mkVisual({
					...fresh,
					thumbnail: png(150, 100),
					channelConfigs: { ...EMPTY_CHANNEL_CONFIGS, canvasSize: { enabled: false, width: 100, height: 100 } },
				}),
				datasets
			)
		).toBe(true)
	})

	it("does not judge a picture it cannot read", () => {
		expect(
			thumbnailIsStale(
				mkVisual({ thumbnail: "https://example.test/t.png", thumbnailAt: 10, updatedAt: 10 }),
				datasets
			)
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
