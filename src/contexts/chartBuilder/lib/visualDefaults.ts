import { DEFAULT_ANNOTATIONS_CONFIG } from "./annotationsConfig"
import { DEFAULT_CAPTION_CONFIG } from "./captionConfig"
import {
	DEFAULT_DATA_TABLE_CONFIG,
	migrateDataTableConfig,
} from "./dataTableConfig"
import {
	DEFAULT_ACCESSIBILITY_CONFIG,
	migrateAccessibilityConfig,
} from "./accessibilityConfig"
import {
	DEFAULT_DATA_LABELS_CONFIG,
	EMPTY_CHANNEL_CONFIGS,
} from "./channelConfig"
import {
	DEFAULT_LEGEND_CONFIG,
	DEFAULT_TOOLTIP_CONFIG,
	migrateLabelsConfig,
} from "./labelsConfig"
import { DEFAULT_DERIVED_VARIABLES_CONFIG } from "./derivedVariables"
import { DEFAULT_MAP_CONFIG } from "./mapConfig"
import { DEFAULT_RESHAPE_CONFIG } from "./reshape"
import {
	configsFromTheme,
	captionConfigFromTheme,
	dataLabelsConfigFromTheme,
	labelsFromTheme,
	legendConfigFromTheme,
} from "./themeConfig"
import {
	emptyDataLabelsEncodings,
	emptyEncodings,
	type Theme,
	type Visual,
} from "./types"

export const newVisualId = () =>
	`vs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

/** The per-visual design slices the editor holds in its draft atoms, every
 * one present. Identity, name, dataset binding, theme id and template link
 * are not slices: the store sets those itself. */
export type VisualDraft = Required<
	Pick<
		Visual,
		| "encodings"
		| "fieldTypeOverrides"
		| "channelConfigs"
		| "labelsConfig"
		| "legendConfig"
		| "tooltipConfig"
		| "dataLabelsEncodings"
		| "dataLabelsConfig"
		| "fieldLevelOrders"
		| "fieldLevelOrderSpecs"
		| "fieldOrder"
		| "annotationsConfig"
		| "captionConfig"
		| "dataTableConfig"
		| "accessibilityConfig"
		| "mapConfig"
		| "reshapeConfig"
		| "derivedVariablesConfig"
	>
>

/** The draft a new, unsaved visual starts from: nothing mapped, and the
 * theme's look seeded into the theme-driven configs. */
export const newVisualDraft = (theme: Theme): VisualDraft => ({
	encodings: emptyEncodings(),
	fieldTypeOverrides: {},
	channelConfigs: configsFromTheme(theme),
	labelsConfig: labelsFromTheme(theme),
	legendConfig: legendConfigFromTheme(theme),
	tooltipConfig: DEFAULT_TOOLTIP_CONFIG,
	dataLabelsEncodings: emptyDataLabelsEncodings(),
	dataLabelsConfig: dataLabelsConfigFromTheme(theme),
	fieldLevelOrders: {},
	fieldLevelOrderSpecs: {},
	fieldOrder: [],
	annotationsConfig: DEFAULT_ANNOTATIONS_CONFIG,
	captionConfig: captionConfigFromTheme(theme),
	dataTableConfig: DEFAULT_DATA_TABLE_CONFIG,
	accessibilityConfig: DEFAULT_ACCESSIBILITY_CONFIG,
	mapConfig: DEFAULT_MAP_CONFIG,
	reshapeConfig: DEFAULT_RESHAPE_CONFIG,
	derivedVariablesConfig: DEFAULT_DERIVED_VARIABLES_CONFIG,
})

/** A stored visual's draft as the editor opens it: the default merges and
 * migrations an older row needs. Pass it the already-structured row
 * (`structureVisualKeys` / `foldFlowNodeTitles` run at intake). */
export const hydrateVisual = (visual: Visual): VisualDraft => ({
	// Back-compat: merge with emptyEncodings() so newly-added channels
	// (e.g. "opacity" added after the visual was saved) get a default
	// `{ field: null }` instead of leaving the slot undefined.
	encodings: {
		...emptyEncodings(),
		...visual.encodings,
	},
	fieldTypeOverrides: visual.fieldTypeOverrides,
	channelConfigs: visual.channelConfigs ?? EMPTY_CHANNEL_CONFIGS,
	// Back-compat: migrate older visuals whose labelsConfig predates the
	// Titles/Text base-font split (or lacks legendTitles altogether).
	labelsConfig: migrateLabelsConfig(visual.labelsConfig),
	// Back-compat: legend / tooltip configs were added later; older
	// visuals don't carry them. Default-merge so missing fields don't
	// blow up the renderer.
	legendConfig: {
		...DEFAULT_LEGEND_CONFIG,
		...visual.legendConfig,
	},
	tooltipConfig: {
		...DEFAULT_TOOLTIP_CONFIG,
		...visual.tooltipConfig,
	},
	// Back-compat: data-labels state was added later. Older visuals don't
	// carry these blobs at all; default-merge so the fields exist on the
	// atoms even when the saved visual is silent.
	dataLabelsEncodings: {
		...emptyDataLabelsEncodings(),
		...visual.dataLabelsEncodings,
	},
	dataLabelsConfig: {
		...DEFAULT_DATA_LABELS_CONFIG,
		...visual.dataLabelsConfig,
	},
	// Per-field level orderings — added after first release. Older
	// visuals leave this undefined; the renderer treats missing entries
	// as "no override" → smart-sort fallback.
	fieldLevelOrders: visual.fieldLevelOrders ?? {},
	// What the "Order by" picker was set to for each of those orders —
	// added after level ordering shipped. Older visuals leave it
	// undefined; the panel then shows an unset picker over an order it
	// can't explain, exactly as it always did.
	fieldLevelOrderSpecs: visual.fieldLevelOrderSpecs ?? {},
	// The column order — added after drag reorder moved from the data set
	// to the visual. Absent = the data set's own order.
	fieldOrder: visual.fieldOrder ?? [],
	// Per-visual annotations — added after first release. Older visuals
	// (and any saved before this field was bound into the save cycle)
	// leave it undefined; fall back to an empty annotation set so a prior
	// visual's rectangles don't linger on the global atom.
	annotationsConfig: visual.annotationsConfig ?? DEFAULT_ANNOTATIONS_CONFIG,
	// Per-visual caption — added after first release. Older visuals leave
	// it undefined; default-merge so missing fields exist on the atom and
	// a prior visual's caption doesn't linger.
	captionConfig: {
		...DEFAULT_CAPTION_CONFIG,
		...visual.captionConfig,
	},
	// Per-visual data table — added after first release. Older visuals
	// leave it undefined, which normalizes to the disabled default; a
	// prior visual's table settings never linger.
	dataTableConfig: migrateDataTableConfig(visual.dataTableConfig),
	// Per-visual screen-reader description — added after first release.
	// Absent normalizes to "follow the title and subtitle"; a prior
	// visual's override never lingers.
	accessibilityConfig: migrateAccessibilityConfig(visual.accessibilityConfig),
	// Per-visual map config — added after maps shipped. Older visuals (and
	// any saved before mapConfig was bound into the save cycle) leave it
	// undefined; default-merge so the coordinate system / projection / focus
	// persist per visual and a prior visual's map state doesn't linger.
	mapConfig: {
		...DEFAULT_MAP_CONFIG,
		...visual.mapConfig,
	},
	// Per-visual wide→long reshape — added after first release. Older
	// visuals leave it undefined; default-merge so the fields exist on
	// the atom and a prior visual's reshape doesn't linger.
	reshapeConfig: {
		...DEFAULT_RESHAPE_CONFIG,
		...visual.reshapeConfig,
	},
	// Per-visual derived variables — added after first release. Older
	// visuals leave it undefined; default-merge so a prior visual's
	// derived columns don't linger.
	derivedVariablesConfig: {
		...DEFAULT_DERIVED_VARIABLES_CONFIG,
		...visual.derivedVariablesConfig,
	},
})
