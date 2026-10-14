import { FacetAxisOptionsPanel } from "./FacetAxisOptionsPanel"

/** Options panel for the `facetRow` channel — a thin wrapper over the
 *  axis-parameterized `FacetAxisOptionsPanel`. Surfaces BOTH axis
 *  subsections (Rows first, then Columns — share modes are grid-wide
 *  bits) plus the row-direction sizing controls: gapY, panelHeight, and
 *  the hide-empty-panels toggle. The "row axis" channel depends on the
 *  chart mode: y for cartesian, r for radar, none for pies (which have
 *  no R-like channel — the Rows subsection gives way to a hint). */
export const FacetRowOptionsPanel = () => <FacetAxisOptionsPanel axis="row" />
