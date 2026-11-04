import { describe, expect, it } from "vitest"

import { DEFAULT_ANNOTATIONS_CONFIG } from "./annotationsConfig"
import { DEFAULT_CAPTION_CONFIG } from "./captionConfig"
import { DEFAULT_DATA_LABELS_CONFIG, EMPTY_CHANNEL_CONFIGS } from "./channelConfig"
import { DEFAULT_DATA_TABLE_CONFIG, migrateDataTableConfig } from "./dataTableConfig"
import { migrateAccessibilityConfig } from "./accessibilityConfig"
import {
	DEFAULT_LEGEND_CONFIG,
	DEFAULT_TOOLTIP_CONFIG,
	migrateLabelsConfig,
} from "./labelsConfig"
import { DEFAULT_MAP_CONFIG } from "./mapConfig"
import { LIGHT_THEME_BASE } from "./systemThemes"
import {
	captionConfigFromTheme,
	configsFromTheme,
	dataLabelsConfigFromTheme,
	labelsFromTheme,
	legendConfigFromTheme,
	mapConfigFromTheme,
	tooltipConfigFromTheme,
} from "./themeConfig"
import { emptyDataLabelsEncodings, emptyEncodings, type Visual } from "./types"
import { hydrateVisual, newVisualDraft, newVisualId } from "./visualDefaults"

describe("newVisualId", () => {
	it("mints distinct vs- ids", () => {
		expect(newVisualId()).toMatch(/^vs-[0-9a-z]+-[0-9a-z]+$/)
		expect(newVisualId()).not.toBe(newVisualId())
	})
})

describe("newVisualDraft", () => {
	it("seeds the theme-driven slices from the theme and the rest empty", () => {
		const draft = newVisualDraft(LIGHT_THEME_BASE)
		expect(draft.encodings).toEqual(emptyEncodings())
		expect(draft.channelConfigs).toEqual(configsFromTheme(LIGHT_THEME_BASE))
		expect(draft.labelsConfig).toEqual(labelsFromTheme(LIGHT_THEME_BASE))
		expect(draft.legendConfig).toEqual(legendConfigFromTheme(LIGHT_THEME_BASE))
		expect(draft.dataLabelsConfig).toEqual(
			dataLabelsConfigFromTheme(LIGHT_THEME_BASE)
		)
		expect(draft.captionConfig).toEqual(captionConfigFromTheme(LIGHT_THEME_BASE))
		expect(draft.tooltipConfig).toEqual(tooltipConfigFromTheme(LIGHT_THEME_BASE))
		// A theme without the hover / table / map fields keeps the built-ins.
		expect(draft.tooltipConfig).toEqual(DEFAULT_TOOLTIP_CONFIG)
		expect(draft.dataTableConfig).toEqual(DEFAULT_DATA_TABLE_CONFIG)
		expect(draft.dataLabelsEncodings).toEqual(emptyDataLabelsEncodings())
		expect(draft.fieldOrder).toEqual([])
		expect(draft.annotationsConfig).toBe(DEFAULT_ANNOTATIONS_CONFIG)
		expect(draft.mapConfig).toEqual(mapConfigFromTheme(LIGHT_THEME_BASE))
		expect(draft.mapConfig).toEqual(DEFAULT_MAP_CONFIG)
	})
})

describe("hydrateVisual", () => {
	it("fills a legacy row's missing slices with the defaults", () => {
		const legacy = {
			id: "vs-old",
			name: "Old",
			datasetId: null,
			fieldTypeOverrides: {},
			encodings: { x: { field: "region" } },
			labelsConfig: undefined,
			createdAt: 0,
			updatedAt: 0,
		} as unknown as Visual
		const draft = hydrateVisual(legacy)
		expect(draft.encodings).toEqual({
			...emptyEncodings(),
			x: { field: "region" },
		})
		expect(draft.channelConfigs).toBe(EMPTY_CHANNEL_CONFIGS)
		expect(draft.labelsConfig).toEqual(migrateLabelsConfig(undefined))
		expect(draft.legendConfig).toEqual(DEFAULT_LEGEND_CONFIG)
		expect(draft.dataLabelsConfig).toEqual(DEFAULT_DATA_LABELS_CONFIG)
		expect(draft.captionConfig).toEqual(DEFAULT_CAPTION_CONFIG)
		expect(draft.dataTableConfig).toEqual(migrateDataTableConfig(undefined))
		expect(draft.accessibilityConfig).toEqual(migrateAccessibilityConfig(undefined))
		expect(draft.annotationsConfig).toBe(DEFAULT_ANNOTATIONS_CONFIG)
		expect(draft.fieldLevelOrders).toEqual({})
		expect(draft.fieldOrder).toEqual([])
	})
})
