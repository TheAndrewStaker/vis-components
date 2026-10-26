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

/** Bar + marks combo (§3.3): under Position and alignment every label gets
 *  a "Show on" choice — Bars, or the Line (Points without a Connection).
 *  A label defaults by the variables it shows (the marks' own variables →
 *  the line), an explicit pick is stored in `fieldLayers`, and a label on
 *  the line takes no bar Placement. */

const DATASET_ID = "ds-labels-combo-layer"

const buildDataset = (): Dataset =>
	buildDatasetFixture({
		id: DATASET_ID,
		name: "combo",
		fields: [
			{ name: "month", inferredType: "categorical" },
			{ name: "units", inferredType: "quantitative" },
			{ name: "revenue", inferredType: "quantitative" },
			{ name: "series", inferredType: "categorical" },
		],
		rows: [
			{ month: "Jan", units: "10", revenue: "50", series: "a" },
			{ month: "Feb", units: "20", revenue: "60", series: "a" },
		],
	})

const AS_BARS: ChannelConfigs = {
	...EMPTY_CHANNEL_CONFIGS,
	length: { minLength: 4, maxLength: 40, render: "bars" },
}

const mountPanel = (opts: {
	chart: "combo" | "combo-points" | "bars"
	cfg?: Partial<DataLabelsConfig>
	fields?: string[]
	singleField?: string
}) => {
	const store = installInMemoryLocalStorage()
	const encodings: Encodings = {
		...emptyEncodings(),
		x: { field: "month" },
		length: { field: "units" },
		...(opts.chart === "bars" ? {} : { y: { field: "revenue" } }),
		...(opts.chart === "combo" ? { connection: { field: "series" } } : {}),
	}
	const configs = opts.chart === "bars" ? EMPTY_CHANNEL_CONFIGS : AS_BARS
	const dataLabelsEncodings = {
		...emptyDataLabelsEncodings(),
		value: opts.fields
			? { field: null, multiField: true, fields: opts.fields }
			: { field: opts.singleField ?? "units" },
	}
	const cfg: DataLabelsConfig = {
		...DEFAULT_DATA_LABELS_CONFIG,
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
	store.set("vis-components:currentChannelConfigs", JSON.stringify(configs))
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
		snap.set(currentChannelConfigsAtom, configs)
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
	expand(container, "Position and alignment")
	return {
		container,
		readCfg: () => snapRef!.get(currentDataLabelsConfigAtom),
	}
}

const expand = (container: HTMLElement, title: string) => {
	const header = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
		(b) =>
			b.getAttribute("aria-expanded") !== null &&
			b.textContent?.trim() === title
	)
	expect(header, `subsection header "${title}"`).toBeDefined()
	fireEvent.click(header!)
}

/** Every "Show on" radiogroup, as its segment labels + the checked one. */
const showOnGroups = (container: HTMLElement) =>
	[...container.querySelectorAll<HTMLElement>('[role="radiogroup"]')]
		.filter((g) => g.getAttribute("aria-label") === "Show labels on")
		.map((g) => {
			const radios = [...g.querySelectorAll<HTMLButtonElement>('[role="radio"]')]
			return {
				labels: radios.map((r) => r.textContent?.trim()),
				checked: radios.find((r) => r.getAttribute("aria-checked") === "true")
					?.textContent?.trim(),
				click: (label: string) =>
					fireEvent.click(radios.find((r) => r.textContent?.trim() === label)!),
			}
		})

const hasGroupHeader = (container: HTMLElement, text: string) =>
	[...container.querySelectorAll("span.vc-group-header")].some(
		(s) => s.textContent?.trim() === text
	)

describe("DataLabelsPanel — combo 'Show on' layer", () => {
	afterEach(cleanup)

	it("is absent on plain bars", () => {
		const { container } = mountPanel({ chart: "bars" })
		expect(showOnGroups(container)).toHaveLength(0)
		expect(hasGroupHeader(container, "Placement")).toBe(true)
	})

	it("single-field label: offers Bars / Line, defaulting by the variable, and stores the pick", () => {
		const { container, readCfg } = mountPanel({ chart: "combo", singleField: "units" })
		const [group] = showOnGroups(container)
		expect(group?.labels).toEqual(["Bars", "Line"])
		expect(group?.checked).toBe("Bars")
		expect(hasGroupHeader(container, "Placement")).toBe(true)
		group!.click("Line")
		expect(readCfg().fieldLayers).toEqual({ units: "marks" })
	})

	it("the Connection variable's label defaults to the Line and takes no bar Placement", () => {
		const { container } = mountPanel({ chart: "combo", singleField: "series" })
		expect(showOnGroups(container)[0]?.checked).toBe("Line")
		expect(hasGroupHeader(container, "Placement")).toBe(false)
	})

	it("without a Connection the marks layer is called Points", () => {
		const { container } = mountPanel({ chart: "combo-points", singleField: "revenue" })
		const [group] = showOnGroups(container)
		expect(group?.labels).toEqual(["Bars", "Points"])
		expect(group?.checked).toBe("Points")
	})

	it("separate labels: each label's subsection has its own choice, written by label key", () => {
		const { container, readCfg } = mountPanel({
			chart: "combo",
			fields: ["series", "units"],
			cfg: { combineVariables: false },
		})
		expand(container, "series")
		expand(container, "units")
		const groups = showOnGroups(container)
		expect(groups.map((g) => g.checked)).toEqual(["Line", "Bars"])
		groups[1]!.click("Line")
		expect(readCfg().fieldLayers).toEqual({ units: "marks" })
	})
})
