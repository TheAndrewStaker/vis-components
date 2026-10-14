import { useAtom, useAtomValue } from "jotai"
import { useMemo } from "react"
import {
	DEFAULT_FACET_CONFIG,
	migrateProportionalSizing,
	migrateShareValue,
	rowSizingMeaningful,
	type FacetConfig,
	type PanelAxisOverride,
} from "../../../lib/channelConfig"
import {
	facetPanelOptions,
	resolveFacetPanels,
} from "../../../lib/resolveFacetPanels"
import { useChartModeDef } from "../../../store/useChartModeDef"
import { axisRangeIsContinuous } from "../../../lib/axisFields"
import {
	facetAxisMapping,
	type FacetAxisMapping,
} from "../../../lib/facetAxisMapping"
import type { ChartModeDef } from "../../../lib/chartModes/types"
import { effectiveType } from "../../../lib/fieldType"
import type { DatasetView, Encodings, FieldType } from "../../../lib/types"
import {
	currentChannelConfigsAtom,
	currentEncodingsAtom,
	currentFieldLevelOrdersAtom,
	currentFieldOverridesAtom,
	currentRenderedPanelInnerDimsAtom,
} from "../../../store/atoms"
import { useCurrentDatasetView } from "../../../store/useCurrentDatasetView"
import { CollapsibleSubsection } from "../../../../../components/ui/CollapsibleSubsection"
import {
	AxisRangeSection,
	GapInput,
	PanelDimInput,
	ShareAxisRow,
	SizeByCheckboxRow,
	countUniqueFieldValues,
	useClearPanelDimWhenSizing,
	useUniqueFieldValues,
	withBound,
	withBoundInMap,
	withPanelBound,
} from "./facetSharedControls"

/** Everything that differs between the facetRow and facetCol option
 *  panels, as data. The two panels are exact mirrors of each other under
 *  this renaming — `FacetAxisOptionsPanel` below implements the shared
 *  logic once and reads the axis-specific keys / copy from here. */
type FacetAxisSpec = {
	/** Facet channel this panel configures. */
	facetChannel: "facetRow" | "facetCol"
	/** The facet channel on the perpendicular axis — its unique-value
	 *  count gates per-group sharing and the sizing / override editors. */
	perpFacetChannel: "facetCol" | "facetRow"
	/** facetAxisMapping accessors: which encoding channel this panel's
	 *  axis controls target for the current chart mode, and its label. */
	axisMapKey: "rowAxis" | "colAxis"
	axisLabelKey: "rowAxisLabel" | "colAxisLabel"
	shareKey: "shareY" | "shareX"
	otherShareKey: "shareX" | "shareY"
	/** Polar share override cleared when the user picks a share mode
	 *  here, so the polar runtime picks up the fresh cartesian value via
	 *  migratePolarShareValue's fallback instead of a stale wrap-mode
	 *  pick (user clicked "None" expecting per-panel scales but a
	 *  leftover "all" would still force sharing). */
	polarShareClearKey: "shareR" | "shareAngle"
	sizingKey: "proportionalSizingY" | "proportionalSizingX"
	gapKey: "gapY" | "gapX"
	gapLabel: string
	panelDimKey: "panelHeight" | "panelWidth"
	panelDimLabel: string
	renderedDimKey: "heightPx" | "widthPx"
	overallRangeKey: "overallYRange" | "overallXRange"
	overridesKey: "rowAxisOverrides" | "colAxisOverrides"
	/** Which bounds of a `panelAxisOverrides` entry this axis reads. */
	panelBoundKeys: {
		min: keyof PanelAxisOverride
		max: keyof PanelAxisOverride
	}
	subsectionTitle: string
	perGroupLabel: string
	/** Singular / plural nouns for user-facing copy. */
	noun: "row" | "column"
	nounPlural: "rows" | "columns"
	/** React key prefix for per-value override rows. */
	valueKeyPrefix: string
	/** Hint shown when the facet channel isn't mapped. */
	emptyHint: string
	/** Hint shown when the chart mode has no axis in this direction. */
	noAxisHint: string
}

const ROW_SPEC: FacetAxisSpec = {
	facetChannel: "facetRow",
	perpFacetChannel: "facetCol",
	axisMapKey: "rowAxis",
	axisLabelKey: "rowAxisLabel",
	shareKey: "shareY",
	otherShareKey: "shareX",
	polarShareClearKey: "shareR",
	sizingKey: "proportionalSizingY",
	gapKey: "gapY",
	gapLabel: "Vertical gap",
	panelDimKey: "panelHeight",
	panelDimLabel: "Panel height",
	renderedDimKey: "heightPx",
	overallRangeKey: "overallYRange",
	overridesKey: "rowAxisOverrides",
	panelBoundKeys: { min: "yMin", max: "yMax" },
	subsectionTitle: "Rows",
	perGroupLabel: "Per row",
	noun: "row",
	nounPlural: "rows",
	valueKeyPrefix: "y-",
	emptyHint:
		"Map a categorical field to Facet (row) to control row-specific layout options.",
	// Pie mode has no R-like channel — there are no row-axis controls to
	// show. The Columns (angle axis) subsection still renders below.
	noAxisHint: "This chart type has no row axis to configure.",
}

const COL_SPEC: FacetAxisSpec = {
	facetChannel: "facetCol",
	perpFacetChannel: "facetRow",
	axisMapKey: "colAxis",
	axisLabelKey: "colAxisLabel",
	shareKey: "shareX",
	otherShareKey: "shareY",
	polarShareClearKey: "shareAngle",
	sizingKey: "proportionalSizingX",
	gapKey: "gapX",
	gapLabel: "Horizontal gap",
	panelDimKey: "panelWidth",
	panelDimLabel: "Panel width",
	renderedDimKey: "widthPx",
	overallRangeKey: "overallXRange",
	overridesKey: "colAxisOverrides",
	panelBoundKeys: { min: "xMin", max: "xMax" },
	subsectionTitle: "Columns",
	perGroupLabel: "Per column",
	noun: "column",
	nounPlural: "columns",
	valueKeyPrefix: "x-",
	emptyHint:
		"Map a categorical field to Facet (col) to control column-specific layout options.",
	// Defensive fallback for hypothetical future modes with no col-axis
	// channel — none of the current modes hit this branch (cartesian,
	// radar, and pie all have one), but it keeps parity with the row
	// panel's pie case.
	noAxisHint: "This chart type has no column axis to configure.",
}

/** The Rows / Columns subsection for ONE axis: share picker, sizing
 *  toggle, and range editors. Both facet panels render one of these per
 *  axis (own axis first, then the perpendicular one) so either panel can
 *  share or unshare either axis — the share modes are grid-wide bits in
 *  the single `facet` config, not per-channel state. Returns null when
 *  the chart mode has no axis in this direction (pie rows).
 *
 *  `isOwnAxis` gates the polar "Size panels by unit" toggle: it's a
 *  single config bit, so only the panel's own subsection surfaces it
 *  (otherwise a radar panel would show it twice). */
const FacetAxisSubsection = ({
	spec,
	cfg,
	updateCfg,
	encodings,
	overrides,
	dataset,
	mode,
	axisMap,
	panelOptions,
	isOwnAxis,
}: {
	spec: FacetAxisSpec
	cfg: FacetConfig
	updateCfg: (next: Partial<FacetConfig>) => void
	encodings: Encodings
	overrides: Record<string, FieldType>
	dataset: DatasetView | undefined
	mode: ChartModeDef
	axisMap: FacetAxisMapping
	/** Every rendered panel (key + display label), from the same
	 *  resolver PlotCanvas draws against — drives the per-panel editor. */
	panelOptions: Array<{ key: string; label: string }>
	isOwnAxis: boolean
}) => {
	// Polar charts (radar / pie): the cartesian "Size … by …" toggle
	// writes proportionalSizingX/Y but the polar runtime reads the
	// dedicated proportionalPanelSizing flag — so the cartesian toggle
	// is a no-op for polar. Detect polar here and render the polar
	// "Size panels by unit" toggle instead. Mirrors what the wrap panel
	// does for polar charts (only one of the two toggles ever surfaces
	// at a time, gated by mode).
	const isPolar = mode.canvas.coordFamily === "polar"

	// The facet field in THIS subsection's direction (may be unmapped
	// when rendering the perpendicular axis — a single row / column still
	// has an axis to share or not across the other direction's panels).
	const ownField = encodings[spec.facetChannel]?.field ?? null
	const perpField = encodings[spec.perpFacetChannel]?.field ?? null

	// ── Everything hook-adjacent is computed unconditionally (before any
	// early-returns) so hook ordering stays stable across renders. ──

	// Unique own-axis facet values (stringified, dataset-encounter order)
	// — drive the per-row / per-column axis bound overrides.
	const ownValues = useUniqueFieldValues(dataset, ownField)

	// Unique-value counts per facet channel gate "Per row" / "Per column"
	// availability (per-group sharing requires 2+ panels in both
	// directions to differ from "All panels").
	const ownCount = countUniqueFieldValues(dataset, ownField)
	const perpCount = countUniqueFieldValues(dataset, perpField)
	const perGroupAvailable = ownCount >= 2 && perpCount >= 2

	// Axis variable type drives the sizing toggle's label and effect.
	// Categorical/ordinal → "by category count"; quant/temporal → "by
	// unit range"; unmapped → hide the toggle entirely. The channel we
	// read depends on chart mode — the cfg share/sizing fields are
	// reused regardless.
	const axisChannel = axisMap[spec.axisMapKey]
	const axisField = axisChannel
		? encodings[axisChannel]?.field ?? null
		: null
	const axisType =
		axisField && dataset ? effectiveType(dataset, axisField, overrides) : null
	// Range editors gate on the field the axis ACTUALLY reads (Length for
	// a bar's measure axis, which `axisField` above — the raw position
	// encoding — misses). The sizing toggles below keep the raw gate: the
	// solver's unit-range weights read the position field, so "size by
	// unit range" would be inert on a measure axis.
	const axisIsContinuous = axisRangeIsContinuous(
		mode,
		axisChannel === "x" ? "x" : "y",
		encodings,
		dataset ? (f: string) => effectiveType(dataset, f, overrides) : null,
	)

	const share = migrateShareValue(cfg[spec.shareKey])
	const size = migrateProportionalSizing(
		cfg[spec.sizingKey],
		cfg.proportionalSizing,
		cfg.proportionalSizingByUnit,
	)

	// "Size row heights / column widths by …" shows whenever it can change anything —
	// same helper the wrap panel and the runtime use (see its doc). Under
	// share = none with 2+ panels across, each panel sizes by its own
	// range and shorter ones sit inside their row, bottom-aligned. The
	// helper is symmetric in (own, perpendicular), so it serves both specs.
	const showSizing = rowSizingMeaningful(ownCount, perpCount, share)
	// Name the dimension that changes ("row heights" / "column widths");
	// with a single row (column) the sizing is per panel, so say so.
	const sizingDim = spec.noun === "row" ? "heights" : "widths"
	const sizingNoun = `${ownCount >= 2 ? spec.noun : "panel"} ${sizingDim}`

	// Defensive panel-dim / proportional-sizing invariant. Gated on the
	// subsection actually surfacing its axis controls (the mode has an
	// axis in this direction) so it can't fire from the null-render
	// state.
	useClearPanelDimWhenSizing(
		axisChannel != null && showSizing && size !== "off",
		cfg[spec.panelDimKey],
		() => updateCfg({ [spec.panelDimKey]: null } as Partial<FacetConfig>),
	)

	// No axis in this direction for the current mode (pies on the row
	// axis): nothing to share, size, or range.
	if (axisChannel === null) return null

	const axisLabel = axisMap[spec.axisLabelKey]
	const axisLabelLower = axisLabel.toLowerCase()

	// Sizing is meaningless under share="all" (every panel sees the same
	// categories → uniform weights). When the user enables sizing while
	// share is "all", flip share to the compatible option so the toggle
	// actually does something visible: "perGroup" when the grid is 2D,
	// "none" otherwise. Cartesian only — radar / pie have different share
	// semantics and we leave those alone. Enabling sizing also clears the
	// stored panel dimension (it'd silently override the proportional
	// weights at render time) so the user starts from auto.
	const setSizing = (next: "off" | "categoryCount" | "unit") => {
		const patch = { [spec.sizingKey]: next } as Partial<FacetConfig>
		if (next !== "off" && axisMap.showPanelSize && share === "all") {
			patch[spec.shareKey] = perGroupAvailable ? "perGroup" : "none"
		}
		if (next !== "off") patch[spec.panelDimKey] = null
		updateCfg(patch)
	}

	// Per-group range editor surfaces when each row / column has a single
	// well-defined axis to bound:
	//   - share === "perGroup": all panels in the group share the axis,
	//     so the per-group bound governs that shared scale.
	//   - share === "none" + perpendicular count === 1: each group holds
	//     a single panel, so per-group == per-panel and the override pins
	//     the panel's bounds directly.
	// Both paths use the same storage; PlotCanvas honors them under both
	// share modes via the same lookup.
	const showValueOverrides =
		axisIsContinuous &&
		(share === "perGroup" || (share === "none" && perpCount === 1))
	// share === "none" + 2+ perpendicular panels: every panel has its own
	// axis and there's no row / column to key a group bound on, so the
	// editor lists each panel (keyed by panel key, same as the wrap
	// panel's per-panel editors) and writes `panelAxisOverrides`. Keeps
	// the rule "a continuous axis can always be bounded, shared or not"
	// consistent across the wrap, row, and column panels.
	const showPanelOverrides =
		axisIsContinuous &&
		share === "none" &&
		perpCount >= 2 &&
		panelOptions.length > 0
	// Overall range surfaces under "All panels" sharing on a continuous
	// axis — lets the user pin the shared scale to a "pretty" floor /
	// ceiling.
	const showOverallRange = share === "all" && axisIsContinuous

	const updateOverallRange = (bound: "min" | "max", raw: string) => {
		const next = withBound(cfg[spec.overallRangeKey], bound, raw)
		if (next) {
			updateCfg({ [spec.overallRangeKey]: next } as Partial<FacetConfig>)
		}
	}

	const updateValueOverride = (
		value: string,
		bound: "min" | "max",
		raw: string,
	) => {
		const all = withBoundInMap(cfg[spec.overridesKey], value, bound, raw)
		if (all) updateCfg({ [spec.overridesKey]: all } as Partial<FacetConfig>)
	}

	const updatePanelOverride = (
		panelKey: string,
		bound: "min" | "max",
		raw: string,
	) => {
		const all = withPanelBound(
			cfg.panelAxisOverrides,
			panelKey,
			spec.panelBoundKeys[bound],
			raw,
		)
		if (all) updateCfg({ panelAxisOverrides: all })
	}

	// The help text depends on which path activated the editor: under
	// "perGroup" it pins the group's SHARED scale; under "none" with one
	// perpendicular panel it pins each group's single panel directly.
	const valueRangeHelp =
		share === "perGroup"
			? `Blank = auto from each ${spec.noun}'s data.`
			: "Blank = auto from each panel's data."

	const displayShare = perGroupAvailable
		? share
		: share === "perGroup"
			? "all"
			: share

	return (
		<CollapsibleSubsection title={spec.subsectionTitle}>
			<ShareAxisRow
				label={`Share ${axisLabelLower}`}
				ariaLabel={`Share ${axisLabel}`}
				value={displayShare}
				perGroupLabel={spec.perGroupLabel}
				perGroupAvailable={perGroupAvailable}
				onChange={(next) => {
					const other = migrateShareValue(cfg[spec.otherShareKey])
					updateCfg({
						[spec.shareKey]: next,
						[spec.otherShareKey]: other,
						// Clear the polar override so the polar runtime picks
						// up THIS cartesian value via migratePolarShareValue's
						// fallback (see spec.polarShareClearKey).
						[spec.polarShareClearKey]: undefined,
					} as Partial<FacetConfig>)
				}}
			/>

			{/* Polar charts use a panel-radius sizing toggle that maps to
			 *  proportionalPanelSizing, NOT the cartesian per-axis sizing
			 *  (which has no effect on radar / pie rendering). Hidden
			 *  under share=all where every panel collapses to the global
			 *  max — same gate as the wrap panel. Own-axis only: it's one
			 *  config bit, not a per-axis one. */}
			{isPolar && isOwnAxis && share !== "all" && (
				<SizeByCheckboxRow
					label="Size panels by unit"
					checked={cfg.proportionalPanelSizing === true}
					onChange={(checked) =>
						updateCfg({ proportionalPanelSizing: checked })
					}
				/>
			)}
			{!isPolar &&
				showSizing &&
				(axisType === "categorical" || axisType === "ordinal") && (
					<SizeByCheckboxRow
						label={`Size ${sizingNoun} by category count`}
						checked={size === "categoryCount"}
						onChange={(checked) =>
							setSizing(checked ? "categoryCount" : "off")
						}
					/>
				)}
			{!isPolar &&
				showSizing &&
				(axisType === "quantitative" || axisType === "temporal") && (
					<SizeByCheckboxRow
						label={`Size ${sizingNoun} by unit range`}
						checked={size === "unit"}
						onChange={(checked) => setSizing(checked ? "unit" : "off")}
					/>
				)}

			{showOverallRange && (
				<AxisRangeSection
					title={`${axisLabel} range`}
					help={`Blank = auto-fit. Set a bound to pin the shared ${axisLabelLower} (e.g. min = 0).`}
					entries={[
						{
							key: "overall",
							min: cfg[spec.overallRangeKey]?.min,
							max: cfg[spec.overallRangeKey]?.max,
							onChange: updateOverallRange,
						},
					]}
				/>
			)}

			{showValueOverrides && ownValues.length > 0 && (
				<AxisRangeSection
					title={`${axisLabel} range per ${spec.noun}`}
					help={valueRangeHelp}
					entries={ownValues.map((v) => ({
						key: `${spec.valueKeyPrefix}${v}`,
						label: v,
						min: cfg[spec.overridesKey]?.[v]?.min,
						max: cfg[spec.overridesKey]?.[v]?.max,
						onChange: (bound, raw) => updateValueOverride(v, bound, raw),
					}))}
				/>
			)}

			{showPanelOverrides && (
				<AxisRangeSection
					title={`${axisLabel} range per panel`}
					help="Blank = auto from each panel's data."
					entries={panelOptions.map((p) => ({
						key: `${spec.valueKeyPrefix}panel-${p.key}`,
						label: p.label,
						min: cfg.panelAxisOverrides?.[p.key]?.[spec.panelBoundKeys.min],
						max: cfg.panelAxisOverrides?.[p.key]?.[spec.panelBoundKeys.max],
						onChange: (bound, raw) => updatePanelOverride(p.key, bound, raw),
					}))}
				/>
			)}
		</CollapsibleSubsection>
	)
}

/** Shared implementation of the facetRow / facetCol option panels.
 *  Each panel hosts BOTH axis subsections (its own axis first, then the
 *  perpendicular one) — share modes are grid-wide, so a user on the
 *  Facet (col) panel can unshare Y without hopping to Facet (row) — plus
 *  the "Custom sizing" block for its own direction: gap, panel
 *  dimension, and the hide-empty-panels toggle. The "own axis" channel
 *  depends on the chart mode (y / r for rows, x / angle for columns,
 *  none for pie rows) — see `facetAxisMapping`. The wrap panel
 *  (`FacetOptionsPanel`) surfaces both axes the same way. */
export const FacetAxisOptionsPanel = ({ axis }: { axis: "row" | "col" }) => {
	const spec = axis === "row" ? ROW_SPEC : COL_SPEC
	const perpSpec = axis === "row" ? COL_SPEC : ROW_SPEC
	const [configs, setConfigs] = useAtom(currentChannelConfigsAtom)
	const encodings = useAtomValue(currentEncodingsAtom)
	const overrides = useAtomValue(currentFieldOverridesAtom)
	const levelOrders = useAtomValue(currentFieldLevelOrdersAtom)
	const dataset = useCurrentDatasetView()
	const renderedPanelDims = useAtomValue(currentRenderedPanelInnerDimsAtom)

	const cfg: FacetConfig = useMemo(
		() => ({ ...DEFAULT_FACET_CONFIG, ...configs.facet }),
		[configs.facet],
	)

	// Rendered panels (key + label) from the resolver PlotCanvas draws
	// against, so per-panel range keys match what the renderer looks up.
	const panelOptions = useMemo(
		() =>
			facetPanelOptions(
				resolveFacetPanels(dataset, encodings, levelOrders, overrides, cfg),
			),
		[dataset, encodings, levelOrders, overrides, cfg],
	)

	const updateCfg = (next: Partial<FacetConfig>) => {
		setConfigs((prev) => ({
			...prev,
			facet: {
				...DEFAULT_FACET_CONFIG,
				...prev.facet,
				...next,
			},
		}))
	}

	const mode = useChartModeDef()
	const axisMap = facetAxisMapping(mode)

	const ownField = encodings[spec.facetChannel]?.field ?? null
	const perpField = encodings[spec.perpFacetChannel]?.field ?? null
	const ownAxisChannel = axisMap[spec.axisMapKey]

	// Panel dimension conflicts with proportional sizing — hide it when
	// "Size row heights / column widths by …" is actively driving sizes on this axis.
	// Same gate the subsection uses for its sizing toggle.
	const ownCount = countUniqueFieldValues(dataset, ownField)
	const perpCount = countUniqueFieldValues(dataset, perpField)
	const ownShare = migrateShareValue(cfg[spec.shareKey])
	const ownSize = migrateProportionalSizing(
		cfg[spec.sizingKey],
		cfg.proportionalSizing,
		cfg.proportionalSizingByUnit,
	)
	const ownSizingActive =
		ownAxisChannel != null &&
		ownSize !== "off" &&
		rowSizingMeaningful(ownCount, perpCount, ownShare)

	// Empty state: nothing meaningful to configure if the facet channel
	// isn't mapped yet. Mirror the wrap panel's "map a field" hint copy.
	if (!ownField) {
		return (
			<div className="vc-option-panel vc-help">
				{spec.emptyHint}
			</div>
		)
	}

	const subsectionProps = {
		cfg,
		updateCfg,
		encodings,
		overrides,
		dataset,
		mode,
		axisMap,
		panelOptions,
	}

	return (
		<div className="vc-option-panel">
			{/* Own axis first. When the mode has no axis in this direction
			 *  (pies on the row panel) surface a brief hint so the empty
			 *  space isn't confusing; the perpendicular subsection below
			 *  still renders. */}
			{ownAxisChannel === null ? (
				<div className="vc-help">{spec.noAxisHint}</div>
			) : (
				<FacetAxisSubsection {...subsectionProps} spec={spec} isOwnAxis />
			)}
			<FacetAxisSubsection
				{...subsectionProps}
				spec={perpSpec}
				isOwnAxis={false}
			/>

			<CollapsibleSubsection title="Custom sizing">
				<GapInput
					label={spec.gapLabel}
					value={cfg[spec.gapKey]}
					defaultValue={DEFAULT_FACET_CONFIG[spec.gapKey]}
					onChange={(n) =>
						updateCfg({ [spec.gapKey]: n } as Partial<FacetConfig>)
					}
				/>

				{axisMap.showPanelSize && !ownSizingActive && (
					<PanelDimInput
						label={spec.panelDimLabel}
						value={cfg[spec.panelDimKey]}
						autoPx={renderedPanelDims?.[spec.renderedDimKey]}
						onCommit={(next) =>
							updateCfg({
								[spec.panelDimKey]: next,
							} as Partial<FacetConfig>)
						}
					/>
				)}

				{/* Grid mode only (both facet channels mapped) — the row × col
				 *  cross-product is the only source of empty panels. ownField is
				 *  already non-null here (the map-a-field hint early-returns
				 *  above), so the perpendicular channel is the whole gate. One
				 *  code site, same config bit: the control mirrors into both
				 *  the row and col panels by design. */}
				{perpField != null && (
					<SizeByCheckboxRow
						label="Hide empty panels"
						checked={cfg.hideEmptyPanels === true}
						onChange={(checked) => updateCfg({ hideEmptyPanels: checked })}
					/>
				)}
			</CollapsibleSubsection>
		</div>
	)
}
