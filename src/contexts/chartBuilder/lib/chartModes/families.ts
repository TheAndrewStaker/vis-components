import type { ChartMode } from "../chartMode"

/** Mode FAMILIES — the one place a "is this a bar chart?" question is
 * answered by id. Sidebar panels that need a family gate import these
 * predicates instead of spelling the id list out locally (five panels used
 * to each carry their own `mode === "areas-x" || mode === "areas-y"`), so
 * adding a sibling mode is one edit here, and `registry.test.ts` checks
 * every id below is a registered mode.
 *
 * Prefer a declared trait over a family when one says what you mean:
 * `canvas.coordFamily` for polar / geo, `canvas.measureAxis` for "which
 * axis is the measure", `canvas.cartesianAxes` for "is there an x axis",
 * `canvas.lengthRole` for what the Length channel does. Families are for
 * behavior that genuinely belongs to a renderer lineage — the bar band
 * gap, the area layer stacking toggle, the pie wedge scope. */

/** The bar renderer's lineage. The combo modes ARE bar charts (same
 * aggregation, band gap, stack / group modes, bar label placements) with a
 * marks layer on top — see `comboOverlayChannel` for the extra layer. */
const BAR_MODE_IDS: readonly ChartMode[] = [
	"bars-x",
	"bars-y",
	"combo-x",
	"combo-y",
]
const COMBO_MODE_IDS: readonly ChartMode[] = ["combo-x", "combo-y"]
const AREA_MODE_IDS: readonly ChartMode[] = ["areas-x", "areas-y"]
const PIE_MODE_IDS: readonly ChartMode[] = ["pies", "pies-x", "pies-y"]
/** The tree readings of the shared no-positions signature (see
 * hierarchySignature.ts). Everything mode-gated for packed circles — the
 * Hierarchy section, derived channel options, the proportional size
 * legend — applies to all three. */
const HIERARCHY_MODE_IDS: readonly ChartMode[] = [
	"packed-circles",
	"treemap",
	"sunburst",
]
/** The flow readings of the same signature — directed edges (connection =
 * source, `flowTargetField` = target) instead of a tree. Derived channel
 * sources (rootGroup / depth) stay tree-only. */
const FLOW_MODE_IDS: readonly ChartMode[] = ["chord", "sankey"]

const has = (ids: readonly ChartMode[], id: string): boolean =>
	(ids as readonly string[]).includes(id)

export const isBarModeId = (id: string): boolean => has(BAR_MODE_IDS, id)
/** The bar + marks combos (a subset of the bar family). */
export const isComboModeId = (id: string): boolean => has(COMBO_MODE_IDS, id)
/** The position channel a combo draws as scatter MARKS on the bars'
 * measure axis: `y` on combo-x (vertical bars), `x` on combo-y. `null` on
 * every other mode — the one question BarPlot, the shared measure-axis
 * bounds and the solver ask that the traits alone can't answer. */
export const comboOverlayChannel = (id: string): "x" | "y" | null =>
	id === "combo-x" ? "y" : id === "combo-y" ? "x" : null
export const isAreaModeId = (id: string): boolean => has(AREA_MODE_IDS, id)
export const isPieModeId = (id: string): boolean => has(PIE_MODE_IDS, id)
export const isHierarchyModeId = (id: string): boolean =>
	has(HIERARCHY_MODE_IDS, id)
export const isFlowModeId = (id: string): boolean => has(FLOW_MODE_IDS, id)
/** Trees + flows: every mode where `connection` is a structural KEY (which
 * node a row attaches to) rather than a drawn line — the gate the
 * Connection panel uses to swap line styling for the Structure section. */
export const isStructureModeId = (id: string): boolean =>
	isHierarchyModeId(id) || isFlowModeId(id)

/** Every id any family names — for the registry test. */
export const FAMILY_MODE_IDS: readonly ChartMode[] = [
	...BAR_MODE_IDS,
	...AREA_MODE_IDS,
	...PIE_MODE_IDS,
	...HIERARCHY_MODE_IDS,
	...FLOW_MODE_IDS,
]
