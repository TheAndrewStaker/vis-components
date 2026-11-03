import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"

import { readPngDpi } from "../lib/pngDpi"
import { EMPTY_CHANNEL_CONFIGS } from "../lib/channelConfig"
import { SYSTEM_LIGHT_THEME } from "../lib/systemThemes"
import { labelsFromTheme } from "../lib/themeConfig"
import { emptyEncodings, type Visual } from "../lib/types"
import { installInMemoryLocalStorage } from "../../../testSupport/localStorageShim"
import { TestProvider, type TestStore } from "../../../testSupport/TestProvider"
import { embedInstancesAtom, visualsAtom } from "./atoms"
import { usePublishEmbed } from "./publishEmbed"

/** The linked picture is a best-effort second step of a publish: success
 *  adds `image` to the recorded urls; a failed capture or upload still
 *  records the HTML publish, without a stale `image` from before. */

// 1×1 transparent PNG.
const PNG =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="

const capture = vi.fn<(opts?: unknown) => Promise<string | null>>()
vi.mock("../lib/captureThumbnail", () => ({
	captureThumbnail: (opts?: unknown) => capture(opts),
}))
const publishHtml = vi.fn()
const publishImage = vi.fn<(id: string, png: File) => Promise<string>>()
vi.mock("../lib/embedPublish", async (importOriginal) => ({
	...(await importOriginal<typeof import("../lib/embedPublish")>()),
	collectEmbedFonts: async () => [],
	publishEmbedRequest: (...args: unknown[]) => publishHtml(...args),
	publishEmbedImageRequest: (id: string, png: File) => publishImage(id, png),
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
const IMAGE_URL = "https://x/embeds/p/image.png"

beforeEach(() => {
	installInMemoryLocalStorage()
	capture.mockReset()
	publishHtml.mockReset().mockResolvedValue(HTML_URLS)
	publishImage.mockReset().mockResolvedValue(IMAGE_URL)
})

const setup = () => {
	let store!: TestStore
	const wrapper = ({ children }: { children: ReactNode }) => (
		<TestProvider
			initializeState={(s) => {
				store = s
				s.set(visualsAtom, [VISUAL])
			}}
		>
			{children}
		</TestProvider>
	)
	const { result } = renderHook(() => usePublishEmbed(), { wrapper })
	const publish = () =>
		act(() => result.current({ visualId: "dv-1", versionId: null, split: false }))
	const recordedUrls = () =>
		Object.values(store.get(embedInstancesAtom)).find((i) => i.visualId === "dv-1")
			?.publishedUrls
	return { publish, recordedUrls }
}

describe("usePublishEmbed linked picture", () => {
	it("captures uncapped with network fonts and records the image url", async () => {
		capture.mockResolvedValue(PNG)
		const { publish, recordedUrls } = setup()
		await publish()
		expect(capture).toHaveBeenCalledWith({
			maxDim: 4096,
			scale: 2,
			allowNetwork: true,
			figure: true,
			opaqueBackground: true,
		})
		const [, png] = publishImage.mock.calls[0]
		expect(png.name).toBe("image.png")
		// Stamped with the dpi of the 2× capture so a consumer (PowerPoint, the
		// add-in) places it at its true size. No figure root in this DOM, so
		// the requested scale stands in for the achieved one.
		expect(readPngDpi(new Uint8Array(await png.arrayBuffer()))).toBeCloseTo(192, 0)
		expect(recordedUrls()).toEqual({ ...HTML_URLS, image: IMAGE_URL })
	})

	it("a republish whose upload fails records the HTML urls without the old image", async () => {
		capture.mockResolvedValue(PNG)
		const { publish, recordedUrls } = setup()
		await publish()
		expect(recordedUrls()?.image).toBe(IMAGE_URL)
		publishImage.mockRejectedValue(new Error("HTTP 500"))
		await publish()
		expect(recordedUrls()).toEqual(HTML_URLS)
	})

	it("a null capture still records the publish, with no upload, after retrying", async () => {
		capture.mockResolvedValue(null)
		const { publish, recordedUrls } = setup()
		await publish()
		expect(capture).toHaveBeenCalledTimes(6)
		expect(publishImage).not.toHaveBeenCalled()
		expect(recordedUrls()).toEqual(HTML_URLS)
	})

	it("retries a capture that declines mid-layout and keeps the picture", async () => {
		// A republish on save lands 800 ms after an edit, often before the
		// chart's layout settles; the first captures say "not yet".
		capture.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValue(PNG)
		const { publish, recordedUrls } = setup()
		await publish()
		expect(capture).toHaveBeenCalledTimes(3)
		expect(publishImage).toHaveBeenCalledTimes(1)
		expect(recordedUrls()).toEqual({ ...HTML_URLS, image: IMAGE_URL })
	})
})
