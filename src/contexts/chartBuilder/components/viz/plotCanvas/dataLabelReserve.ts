import { axisFieldsFor } from "../../../lib/axisFields"
import type { ChannelConfigs, DataLabelsConfig } from "../../../lib/channelConfig"
import { getChartModeDef } from "../../../lib/chartMode"
import {
	populationOverrides,
	populationTemplate,
	presentPopulations,
	resolveLabelSelection,
} from "../../../lib/dataLabelsSelection"
import { buildLabelText } from "../../../lib/dataLabelsStyle"
import { effectiveType } from "../../../lib/fieldType"
import { ptToPx } from "../../../lib/fontUnit"
import type { MapConfig } from "../../../lib/mapConfig"
import { BASE_MARGIN } from "../../../lib/plotLayout"
import type {
	DataLabelsEncodings,
	DatasetView,
	Encodings,
	FieldType,
} from "../../../lib/types"
import { measureMaxLabelWidth } from "./measureText"

/** Estimate the data-label overflow on every edge. A label rendered
 *  at an outermost data point may extend past the plot's natural
 *  margins depending on alignment + offset + size encoding. PlotCanvas
 *  reserves extra room in the canvas so labels stay in view. The 0.55
 *  px/char fallback heuristic matches the legend's longest-label estimate.
 *
 *  The reserve is NOT capped here: like a wide legend, a long end-of-line
 *  label compresses the plot as far as needed so it stays in the viewport
 *  (the plot may shrink to nothing, exactly as it does beside an oversized
 *  legend). The solver only clamps the pair so the canvas never grows past
 *  the container in fit mode (LAYOUT.md §2). A fixed 400px cap used to
 *  live here, and any label wider than that clipped off the right edge.
 *
 *  Pure: PlotCanvas calls this inside its `dataLabelOverflow` useMemo,
 *  whose dep array (deliberately primitives — `dataLabels` is a
 *  freshly-spread object every render) governs recomputation. */
/** Breathing room (px) added to the overflowing side of the label. The
 *  reserve otherwise lands exactly on the measured glyph edge, and canvas
 *  measureText excludes the trailing side bearing while subpixel /
 *  antialiased rendering (and a webfont measured a hair narrow) can still
 *  nibble the last character. Same idea as the x-tick overhang's +3. */
export const LABEL_RESERVE_PAD_PX = 4

/** Upper bound on distinct label strings measured per template. Sorted
 *  longest-first before the cut, so only strings shorter than every kept
 *  one are dropped. */
const MAX_MEASURED_CANDIDATES = 2000

export const computeDataLabelOverflow = ({
	dataset,
	encodings,
	overrides,
	channelConfigs,
	mapConfig,
	dataLabels,
	dataLabelsEncodings,
}: {
	dataset: DatasetView | undefined
	encodings: Encodings
	overrides: Record<string, FieldType>
	channelConfigs: ChannelConfigs
	mapConfig: MapConfig
	dataLabels: DataLabelsConfig
	dataLabelsEncodings: DataLabelsEncodings
}): { left: number; right: number } => {
	const empty = { left: 0, right: 0 }
	if (!dataset) return empty
	// Geo modes anchor labels at region centroids INSIDE the plot area —
	// no edge overflow to reserve for. (PlotCanvas's own `mode` memo isn't
	// in scope here, so resolve the def inline; the registry scan is cheap.)
	const memoMode = getChartModeDef(
		encodings,
		(name) => effectiveType(dataset, name, overrides),
		channelConfigs,
		mapConfig
	)
	if (memoMode.canvas.coordFamily === "geo") return empty
	// Data labels have their own encoding atom; the rendered text comes
	// from that `value` mapping. Fall back to the chart's measure encoding
	// when the data-labels value isn't explicitly mapped (mirrors
	// DataLabelsLayer's fallback).
	// Rebuild the pieces `buildLabelText` needs from primitive fields so the
	// memo depends on those (stable) primitives, not the freshly-spread
	// `dataLabels` object (new every render → would defeat memoization).
	const value = {
		field: dataLabelsEncodings.value?.field ?? null,
		multiField: dataLabelsEncodings.value?.multiField,
		fields: dataLabelsEncodings.value?.fields,
	}
	const fallbackField =
		encodings.length?.field ?? encodings.y?.field ?? null
	const isMulti =
		value.multiField === true && (value.fields?.length ?? 0) > 0
	if (!isMulti && !(value.field ?? fallbackField)) return empty
	// One profile per label POPULATION the selection renders (all / first /
	// last — see lib/dataLabelsSelection). In a split selection the series-end
	// populations carry their own template / offset / alignment; a lone
	// population uses the base profile directly, mirroring the renderer. The
	// reserve must cover whichever labels actually render: a last label is
	// exactly the one that clips off the right edge, so its (often wider)
	// template drives the right-side reserve.
	const selection = resolveLabelSelection(
		{
			labelPoints: dataLabels.labelPoints,
			onlyLastLabel: dataLabels.onlyLastLabel,
			fieldLabelPoints: dataLabels.fieldLabelPoints,
		},
		value
	)
	/** Which canvas edge(s) a population's labels can sit against. */
	type ReserveEdges = "left" | "right" | "both"
	type ReserveProfile = {
		template: string | undefined
		xOffset: number
		alignment: "left" | "center" | "right"
		edges: ReserveEdges
	}
	const baseProfile: ReserveProfile = {
		template: dataLabels.labelTemplate,
		xOffset: dataLabels.xOffset ?? 0,
		alignment: dataLabels.alignment ?? "center",
		edges: "both",
	}
	// Series-end populations only touch ONE horizontal edge when the series
	// run along x: "first" anchors are the leftmost points, "last" the
	// rightmost (DataLabelsLayer ranks endpoints on `lastAxis`, which is x
	// unless the y field is categorical / ordinal — horizontal bars, where
	// the ends are top / bottom and either one can sit at either side). A
	// right-aligned LAST label hangs leftward over the plot, so it needs no
	// left reserve — treating it as if it could also sit at the left edge
	// opened a label-wide gutter on the left for a label that only ever
	// renders on the right. A series with a single anchor is first AND last
	// at once, so a lone x value keeps both edges.
	const { xField, yField } = axisFieldsFor(memoMode, encodings)
	const yType = yField ? effectiveType(dataset, yField, overrides) : null
	const endpointAxisIsX = !(yType === "categorical" || yType === "ordinal")
	// Counted PER FACET PANEL: a faceted chart with one bar per panel has a
	// single x value in every panel even though the dataset holds many, and
	// each panel's series end is then both first and last — dropping an
	// edge's reserve there shifted the whole plot when "Which labels"
	// changed, with no label actually moving.
	const singleAnchorPerSeries = (() => {
		if (!xField) return true
		const facetFields = [
			encodings.facet?.field,
			encodings.facetRow?.field,
			encodings.facetCol?.field,
		].filter((f): f is string => !!f)
		const seenByPanel = new Map<string, Set<unknown>>()
		for (const row of dataset.rows) {
			const panel = facetFields.map((f) => String(row[f] ?? "")).join("\u0000")
			let seen = seenByPanel.get(panel)
			if (!seen) {
				seen = new Set()
				seenByPanel.set(panel, seen)
			}
			seen.add(row[xField])
		}
		for (const seen of seenByPanel.values()) if (seen.size <= 1) return true
		return false
	})()
	const edgeGated =
		memoMode.canvas.coordFamily === "cartesian" &&
		endpointAxisIsX &&
		!singleAnchorPerSeries
	const edgesFor = (pop: "all" | "first" | "last"): ReserveEdges =>
		!edgeGated || pop === "all" ? "both" : pop === "first" ? "left" : "right"
	const templateCfg = {
		labelTemplate: dataLabels.labelTemplate,
		firstLabel: dataLabels.firstLabel,
		lastLabel: dataLabels.lastLabel,
	}
	// Separate variables (multi-field, "Combine variables" unchecked): each
	// variable is its own label, so a population reserves for its widest
	// single variable rather than the arranged template.
	const separate = isMulti && dataLabels.combineVariables === false
	const profiles: ReserveProfile[] = presentPopulations(selection).flatMap(
		(pop) => {
			const ov = populationOverrides(templateCfg, selection, pop)
			const shape = {
				xOffset: ov.xOffset ?? baseProfile.xOffset,
				alignment: ov.alignment ?? baseProfile.alignment,
				edges: edgesFor(pop),
			}
			if (separate) {
				// Each variable's own alignment / offset (its base), else the
				// layer's. Endpoint overrides don't apply to separate labels.
				return selection.fields[pop].map((f) => ({
					edges: shape.edges,
					xOffset: dataLabels.fieldOffsets?.[f]?.xOffset ?? baseProfile.xOffset,
					alignment: dataLabels.fieldAlignments?.[f] ?? baseProfile.alignment,
					template: `{${f}}`,
				}))
			}
			return [
				{
					...shape,
					// Templates only matter in multi-field mode (one field needs no
					// arrangement); each population composes with its own.
					template: isMulti
						? populationTemplate(templateCfg, selection, pop)
						: baseProfile.template,
				},
			]
		}
	)
	// Position rules can push a matching subset of labels past either edge
	// with their own X offset — reserve for each rule's offset too. Assuming
	// the longest label could take any rule's offset over-reserves slightly,
	// the same conservatism the sizeMax path applies.
	for (const rule of dataLabels.positionRules ?? []) {
		profiles.push({ ...baseProfile, xOffset: rule.xOffset, edges: "both" })
	}
	// Candidate RENDERED labels per distinct template, composed identically
	// to the layer via `buildLabelText`. In multi-field mode that's the full
	// template output (wider than any single field), so the reserved margin
	// tracks what actually draws.
	//
	// Every DISTINCT string is a candidate, not just the longest by character
	// count: glyph widths vary ~3× between faces like "i" and "W", so
	// "9.0% Medicare Traditional" (25 chars) measures NARROWER than
	// "46.8% Employer-Sponsored" (24 chars) — picking by length reserved for
	// the former and clipped the latter's last glyph. Candidates are capped
	// (longest-by-length first) so a huge dataset doesn't pay a measureText
	// per row; anything beyond the cap is shorter than every kept string by
	// enough characters that it can't out-measure them in practice.
	const candidatesByTemplate = new Map<string | undefined, string[]>()
	for (const p of profiles) {
		if (candidatesByTemplate.has(p.template)) continue
		const labelCfg = {
			decimals: dataLabels.decimals,
			labelTemplate: p.template,
			fieldFormats: dataLabels.fieldFormats,
		}
		const distinct = new Set<string>()
		for (const row of dataset.rows) {
			const text = buildLabelText(row, value, labelCfg, fallbackField)
			if (text) distinct.add(text)
		}
		const candidates = [...distinct]
			.sort((a, b) => b.length - a.length)
			.slice(0, MAX_MEASURED_CANDIDATES)
		candidatesByTemplate.set(p.template, candidates)
	}
	// When the user maps the `size` channel on data labels, each
	// label's rendered font size lerps into `[sizeMin, sizeMax]`.
	// The label width estimate has to use the LARGEST possible size
	// (sizeMax) so the canvas reserves enough room for the biggest
	// label, not just the default font-size case.
	// Per-variable sizes (multi-field mode) can likewise enlarge a piece of
	// the label, so the largest configured one joins the estimate — the
	// same conservatism as sizeMax.
	const sizeMapped = !!dataLabelsEncodings.size?.field
	const perVariableMax = isMulti
		? Math.max(
				0,
				...(value.fields ?? []).map((f) => dataLabels.fieldSizes?.[f] ?? 0)
			)
		: 0
	const fontSizeForEstimate = ptToPx(
		Math.max(
			sizeMapped
				? Math.max(dataLabels.fontSize, dataLabels.sizeMax ?? dataLabels.fontSize)
				: dataLabels.fontSize,
			perVariableMax
		)
	)
	// Whole pixels, never negative. No upper cap (see the module comment).
	const cap = (n: number) => Math.max(0, Math.ceil(n))
	let right = 0
	let left = 0
	for (const p of profiles) {
		const candidates = candidatesByTemplate.get(p.template) ?? []
		if (candidates.length === 0) continue
		// Measure the actual rendered width of every candidate with the
		// data-label font (family + weight + style) via canvas measureText
		// and keep the widest, mirroring the axis-tick fix (see
		// measureMaxLabelWidth). The old `chars * fontSize * 0.55` heuristic
		// ignored font family/weight and under-reserved for wide/bold faces,
		// so end-of-line series labels clipped off the right edge. Fall back
		// to the heuristic (on the longest string — candidates are sorted
		// longest-first) when canvas isn't available (SSR / non-DOM env),
		// where measureMaxLabelWidth returns 0.
		const measured = measureMaxLabelWidth(
			candidates,
			dataLabels.fontFamily,
			fontSizeForEstimate,
			dataLabels.fontWeight,
			dataLabels.italic,
		)
		const labelPx =
			measured > 0
				? measured
				: (candidates[0]?.length ?? 0) * fontSizeForEstimate * 0.55
		// Fraction of label width that lands to each side of the anchor:
		//   left  align → full width to the RIGHT, none to the left
		//   center      → half each way
		//   right align → none to the right, full width to the LEFT
		const rightFraction =
			p.alignment === "left" ? 1 : p.alignment === "center" ? 0.5 : 0
		const leftFraction =
			p.alignment === "right" ? 1 : p.alignment === "center" ? 0.5 : 0
		// Pad only the side(s) the text actually extends toward.
		const rightExtent =
			rightFraction > 0 ? labelPx * rightFraction + LABEL_RESERVE_PAD_PX : 0
		const leftExtent =
			leftFraction > 0 ? labelPx * leftFraction + LABEL_RESERVE_PAD_PX : 0
		// Subtract BASE_MARGIN on each side — the chart already reserves
		// space there; only excess past the natural margin counts. A
		// population pinned to one edge contributes to that edge only.
		if (p.edges !== "left") {
			right = Math.max(right, cap(p.xOffset + rightExtent - BASE_MARGIN.right))
		}
		if (p.edges !== "right") {
			left = Math.max(left, cap(-p.xOffset + leftExtent - BASE_MARGIN.left))
		}
	}
	return { left, right }
}
