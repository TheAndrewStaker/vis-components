import { cleanup, fireEvent, render } from "@testing-library/react"
import { TestProvider, type TestStore } from "../../../../testSupport/TestProvider"
import { installInMemoryLocalStorage } from "../../../../testSupport/localStorageShim"
import { buildDataset as buildDatasetFixture } from "../../../../testSupport/fixtures"
import { afterEach, describe, expect, it } from "vitest"

import {
	DEFAULT_DATA_LABELS_CONFIG,
	EMPTY_CHANNEL_CONFIGS,
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

/** "Split into individual variables": a composed label naming two or more
 *  variables can style each one separately under Color, Size and Text
 *  properties, while still positioning as ONE label. The toggle sits above
 *  the label's own controls and only appears where there's something to
 *  split. */

const DATASET_ID = "ds-labels-split-pieces"

const buildDataset = (): Dataset =>
	buildDatasetFixture({
		id: DATASET_ID,
		name: "pts",
		fields: [
			{ name: "x", inferredType: "quantitative" },
			{ name: "y", inferredType: "quantitative" },
			{ name: "g", inferredType: "categorical" },
		],
		rows: [
			{ x: "1", y: "10", g: "A" },
			{ x: "2", y: "20", g: "B" },
		],
	})

const mountPanel = (cfg: Partial<DataLabelsConfig>) => {
	const store = installInMemoryLocalStorage()
	const encodings: Encodings = {
		...emptyEncodings(),
		x: { field: "x" },
		y: { field: "y" },
	}
	const dataLabelsEncodings = {
		...emptyDataLabelsEncodings(),
		x: { field: "x" },
		y: { field: "y" },
		value: { field: null, multiField: true, fields: ["y", "g"] },
	}
	const full: DataLabelsConfig = { ...DEFAULT_DATA_LABELS_CONFIG, ...cfg }
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
	store.set("vis-components:currentDataLabelsConfig", JSON.stringify(full))
	/* eslint-enable @vc/use-wrapped-json-functions */
	let snapRef: TestStore | null = null
	const init = (snap: TestStore) => {
		snapRef = snap
		snap.set(loadedDatasetsAtom, { [DATASET_ID]: buildDataset() })
		snap.set(currentDatasetIdAtom, DATASET_ID)
		snap.set(previewVersionIdAtom, null)
		snap.set(currentEncodingsAtom, encodings)
		snap.set(currentChannelConfigsAtom, EMPTY_CHANNEL_CONFIGS)
		snap.set(currentLabelsAtom, DEFAULT_LABELS_CONFIG)
		snap.set(currentDataLabelsEncodingsAtom, dataLabelsEncodings)
		snap.set(currentDataLabelsConfigAtom, full)
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

/** Open a subsection and return the element holding its header and body. */
const openSection = (root: ParentNode, title: string): HTMLElement => {
	const header = headerFor(root, title)
	expect(header, `subsection header "${title}"`).not.toBeNull()
	fireEvent.click(header!)
	return header!.parentElement!.parentElement as HTMLElement
}

const openChannel = (container: HTMLElement, label: string) => {
	const btn = container.querySelector<HTMLButtonElement>(
		`button[aria-label="Toggle settings for ${label}"]`
	)
	expect(btn, `channel chevron "${label}"`).not.toBeNull()
	fireEvent.click(btn!)
}

/** The control a `<label>` with this exact text points at. */
const controlFor = (root: ParentNode, labelText: string) => {
	const label = [...root.querySelectorAll("label")].find(
		(l) => l.textContent?.trim() === labelText
	)
	return label?.ownerDocument.getElementById(label.htmlFor) ?? null
}

const splitToggle = (root: ParentNode) =>
	controlFor(root, "Split into individual variables")
const numberInputFor = controlFor

const COMBINED: Partial<DataLabelsConfig> = {
	composedLabels: [
		{ id: "lbl-1", template: "{y} ({g})" },
		{ id: "g", template: "{g}" },
	],
}

describe("DataLabelsPanel — split a combined label into its variables", () => {
	afterEach(cleanup)

	it("offers the split only on a label with two or more variables", () => {
		const { container } = mountPanel(COMBINED)
		openChannel(container, "Size")
		const combined = openSection(container, "y + g")
		expect(splitToggle(combined)).not.toBeNull()
		const lone = openSection(container, "g")
		expect(splitToggle(lone)).toBeNull()
	})

	it("writes the toggle per section, keyed by the label", () => {
		const { container, readCfg } = mountPanel(COMBINED)
		openChannel(container, "Size")
		const combined = openSection(container, "y + g")
		fireEvent.click(splitToggle(combined)!)
		expect(readCfg().pieceSplits).toEqual({ "lbl-1": { size: true } })
	})

	it("expands into one row per variable, writing piece entries", () => {
		const { container, readCfg } = mountPanel({
			...COMBINED,
			pieceSplits: { "lbl-1": { size: true } },
		})
		openChannel(container, "Size")
		const combined = openSection(container, "y + g")
		// One Size row per variable, named by it — no single "Size" row.
		expect(numberInputFor(combined, "Size")).toBeNull()
		const yRow = numberInputFor(combined, "y") as HTMLInputElement
		expect(yRow).not.toBeNull()
		expect(numberInputFor(combined, "g")).not.toBeNull()
		fireEvent.change(yRow, { target: { value: "20" } })
		fireEvent.blur(yRow)
		// The piece's size lives under pieces[label][variable] — two keys, no
		// joined one — and the label's own map stays untouched.
		expect(readCfg().pieces).toEqual({ "lbl-1": { y: { size: 20 } } })
		expect(readCfg().fieldSizes ?? {}).toEqual({})
	})

	it("Text splits into a block per variable", () => {
		const { container } = mountPanel({
			...COMBINED,
			pieceSplits: { "lbl-1": { text: true } },
		})
		const section = openSection(container, "Text")
		const combined = openSection(section, "y + g")
		// The label's own block is replaced by one per variable.
		expect(headerFor(combined, "y")).not.toBeNull()
		expect(headerFor(combined, "g")).not.toBeNull()
	})

	it("a lone combined label gets the block, so its toggle has a home", () => {
		const { container, readCfg } = mountPanel({
			composedLabels: [{ id: "lbl-1", template: "{y} ({g})" }],
		})
		openChannel(container, "Size")
		const combined = openSection(container, "y + g")
		expect(splitToggle(combined)).not.toBeNull()
		fireEvent.click(splitToggle(combined)!)
		expect(readCfg().pieceSplits?.["lbl-1"]?.size).toBe(true)
	})

	it("a lone single-variable label keeps the layer-wide controls", () => {
		const { container } = mountPanel({
			composedLabels: [{ id: "y", template: "{y}" }],
		})
		openChannel(container, "Size")
		expect(headerFor(container, "y")).toBeNull()
		expect(numberInputFor(container, "Default size")).not.toBeNull()
	})
})
