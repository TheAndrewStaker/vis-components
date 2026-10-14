import { FacetAxisOptionsPanel } from "./FacetAxisOptionsPanel"

/** Options panel for the `facetCol` channel — a thin wrapper over the
 *  axis-parameterized `FacetAxisOptionsPanel`, mirroring
 *  `FacetRowOptionsPanel` on the other axis. Surfaces BOTH axis
 *  subsections (Columns first, then Rows — share modes are grid-wide
 *  bits) plus the col-direction sizing controls: gapX, panelWidth, and
 *  the hide-empty-panels toggle. The "col axis" channel depends on the
 *  chart mode: x for cartesian, angle for radar / pies. */
export const FacetColOptionsPanel = () => <FacetAxisOptionsPanel axis="col" />
