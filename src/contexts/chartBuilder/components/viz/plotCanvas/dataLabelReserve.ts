import { axisFieldsFor } from "../../../lib/axisFields"
import { barTotalFieldName, withBarTotals } from "../../../lib/barTotalLabel"
import type { ChannelConfigs, DataLabelsConfig } from "../../../lib/channelConfig"
import { getChartModeDef } from "../../../lib/chartMode"
import { isBarModeId } from "../../../lib/chartModes/families"
import {
	labelKeysFor,
	normalizeComposedLabels,
	populationOverrides,
	presentPopulations,
	resolveLabelSelection,
	sectionKeysFor,
} from "../../../lib/dataLabelsSelection"
import { labelEntry } from "../../../lib/labelPieces"
import { BAR_LABEL_EDGE_PAD_PX } from "../../../lib/dataLabelsLayout"
import { buildLabelText } from "../../../lib/dataLabelsStyle"
import { effectiveType } from "../../../lib/fieldType"
import { ptToPx } from "../../../lib/fontUnit"
import type { MapConfig } from "../../../lib/mapConfig"
import { BASE_MARGIN } from "../../../lib/plotLayout"
import { resolveStackModes } from "../../../lib/stackMode"
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

/** The layer's render gate (DataLabelsLayer `positionMapped` /
 *  `valueMapped`), resolved from the mode's canvas traits instead of the
 *  renderer's `positionGate` prop: labels draw only once the position
 *  field(s) AND a value are explicitly mapped on the Data Labels shelf.
 *  Polar modes take `angle` (or legacy x + y); the axis-less structure
 *  layouts (packed circles / treemap / sunburst / chord / sankey) pick
 *  their own labeled nodes and text, so they skip both gates. */
const labelsRender = (
	mode: NonNullable<ReturnType<typeof getChartModeDef>>,
	enc: DataLabelsEncodings,
): boolean => {
	const { coordFamily, cartesianAxes } = mode.canvas
	if (coordFamily === "cartesian" && !cartesianAxes.x && !cartesianAxes.y)
		return true
	const xy = Boolean(enc.x?.field) && Boolean(enc.y?.field)
	const positionMapped =
		coordFamily === "polar" ? Boolean(enc.angle?.field) || xy : xy
	const valueMapped =
		Boolean(enc.value?.field) ||
		(enc.value?.multiField === true && (enc.value.fields?.length ?? 0) > 0)
	return positionMapped && valueMapped
}

export const computeDataLabelOverflow = ({
	dataset,
	encodings,
	overrides,
	channelConfigs,
	mapConfig,
	dataLabels: dataLabelsRaw,
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
	// A chart that draws no labels reserves nothing. The y / length fallback
	// below only composes the TEXT once labels exist; it used to double as
	// the "labels exist" test, so an unlabeled chart with long category
	// names reserved for the widest name on BOTH sides — on a row-faceted
	// dumbbell of hospital names that squeezed the plot to a 33px sliver
	// at export size and left a blank strip beside the row titles.
	if (!labelsRender(memoMode, dataLabelsEncodings)) return empty
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
	// Normalized like the layer: a pre-composed-labels save derives its list.
	const dataLabels = normalizeComposedLabels(dataLabelsRaw, value.fields ?? [])
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
	const selection = resolveLabelSelection(dataLabels, value)
	/** Which canvas edge(s) a population's labels can sit against. */
	type ReserveEdges = "left" | "right" | "both"
	type ReserveProfile = {
		template: string | undefined
		xOffset: number
		alignment: "left" | "center" | "right"
		edges: ReserveEdges
		/** A separate variable's own bar side (`fieldBarPlacements`), when
		 *  it has one; the layer-wide side otherwise. */
		side?: DataLabelsConfig["barLabelSide"]
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
	// One profile per label the layer draws in each population: single-field,
	// the one label with that population's endpoint overrides; multi-field,
	// every composed label in the population (`labelKeysFor`) with its own
	// alignment / offset / side, composing its own template — never the
	// endpoint overrides.
	const labelKeys = labelKeysFor(dataLabels, value)
	const labelTemplates = new Map(
		labelKeys.labels.map((l) => [l.id, l.template] as const)
	)
	const ownProfile = (key: string, pop: "all" | "first" | "last"): ReserveProfile => ({
		edges: edgesFor(pop),
		xOffset: dataLabels.fieldOffsets?.[key]?.xOffset ?? baseProfile.xOffset,
		alignment: dataLabels.fieldAlignments?.[key] ?? baseProfile.alignment,
		side: dataLabels.fieldBarPlacements?.[key]?.side,
		template: labelTemplates.get(key) ?? "",
	})
	const profiles: ReserveProfile[] = presentPopulations(selection).flatMap(
		(pop) => {
			if (isMulti) {
				return selection.labels[pop]
					.filter((key) => (labelTemplates.get(key) ?? "").trim() !== "")
					.map((key) => ownProfile(key, pop))
			}
			const ov = populationOverrides(templateCfg, selection, pop)
			return [
				{
					xOffset: ov.xOffset ?? baseProfile.xOffset,
					alignment: ov.alignment ?? baseProfile.alignment,
					edges: edgesFor(pop),
					template: baseProfile.template,
				},
			]
		}
	)
	// Position rules can push a matching subset of labels past either edge
	// with their own X offset — reserve for each rule's offset too. Assuming
	// the longest label could take any rule's offset over-reserves slightly,
	// the same conservatism the sizeMax path applies. The arranged label's
	// rules ride on the base profile; an own label's (a separate variable's
	// or a combination's) on its own, so its template and side still drive
	// the width.
	for (const rule of dataLabels.positionRules ?? []) {
		profiles.push({ ...baseProfile, xOffset: rule.xOffset, edges: "both" })
	}
	if (isMulti) {
		for (const key of labelKeys.keys) {
			for (const rule of dataLabels.fieldPositionRules?.[key] ?? []) {
				profiles.push({
					...ownProfile(key, "all"),
					xOffset: rule.xOffset,
					edges: "both",
				})
			}
		}
	}
	// Beside a VERTICAL bar (`barLabelSide`): the anchor is the bar's edge
	// plus the pad and the text is forced to hang away from the bar, whatever
	// alignment the profile carried — mirror both so the reserve covers the
	// label where it draws. The edge itself sits no further out than the
	// outermost category center the formula below already treats as the
	// plot edge, so only the pad moves. Horizontal bars shift labels
	// vertically, which this (left / right) reserve never models.
	const barSide = dataLabels.barLabelSide ?? "center"
	if (memoMode.id === "bars-x") {
		for (let i = 0; i < profiles.length; i++) {
			const p = profiles[i]
			const side = p.side ?? barSide
			if (side === "center") continue
			const after = side === "after"
			profiles[i] = {
				...p,
				alignment: after ? "left" : "right",
				xOffset: p.xOffset + (after ? BAR_LABEL_EDGE_PAD_PX : -BAR_LABEL_EDGE_PAD_PX),
			}
		}
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
	// Bars: the derived Bar total (`lib/barTotalLabel.ts`) is no column, so
	// each row is extended with its bar's total — summed per panel, category
	// and group sub-band, as the renderer does — and a `{Bar total}` label
	// measures what it draws. Other charts (where it isn't offered) and a
	// data set column of that name read the rows as they are.
	const barTotalField = isBarModeId(memoMode.id)
		? barTotalFieldName(dataset.fields.map((f) => f.name))
		: null
	const usesBarTotal =
		barTotalField !== null &&
		(isMulti
			? (value.fields ?? []).includes(barTotalField)
			: value.field === barTotalField)
	const candidateRows =
		barTotalField !== null && usesBarTotal
			? withBarTotals(dataset.rows, barTotalField, {
					keyFields: [
						memoMode.canvas.measureAxis === "y" ? xField : yField,
						encodings.facet?.field,
						encodings.facetRow?.field,
						encodings.facetCol?.field,
						...resolveStackModes(channelConfigs, encodings)
							.filter((m) => m.mode === "group")
							.map((m) => encodings[m.channel]?.field),
					].filter((f): f is string => !!f),
					lengthField: encodings.length?.field ?? null,
				})
			: dataset.rows
	const candidatesByTemplate = new Map<string | undefined, string[]>()
	for (const p of profiles) {
		if (candidatesByTemplate.has(p.template)) continue
		const labelCfg = {
			decimals: dataLabels.decimals,
			labelTemplate: p.template,
			fieldFormats: dataLabels.fieldFormats,
		}
		const distinct = new Set<string>()
		for (const row of candidateRows) {
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
	// Per-label sizes (multi-field mode) can likewise enlarge a label, so the
	// largest configured one joins the estimate — the same conservatism as
	// sizeMax. A label with a SPLIT Size section sizes each variable
	// separately, so its piece entries count too.
	const sizeMapped = !!dataLabelsEncodings.size?.field
	const sizeKeys = isMulti
		? labelKeys.keys.flatMap((k) =>
				sectionKeysFor(dataLabels, k, labelKeys.pieces[k] ?? [], "size")
			)
		: []
	const perVariableMax = Math.max(
		0,
		...sizeKeys.map((k) => labelEntry(dataLabels, "fieldSizes", k) ?? 0)
	)
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
