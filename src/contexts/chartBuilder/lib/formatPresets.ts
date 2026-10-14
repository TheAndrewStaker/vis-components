import { LITERAL_FORMAT, parseFormatSpec } from "./formatTick"
import { COUNTRY_NAME_FORMAT } from "./geo/countryNames"

/** Dropdown value for the "Auto" preset in every format dropdown. Selecting
 *  it clears the stored spec to "" — the empty string is what every
 *  formatter reads as "fall back to the default format", so it can't be the
 *  option value itself. */
export const FORMAT_PRESET_AUTO = "__auto__"

/** Dropdown value shown when the Format box holds text that doesn't trace
 *  back to any preset (a hand-written spec, or a preset the current chart
 *  doesn't offer). It's a display-only entry — picking it changes nothing,
 *  the box stays the source of truth. */
export const FORMAT_PRESET_CUSTOM = "__custom__"

export type FormatPresetOption = {
	/** The spec stored verbatim in the Format box (or the Auto sentinel). */
	value: string
	label: string
}

/** A `<optgroup>`'s worth of presets; `label` absent = ungrouped, rendered
 *  as bare options at the top of the list. */
export type FormatPresetGroup = {
	label?: string
	options: readonly FormatPresetOption[]
}

const GENERAL_GROUP: FormatPresetGroup = {
	options: [
		{ value: FORMAT_PRESET_AUTO, label: "Auto (default)" },
		{ value: LITERAL_FORMAT, label: "Literal (show value as-is)" },
		{ value: `${LITERAL_FORMAT}%`, label: "Literal + % (3 → 3%)" },
	],
}

const GEOGRAPHY_GROUP: FormatPresetGroup = {
	label: "Geography",
	options: [
		{
			value: COUNTRY_NAME_FORMAT,
			label: "Full country name (Democratic Republic of the Congo)",
		},
	],
}

const NUMERIC_GROUP: FormatPresetGroup = {
	label: "Numeric",
	options: [
		{ value: ",", label: "Thousands separator (1,234)" },
		{ value: ",.0f", label: "Whole numbers (1,234)" },
		{ value: ".2f", label: "Two decimals (12.34)" },
		{ value: ".0%", label: "Percent (12%)" },
		{ value: ".1%", label: "Percent · 1 decimal (12.3%)" },
	],
}

/** Millions / Billions here are the plain-number twins of the Currency
 *  ones: same fixed-scale letter (`parseScaledSpec`), no dollar sign. */
const SCIENTIFIC_GROUP: FormatPresetGroup = {
	label: "Scientific",
	options: [
		{ value: ".2e", label: "Scientific notation (1.23e+4)" },
		{ value: ".3s", label: "SI prefix (1.23k)" },
		{ value: ",.1~fM", label: "Millions (1.2M)" },
		{ value: ",.1~fB", label: "Billions (1.2B)" },
	],
}

/** The K / M / B entries end in a fixed-scale letter (`parseScaledSpec`):
 *  the value is divided by that scale and the letter printed after it, so
 *  every label shares ONE scale — unlike the Numeric SI prefix, which d3
 *  picks per value. `.1~f` keeps one decimal where it carries information
 *  and trims it otherwise ($2.5M, $5M). */
const CURRENCY_GROUP: FormatPresetGroup = {
	label: "Currency",
	options: [
		{ value: "$,.0f", label: "Whole dollars ($1,234)" },
		{ value: "$,.2f", label: "Dollars and cents ($1,234.56)" },
		{ value: "$,.1~fK", label: "Thousands ($12.5K)" },
		{ value: "$,.1~fM", label: "Millions ($1.2M)" },
		{ value: "$,.1~fB", label: "Billions ($1.2B)" },
	],
}

const TEMPORAL_GROUP: FormatPresetGroup = {
	label: "Temporal",
	options: [
		{ value: "%Y-%m-%d", label: "ISO date (2026-05-20)" },
		{ value: "%b %Y", label: "Month + year (May 2026)" },
		{ value: "%Y", label: "Year (2026)" },
		{ value: "%b %d", label: "Day + month (May 20)" },
		{ value: "%H:%M", label: "Time (14:35)" },
	],
}

/** The ONE list of format presets, as data. `FormatPresetOptions` renders
 *  it into every format dropdown in the sidebar — x / y / r tick labels, the
 *  chord ring axis tick labels, per-field data labels, legend measure
 *  labels — so the choices (and their wording) can never drift apart again.
 *  `countryNames` adds the Geography group; the data-label panels pass it on
 *  countries-level geo charts only. */
export const formatPresetGroups = (countryNames = false): FormatPresetGroup[] =>
	countryNames
		? [
				GENERAL_GROUP,
				GEOGRAPHY_GROUP,
				NUMERIC_GROUP,
				CURRENCY_GROUP,
				SCIENTIFIC_GROUP,
				TEMPORAL_GROUP,
			]
		: [GENERAL_GROUP, NUMERIC_GROUP, CURRENCY_GROUP, SCIENTIFIC_GROUP, TEMPORAL_GROUP]

const presetValues = (countryNames: boolean): Set<string> =>
	new Set(
		formatPresetGroups(countryNames).flatMap((g) =>
			g.options.map((o) => o.value)
		)
	)

/** Maps a raw format-dropdown selection onto the spec to store: the Auto
 *  sentinel clears to "", the display-only Custom entry is a no-op (returns
 *  null), any other value is the spec verbatim. */
export const formatPresetSelection = (value: string): string | null => {
	if (value === FORMAT_PRESET_AUTO) return ""
	if (value === "" || value === FORMAT_PRESET_CUSTOM) return null
	return value
}

/** The reverse of `formatPresetSelection`: which dropdown entry a stored
 *  format string belongs under, so the dropdown keeps SHOWING the preset the
 *  user picked while the box below holds their edit of it. An exact preset
 *  match wins; otherwise the spec is split off the surrounding literal text
 *  (`,.0f kg` → `,.0f`, `€literal` → `literal`) and matched, so editing a
 *  preset's affixes doesn't drop the dropdown back to nothing. Anything else
 *  — a hand-written spec, or a preset this chart doesn't offer — reads as
 *  Custom. */
export const formatPresetValueFor = (
	raw: string,
	countryNames = false
): string => {
	if (raw === "") return FORMAT_PRESET_AUTO
	const values = presetValues(countryNames)
	if (values.has(raw)) return raw
	const { spec } = parseFormatSpec(raw)
	// `{}%` and friends: Auto labels with text wrapped around them.
	if (spec === "") return FORMAT_PRESET_AUTO
	if (values.has(spec)) return spec
	return FORMAT_PRESET_CUSTOM
}
