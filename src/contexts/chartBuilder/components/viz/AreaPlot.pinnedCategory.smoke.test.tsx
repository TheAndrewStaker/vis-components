import { render } from "@testing-library/react"
import { TestProvider, type TestStore } from "../../../../testSupport/TestProvider"
import { installInMemoryLocalStorage } from "../../../../testSupport/localStorageShim"
import { buildDataset as buildDatasetFixture } from "../../../../testSupport/fixtures"
import { describe, expect, it } from "vitest"

import {
	DEFAULT_CONNECTION_CONFIG,
	DEFAULT_DATA_LABELS_CONFIG,
	EMPTY_CHANNEL_CONFIGS,
} from "../../lib/channelConfig"
import { DEFAULT_LABELS_CONFIG } from "../../lib/labelsConfig"
import {
	emptyDataLabelsEncodings,
	emptyEncodings,
	type Dataset,
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

import { AreaPlot } from "./AreaPlot"

/** Scale range min / max on an area chart's DATE x axis. The x axis is the
 *  layer's category axis, which used to ignore the pins the sidebar wrote
 *  (only the measure axis honored them): a 2000–2025 series pinned to
 *  1990–2020 still drew 2000–2025 (user-reported October 2026). */

const DATASET_ID = "ds-area-pinned-category"

const buildDataset = (): Dataset =>
	buildDatasetFixture({
		id: DATASET_ID,
		name: "area-pinned-category",
		filename: "area-pinned-category.csv",
		fields: [
			{ name: "d", inferredType: "temporal" },
			{ name: "val", inferredType: "quantitative" },
			{ name: "conn", inferredType: "categorical" },
		],
		rows: [2000, 2005, 2010, 2015, 2020, 2025].map((y) => ({
			d: `${y}-01-01`,
			val: "10",
			conn: "c",
		})),
	})

const channelConfigs = () => ({
	...EMPTY_CHANNEL_CONFIGS,
	connection: { ...DEFAULT_CONNECTION_CONFIG, fill: "area" as const },
})

const encodings = () => ({
	...emptyEncodings(),
	x: { field: "d" },
	length: { field: "val" },
	connection: { field: "conn" },
})

const seedStorage = () => {
	const store = installInMemoryLocalStorage()
	/* eslint-disable @th/use-wrapped-json-functions */
	store.set("vis-components:datasets", JSON.stringify({ [DATASET_ID]: buildDataset() }))
	store.set("vis-components:currentDatasetId", JSON.stringify(DATASET_ID))
	store.set("vis-components:previewVersionId", JSON.stringify(null))
	store.set("vis-components:currentEncodings", JSON.stringify(encodings()))
	store.set("vis-components:currentChannelConfigs", JSON.stringify(channelConfigs()))
	/* eslint-enable @th/use-wrapped-json-functions */
}

const initState = (snap: TestStore) => {
	snap.set(loadedDatasetsAtom, { [DATASET_ID]: buildDataset() })
	snap.set(currentDatasetIdAtom, DATASET_ID)
	snap.set(previewVersionIdAtom, null)
	snap.set(currentEncodingsAtom, encodings())
	snap.set(currentChannelConfigsAtom, channelConfigs())
	snap.set(currentLabelsAtom, DEFAULT_LABELS_CONFIG)
	snap.set(currentDataLabelsConfigAtom, DEFAULT_DATA_LABELS_CONFIG)
	snap.set(currentDataLabelsEncodingsAtom, emptyDataLabelsEncodings())
	snap.set(currentFieldOverridesAtom, {})
	snap.set(currentFieldLevelOrdersAtom, {})
}

const mount = (pins?: { min: number; max: number }) => {
	seedStorage()
	const { container } = render(
		<TestProvider initializeState={initState}>
			<div style={{ width: 600, height: 400 }}>
				<AreaPlot xMinOverride={pins?.min} xMaxOverride={pins?.max} />
			</div>
		</TestProvider>,
	)
	return container
}

const textLabels = (container: HTMLElement): string[] =>
	[...container.querySelectorAll("text")].map((t) => t.textContent ?? "")

describe("AreaPlot pinned date x axis", () => {
	it("auto-fits the x axis to the data when no bound is set", () => {
		const labels = textLabels(mount())
		expect(labels).toContain("2000")
		expect(labels).toContain("2025")
		expect(labels).not.toContain("1990")
		expect(mount().querySelector("clipPath")).toBeNull()
	})

	it("lays the x axis out from the pinned min to the pinned max", () => {
		const container = mount({
			min: new Date(1990, 0, 1).getTime(),
			max: new Date(2020, 0, 1).getTime(),
		})
		const labels = textLabels(container)
		expect(labels).toContain("1990")
		expect(labels).toContain("2020")
		expect(labels).not.toContain("2025")
	})

	it("clips the layers to the plot so rows past the pinned range don't spill", () => {
		const container = mount({
			min: new Date(1990, 0, 1).getTime(),
			max: new Date(2020, 0, 1).getTime(),
		})
		const clip = container.querySelector("clipPath")
		expect(clip).not.toBeNull()
		const clipped = container.querySelector(`g[clip-path="url(#${clip!.id})"]`)
		expect(clipped).not.toBeNull()
		expect(clipped!.querySelectorAll("path").length).toBeGreaterThan(0)
	})
})
