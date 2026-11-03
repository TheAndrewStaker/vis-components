import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"

import { EMPTY_CHANNEL_CONFIGS } from "../lib/channelConfig"
import { SYSTEM_LIGHT_THEME } from "../lib/systemThemes"
import { labelsFromTheme } from "../lib/themeConfig"
import { type EmbedInstance, emptyEncodings, type Visual } from "../lib/types"
import { installInMemoryLocalStorage } from "../../../testSupport/localStorageShim"
import { TestProvider, type TestStore } from "../../../testSupport/TestProvider"
import { embedInstancesAtom, visualsAtom } from "./atoms"
import { republishStateAtom, useRepublishVisual } from "./republishVisual"

/** One-click Republish: every PUBLISHED pin of the visual goes out again
 *  with its own versionId and split choice, unpublished rows are left
 *  alone, overlapping calls coalesce into exactly one follow-up pass, and
 *  the first error of a pass is recorded until a later pass succeeds. */

// A 1×1 PNG: the picture step must succeed at once, or its mid-layout
// retries (publishEmbed.ts) would make every publish here take a second.
vi.mock("../lib/captureThumbnail", () => ({
	captureThumbnail: async () =>
		"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
}))
const publishHtml = vi.fn()
vi.mock("../lib/embedPublish", async (importOriginal) => ({
	...(await importOriginal<typeof import("../lib/embedPublish")>()),
	collectEmbedFonts: async () => [],
	publishEmbedRequest: (...args: unknown[]) => publishHtml(...args),
	publishEmbedImageRequest: async () => "unused",
}))

const VISUAL: Visual = {
	id: "dv-1",
	name: "Sales",
	folderId: null,
	datasetId: null,
	createdAtVersionId: null,
	fieldTypeOverrides: {},
	encodings: emptyEncodings(),
	channelConfigs: EMPTY_CHANNEL_CONFIGS,
	labelsConfig: labelsFromTheme(SYSTEM_LIGHT_THEME),
	thumbnail: null,
	createdAt: 1,
	updatedAt: 1,
}

const HTML_URLS = { full: "https://x/embeds/p/index.html" }

const instance = (extra: Partial<EmbedInstance>): EmbedInstance => ({
	id: "ei",
	visualId: "dv-1",
	versionId: null,
	createdAt: 1,
	lastExportedAt: 1,
	...extra,
})
/** "Latest" pin, published as one combined page. */
const LATEST = instance({
	id: "ei-latest",
	publishId: "pub-latest",
	publishedAt: 10,
	publishedParts: ["full"],
	publishedUrls: { full: "https://x/embeds/pub-latest/index.html" },
	publishedVersionId: null,
})
/** Pinned to v1, published split (chart + legend). */
const PINNED = instance({
	id: "ei-pinned",
	versionId: "v1",
	publishId: "pub-pinned",
	publishedAt: 10,
	publishedParts: ["chart", "legend"],
	publishedUrls: {
		chart: "https://x/embeds/pub-pinned/chart.html",
		legend: "https://x/embeds/pub-pinned/legend.html",
	},
	publishedVersionId: "v1",
})
/** A copied snippet that was never published. */
const COPIED = instance({ id: "ei-copied", versionId: "v2" })

beforeEach(() => {
	installInMemoryLocalStorage()
	publishHtml.mockReset().mockResolvedValue(HTML_URLS)
})

const setup = (instances: EmbedInstance[] = [LATEST, PINNED, COPIED]) => {
	let store!: TestStore
	const wrapper = ({ children }: { children: ReactNode }) => (
		<TestProvider
			initializeState={(s) => {
				store = s
				s.set(visualsAtom, [VISUAL])
				s.set(embedInstancesAtom, Object.fromEntries(instances.map((i) => [i.id, i])))
			}}
		>
			{children}
		</TestProvider>
	)
	const { result } = renderHook(() => useRepublishVisual(), { wrapper })
	const republish = (visualId = "dv-1") =>
		result.current(visualId, { includeZctaTopology: false })
	return {
		republish,
		state: () => store.get(republishStateAtom),
		instances: () => store.get(embedInstancesAtom),
	}
}

describe("useRepublishVisual", () => {
	it("republishes each published pin with its own publish id and split, skipping unpublished rows", async () => {
		const { republish, instances, state } = setup()
		let count = 0
		await act(async () => {
			count = await republish()
		})
		expect(count).toBe(2)
		expect(publishHtml.mock.calls.map(([id, parts]) => [id, parts])).toEqual([
			["pub-latest", ["full"]],
			["pub-pinned", ["chart", "legend"]],
		])
		// Recorded back onto the same rows — no new instance, the copied
		// snippet untouched.
		const after = instances()
		expect(Object.keys(after).sort()).toEqual(["ei-copied", "ei-latest", "ei-pinned"])
		expect(after["ei-latest"].publishedAt).toBeGreaterThan(10)
		expect(after["ei-pinned"].publishedAt).toBeGreaterThan(10)
		expect(after["ei-pinned"].versionId).toBe("v1")
		expect(after["ei-copied"].publishId).toBeUndefined()
		expect(state()).toMatchObject({ busy: false, pending: false, error: null })
		expect(state().lastAt).not.toBeNull()
	})

	it("is a no-op for a visual with no published pin, or an unknown one", async () => {
		const { republish, state } = setup([COPIED])
		let count = -1
		await act(async () => {
			count = await republish()
		})
		expect(count).toBe(0)
		await act(async () => {
			count = await republish("dv-missing")
		})
		expect(count).toBe(0)
		expect(publishHtml).not.toHaveBeenCalled()
		expect(state().lastAt).toBeNull()
	})

	it("coalesces calls that land mid-pass into exactly one follow-up pass", async () => {
		let release!: () => void
		const gate = new Promise<void>((r) => {
			release = r
		})
		publishHtml.mockImplementation(async () => {
			await gate
			return HTML_URLS
		})
		const { republish, state } = setup([LATEST, PINNED])

		let first!: Promise<number>
		let second = -1
		let third = -1
		await act(async () => {
			first = republish()
			expect(state().busy).toBe(true)
			// Two more while the pass is held: folded into ONE pending pass.
			second = await republish()
			third = await republish()
		})
		expect(second).toBe(0)
		expect(third).toBe(0)
		expect(state()).toMatchObject({ busy: true, pending: true })

		let total = 0
		await act(async () => {
			release()
			total = await first
		})
		// Two pins × (the running pass + one follow-up), never three passes.
		expect(publishHtml).toHaveBeenCalledTimes(4)
		expect(total).toBe(4)
		expect(state()).toMatchObject({ busy: false, pending: false, error: null })
	})

	it("records the first error of a pass and clears it on a later success", async () => {
		publishHtml.mockRejectedValueOnce(new Error("HTTP 500"))
		const { republish, state } = setup([LATEST, PINNED])
		await act(async () => {
			await republish()
		})
		// The failing pin aborted the pass: the second pin was never tried.
		expect(publishHtml).toHaveBeenCalledTimes(1)
		expect(state()).toMatchObject({ busy: false, error: "HTTP 500", lastAt: null })

		await act(async () => {
			await republish()
		})
		expect(publishHtml).toHaveBeenCalledTimes(3)
		expect(state().error).toBeNull()
		expect(state().lastAt).not.toBeNull()
	})
})
