/** Publish / unpublish actions for published embeds (the 0016 contract).
 *
 *  `usePublishEmbed` assembles the whole payload from the store — the SAVED
 *  visual, the one dataset version the embed will draw, the theme it renders
 *  under, and the user-font faces the on-screen chart uses — PUTs it, and
 *  records the returned public URLs on the (visualId, versionId) embed
 *  instance. Republishing the same instance reuses its publishId, so the
 *  public URLs never change once copied. */

import { useCallback } from "react"
import { useAtomCallback } from "jotai/utils"

import {
	clearEmbedPublish,
	recordEmbedPublish,
} from "../lib/embedInstances"
import {
	buildEmbedDataset,
	collectEmbedFonts,
	newPublishId,
	publishEmbedImageRequest,
	publishEmbedRequest,
	unpublishEmbedRequest,
	type EmbedPublishUrls,
} from "../lib/embedPublish"
import { captureThumbnail } from "../lib/captureThumbnail"
import { stampPngDpi } from "../lib/pngDpi"
import { pngFileFromDataUrl } from "../lib/storage/thumbnailUpload"
import { loadZctaTopology } from "../lib/geo/zctaTopology"
import { getStorageAdapter } from "../lib/storage/registry"
import type { Dataset, SavedTheme } from "../lib/types"
import { isTemplate } from "../lib/visualTrash"
import type { EmbedPart } from "../../../embedRuntime/payload"
import {
	datasetIndexAtom,
	embedInstancesAtom,
	publishedEditAckAtom,
	themeAtom,
	themesAtom,
	visualsAtom,
} from "./atoms"

export type PublishEmbedArgs = {
	visualId: string
	/** Pinned dataset version, or null for "latest at publish time". */
	versionId: string | null
	/** Publish the chart/legend split files instead of the combined page. */
	split: boolean
	/** Inline the ZCTA boundary topology (ZIP-level maps). The caller decides
	 *  — it sits in the editor, where the effective geography level is a
	 *  hook over the live atoms. */
	includeZctaTopology?: boolean
}

export const usePublishEmbed = () =>
	useAtomCallback(
		useCallback(
			async (get, set, args: PublishEmbedArgs): Promise<EmbedPublishUrls> => {
				const visual = get(visualsAtom).find((v) => v.id === args.visualId)
				if (!visual) {
					throw new Error("Save the visualization before publishing.")
				}
				if (isTemplate(visual)) {
					throw new Error(
						"Templates can't be published. Start a visualization from it first."
					)
				}

				// The one dataset version the embed draws — the payload carries it
				// whole, because a published embed fetches nothing.
				let dataset: Dataset | null = null
				let publishedVersionId: string | null = null
				if (visual.datasetId) {
					const meta = get(datasetIndexAtom)[visual.datasetId]
					if (!meta) {
						throw new Error("The data set could not be loaded. Try again.")
					}
					const versionId = args.versionId ?? meta.latestVersionId
					publishedVersionId = versionId
					const adapter = getStorageAdapter()
					let rows = await adapter.loadDatasetVersion(visual.datasetId, versionId)
					if (rows === null) {
						// Pre-split stores have no per-version body — fall back to the
						// whole dataset, same as the render path does.
						const whole = await adapter.loadDataset(visual.datasetId)
						rows = whole?.versions.find((v) => v.id === versionId)?.rows ?? null
					}
					if (rows === null) {
						throw new Error("The data version could not be loaded. Try again.")
					}
					dataset = buildEmbedDataset(meta, versionId, rows)
					if (dataset === null) {
						throw new Error("The pinned version no longer exists.")
					}
				}

				// The theme the embed renders under: the visual's saved theme when it
				// still exists, else a snapshot of the live editor theme — the embed
				// viewer has no theme library to fall back to.
				const themes = get(themesAtom)
				const saved = visual.themeId
					? (themes.find((t) => t.id === visual.themeId) ?? null)
					: null
				const theme: SavedTheme = saved ?? {
					id: "embedded-theme",
					name: "Embedded theme",
					isSystem: false,
					...get(themeAtom),
				}

				const fonts = await collectEmbedFonts()

				// ZIP-level maps carry their boundary topology — the runtime has no
				// fetch path for it. Failure to load it degrades exactly like the
				// editor does (the level reports unavailable), so it never blocks.
				const zctaTopology = args.includeZctaTopology
					? await loadZctaTopology().catch(() => undefined)
					: undefined

				const instances = get(embedInstancesAtom)
				const existing = Object.values(instances).find(
					(i) => i.visualId === args.visualId && i.versionId === args.versionId
				)
				const publishId = existing?.publishId ?? newPublishId()
				const parts: EmbedPart[] = args.split ? ["chart", "legend"] : ["full"]

				const htmlUrls = await publishEmbedRequest(publishId, parts, {
					visual,
					dataset,
					theme,
					fonts,
					...(zctaTopology !== undefined ? { zctaTopology } : {}),
				})

				// The linked picture rides a second request (the server 404s it
				// until the HTML publish exists). Best-effort: the embed is already
				// live, so a failed capture or upload records the publish without
				// an `image` url (the Export tab offers a retry) rather than failing
				// it. The urls object is built fresh, so a stale `image` from an
				// earlier publish never survives a failed picture step.
				const image = await publishEmbedImage(publishId)
				const urls: EmbedPublishUrls = {
					...htmlUrls,
					...(image !== null ? { image } : {}),
				}

				set(embedInstancesAtom, (prev) =>
					recordEmbedPublish(prev, args.visualId, args.versionId, {
						publishId,
						publishedAt: Date.now(),
						publishedParts: parts,
						publishedUrls: urls,
						publishedVersionId,
					})
				)
				// The visual becomes "published" the instant this lands, which
				// would otherwise trip PublishedEditGate's warning on the user's
				// own deliberate publish. Pre-acknowledge it.
				set(publishedEditAckAtom, args.visualId)
				return urls
			},
			[]
		)
	)

/** Capture the on-screen figure (chart + legend) and upload it as the
 *  embed's picture. Rasterized at 2 raster px per CSS px so it stays crisp
 *  projected, and stamped with the matching dpi (`pHYs`, 96 × the scale
 *  actually achieved under the cap) so a consumer places it at its true
 *  size — 12pt in the app is 12pt on the slide. Resolves to its public url,
 *  or null on any failure. */
const EMBED_IMAGE_MAX_DIM = 4096
const EMBED_IMAGE_SCALE = 2
const CSS_DPI = 96
const publishEmbedImage = async (publishId: string): Promise<string | null> => {
	try {
		const dataUrl = await captureThumbnail({
			maxDim: EMBED_IMAGE_MAX_DIM,
			scale: EMBED_IMAGE_SCALE,
			allowNetwork: true,
			// A picture that stands alone on a slide: legend and canvas colour
			// included, white under an unset canvas colour.
			figure: true,
			opaqueBackground: true,
		})
		if (dataUrl === null) return null
		const png = pngFileFromDataUrl(dataUrl, "image.png")
		if (png === null) return null
		// The scale actually achieved: the cap may have pulled it under 2.
		// Layout width (offsetWidth) ignores the editor's display-only zoom.
		const bytes = new Uint8Array(await png.arrayBuffer())
		const root = document.querySelector<HTMLElement>("[data-chart-root]")
		const pngWidth = new DataView(bytes.buffer).getUint32(16)
		const scale = root && root.offsetWidth > 0 ? pngWidth / root.offsetWidth : EMBED_IMAGE_SCALE
		const stampedBytes = stampPngDpi(bytes, CSS_DPI * scale)
		// `slice` yields a plain ArrayBuffer (BlobPart); the typed array's
		// buffer is ArrayBufferLike and TS 5.7+ rejects it.
		const stamped = new File(
			[stampedBytes.buffer.slice(stampedBytes.byteOffset, stampedBytes.byteOffset + stampedBytes.byteLength) as ArrayBuffer],
			"image.png",
			{ type: "image/png" }
		)
		return await publishEmbedImageRequest(publishId, stamped)
	} catch {
		return null
	}
}

/** Unpublish one instance: delete its public files, then clear its publish
 *  fields (the landing row stays, shown as not published). */
export const useUnpublishEmbed = () =>
	useAtomCallback(
		useCallback(async (get, set, instanceId: string): Promise<void> => {
			const instance = get(embedInstancesAtom)[instanceId]
			if (!instance?.publishId) return
			await unpublishEmbedRequest(instance.publishId)
			set(embedInstancesAtom, (prev) => clearEmbedPublish(prev, instanceId))
		}, [])
	)
