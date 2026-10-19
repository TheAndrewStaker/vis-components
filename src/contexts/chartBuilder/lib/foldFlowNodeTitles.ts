// Flow diagrams (chord / sankey) styled their node labels under Labels →
// "Node titles" until 2026-10-19; Data Labels owns them now. This pass
// moves a visual's stored Node-titles styling into its Data Labels config
// so it keeps its look:
//   font family / size / weight / italic / underline / color → the Data
//     Labels text fields; alignment → alignment; x / y → the x / y nudges.
// The radial "Distance" offset has no Data Labels equivalent and is dropped.
// The `nodeTitle` entries are then removed from the labels config.
//
// It runs beside `structureVisualKeys` on every intake — opening a visual
// (editor and embed), saving one, importing a bundle, seeding examples —
// rather than as a versioned migration, so no stored content stamp moves.
// Idempotent (a folded visual has no `nodeTitle` entries left), tolerant of
// sparse / partial records, and the same reference when there's nothing to
// move. Only chord / sankey visuals fold: on any other chart the entry was
// already inert, and Data Labels there styles other labels.

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === "object" && v !== null && !Array.isArray(v)

const NODE_TITLE = "nodeTitle"

/** The map without its `nodeTitle` entry (undefined in → undefined out). */
const withoutNodeTitle = (map: unknown): unknown => {
	if (!isRecord(map) || !(NODE_TITLE in map)) return map
	const { [NODE_TITLE]: _dropped, ...rest } = map
	return rest
}

export const foldFlowNodeTitles = <T>(visual: T): T => {
	if (!isRecord(visual)) return visual
	const cc = visual.channelConfigs
	const layout =
		isRecord(cc) && isRecord(cc.connection)
			? cc.connection.hierarchyLayout
			: undefined
	if (layout !== "chord" && layout !== "sankey") return visual
	const labels = visual.labelsConfig
	if (!isRecord(labels)) return visual
	const fontMap = labels.fontOverrides
	const alignMap = labels.titleAlignments
	const offsetMap = labels.titleOffsets
	const font = isRecord(fontMap) ? fontMap[NODE_TITLE] : undefined
	const align = isRecord(alignMap) ? alignMap[NODE_TITLE] : undefined
	const offset = isRecord(offsetMap) ? offsetMap[NODE_TITLE] : undefined
	if (font === undefined && align === undefined && offset === undefined) {
		return visual
	}

	const dl: Record<string, unknown> = isRecord(visual.dataLabelsConfig)
		? { ...visual.dataLabelsConfig }
		: {}
	if (isRecord(font)) {
		if (typeof font.family === "string") dl.fontFamily = font.family
		if (typeof font.size === "number") dl.fontSize = font.size
		if (typeof font.weight === "number") dl.fontWeight = font.weight
		if (typeof font.italic === "boolean") dl.italic = font.italic
		if (typeof font.underline === "boolean") dl.underline = font.underline
		if (typeof font.color === "string") dl.color = font.color
	}
	if (align === "left" || align === "center" || align === "right") {
		dl.alignment = align
	}
	// Both offsets are screen coordinates (+y = down), so they copy as-is.
	if (isRecord(offset)) {
		if (typeof offset.x === "number") dl.xOffset = offset.x
		if (typeof offset.y === "number") dl.yOffset = offset.y
	}

	return {
		...visual,
		labelsConfig: {
			...labels,
			fontOverrides: withoutNodeTitle(fontMap),
			titleAlignments: withoutNodeTitle(alignMap),
			titleOffsets: withoutNodeTitle(offsetMap),
		},
		dataLabelsConfig: dl,
	}
}
