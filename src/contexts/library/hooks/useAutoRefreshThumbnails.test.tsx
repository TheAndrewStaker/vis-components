import { act, renderHook, waitFor } from "@testing-library/react"
import { type ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { EMPTY_CHANNEL_CONFIGS } from "../../chartBuilder/lib/channelConfig"
import { DEFAULT_LABELS_CONFIG } from "../../chartBuilder/lib/labelsConfig"
import type { DatasetLike } from "../../chartBuilder/lib/datasetMeta"
import type { Visual } from "../../chartBuilder/lib/types"
import { emptyEncodings } from "../../chartBuilder/lib/types"
import { visualsAtom } from "../../chartBuilder/store/atoms"
import { TestProvider, type TestStore } from "../../../testSupport/TestProvider"
import * as backfill from "../lib/thumbnailBackfill"
import { useAutoRefreshThumbnails } from "./useAutoRefreshThumbnails"

const THUMB = "data:image/png;base64,x"

const mkVisual = (overrides: Partial<Visual> = {}): Visual => ({
	id: "vis-1",
	name: "Kinds of Cats",
	folderId: null,
	datasetId: "ds-cats",
	createdAtVersionId: "v1",
	fieldTypeOverrides: {},
	encodings: emptyEncodings(),
	channelConfigs: EMPTY_CHANNEL_CONFIGS,
	labelsConfig: DEFAULT_LABELS_CONFIG,
	thumbnail: THUMB,
	thumbnailAt: 5,
	createdAt: 1,
	updatedAt: 5,
	...overrides,
})

const datasets: Record<string, DatasetLike> = {
	"ds-cats": {
		id: "ds-cats",
		name: "cats",
		fields: [{ name: "a", inferredType: "quantitative" }],
		versions: [{ id: "v1", filename: "cats.csv", createdAt: 0 }],
		latestVersionId: "v1",
		createdAt: 0,
	},
}

const render = (visuals: Visual[]) => {
	const captured: { store?: TestStore } = {}
	const hook = renderHook(
		({ visible }: { visible: Visual[] }) =>
			useAutoRefreshThumbnails(visible, datasets),
		{
			initialProps: { visible: visuals },
			wrapper: ({ children }: { children: ReactNode }) => (
				<TestProvider
					initializeState={(s) => {
						captured.store = s
						s.set(visualsAtom, visuals)
					}}
				>
					{children}
				</TestProvider>
			),
		}
	)
	return { ...hook, store: captured.store! }
}

describe("useAutoRefreshThumbnails", () => {
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("re-renders only the stale listed visuals, once, and stamps the result", async () => {
		const run = vi
			.spyOn(backfill, "runThumbnailBackfill")
			.mockImplementation(async (candidates, callbacks) => {
				callbacks.onCaptured(candidates[0]!.id, "data:image/png;base64,new")
				return { regenerated: 1, failed: 0 }
			})
		const fresh = mkVisual({ id: "fresh" })
		const stale = mkVisual({ id: "stale", thumbnailAt: 1 })
		const { result, store, rerender } = render([fresh, stale])

		await waitFor(() => {
			expect(run).toHaveBeenCalledTimes(1)
		})
		expect(run.mock.calls[0]![0]).toEqual([{ id: "stale" }])
		await waitFor(() => {
			expect(result.current).toBeNull()
		})
		const saved = store.get(visualsAtom).find((v) => v.id === "stale")!
		expect(saved.thumbnail).toBe("data:image/png;base64,new")
		expect(saved.thumbnailAt).toBeGreaterThanOrEqual(saved.updatedAt)

		// The same listing again (a filter toggled back and forth) does nothing.
		act(() => {
			rerender({ visible: [fresh, stale] })
		})
		await act(async () => {
			await Promise.resolve()
		})
		expect(run).toHaveBeenCalledTimes(1)
	})

	it("doesn't retry a visual that failed to render until it changes", async () => {
		const run = vi
			.spyOn(backfill, "runThumbnailBackfill")
			.mockResolvedValue({ regenerated: 0, failed: 1 })
		const stale = mkVisual({ id: "stale", thumbnail: null })
		const { rerender } = render([stale])
		await waitFor(() => {
			expect(run).toHaveBeenCalledTimes(1)
		})

		act(() => {
			rerender({ visible: [stale] })
		})
		await act(async () => {
			await Promise.resolve()
		})
		expect(run).toHaveBeenCalledTimes(1)

		// An edit (new updatedAt) re-queues it.
		act(() => {
			rerender({ visible: [{ ...stale, updatedAt: 6 }] })
		})
		await waitFor(() => {
			expect(run).toHaveBeenCalledTimes(2)
		})
	})

	it("aborts the run when the page unmounts", async () => {
		let seen: AbortSignal | undefined
		vi.spyOn(backfill, "runThumbnailBackfill").mockImplementation(
			(_candidates, _callbacks, options) =>
				new Promise((resolve) => {
					seen = options?.signal
					options?.signal?.addEventListener("abort", () => {
						resolve({ regenerated: 0, failed: 0 })
					})
				})
		)
		const { unmount } = render([mkVisual({ id: "stale", thumbnail: null })])
		await waitFor(() => {
			expect(seen).toBeDefined()
		})
		unmount()
		expect(seen!.aborted).toBe(true)
	})
})
