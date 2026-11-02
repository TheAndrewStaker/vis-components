import { render } from "@testing-library/react"
import { TestProvider, type TestStore } from "../../../../testSupport/TestProvider"
import { installInMemoryLocalStorage } from "../../../../testSupport/localStorageShim"
import { buildDataset as buildDatasetFixture } from "../../../../testSupport/fixtures"
import { describe, expect, it } from "vitest"
import {
	DEFAULT_DATA_LABELS_CONFIG,
	type DataLabelsConfig,
} from "../../lib/channelConfig"
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
	currentFieldOverridesAtom,
	loadedDatasetsAtom,
	previewVersionIdAtom,
} from "../../store/atoms"

import { DataLabelsLayer, type DataLabelAnchor } from "./DataLabelsLayer"

/** Anchors WITHOUT a composable `row` (renderers that don't build one yet:
 *  areas, tiles) under a "Multiple variables…" Value mapping. Their boxes
 *  are keyed to no composed label, so the per-key expansion used to match
 *  none of them and every label vanished. They keep their pre-formatted
 *  text instead, following the composed labels' "Which labels". */

const DATASET_ID = "ds-preformatted-multi"

const buildDataset = (): Dataset =>
	buildDatasetFixture({
		id: DATASET_ID,
		name: "sales",
		filename: "sales.csv",
		fields: [
			{ name: "cat", inferredType: "categorical" },
			{ name: "val", inferredType: "quantitative" },
			{ name: "region", inferredType: "categorical" },
		],
		rows: [
			{ cat: "A", val: "10", region: "north" },
			{ cat: "A", val: "30", region: "south" },
			{ cat: "B", val: "20", region: "north" },
			{ cat: "B", val: "40", region: "south" },
		],
	})

// Pre-formatted anchors, no `row`: two series (north / south) of two.
const ANCHORS: DataLabelAnchor[] = [
	{ cx: 10, cy: 40, key: "A|north", label: "10", hueValue: "north", series: "north", rank: 0 },
	{ cx: 10, cy: 10, key: "A|south", label: "30", hueValue: "south", series: "south", rank: 0 },
	{ cx: 50, cy: 40, key: "B|north", label: "20", hueValue: "north", series: "north", rank: 1 },
	{ cx: 50, cy: 10, key: "B|south", label: "40", hueValue: "south", series: "south", rank: 1 },
]

const dataLabelsEncodings = {
	...emptyDataLabelsEncodings(),
	x: { field: "cat" },
	y: { field: "val" },
	value: { field: null, multiField: true, fields: ["val", "region"] },
}
const chartEncodings = {
	...emptyEncodings(),
	x: { field: "cat" },
	y: { field: "val" },
	hue: { field: "region" },
}

const seedState = (labelsCfg: Partial<DataLabelsConfig>) => {
	const store = installInMemoryLocalStorage()
	/* eslint-disable @vc/use-wrapped-json-functions */
	store.set(
		"vis-components:datasets",
		JSON.stringify({ [DATASET_ID]: buildDataset() })
	)
	store.set("vis-components:currentDatasetId", JSON.stringify(DATASET_ID))
	store.set("vis-components:previewVersionId", JSON.stringify(null))
	store.set("vis-components:currentEncodings", JSON.stringify(chartEncodings))
	store.set("vis-components:currentChannelConfigs", JSON.stringify({}))
	store.set(
		"vis-components:currentDataLabelsEncodings",
		JSON.stringify(dataLabelsEncodings)
	)
	store.set(
		"vis-components:currentDataLabelsConfig",
		JSON.stringify({ ...DEFAULT_DATA_LABELS_CONFIG, ...labelsCfg })
	)
	/* eslint-enable @vc/use-wrapped-json-functions */
}

const initState = (labelsCfg: Partial<DataLabelsConfig>) => (snap: TestStore) => {
	snap.set(loadedDatasetsAtom, { [DATASET_ID]: buildDataset() })
	snap.set(currentDatasetIdAtom, DATASET_ID)
	snap.set(previewVersionIdAtom, null)
	snap.set(currentEncodingsAtom, chartEncodings)
	snap.set(currentChannelConfigsAtom, {})
	snap.set(currentDataLabelsConfigAtom, { ...DEFAULT_DATA_LABELS_CONFIG, ...labelsCfg })
	snap.set(currentDataLabelsEncodingsAtom, dataLabelsEncodings)
	snap.set(currentFieldOverridesAtom, {})
}

const renderTexts = (labelsCfg: Partial<DataLabelsConfig>): string[] => {
	seedState(labelsCfg)
	const { container } = render(
		<TestProvider initializeState={initState(labelsCfg)}>
			<svg>
				<DataLabelsLayer
					rows={[]}
					xScale={null}
					yScale={null}
					xType="categorical"
					yType="quantitative"
					anchors={ANCHORS}
				/>
			</svg>
		</TestProvider>
	)
	return [...container.querySelectorAll("text")]
		.map((t) => t.textContent?.trim() ?? "")
		.sort()
}

describe("Data labels — pre-formatted anchors under a multi-field Value", () => {
	it("keep their text on every anchor", () => {
		expect(
			renderTexts({
				composedLabels: [
					{ id: "val", template: "{val}" },
					{ id: "region", template: "{region}" },
				],
			})
		).toEqual(["10", "20", "30", "40"])
	})

	it("follow the composed labels' Which labels (last per series)", () => {
		expect(
			renderTexts({
				labelPoints: "last",
				composedLabels: [{ id: "val", template: "{val}" }],
			})
		).toEqual(["20", "40"])
	})

	it("draw nothing when the composed-label list is empty", () => {
		expect(renderTexts({ composedLabels: [] })).toEqual([])
	})
})
