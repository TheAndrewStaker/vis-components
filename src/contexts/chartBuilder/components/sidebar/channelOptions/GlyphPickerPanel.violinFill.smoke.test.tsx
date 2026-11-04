import { cleanup, fireEvent, render, within } from "@testing-library/react"
import { TestProvider } from "../../../../../testSupport/TestProvider"
import { installInMemoryLocalStorage } from "../../../../../testSupport/localStorageShim"
import { buildDataset as buildDatasetFixture } from "../../../../../testSupport/fixtures"
import { afterEach, describe, expect, it } from "vitest"

import {
	DEFAULT_AXIS_CONFIG,
	DEFAULT_DISTRIBUTION_OVERLAY_CONFIG,
	type ChannelConfigs,
	type PatternConfig,
} from "../../../lib/channelConfig"
import { DEFAULT_LABELS_CONFIG } from "../../../lib/labelsConfig"
import { emptyEncodings, type Dataset, type Encodings } from "../../../lib/types"

import { PatternOptionsPanel } from "./GlyphPickerPanel"

/** The Pattern panel's "Violin / box fill" subsection — shown while a
 *  violin or box overlay is on. Its picks are SEPARATE from the Point-fill
 *  ones: they write `pattern.defaultViolinPattern` /
 *  `pattern.violinOverrides`, never `defaultPattern` / `pattern.overrides`. */

const DATASET_ID = "ds-violin-fill-panel"

const buildDataset = (): Dataset =>
	buildDatasetFixture({
		id: DATASET_ID,
		name: "scores",
		filename: "scores.csv",
		fields: [
			{ name: "group", inferredType: "categorical" },
			{ name: "score", inferredType: "quantitative" },
		],
		rows: ["A", "B"].flatMap((group) =>
			Array.from({ length: 4 }, (_, i) => ({ group, score: String(i + 1) }))
		),
	})

const STRIP: Encodings = {
	...emptyEncodings(),
	x: { field: "group" },
	y: { field: "score" },
}

const BOX: Partial<ChannelConfigs> = {
	y: {
		...DEFAULT_AXIS_CONFIG,
		distributionOverlay: { ...DEFAULT_DISTRIBUTION_OVERLAY_CONFIG, showBoxPlot: true },
	},
}

const seed = (encodings: Encodings, configs: Partial<ChannelConfigs>) => {
	const store = installInMemoryLocalStorage()
	/* eslint-disable no-restricted-globals, @vc/no-storage-outside-try, @vc/use-wrapped-json-functions */
	const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v))
	set("vis-components:datasets", { [DATASET_ID]: buildDataset() })
	set("vis-components:currentDatasetId", DATASET_ID)
	set("vis-components:previewVersionId", null)
	set("vis-components:currentEncodings", encodings)
	set("vis-components:currentChannelConfigs", configs)
	set("vis-components:currentLabels", { _v: 1, data: DEFAULT_LABELS_CONFIG })
	/* eslint-enable no-restricted-globals, @vc/no-storage-outside-try, @vc/use-wrapped-json-functions */
	return store
}

// Datasets hydrate asynchronously — settle a tick before asserting.
const mount = async () => {
	const { container } = render(
		<TestProvider>
			<PatternOptionsPanel />
		</TestProvider>
	)
	await new Promise((r) => setTimeout(r, 50))
	return within(container)
}

afterEach(cleanup)

type SavedConfigs = { defaultPattern?: number | null; pattern?: Partial<PatternConfig> }
const readSavedConfigs = (store: Map<string, string>): SavedConfigs => {
	const parsed = JSON.parse(
		store.get("vis-components:currentChannelConfigs") ?? "{}"
	) as { _v?: number; data?: SavedConfigs }
	return parsed.data ?? (parsed as SavedConfigs)
}

describe("Pattern panel — 'Violin / box fill' (no pattern variable)", () => {
	it("appears only while a violin / box overlay is on", async () => {
		seed(STRIP, {})
		let q = await mount()
		expect(q.queryByText("Violin / box fill")).toBeNull()
		cleanup()
		seed(STRIP, BOX)
		q = await mount()
		expect(q.queryByText("Violin / box fill")).not.toBeNull()
		// The point rows move into their own peer subsection beside it.
		expect(q.queryByText("Point fill")).not.toBeNull()
		expect(q.queryByText("Default pattern")).toBeNull()
		expect(q.queryByLabelText("Pattern option 1")).not.toBeNull()
	})

	it("a violin / box swatch writes pattern.defaultViolinPattern and leaves the point-fill defaultPattern alone", async () => {
		const store = seed(STRIP, BOX)
		const q = await mount()
		fireEvent.click(q.getByLabelText("Violin / box pattern option 3"))
		const configs = readSavedConfigs(store)
		expect(configs.pattern?.defaultViolinPattern).toBe(2)
		expect(configs.defaultPattern ?? null).toBeNull()
		expect(configs.pattern?.defaultPolygonPattern ?? null).toBeNull()
	})

	it("a Point-fill swatch keeps writing defaultPattern, not the violin pick", async () => {
		const store = seed(STRIP, BOX)
		const q = await mount()
		fireEvent.click(q.getByLabelText("Pattern option 1"))
		const configs = readSavedConfigs(store)
		expect(configs.defaultPattern).toBe(0)
		expect(configs.pattern?.defaultViolinPattern ?? null).toBeNull()
	})
})

describe("Pattern panel — 'Violin / box fill' (pattern variable mapped)", () => {
	it("lists a violin / box row per category, separate from the point-fill row", async () => {
		const store = seed({ ...STRIP, pattern: { field: "group" } }, BOX)
		const q = await mount()
		expect(q.getAllByLabelText("No violin / box pattern for A").length).toBe(1)
		expect(q.getAllByLabelText("No pattern for A").length).toBe(1)
		fireEvent.click(q.getAllByLabelText("Violin / box pattern option 2")[0]!)
		const configs = readSavedConfigs(store)
		expect(configs.pattern?.violinOverrides).toEqual({ A: 1 })
		expect(configs.pattern?.overrides ?? {}).toEqual({})
	})
})

// The body's Vary by is the LAST one: Point fill's (shelf-bound) comes first.
const varyBySelect = (q: ReturnType<typeof within>) =>
	q.getAllByLabelText("Vary by").at(-1) as HTMLSelectElement

describe("Pattern panel — 'Violin / box fill' Vary by", () => {
	it("defaults to Auto (the Pattern variable) with the stored key absent", async () => {
		const store = seed({ ...STRIP, pattern: { field: "group" } }, BOX)
		const q = await mount()
		expect(varyBySelect(q).value).toBe("__auto__")
		expect("violinField" in (readSavedConfigs(store).pattern ?? {})).toBe(false)
	})

	it("'none' with a Pattern variable mapped: one default pattern for every body, stored as null", async () => {
		const store = seed({ ...STRIP, pattern: { field: "group" } }, BOX)
		const q = await mount()
		fireEvent.change(varyBySelect(q), { target: { value: "" } })
		expect(readSavedConfigs(store).pattern?.violinField).toBeNull()
		// Per-level body rows give way to the default swatch row; the point
		// rows keep their per-level list.
		expect(q.queryByLabelText("No violin / box pattern for A")).toBeNull()
		fireEvent.click(q.getByLabelText("Violin / box pattern option 3"))
		expect(readSavedConfigs(store).pattern?.defaultViolinPattern).toBe(2)
		expect(q.getAllByLabelText("No pattern for A").length).toBe(1)
	})

	it("its own variable with NO Pattern variable mapped: per-level body rows, point rows stay a default", async () => {
		const store = seed(STRIP, BOX)
		const q = await mount()
		fireEvent.change(varyBySelect(q), { target: { value: "group" } })
		expect(readSavedConfigs(store).pattern?.violinField).toBe("group")
		expect(q.getAllByLabelText("No violin / box pattern for A").length).toBe(1)
		expect(q.getAllByLabelText("No violin / box pattern for B").length).toBe(1)
		expect(q.queryByLabelText("Pattern option 1")).not.toBeNull()
		fireEvent.click(q.getAllByLabelText("Violin / box pattern option 2")[0]!)
		expect(readSavedConfigs(store).pattern?.violinOverrides).toEqual({ A: 1 })
	})

	it("Auto again drops the key", async () => {
		const store = seed(STRIP, {
			...BOX,
			pattern: { overrides: {}, inkColors: {}, backgroundColor: null, stackMode: "stack", violinField: null },
		})
		const q = await mount()
		expect(varyBySelect(q).value).toBe("")
		fireEvent.change(varyBySelect(q), { target: { value: "__auto__" } })
		expect("violinField" in (readSavedConfigs(store).pattern ?? {})).toBe(false)
	})
})

describe("Pattern panel — Point fill 'Vary by' (shelf-bound)", () => {
	const readEncodings = (store: Map<string, string>) => {
		const parsed = JSON.parse(store.get("vis-components:currentEncodings") ?? "{}") as {
			data?: { pattern?: { field?: string | null } }
			pattern?: { field?: string | null }
		}
		return parsed.data ?? parsed
	}
	const pointVaryBy = (q: ReturnType<typeof within>) =>
		q.getAllByLabelText("Vary by")[0] as HTMLSelectElement

	it("shows the shelf's Pattern variable and maps it when changed", async () => {
		const store = seed(STRIP, BOX)
		const q = await mount()
		// Two Vary by selects: Point fill's first, then the body's.
		expect(q.getAllByLabelText("Vary by")).toHaveLength(2)
		expect(pointVaryBy(q).value).toBe("")
		fireEvent.change(pointVaryBy(q), { target: { value: "group" } })
		expect(readEncodings(store).pattern?.field).toBe("group")
		// The per-level point rows follow the new variable.
		expect(q.getAllByLabelText("No pattern for A").length).toBe(1)
	})

	it("'— none —' clears the shelf's Pattern variable", async () => {
		const store = seed({ ...STRIP, pattern: { field: "group" } }, BOX)
		const q = await mount()
		expect(pointVaryBy(q).value).toBe("group")
		fireEvent.change(pointVaryBy(q), { target: { value: "" } })
		expect(readEncodings(store).pattern?.field ?? null).toBeNull()
		expect(q.queryByLabelText("Pattern option 1")).not.toBeNull()
	})
})
