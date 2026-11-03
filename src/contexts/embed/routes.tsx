import { EMBED_PATH_PREFIX } from "../../lib/embedPath"
import { createRoute, rootRoute } from "../../routes/router"
import { IMAGE_FORMATS } from "../chartBuilder/lib/exportImage"
import type { ImageFormat } from "../chartBuilder/lib/exportImage"
import { EmbedPage } from "./components/EmbedPage"

export type EmbedPart = "chart" | "legend"

export type EmbedSearch = {
	v?: string // pinned dataset version id; absent = live (latest)
	/** Render only one slice of the visual. Used by the dual-iframe embed
	 * option so chart and legend can sit in independently-sized iframes. */
	part?: EmbedPart
	/** `table=off` suppresses the data table (Sidebar → Data table). The
	 * app's own capture iframes — the Export modal and the library's
	 * thumbnail refresh — pass it, so an image export keeps the requested
	 * size and stays the chart alone. `table=image` is the Export modal's
	 * "Include data table": the chart at the iframe's height less the
	 * table's, the table under it as a static block (`ExportTableLayout`). */
	table?: "off" | "image"
	/** Export mode: render the chart at `width × height` CSS px (default: a
	 * fixed canvas size, else 650×400), run the Export dialog's pipeline on
	 * it at `ratio` (default 4), and write the file into `#export-result` as
	 * base64 — for a script or headless browser, nobody at the dialog.
	 * `null` = a format the dialog doesn't offer (`#export-error`). */
	export?: ImageFormat | null
	width?: number
	height?: number
	ratio?: number
}

const positive = (raw: unknown): number | undefined => {
	const n = Number(raw)
	return Number.isFinite(n) && n > 0 ? n : undefined
}

const validateSearch = (raw: Record<string, unknown>): EmbedSearch => {
	const out: EmbedSearch = {}
	if (typeof raw.v === "string" && raw.v.length > 0) out.v = raw.v
	if (raw.part === "chart" || raw.part === "legend") out.part = raw.part
	if (raw.table === "off" || raw.table === "image") out.table = raw.table
	if (raw.export !== undefined) {
		out.export = IMAGE_FORMATS.find((f) => f === raw.export) ?? null
		const width = positive(raw.width)
		const height = positive(raw.height)
		const ratio = positive(raw.ratio)
		if (width !== undefined) out.width = width
		if (height !== undefined) out.height = height
		if (ratio !== undefined) out.ratio = ratio
	}
	return out
}

export const embedRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: `${EMBED_PATH_PREFIX}$visualId`,
	component: EmbedPage,
	validateSearch,
})
