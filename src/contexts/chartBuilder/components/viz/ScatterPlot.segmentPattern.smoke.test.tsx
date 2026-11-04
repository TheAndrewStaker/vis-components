import { render } from "@testing-library/react"
import { TestProvider, type TestStore } from "../../../../testSupport/TestProvider"
import { installInMemoryLocalStorage } from "../../../../testSupport/localStorageShim"
import { buildDataset as buildDatasetFixture } from "../../../../testSupport/fixtures"
import { describe, expect, it } from "vitest"
import {
	DEFAULT_CONNECTION_CONFIG,
	DEFAULT_DATA_LABELS_CONFIG,
	DEFAULT_LENGTH_CONFIG,
	type ChannelConfigs,
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
import { ScatterPlot } from "./ScatterPlot"

/** Pattern on scatter LINE SEGMENTS (the funnel-chart case): a thick
 *  segment takes the pattern tile as its stroke paint; a thin one takes
 *  the dash; the Segments toggle overrides the auto rule. */

const DATASET_ID = "ds-segment-pattern"

const buildDataset = (): Dataset =>
	buildDatasetFixture({
		id: DATASET_ID,
		name: "test",
		filename: "test.csv",
		fields: [
			{ name: "x", inferredType: "quantitative" },
			{ name: "group", inferredType: "categorical" },
			{ name: "value", inferredType: "quantitative" },
		],
		rows: [
			{ x: "1", group: "A", value: "5" },
			{ x: "1", group: "B", value: "4" },
			{ x: "1", group: "C", value: "3" },
		],
	})

const mount = (opts: {
	patternField?: string
	configs?: Partial<ChannelConfigs>
}) => {
	const store = installInMemoryLocalStorage()
	const encodings: Encodings = {
		...emptyEncodings(),
		x: { field: "x" },
		y: { field: "group" },
		length: { field: "value" },
		...(opts.patternField ? { pattern: { field: opts.patternField } } : {}),
	}
	/* eslint-disable @vc/use-wrapped-json-functions */
	store.set(
		"vis-components:datasets",
		JSON.stringify({ [DATASET_ID]: buildDataset() })
	)
	store.set("vis-components:currentDatasetId", JSON.stringify(DATASET_ID))
	store.set("vis-components:previewVersionId", JSON.stringify(null))
	store.set("vis-components:currentEncodings", JSON.stringify(encodings))
	/* eslint-enable @vc/use-wrapped-json-functions */
	const init = (snap: TestStore) => {
		snap.set(loadedDatasetsAtom, { [DATASET_ID]: buildDataset() })
		snap.set(currentDatasetIdAtom, DATASET_ID)
		snap.set(previewVersionIdAtom, null)
		snap.set(currentEncodingsAtom, encodings)
		snap.set(currentLabelsAtom, DEFAULT_LABELS_CONFIG)
		snap.set(currentDataLabelsConfigAtom, DEFAULT_DATA_LABELS_CONFIG)
		snap.set(currentDataLabelsEncodingsAtom, emptyDataLabelsEncodings())
		snap.set(currentFieldOverridesAtom, {})
		snap.set(currentFieldLevelOrdersAtom, {})
		snap.set(currentChannelConfigsAtom, (prev) => ({ ...prev, ...opts.configs }))
	}
	const { container } = render(
		<TestProvider initializeState={init}>
			<div style={{ width: 600, height: 400 }}>
				<ScatterPlot />
			</div>
		</TestProvider>
	)
	return container
}

/** The data segments: every `<line>` carrying a stroke-linecap (axis
 *  stems and gridlines don't). */
const segments = (container: HTMLElement) =>
	[...container.querySelectorAll("line[stroke-linecap]")] as SVGLineElement[]

const patternStroked = (lines: SVGLineElement[]) =>
	lines.filter((l) => (l.getAttribute("stroke") ?? "").startsWith("url(#vc-pat-"))
const dashed = (lines: SVGLineElement[]) =>
	lines.filter((l) => l.getAttribute("stroke-dasharray") !== null)

const thick = { ...DEFAULT_LENGTH_CONFIG, segmentThickness: 44 }
const thin = { ...DEFAULT_LENGTH_CONFIG, segmentThickness: 3 }

describe("Pattern on line segments", () => {
	it("a thick segment takes the default pattern as its stroke paint", () => {
		const container = mount({
			configs: { defaultPattern: 0, length: thick },
		})
		const lines = segments(container)
		expect(lines).toHaveLength(3)
		expect(patternStroked(lines)).toHaveLength(3)
		expect(dashed(lines)).toHaveLength(0)
		// The def the stroke references is emitted.
		const id = lines[0]!.getAttribute("stroke")!.slice("url(#".length, -1)
		expect(container.querySelector(`pattern[id="${id}"]`)).not.toBeNull()
	})

	it("a thin segment takes the default line dash instead, over the gap ink", () => {
		const container = mount({
			configs: {
				defaultPattern: 0,
				length: thin,
				connection: { ...DEFAULT_CONNECTION_CONFIG, defaultDashPattern: "dashed" },
			},
		})
		const lines = segments(container)
		// Underlay + dashed top line per segment ("Fill dash gaps" auto on).
		expect(lines).toHaveLength(6)
		expect(patternStroked(lines)).toHaveLength(0)
		const top = dashed(lines)
		expect(top).toHaveLength(3)
		expect(top.map((l) => l.getAttribute("stroke-dasharray"))).toEqual([
			"8,7",
			"8,7",
			"8,7",
		])
	})

	it("a pattern variable on thin segments cycles the dash by category", () => {
		const container = mount({
			patternField: "group",
			configs: {
				length: thin,
				connection: { ...DEFAULT_CONNECTION_CONFIG, dashGapFill: false },
			},
		})
		const lines = segments(container)
		expect(lines).toHaveLength(3)
		expect(lines.map((l) => l.getAttribute("stroke-dasharray"))).toEqual([
			"8,7",
			"2,6",
			"8,6,2,6",
		])
	})

	it("a pattern variable on thick segments strokes each with its tile", () => {
		const container = mount({
			patternField: "group",
			configs: { length: thick },
		})
		const lines = segments(container)
		expect(patternStroked(lines)).toHaveLength(3)
		expect(new Set(lines.map((l) => l.getAttribute("stroke"))).size).toBe(3)
	})

	it("the Segments toggle overrides the auto rule both ways", () => {
		const forcedDash = segments(
			mount({
				configs: {
					defaultPattern: 0,
					length: thick,
					pattern: {
						overrides: {},
						inkColors: {},
						backgroundColor: null,
						stackMode: "stack",
						segmentPattern: "dash",
					},
					connection: {
						...DEFAULT_CONNECTION_CONFIG,
						defaultDashPattern: "dotted",
						dashGapFill: false,
					},
				},
			})
		)
		expect(patternStroked(forcedDash)).toHaveLength(0)
		expect(dashed(forcedDash)).toHaveLength(3)
		const forcedFill = segments(
			mount({
				configs: {
					defaultPattern: 0,
					length: thin,
					pattern: {
						overrides: {},
						inkColors: {},
						backgroundColor: null,
						stackMode: "stack",
						segmentPattern: "fill",
					},
				},
			})
		)
		expect(patternStroked(forcedFill)).toHaveLength(3)
	})
})
