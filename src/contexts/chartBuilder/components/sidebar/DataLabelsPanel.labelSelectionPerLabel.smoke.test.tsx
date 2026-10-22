import { cleanup, fireEvent, render } from "@testing-library/react"
import { TestProvider, type TestStore } from "../../../../testSupport/TestProvider"
import { installInMemoryLocalStorage } from "../../../../testSupport/localStorageShim"
import { buildDataset as buildDatasetFixture } from "../../../../testSupport/fixtures"
import { afterEach, describe, expect, it } from "vitest"

import {
	DEFAULT_DATA_LABELS_CONFIG,
	EMPTY_CHANNEL_CONFIGS,
	type ChannelConfigs,
	type DataLabelsConfig,
} from "../../lib/channelConfig"
import { DEFAULT_LABELS_CONFIG } from "../../lib/labelsConfig"
import {
	emptyDataLabelsEncodings,
	emptyEncodings,
	type Dataset,
	type Encodings,
} from "../../lib/types"
import {
	currentChannelConfigsAtom,
	currentDataLabelsConfigAtom,
	currentDataLabelsEncodingsAtom,
	currentDatasetIdAtom,
	currentEncodingsAtom,
	currentFieldLevelOrdersAtom,
	currentFieldOverridesAtom,
	currentLabelsAtom,
	loadedDatasetsAtom,
	previewVersionIdAtom,
} from "../../store/atoms"

import { DataLabelsPanel } from "./DataLabelsPanel"

/** Label selection is per COMPOSED LABEL: each label's block holds its own
 *  "Which labels", the "Of each" unit its series ends run over, and the
 *  facet panels it draws on. Nothing stays layer-wide once there are two
 *  labels — one can sit on the last bar of every stack across all panels
 *  while the other sits on the last bar of each series in one panel. */

const DATASET_ID = "ds-labels-selection-per-label"

const buildDataset = (): Dataset =>
	buildDatasetFixture({
		id: DATASET_ID,
		name: "bars",
		fields: [
			{ name: "cat", inferredType: "categorical" },
			{ name: "val", inferredType: "quantitative" },
			{ name: "g", inferredType: "categorical" },
			{ name: "f", inferredType: "categorical" },
		],
		rows: [
			{ cat: "A", val: "10", g: "x", f: "P1" },
			{ cat: "B", val: "20", g: "y", f: "P2" },
		],
	})

const mountPanel = (opts: {
	cfg?: Partial<DataLabelsConfig>
	faceted?: boolean
	/** One mapped Value field instead of composed labels. */
	singleField?: boolean
}) => {
	const store = installInMemoryLocalStorage()
	// Stacked, hue-grouped vertical bars: a layering channel is mapped, so
	// "Of each" has something to offer (Series / Stack).
	const encodings: Encodings = {
		...emptyEncodings(),
		x: { field: "cat" },
		length: { field: "val" },
		hue: { field: "g" },
		...(opts.faceted === false ? {} : { facet: { field: "f" } }),
	}
	const dataLabelsEncodings = {
		...emptyDataLabelsEncodings(),
		x: { field: "cat" },
		y: { field: "val" },
		value: opts.singleField
			? { field: "val" }
			: { field: null, multiField: true, fields: ["val", "g"] },
	}
	const channelConfigs: ChannelConfigs = EMPTY_CHANNEL_CONFIGS
	const cfg: DataLabelsConfig = {
		...DEFAULT_DATA_LABELS_CONFIG,
		...(opts.singleField
			? {}
			: {
					composedLabels: [
						{ id: "val", template: "{val}" },
						{ id: "g", template: "{g}" },
					],
					fieldLabelPoints: { val: "all", g: "last" },
				}),
		...(opts.cfg ?? {}),
	}
	/* eslint-disable @vc/use-wrapped-json-functions */
	store.set(
		"vis-components:datasets",
		JSON.stringify({ [DATASET_ID]: buildDataset() })
	)
	store.set("vis-components:currentDatasetId", JSON.stringify(DATASET_ID))
	store.set("vis-components:previewVersionId", JSON.stringify(null))
	store.set("vis-components:currentEncodings", JSON.stringify(encodings))
	store.set(
		"vis-components:currentDataLabelsEncodings",
		JSON.stringify(dataLabelsEncodings)
	)
	store.set("vis-components:currentDataLabelsConfig", JSON.stringify(cfg))
	/* eslint-enable @vc/use-wrapped-json-functions */

	let snapRef: TestStore | null = null
	const init = (snap: TestStore) => {
		snapRef = snap
		snap.set(loadedDatasetsAtom, { [DATASET_ID]: buildDataset() })
		snap.set(currentDatasetIdAtom, DATASET_ID)
		snap.set(previewVersionIdAtom, null)
		snap.set(currentEncodingsAtom, encodings)
		snap.set(currentChannelConfigsAtom, channelConfigs)
		snap.set(currentLabelsAtom, DEFAULT_LABELS_CONFIG)
		snap.set(currentDataLabelsEncodingsAtom, dataLabelsEncodings)
		snap.set(currentDataLabelsConfigAtom, cfg)
		snap.set(currentFieldOverridesAtom, {})
		snap.set(currentFieldLevelOrdersAtom, {})
	}

	const { container } = render(
		<TestProvider initializeState={init}>
			<DataLabelsPanel />
		</TestProvider>
	)
	return { container, readCfg: () => snapRef!.get(currentDataLabelsConfigAtom) }
}

const headerFor = (root: ParentNode, title: string) =>
	[...root.querySelectorAll<HTMLButtonElement>("button")].find(
		(b) =>
			b.getAttribute("aria-expanded") !== null &&
			b.textContent?.trim() === title
	) ?? null

/** Open a subsection and return the element holding its body. */
const openSection = (root: ParentNode, title: string): HTMLElement => {
	const header = headerFor(root, title)
	expect(header, `subsection header "${title}"`).not.toBeNull()
	fireEvent.click(header!)
	// header button → header row → the subsection wrapper (header + body).
	return header!.parentElement!.parentElement as HTMLElement
}

const labelledControl = (root: ParentNode, text: string) => {
	const label = [...root.querySelectorAll("label")].find(
		(l) => l.textContent?.trim() === text
	)
	if (!label) return null
	return (
		(label.htmlFor
			? root.querySelector<HTMLElement>(`#${CSS.escape(label.htmlFor)}`)
			: null) ?? label.querySelector<HTMLElement>("input,select")
	)
}

const checkboxFor = (root: ParentNode, text: string) => {
	const label = [...root.querySelectorAll("label")].find(
		(l) => l.textContent?.trim() === text
	)
	if (!label) return null
	return label.htmlFor
		? root.querySelector<HTMLInputElement>(`#${CSS.escape(label.htmlFor)}`)
		: label.querySelector<HTMLInputElement>('input[type="checkbox"]')
}

describe("DataLabelsPanel — per-label Of each and Apply to all facets", () => {
	afterEach(cleanup)

	it("gives each composed label its own Of each and Apply to all facets", () => {
		const { container } = mountPanel({})
		const selection = openSection(container, "Label selection")
		// No layer-wide pair left: both live under a label's subheader.
		expect(labelledControl(selection, "Of each")).toBeNull()
		expect(checkboxFor(selection, "Apply to all facets")).toBeNull()

		const g = openSection(selection, "g")
		expect(labelledControl(g, "Which labels")).not.toBeNull()
		expect(labelledControl(g, "Of each")).not.toBeNull()
		expect(checkboxFor(g, "Apply to all facets")).not.toBeNull()

		const val = openSection(selection, "val")
		// "All labels" has no series ends, so there's no unit to scope —
		// but it still picks its facet panels.
		expect(labelledControl(val, "Of each")).toBeNull()
		expect(checkboxFor(val, "Apply to all facets")).not.toBeNull()
	})

	it("writes Of each to the label's own entry, not the layer", () => {
		const { container, readCfg } = mountPanel({})
		const selection = openSection(container, "Label selection")
		const g = openSection(selection, "g")
		const ofEach = labelledControl(g, "Of each") as HTMLSelectElement
		fireEvent.change(ofEach, { target: { value: "stack" } })
		expect(readCfg().fieldLabelPointsScope).toEqual({ g: "stack" })
		expect(readCfg().labelPointsScope).toBe("series")
	})

	it("writes Apply to all facets to the label's own entry, not the layer", () => {
		const { container, readCfg } = mountPanel({})
		const selection = openSection(container, "Label selection")
		const g = openSection(selection, "g")
		fireEvent.click(checkboxFor(g, "Apply to all facets")!)
		// Unticking "all" seeds every panel key, then the user prunes.
		expect(readCfg().fieldFacetKeys?.["g"]).toEqual(["P1", "P2"])
		expect(readCfg().facetKeys).toBeUndefined()
	})

	it("a label with no entry shows the layer-wide values it inherits", () => {
		const { container } = mountPanel({
			cfg: { labelPointsScope: "stack", facetKeys: ["P2"] },
		})
		const selection = openSection(container, "Label selection")
		const g = openSection(selection, "g")
		expect((labelledControl(g, "Of each") as HTMLSelectElement).value).toBe(
			"stack"
		)
		expect(checkboxFor(g, "Apply to all facets")!.checked).toBe(false)
		expect(checkboxFor(g, "P2")!.checked).toBe(true)
		expect(checkboxFor(g, "P1")!.checked).toBe(false)
	})

	it("a lone composed label skips the subheader but keeps its own entries", () => {
		const { container, readCfg } = mountPanel({
			cfg: {
				composedLabels: [{ id: "val", template: "{val}" }],
				fieldLabelPoints: { val: "last" },
			},
		})
		const selection = openSection(container, "Label selection")
		expect(headerFor(selection, "val")).toBeNull()
		const ofEach = labelledControl(selection, "Of each") as HTMLSelectElement
		expect(ofEach).not.toBeNull()
		fireEvent.change(ofEach, { target: { value: "stack" } })
		expect(readCfg().fieldLabelPointsScope).toEqual({ val: "stack" })
	})

	it("a single-field mapping writes the layer-wide pair", () => {
		const { container, readCfg } = mountPanel({
			singleField: true,
			cfg: { labelPoints: "last" },
		})
		const selection = openSection(container, "Label selection")
		const ofEach = labelledControl(selection, "Of each") as HTMLSelectElement
		fireEvent.change(ofEach, { target: { value: "stack" } })
		expect(readCfg().labelPointsScope).toBe("stack")
		expect(readCfg().fieldLabelPointsScope).toEqual({})
		fireEvent.click(checkboxFor(selection, "Apply to all facets")!)
		expect(readCfg().facetKeys).toEqual(["P1", "P2"])
		expect(readCfg().fieldFacetKeys).toEqual({})
	})
})
