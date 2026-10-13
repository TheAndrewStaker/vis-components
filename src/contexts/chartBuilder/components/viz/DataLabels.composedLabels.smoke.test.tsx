import { render } from "@testing-library/react"
import { TestProvider } from "../../../../testSupport/TestProvider"
import { installInMemoryLocalStorage } from "../../../../testSupport/localStorageShim"
import { buildDataset as buildDatasetFixture } from "../../../../testSupport/fixtures"
import { describe, expect, it } from "vitest"
import {
	DEFAULT_DATA_LABELS_CONFIG,
	type DataLabelsConfig,
} from "../../lib/channelConfig"
import { DEFAULT_LABELS_CONFIG } from "../../lib/labelsConfig"
import {
	emptyDataLabelsEncodings,
	emptyEncodings,
	type Dataset,
	type Encodings,
} from "../../lib/types"

import { ChartCanvas } from "./ChartCanvas"

/** Composed labels through the production path on a stacked bar chart:
 *  every text box is one label at every anchor its own "Which labels"
 *  names, composing its template, styled as one by its id. */

const DATASET_ID = "ds-composed-labels"
const settings = ["Home", "Away"]
const levels = ["a", "b", "c"]

const buildDataset = (): Dataset =>
	buildDatasetFixture({
		id: DATASET_ID,
		name: "bars",
		filename: "bars.csv",
		fields: [
			{ name: "Setting", inferredType: "categorical" },
			{ name: "level", inferredType: "categorical" },
			{ name: "value", inferredType: "quantitative" },
		],
		rows: settings.flatMap((s) =>
			levels.map((l, i) => ({ Setting: s, level: l, value: String(10 + i) }))
		),
	})

const seed = (labelsCfg: Partial<DataLabelsConfig>) => {
	const store = installInMemoryLocalStorage()
	const encodings: Encodings = {
		...emptyEncodings(),
		x: { field: "Setting" },
		length: { field: "value" },
		hue: { field: "level" },
	}
	/* eslint-disable @th/use-wrapped-json-functions */
	store.set(
		"vis-components:datasets",
		JSON.stringify({ [DATASET_ID]: buildDataset() })
	)
	store.set("vis-components:currentDatasetId", JSON.stringify(DATASET_ID))
	store.set("vis-components:previewVersionId", JSON.stringify(null))
	store.set("vis-components:currentEncodings", JSON.stringify(encodings))
	store.set("vis-components:currentChannelConfigs", JSON.stringify({}))
	store.set(
		"vis-components:currentLabels",
		JSON.stringify({ _v: 1, data: DEFAULT_LABELS_CONFIG })
	)
	store.set(
		"vis-components:currentDataLabelsEncodings",
		JSON.stringify({
			...emptyDataLabelsEncodings(),
			x: { field: "Setting" },
			y: { field: "value" },
			value: { field: null, multiField: true, fields: ["level", "value"] },
		})
	)
	store.set(
		"vis-components:currentDataLabelsConfig",
		JSON.stringify({ ...DEFAULT_DATA_LABELS_CONFIG, ...labelsCfg })
	)
	/* eslint-enable @th/use-wrapped-json-functions */
}

const mount = () =>
	render(
		<TestProvider>
			<div style={{ width: 800, height: 600 }}>
				<ChartCanvas />
			</div>
		</TestProvider>
	)

const labelNodes = (container: HTMLElement) => [
	...container.querySelectorAll(
		'g[aria-hidden="true"][pointer-events="none"] text'
	),
]
const texts = (container: HTMLElement) =>
	labelNodes(container)
		.map((t) => t.textContent?.trim() ?? "")
		.sort()

describe("Data labels — composed labels", () => {
	it("the default list labels every anchor once per variable", () => {
		seed({
			composedLabels: [
				{ id: "level", template: "{level}" },
				{ id: "value", template: "{value}" },
			],
		})
		const { container } = mount()
		expect(texts(container)).toEqual(
			[...levels, ...levels, "10", "11", "12", "10", "11", "12"].sort()
		)
	})

	it("a combination composes its template beside a single-variable label", () => {
		seed({
			composedLabels: [
				{ id: "lbl-1", template: "{level}: {value}" },
				{ id: "value", template: "{value}" },
			],
		})
		const { container } = mount()
		expect(texts(container)).toEqual(
			[
				...levels.map((l, i) => `${l}: ${10 + i}`),
				...levels.map((l, i) => `${l}: ${10 + i}`),
				"10",
				"11",
				"12",
				"10",
				"11",
				"12",
			].sort()
		)
	})

	it("an empty box draws nothing; an explicit empty list draws no labels", () => {
		seed({ composedLabels: [{ id: "lbl-1", template: "" }, { id: "value", template: "{value}" }] })
		const one = mount()
		expect(texts(one.container)).toEqual(["10", "11", "12", "10", "11", "12"].sort())
		one.unmount()
		seed({ composedLabels: [] })
		const none = mount()
		expect(texts(none.container)).toEqual([])
	})

	it("a label's own color by id covers the whole label", () => {
		seed({
			color: "#111111",
			composedLabels: [{ id: "lbl-1", template: "{level} {value}" }],
			fieldColors: { "lbl-1": { field: null, singleColor: "#ff0000" } },
		})
		const { container } = mount()
		const nodes = labelNodes(container)
		expect(nodes).toHaveLength(6)
		for (const t of nodes) {
			const fills = [...t.querySelectorAll("tspan")].map((s) => s.getAttribute("fill"))
			expect(fills.length).toBeGreaterThan(0)
			for (const f of fills) expect(f).toBe("#ff0000")
		}
	})

	it("a label's own Which labels puts it on the series end only", () => {
		seed({
			fieldLabelPoints: { "lbl-1": "last" },
			labelPointsScope: "stack",
			composedLabels: [
				{ id: "value", template: "{value}" },
				{ id: "lbl-1", template: "{level}+" },
			],
		})
		const { container } = mount()
		// value: every slice (6); the combination: top slice of each stack (2).
		expect(texts(container)).toEqual(
			["10", "11", "12", "10", "11", "12", "c+", "c+"].sort()
		)
	})

	it("a visual saved before composed labels keeps its combined look", () => {
		// Legacy state: variables combined by the shared Label text.
		seed({ labelTemplate: "{level} ({value})" })
		const { container } = mount()
		expect(texts(container)).toEqual(
			[
				...levels.map((l, i) => `${l} (${10 + i})`),
				...levels.map((l, i) => `${l} (${10 + i})`),
			].sort()
		)
	})
})
