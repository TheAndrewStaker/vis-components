import {
	DEFAULT_ANGLE_CONFIG,
	DEFAULT_AXIS_CONFIG,
	DEFAULT_CHORD_AXIS_CONFIG,
	DEFAULT_CONNECTION_CONFIG,
	DEFAULT_DATA_LABELS_CONFIG,
	type ChannelConfigs,
	type DataLabelsConfig,
} from "../channelConfig"
import { parseFormatSpec } from "../formatTick"
import {
	DEFAULT_LEGEND_CHANNEL_CONFIG,
	DEFAULT_LEGEND_CONFIG,
	QUANTITATIVE_LEGEND_CHANNELS,
	type LegendConfig,
	type QuantitativeLegendChannel,
} from "../labelsConfig"
import type {
	DataKind,
	DataLabelsEncodings,
	Encodings,
	FormatSurfaceKey,
	TemplateMeta,
	TemplateSourceField,
} from "../types"

/** The slice of a visual (or editor draft) that holds format strings and
 * the field bindings that say which field each one formats. `Visual` and
 * `TemplateBody` both satisfy it. */
export type FormatConfigs = {
	encodings: Encodings
	dataLabelsEncodings?: DataLabelsEncodings
	channelConfigs: ChannelConfigs
	legendConfig?: Partial<LegendConfig>
	dataLabelsConfig?: Partial<DataLabelsConfig>
}

/** One format-bearing place in a visual. `fieldOf` names the field the
 * format applies to (null = surface unbound); `read` returns the stored
 * format (undefined = slot absent, which reads as Auto); `write` stores
 * one — identity-preserving when the value is unchanged, merging over the
 * proper DEFAULT_* config when the slot is absent. */
export type FormatSurface = {
	key: FormatSurfaceKey
	fieldOf: (
		encodings: Encodings,
		dataLabelsEncodings?: DataLabelsEncodings,
	) => string | null
	read: (configs: FormatConfigs) => string | undefined
	write: <T extends FormatConfigs>(configs: T, format: string) => T
}

/** A stored format whose SPEC is still Auto — "" outright, or Before /
 * After text around an empty spec. Same test as `formatHintDefaults.ts`. */
const isAuto = (stored: string | undefined): boolean =>
	parseFormatSpec(stored ?? "").spec.trim() === ""

/** Absent and "" are the same value (Auto). */
const unchanged = (stored: string | undefined, format: string): boolean =>
	(stored ?? "") === format

const withChannelConfigs = <T extends FormatConfigs>(
	configs: T,
	channelConfigs: ChannelConfigs,
): T => ({ ...configs, channelConfigs })

const axisSurface = (ch: "x" | "y" | "r"): FormatSurface => ({
	key: `axis:${ch}`,
	// A positional axis without its own field can still be the MEASURE axis
	// (bar-family charts encode the value on `length`), exactly as
	// `applyFormatHintsToChannelConfigs` resolves it.
	fieldOf: (enc) => enc[ch]?.field ?? enc.length?.field ?? null,
	read: (c) => c.channelConfigs[ch]?.customFormat,
	write: (c, format) => {
		const existing = c.channelConfigs[ch]
		if (unchanged(existing?.customFormat, format)) return c
		return withChannelConfigs(c, {
			...c.channelConfigs,
			[ch]: { ...(existing ?? DEFAULT_AXIS_CONFIG), customFormat: format },
		})
	},
})

const angleSurface: FormatSurface = {
	key: "axis:angle",
	fieldOf: (enc) => enc.angle?.field ?? null,
	read: (c) => c.channelConfigs.angle?.customFormat,
	write: (c, format) => {
		const existing = c.channelConfigs.angle
		if (unchanged(existing?.customFormat, format)) return c
		return withChannelConfigs(c, {
			...c.channelConfigs,
			angle: {
				...DEFAULT_ANGLE_CONFIG,
				...(existing ?? {}),
				customFormat: format,
			},
		})
	},
}

/** The chord ring axis measures the flow value, which rides on `area`
 * (as `tooltipFormats.ts` reads it). */
const chordSurface: FormatSurface = {
	key: "axis:chord",
	fieldOf: (enc) => enc.area?.field ?? null,
	read: (c) => c.channelConfigs.connection?.chordAxis?.customFormat,
	write: (c, format) => {
		const conn = c.channelConfigs.connection
		if (unchanged(conn?.chordAxis?.customFormat, format)) return c
		const base = conn ?? DEFAULT_CONNECTION_CONFIG
		return withChannelConfigs(c, {
			...c.channelConfigs,
			connection: {
				...base,
				chordAxis: {
					...DEFAULT_CHORD_AXIS_CONFIG,
					...(base.chordAxis ?? {}),
					customFormat: format,
				},
			},
		})
	},
}

const legendSurface = (ch: QuantitativeLegendChannel): FormatSurface => ({
	key: `legend:${ch}`,
	fieldOf: (enc) => enc[ch]?.field ?? null,
	read: (c) => c.legendConfig?.channels?.[ch]?.format,
	write: (c, format) => {
		const legend = c.legendConfig
		const existing = legend?.channels?.[ch]
		if (unchanged(existing?.format, format)) return c
		return {
			...c,
			legendConfig: {
				...(legend ?? DEFAULT_LEGEND_CONFIG),
				channels: {
					...(legend?.channels ?? {}),
					[ch]: { ...(existing ?? DEFAULT_LEGEND_CHANNEL_CONFIG), format },
				},
			},
		}
	},
})

/** Data-label formats are keyed by field NAME in `fieldFormats`; writing
 * Auto ("") removes the entry, keeping the map sparse. */
const writeFieldFormat = <T extends FormatConfigs>(
	c: T,
	field: string,
	format: string,
): T => {
	const cfg = c.dataLabelsConfig
	const formats = cfg?.fieldFormats
	if (unchanged(formats?.[field], format)) return c
	const next = { ...(formats ?? {}) }
	if (format === "") delete next[field]
	else next[field] = format
	return {
		...c,
		dataLabelsConfig: { ...(cfg ?? DEFAULT_DATA_LABELS_CONFIG), fieldFormats: next },
	}
}

const singleValueField = (dle?: DataLabelsEncodings): string | null =>
	dle && !dle.value.multiField ? (dle.value.field ?? null) : null

const multiValueField = (
	dle: DataLabelsEncodings | undefined,
	i: number,
): string | null =>
	dle?.value.multiField ? (dle.value.fields?.[i] ?? null) : null

const labelsValueSurface: FormatSurface = {
	key: "labels:value",
	fieldOf: (_enc, dle) => singleValueField(dle),
	read: (c) => {
		const f = singleValueField(c.dataLabelsEncodings)
		return f ? c.dataLabelsConfig?.fieldFormats?.[f] : undefined
	},
	write: (c, format) => {
		const f = singleValueField(c.dataLabelsEncodings)
		return f ? writeFieldFormat(c, f, format) : c
	},
}

const labelsMultiSurface = (i: number): FormatSurface => ({
	key: `labels:value:${i}`,
	fieldOf: (_enc, dle) => multiValueField(dle, i),
	read: (c) => {
		const f = multiValueField(c.dataLabelsEncodings, i)
		return f ? c.dataLabelsConfig?.fieldFormats?.[f] : undefined
	},
	write: (c, format) => {
		const f = multiValueField(c.dataLabelsEncodings, i)
		return f ? writeFieldFormat(c, f, format) : c
	},
})

/** The fixed surfaces. Multi-field data-label surfaces depend on how many
 * fields are selected, so `formatSurfacesFor` appends those. */
export const FORMAT_SURFACES: readonly FormatSurface[] = [
	axisSurface("x"),
	axisSurface("y"),
	axisSurface("r"),
	angleSurface,
	chordSurface,
	...QUANTITATIVE_LEGEND_CHANNELS.map(legendSurface),
	labelsValueSurface,
]

/** Every concrete surface for these encodings: the fixed table plus one
 * `labels:value:<i>` per selected multi-field data-label field. */
export const formatSurfacesFor = (
	_encodings: Encodings,
	dataLabelsEncodings?: DataLabelsEncodings,
): FormatSurface[] => {
	const value = dataLabelsEncodings?.value
	const n = value?.multiField ? (value.fields?.length ?? 0) : 0
	return [
		...FORMAT_SURFACES,
		...Array.from({ length: n }, (_, i) => labelsMultiSurface(i)),
	]
}

/** Record, per bound surface whose stored format is NOT Auto, that format
 * under the bound field's data kind. Fields not in `sourceFields` (kind
 * unknown) are skipped. */
export const collectFormatMemory = (
	configs: FormatConfigs,
	sourceFields: readonly TemplateSourceField[],
): TemplateMeta["formatMemory"] => {
	const kinds = new Map(sourceFields.map((f) => [f.name, f.kind]))
	const memory: TemplateMeta["formatMemory"] = {}
	for (const s of formatSurfacesFor(
		configs.encodings,
		configs.dataLabelsEncodings,
	)) {
		const field = s.fieldOf(configs.encodings, configs.dataLabelsEncodings)
		if (!field) continue
		const kind = kinds.get(field)
		if (!kind) continue
		const stored = s.read(configs)
		if (stored === undefined || isAuto(stored)) continue
		memory[s.key] = { ...memory[s.key], [kind]: stored }
	}
	return memory
}

/** Set each bound surface's format from memory by its (new) field's kind:
 * a hit writes the remembered string, a miss (unknown kind, or nothing
 * remembered for it) writes Auto (""). Identity-preserving when nothing
 * changes. */
export const applyFormatMemory = <T extends FormatConfigs>(
	configs: T,
	memory: TemplateMeta["formatMemory"],
	fieldKinds: ReadonlyMap<string, DataKind>,
): T => {
	let out = configs
	for (const s of formatSurfacesFor(
		configs.encodings,
		configs.dataLabelsEncodings,
	)) {
		const field = s.fieldOf(configs.encodings, configs.dataLabelsEncodings)
		if (!field) continue
		const kind = fieldKinds.get(field)
		const hit = kind ? memory[s.key]?.[kind] : undefined
		out = s.write(out, hit ?? "")
	}
	return out
}

/** Deep-merge format memory per surface per kind; `incoming` wins. */
export const mergeFormatMemory = (
	existing: TemplateMeta["formatMemory"],
	incoming: TemplateMeta["formatMemory"],
): TemplateMeta["formatMemory"] => {
	const out: TemplateMeta["formatMemory"] = { ...existing }
	for (const [key, kinds] of Object.entries(incoming))
		out[key] = { ...(existing[key] ?? {}), ...kinds }
	return out
}
