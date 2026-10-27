import type { AestheticScales } from "../store/useAestheticScales"

import type { Stack } from "./aggregators/stacks"
import type { ChannelConfigs } from "./channelConfig"
import type { PatternDefSpec } from "./patternDefs"
import type { RuleRows } from "./textColorRules"
import {
	resolveGroupFill,
	resolvePatternDefForItem,
	type GroupValues,
	type PatternDefItem,
	type PatternDefOptions,
} from "./resolveLayerColor"

// The per-item resolver (and its item/options types) lives beside
// `resolveLayerColor` so the GroupValues renderers' mark pipeline and the
// defs passes here share one implementation. Re-exported for the existing
// importers (ScatterPlot's mark loop, geoMarkStyle).
export { resolvePatternDefForItem }
export type { PatternDefItem, PatternDefOptions }

/** Build the deduplicated list of `<pattern>` element specs that the
 *  current encoding + configs will reference, from pre-resolved per-mark
 *  items. Renderers run this upfront so all `<defs>` are registered before
 *  any mark tries to reference them via `fill="url(#...)"`. */
export const buildPatternDefsFromItems = (
	items: Iterable<PatternDefItem>,
	aestheticScales: AestheticScales,
	channelConfigs: ChannelConfigs,
	patternBgFallback: string,
	options?: PatternDefOptions
): PatternDefSpec[] => {
	const defsMap = new Map<string, PatternDefSpec>()
	for (const item of items) {
		const resolved = resolvePatternDefForItem(
			item,
			aestheticScales,
			channelConfigs,
			patternBgFallback,
			options
		)
		if (resolved && !defsMap.has(resolved.svgId)) {
			defsMap.set(resolved.svgId, resolved)
		}
	}
	return [...defsMap.values()]
}

/** GroupValues-based entry point (BarPlot / AreaPlot / PiePlot iterate
 *  their native `stacks.slices.groupValues`). Resolves each slice's fill +
 *  pre-modulation hue via `resolveGroupFill` — the same helper
 *  `resolveLayerColor` uses — then defers to the item-based core. Pass the
 *  SAME `options` the renderer hands `resolveLayerColor` (`patternOptions`)
 *  so marks and defs agree on the default-pattern / default-to-none
 *  semantics.
 *
 *  Why a separate helper from `resolveLayerColor`:
 *   - `resolveLayerColor` returns only the resolved fill / opacity /
 *     pattern-id for one row/slice — sufficient for rendering.
 *   - This helper produces the *full* `PatternDefSpec` (svgId + svg
 *     children + background + ink) needed by `<PatternDefs>` to emit
 *     each pattern's `<defs>` block. */
export const buildPatternDefs = (
	fillInputs: readonly FillInput[],
	aestheticScales: AestheticScales,
	channelConfigs: ChannelConfigs,
	defaultFill: string,
	patternBgFallback: string,
	options?: PatternDefOptions
): PatternDefSpec[] => {
	const patG = aestheticScales.pattern?.field ?? null
	const patternCategories = aestheticScales.pattern?.categories ?? null
	const fieldMapped = !!(patternCategories && patG)
	// With no pattern field, defs exist only when the renderer opted into
	// the configured default pattern (its svgId still varies with each
	// slice's hue color, so every slice contributes an item).
	const wantsDefaultPattern =
		!!options?.includeDefaultPattern && channelConfigs.defaultPattern != null
	if (!fieldMapped && !wantsDefaultPattern) return []

	return buildPatternDefsFromItems(
		fillInputs
			.filter(
				({ groupValues }) => !fieldMapped || groupValues.pattern !== undefined
			)
			.map(({ groupValues, rows }) => {
				const { fill, preModulationHue, satUnit, briUnit } = resolveGroupFill(
					groupValues,
					defaultFill,
					aestheticScales,
					channelConfigs,
					rows
				)
				return {
					patternValue: groupValues.pattern,
					fill,
					preModulationHue,
					satUnit,
					briUnit,
				}
			}),
		aestheticScales,
		channelConfigs,
		patternBgFallback,
		options
	)
}

/** One slice's fill inputs: its `GroupValues` plus the dataset rows behind
 *  it. The rows feed `{Variable}` fill rules, which can change a slice's
 *  color — and so its pattern def id — so the defs pass MUST see the same
 *  rows the mark pipeline (`resolveLayerColor`) does. */
export type FillInput = { groupValues: GroupValues; rows?: RuleRows }

/** Map a stack list to the slice-level fill inputs the `buildPatternDefs`
 *  wrapper consumes. Centralized so BarPlot / AreaPlot / PiePlot stay in
 *  sync. */
export const stacksToFillInputs = (stacks: readonly Stack[]): FillInput[] =>
	stacks.flatMap((s) =>
		s.slices.map((sl) => ({ groupValues: sl.groupValues, rows: sl.rows }))
	)
