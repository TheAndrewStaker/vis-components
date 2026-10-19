import { render } from "@testing-library/react"
import { TestProvider, type TestStore } from "../../../../testSupport/TestProvider"
import { installInMemoryLocalStorage } from "../../../../testSupport/localStorageShim"
import { describe, expect, it } from "vitest"
import {
	DEFAULT_CONNECTION_CONFIG,
	DEFAULT_DATA_LABELS_CONFIG,
} from "../../lib/channelConfig"
import { DEFAULT_LABELS_CONFIG } from "../../lib/labelsConfig"
import {
	emptyDataLabelsEncodings,
	emptyEncodings,
	type Dataset,
} from "../../lib/types"
import {
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

import { ScatterPlot } from "./ScatterPlot"

/** Line thickness "Vary by" on a scatter line chart. Each polyline's width
 *  comes from `thicknessByValue`, keyed by the Vary-by field's value off the
 *  line's representative (first) row when `thicknessField` is set — so a
 *  variable other than the connection field can drive it — and by the
 *  connection value for legacy visuals that stored only the map. */

const DATASET_ID = "ds-thickness-vary-by"

const buildDataset = (): Dataset => ({
	id: DATASET_ID,
	name: "test",
	fields: [
		{ name: "month", inferredType: "quantitative" },
		{ name: "sales", inferredType: "quantitative" },
		{ name: "region", inferredType: "categorical" },
		{ name: "tier", inferredType: "categorical" },
	],
	versions: [
		{
			id: "v1",
			filename: "test.csv",
			// Three lines (one per region). `tier` is constant within each
			// line, with two regions sharing a tier — the case the connection
			// value alone can't express.
			rows: [
				{ month: "1", sales: "10", region: "north", tier: "a" },
				{ month: "2", sales: "20", region: "north", tier: "a" },
				{ month: "1", sales: "12", region: "south", tier: "b" },
				{ month: "2", sales: "22", region: "south", tier: "b" },
				{ month: "1", sales: "14", region: "west", tier: "b" },
				{ month: "2", sales: "24", region: "west", tier: "b" },
			],
			createdAt: 0,
		},
	],
	latestVersionId: "v1",
	createdAt: 0,
})

const ENCODINGS = {
	...emptyEncodings(),
	x: { field: "month" },
	y: { field: "sales" },
	connection: { field: "region" },
}

const seedStorage = (connectionCfg: object) => {
	const store = installInMemoryLocalStorage()
	/* eslint-disable @vc/use-wrapped-json-functions */
	store.set("vis-components:datasets", JSON.stringify({ [DATASET_ID]: buildDataset() }))
	store.set("vis-components:currentDatasetId", JSON.stringify(DATASET_ID))
	store.set("vis-components:previewVersionId", JSON.stringify(null))
	store.set("vis-components:currentEncodings", JSON.stringify(ENCODINGS))
	// Channel configs bootstrap from storage on first read.
	store.set(
		"vis-components:currentChannelConfigs",
		JSON.stringify({ connection: connectionCfg })
	)
	/* eslint-enable @vc/use-wrapped-json-functions */
}

const initState = (snap: TestStore) => {
	snap.set(loadedDatasetsAtom, { [DATASET_ID]: buildDataset() })
	snap.set(currentDatasetIdAtom, DATASET_ID)
	snap.set(previewVersionIdAtom, null)
	snap.set(currentEncodingsAtom, ENCODINGS)
	snap.set(currentLabelsAtom, DEFAULT_LABELS_CONFIG)
	snap.set(currentDataLabelsConfigAtom, DEFAULT_DATA_LABELS_CONFIG)
	snap.set(currentDataLabelsEncodingsAtom, emptyDataLabelsEncodings())
	snap.set(currentFieldOverridesAtom, {})
	snap.set(currentFieldLevelOrdersAtom, {})
}

/** Sorted stroke widths of the visible connection polylines. */
const lineWidths = (connectionCfg: object): string[] => {
	seedStorage(connectionCfg)
	const { container } = render(
		<TestProvider initializeState={initState}>
			<div style={{ width: 600, height: 400 }}>
				<ScatterPlot />
			</div>
		</TestProvider>
	)
	return [...container.querySelectorAll("polyline:not(.vc-line-hit)")]
		.map((p) => p.getAttribute("stroke-width") ?? "")
		.sort()
}

describe("Line thickness — Vary by a field", () => {
	it("a non-connection field keys each line's width off its representative row", () => {
		// north → tier a → 1px; south and west → tier b → 7px.
		expect(
			lineWidths({
				...DEFAULT_CONNECTION_CONFIG,
				thickness: 2,
				thicknessField: "tier",
				thicknessByValue: { a: 1, b: 7 },
			})
		).toEqual(["1", "7", "7"])
	})

	it("legacy map without a field still keys by the connection value", () => {
		expect(
			lineWidths({
				...DEFAULT_CONNECTION_CONFIG,
				thickness: 2,
				thicknessByValue: { north: 3, south: 5 },
			})
		).toEqual(["2", "3", "5"])
	})

	it("a field with no matching levels falls back to the single thickness", () => {
		expect(
			lineWidths({
				...DEFAULT_CONNECTION_CONFIG,
				thickness: 2,
				thicknessField: "tier",
				thicknessByValue: { north: 9 },
			})
		).toEqual(["2", "2", "2"])
	})
})
