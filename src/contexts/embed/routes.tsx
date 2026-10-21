import { EMBED_PATH_PREFIX } from "../../lib/embedPath"
import { createRoute, rootRoute } from "../../routes/router"
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
	 * size and stays the chart alone. */
	table?: "off"
}

const validateSearch = (raw: Record<string, unknown>): EmbedSearch => {
	const out: EmbedSearch = {}
	if (typeof raw.v === "string" && raw.v.length > 0) out.v = raw.v
	if (raw.part === "chart" || raw.part === "legend") out.part = raw.part
	if (raw.table === "off") out.table = "off"
	return out
}

export const embedRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: `${EMBED_PATH_PREFIX}$visualId`,
	component: EmbedPage,
	validateSearch,
})
