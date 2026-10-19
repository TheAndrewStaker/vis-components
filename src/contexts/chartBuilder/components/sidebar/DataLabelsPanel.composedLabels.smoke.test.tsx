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

/** Compose labels under Value: the boxes are the labels. Each gets its own
 *  section — titled by its variables — under Color, Size, Label selection
 *  and Adjust position; a lone label uses the layer-wide controls. */

const DATASET_ID = "ds-labels-composed"

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

const sectionHeader = (container: HTMLElement, title: string) =>
	[...container.querySelectorAll<HTMLButtonElement>("button")].find(
		(b) =>
			b.getAttribute("aria-expanded") !== null &&
			b.textContent?.trim() === title
	) ?? null

const expand = (container: HTMLElement, title: string) => {
	const header = sectionHeader(container, title)
	expect(header, `subsection header "${title}"`).not.toBeNull()
	fireEvent.click(header!)
}

const openChannel = (container: HTMLElement, label: string) => {
	const btn = container.querySelector<HTMLButtonElement>(
		`button[aria-label="Toggle settings for ${label}"]`
	)
	expect(btn, `channel chevron "${label}"`).not.toBeNull()
	fireEvent.click(btn!)
}

const groupHeaders = (container: HTMLElement) =>
	[...container.querySelectorAll("span.vc-group-header")].map((s) =>
		s.textContent?.trim()
	)

describe("DataLabelsPanel — composed labels", () => {
	afterEach(cleanup)

	it("'Compose labels' comes after Text format, with one box per label", () => {
		const { container } = mountPanel({
			composedLabels: [
				{ id: "y", template: "{y}" },
				{ id: "g", template: "{g}" },
			],
		})
		openChannel(container, "Value")
		const headers = groupHeaders(container)
		expect(headers.indexOf("Text format")).toBeGreaterThan(headers.indexOf("Fields to include"))
		expect(headers.indexOf("Compose labels")).toBeGreaterThan(headers.indexOf("Text format"))
		expect(
			[...container.querySelectorAll<HTMLInputElement>('input[aria-label$=" text"]')].map(
				(b) => b.value
			)
		).toEqual(["{y}", "{g}"])
	})

	it("a combination gets its own sections, titled by its variables", () => {
		const { container } = mountPanel({
			composedLabels: [
				{ id: "lbl-1", template: "{y} ({g})" },
				{ id: "g", template: "{g}" },
			],
		})
		openChannel(container, "Color")
		expect(sectionHeader(container, "y + g")).not.toBeNull()
		expect(sectionHeader(container, "g")).not.toBeNull()
		expect(sectionHeader(container, "y")).toBeNull()
		expand(container, "Label selection")
		expect(sectionHeader(container, "y + g")).not.toBeNull()
		expand(container, "Adjust position and alignment")
		expect(sectionHeader(container, "y + g")).not.toBeNull()
		// No layer-wide Angle: every label has its own.
		expect(
			[...container.querySelectorAll("label")].some(
				(l) => l.textContent?.trim() === "Angle"
			)
		).toBe(false)
	})

	it("a lone label keeps the layer-wide controls and binds Which labels to its key", () => {
		const { container, readCfg } = mountPanel({
			composedLabels: [{ id: "lbl-1", template: "{y} ({g})" }],
		})
		expand(container, "Adjust position and alignment")
		expect(
			[...container.querySelectorAll("label")].some(
				(l) => l.textContent?.trim() === "Angle"
			)
		).toBe(true)
		expand(container, "Label selection")
		const which = [...container.querySelectorAll("label")].find(
			(l) => l.textContent?.trim() === "Which labels"
		)
		expect(which).toBeDefined()
		const select = container.querySelector<HTMLSelectElement>(
			`#${CSS.escape(which!.htmlFor)}`
		)
		fireEvent.change(select!, { target: { value: "last" } })
		expect(readCfg().fieldLabelPoints?.["lbl-1"]).toBe("last")
	})
})
