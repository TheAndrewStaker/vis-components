import type { DataLabelsConfig } from "./channelConfig"
import { labelFacetKeysFor } from "./dataLabelsSelection"
import {
	FACET_PANEL_ALL,
	facetScopeIncludes,
	type FacetPanelRef,
} from "./facetPanelRef"

/** Is a facet-scoped setting active on this panel?
 *
 *  Shared semantics for everything that scopes itself to facet panels
 *  (per-annotation `facetKeys`, the Data Labels layer's `facetKeys`):
 *  `null` / undefined ⇒ every panel (the default); an array ⇒ only the
 *  listed panels (`FacetPanelRef`, matched by the panel key). The
 *  unfaceted chart's single panel (`FACET_PANEL_ALL`) and a render site
 *  outside any panel (`null`) always qualify, so a stored selection from a
 *  previously faceted chart never blanks an unfaceted one. */
export const onFacetPanel = (
	facetKeys: readonly FacetPanelRef[] | null | undefined,
	panelKey: string | null,
): boolean =>
	facetKeys == null ||
	panelKey === null ||
	panelKey === FACET_PANEL_ALL ||
	facetScopeIncludes(facetKeys, panelKey)

/** Does the Data Labels layer draw on this facet panel? ("Label all
 *  facets" unchecked ⇒ only the panels the user ticked.)
 *
 *  Layer-wide — the single-field label's scope, and the fallback for a
 *  composed label with no entry of its own. Multi-field callers gate each
 *  composed label with `composedLabelOnPanel` instead, so one label can
 *  draw on every panel while another is kept to a few. */
export const dataLabelsOnPanel = (
	cfg: Pick<DataLabelsConfig, "facetKeys">,
	panelKey: string | null,
): boolean => onFacetPanel(cfg.facetKeys, panelKey)

/** Does ONE composed label (by id) draw on this facet panel? Its own
 *  `fieldFacetKeys` entry when it has one, else the layer's `facetKeys`
 *  (`labelFacetKeysFor`). `key === null` is the single-field label. */
export const composedLabelOnPanel = (
	cfg: Pick<DataLabelsConfig, "facetKeys" | "fieldFacetKeys">,
	key: string | null,
	panelKey: string | null,
): boolean => onFacetPanel(labelFacetKeysFor(cfg, key), panelKey)
