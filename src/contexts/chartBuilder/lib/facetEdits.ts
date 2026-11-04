/** What the Facet panels do beyond storing a value, shared with the
 * settings path. */

import type { FacetConfig } from "./channelConfig"

export type FacetSizing = NonNullable<FacetConfig["proportionalSizingX"]>

/** Turning proportional sizing on clears the fixed panel size on that
 * axis; on a row / column facet it also moves an "all" share to the
 * compatible option (per group when the grid is 2-D, else none), since
 * sizing is meaningless under one shared axis. */
export const facetSizingPatch = (
	cfg: FacetConfig,
	axis: "x" | "y",
	next: FacetSizing,
	opts: { flipShare: boolean; perGroupAvailable: boolean }
): Partial<FacetConfig> => {
	const sizingKey = axis === "x" ? "proportionalSizingX" : "proportionalSizingY"
	const shareKey = axis === "x" ? "shareX" : "shareY"
	const dimKey = axis === "x" ? "panelWidth" : "panelHeight"
	const patch: Partial<FacetConfig> = { [sizingKey]: next }
	if (next !== "off" && opts.flipShare && cfg[shareKey] === "all")
		patch[shareKey] = opts.perGroupAvailable ? "perGroup" : "none"
	if (next !== "off") patch[dimKey] = null
	return patch
}

/** A wrap grid's rows / cols: null clears; a count must fit the panels
 * (1 … facetCount) and snaps the other dimension up so every panel has a
 * cell. Null when the count can't be used. */
export const facetGridPatch = (
	cfg: Pick<FacetConfig, "rows" | "cols">,
	axis: "rows" | "cols",
	n: number | null,
	facetCount: number
): Partial<FacetConfig> | null => {
	if (n === null) return { [axis]: null }
	const max = Math.max(1, facetCount)
	if (!Number.isFinite(n) || n < 1 || n > max) return null
	const otherKey = axis === "rows" ? "cols" : "rows"
	const other = cfg[otherKey]
	const minLegalOther = Math.max(1, Math.ceil(facetCount / n))
	if (other == null || other < minLegalOther) return { [axis]: n, [otherKey]: minLegalOther }
	return { [axis]: n }
}
