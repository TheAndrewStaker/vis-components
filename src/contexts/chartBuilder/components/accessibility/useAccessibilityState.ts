import { useMemo } from "react"
import { useAtomValue } from "jotai"
import {
	migrateAccessibilityConfig,
	resolveChartDescription,
} from "../../lib/accessibilityConfig"
import {
	patternDistinguishesLevels,
	shapeDrawsGlyphs,
	type AxisTitleState,
} from "../../lib/accessibilityCheck"
import { DEFAULT_OPACITY } from "../../lib/channelConfig"
import { effectiveType } from "../../lib/fieldType"
import {
	DEFAULT_TOOLTIP_CONFIG,
	LEGEND_CHANNELS,
	isTitleHidden,
	legendFontKey,
	resolveLegendHidden,
	type LabelsConfig,
} from "../../lib/labelsConfig"
import { orderCategories } from "../../lib/legendSections"
import { applyHueScale, makeHueScale } from "../../lib/scales"
import { uniqueValues } from "../../lib/uniqueFieldValues"
import {
	currentAccessibilityConfigAtom,
	currentDataLabelsEncodingsAtom,
	currentEncodingsAtom,
	currentFieldLevelOrdersAtom,
	currentFieldOverridesAtom,
	currentLabelsAtom,
	currentTooltipConfigAtom,
	currentVisualNameAtom,
} from "../../store/atoms"
import {
	renderChannelConfigsAtom,
	renderLegendConfigAtom,
} from "../../store/renderConfigs"
import { useChartModeDef } from "../../store/useChartModeDef"
import { useCurrentDatasetView } from "../../store/useCurrentDatasetView"

/** The editor-state half of the accessibility check's input — everything
 *  the rules need that the rendered DOM can't say reliably (which field the
 *  color encodes and its level colors, what else encodes that field, the
 *  tooltip / title settings). Targets are attached later from the DOM. */
export type AccessibilityState = {
	hue: null | {
		field: string
		discrete: boolean
		ordered: boolean
		levels: Array<{ value: string; color: string }>
		ends: [string, string] | null
	}
	redundantEncoding: { shape: boolean; pattern: boolean; position: boolean }
	/** The data-label fields include the color field. */
	labelsNameHueField: boolean
	/** Data labels are configured to draw (value mapped). */
	dataLabelsMapped: boolean
	tooltipsEnabled: boolean
	marks: {
		lowOpacity: { value: number } | null
		lineThicknessPx: number | null
		dataOutlineWidthPx: number | null
	}
	axes: { x: AxisTitleState | null; y: AxisTitleState | null }
	legends: Array<{ field: string; title: AxisTitleState }>
	/** The screen-reader description (rule 9). */
	description: {
		automatic: boolean
		hasTitle: boolean
		text: string
		visualName: string
	}
}

const axisTitleState = (
	labels: LabelsConfig,
	axis: "x" | "y",
	field: string | null,
	isMeasureAxis: boolean
): AxisTitleState => {
	const key = axis === "x" ? "xAxisTitle" : "yAxisTitle"
	if (isTitleHidden(labels, key)) return "hidden"
	const stored = labels[key]
	if (stored !== undefined) return stored.trim() === "" ? "empty" : "shown"
	// Undefined falls back to the field name; a measure axis with no field
	// (a histogram's count) is titled by the renderer.
	return field || isMeasureAxis ? "shown" : "empty"
}

export const useAccessibilityState = (): AccessibilityState | null => {
	const dataset = useCurrentDatasetView()
	const encodings = useAtomValue(currentEncodingsAtom)
	const overrides = useAtomValue(currentFieldOverridesAtom)
	const configs = useAtomValue(renderChannelConfigsAtom)
	const legendCfg = useAtomValue(renderLegendConfigAtom)
	// Raw labels (not `renderedLabelsAtom`): the check must see a title the
	// "Titles shown" box hid, to word the finding as "hidden".
	const labels = useAtomValue(currentLabelsAtom)
	const tooltip = useAtomValue(currentTooltipConfigAtom)
	const labelEnc = useAtomValue(currentDataLabelsEncodingsAtom)
	const levelOrders = useAtomValue(currentFieldLevelOrdersAtom)
	const mode = useChartModeDef()
	const accessibility = useAtomValue(currentAccessibilityConfigAtom)
	const visualName = useAtomValue(currentVisualNameAtom)

	return useMemo((): AccessibilityState | null => {
		if (!dataset) return null
		const hueField = encodings.hue?.field ?? null
		let hue: AccessibilityState["hue"] = null
		if (hueField) {
			const type = effectiveType(dataset, hueField, overrides)
			const values = dataset.rows.map((r) => r[hueField])
			const discrete = type === "categorical" || type === "ordinal"
			const scale = makeHueScale(
				values,
				type,
				configs.hue,
				type === "ordinal"
					? (configs.ordinalPalette ?? configs.categoricalPalette)
					: configs.categoricalPalette
			)
			if (discrete && scale.kind === "categorical") {
				const ordered = orderCategories(
					uniqueValues(values, { type }),
					type,
					levelOrders[hueField]
				)
				const levels = ordered.flatMap((v) => {
					const c = applyHueScale(scale, v, type)
					return c ? [{ value: v, color: c }] : []
				})
				const first = levels[0]
				const last = levels.at(-1)
				hue = {
					field: hueField,
					discrete: true,
					ordered: type === "ordinal",
					levels,
					ends: first && last && levels.length >= 2 ? [first.color, last.color] : null,
				}
			} else if (scale.kind !== "categorical") {
				const domain = scale.scale.domain() as number[]
				const lo = domain[0]
				const hi = domain.at(-1)
				hue = {
					field: hueField,
					discrete: false,
					ordered: true,
					levels: [],
					ends:
						lo !== undefined && hi !== undefined
							? [String(scale.scale(lo)), String(scale.scale(hi))]
							: null,
				}
			}
		}

		const positionFields = [
			encodings.x?.field,
			encodings.y?.field,
			encodings.facet?.field,
			encodings.facetRow?.field,
			encodings.facetCol?.field,
		]
		const value = labelEnc.value
		const labelFields = [
			value.field,
			...(value.multiField === true ? (value.fields ?? []) : []),
		].filter((f): f is string => !!f)
		const dataLabelsMapped = labelFields.length > 0

		const { cartesianAxes, measureAxis } = mode.canvas
		const axisField = (axis: "x" | "y"): string | null =>
			measureAxis === axis
				? (mode.canvas.resolveMeasureField?.(encodings) ?? null)
				: (encodings[axis]?.field ?? null)

		// Lines carry data only on cartesian charts that draw them from the
		// connection channel (maps use it as the region key).
		const linesDrawn =
			!!encodings.connection?.field &&
			!mode.legend.hideConnectionInThisMode &&
			(cartesianAxes.x || cartesianAxes.y)
		const conn = configs.connection
		const thicknesses = linesDrawn && conn
			? [conn.thickness, ...Object.values(conn.thicknessByValue ?? {})].filter(
					(t): t is number => typeof t === "number" && t > 0
				)
			: []

		const opacity = encodings.opacity?.field
			? null
			: (configs.defaultOpacity ?? DEFAULT_OPACITY)

		const hidden = resolveLegendHidden(legendCfg.hidden ?? {}, mode.legend)
		const legends: AccessibilityState["legends"] = []
		const seenFields = new Set<string>()
		for (const ch of LEGEND_CHANNELS) {
			const field = encodings[ch]?.field
			if (!field || hidden[ch] || seenFields.has(field)) continue
			seenFields.add(field)
			const typed = labels.legendTitles?.[ch]
			legends.push({
				field,
				title: isTitleHidden(labels, legendFontKey(ch))
					? "hidden"
					: typed !== undefined && typed.trim() === ""
						? "empty"
						: "shown",
			})
		}

		return {
			hue,
			redundantEncoding: {
				// Only channels this mode actually DRAWS count as a second
				// cue (the mode traits that gate the Shape / Pattern panels).
				shape:
					!!hueField &&
					encodings.shape?.field === hueField &&
					shapeDrawsGlyphs(mode.canvas.shapeRole),
				pattern:
					!!hueField &&
					encodings.pattern?.field === hueField &&
					patternDistinguishesLevels({
						levels: hue?.levels.map((l) => l.value) ?? [],
						connectionRole: mode.canvas.connectionRole,
						connectionMapped: !!encodings.connection?.field,
						overrides: configs.pattern?.overrides,
						dashOverrides: configs.pattern?.dashOverrides,
						customDashOverrides: configs.pattern?.customDashOverrides,
					}),
				position: !!hueField && positionFields.includes(hueField),
			},
			labelsNameHueField: !!hueField && labelFields.includes(hueField),
			dataLabelsMapped,
			tooltipsEnabled: { ...DEFAULT_TOOLTIP_CONFIG, ...tooltip }.enabled,
			marks: {
				lowOpacity:
					opacity !== null && opacity < 0.4
						? { value: opacity }
						: null,
				lineThicknessPx: thicknesses.length > 0 ? Math.min(...thicknesses) : null,
				dataOutlineWidthPx: encodings.outlineHue?.field
					? (configs.shape?.outlineWidth ?? null)
					: null,
			},
			axes: {
				x: cartesianAxes.x
					? axisTitleState(labels, "x", axisField("x"), measureAxis === "x")
					: null,
				y: cartesianAxes.y
					? axisTitleState(labels, "y", axisField("y"), measureAxis === "y")
					: null,
			},
			legends,
			description: {
				automatic: migrateAccessibilityConfig(accessibility).description === null,
				hasTitle: labels.title.trim() !== "",
				text: resolveChartDescription(accessibility, {
					title: labels.title,
					subtitle: labels.subtitle,
					visualName,
				}),
				visualName,
			},
		}
	}, [
		dataset,
		encodings,
		overrides,
		configs,
		legendCfg,
		labels,
		tooltip,
		labelEnc,
		levelOrders,
		mode,
		accessibility,
		visualName,
	])
}
