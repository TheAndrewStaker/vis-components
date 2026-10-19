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
} from "../../lib/types"

import { ChartCanvas } from "./ChartCanvas"

/** "Combine variables into single label" UNCHECKED: each checked variable
 *  renders as its own label at every anchor it applies to, instead of the
 *  arranged `{A}, {B}` label. Templates stand down. Per-variable "Which
 *  labels" still decides where each variable's labels appear. Mounted
 *  through the production stacked-bar path. */

const DATASET_ID = "ds-separate-variables"

const buildDataset = (): Dataset =>
	buildDatasetFixture({
		id: DATASET_ID,
		name: "bars",
		filename: "bars.csv",
		fields: [
			{ name: "category", inferredType: "categorical" },
			{ name: "value", inferredType: "quantitative" },
			{ name: "series", inferredType: "categorical" },
		],
		rows: [
			{ category: "A", value: "0.1", series: "x" },
			{ category: "A", value: "0.2", series: "y" },
			{ category: "B", value: "0.15", series: "x" },
			{ category: "B", value: "0.25", series: "y" },
		],
	})

const seed = (labelsCfg: Partial<DataLabelsConfig>) => {
	const store = installInMemoryLocalStorage()
	/* eslint-disable @vc/use-wrapped-json-functions */
	store.set(
		"vis-components:datasets",
		JSON.stringify({ [DATASET_ID]: buildDataset() })
	)
	store.set("vis-components:currentDatasetId", JSON.stringify(DATASET_ID))
	store.set("vis-components:previewVersionId", JSON.stringify(null))
	store.set(
		"vis-components:currentEncodings",
		JSON.stringify({
			...emptyEncodings(),
			x: { field: "category" },
			length: { field: "value" },
			hue: { field: "series" },
		})
	)
	store.set("vis-components:currentChannelConfigs", JSON.stringify({}))
	store.set(
		"vis-components:currentLabels",
		JSON.stringify({ _v: 1, data: DEFAULT_LABELS_CONFIG })
	)
	store.set(
		"vis-components:currentDataLabelsEncodings",
		JSON.stringify({
			...emptyDataLabelsEncodings(),
			x: { field: "category" },
			y: { field: "value" },
			value: { field: null, multiField: true, fields: ["value", "series"] },
		})
	)
	store.set(
		"vis-components:currentDataLabelsConfig",
		JSON.stringify({ ...DEFAULT_DATA_LABELS_CONFIG, ...labelsCfg })
	)
	/* eslint-enable @vc/use-wrapped-json-functions */
}

const mount = () =>
	render(
		<TestProvider>
			<div style={{ width: 800, height: 600 }}>
				<ChartCanvas />
			</div>
		</TestProvider>
	)

const renderedDataLabels = (container: HTMLElement) => {
	const groups = container.querySelectorAll(
		'g[aria-hidden="true"][pointer-events="none"]'
	)
	return [...groups].flatMap((g) => [...g.querySelectorAll("text")])
}
const texts = (container: HTMLElement) =>
	renderedDataLabels(container)
		.map((t) => t.textContent?.trim() ?? "")
		.sort()

describe("Data labels — separate variables (combine unchecked)", () => {
	it("renders one label per variable per slice instead of the arranged label", () => {
		seed({
			combineVariables: false,
			fieldFormats: { value: ".0%" },
			// A template that would otherwise arrange them — ignored.
			labelTemplate: "{series}: {value}",
		})
		const { container } = mount()
		expect(texts(container)).toEqual(
			["10%", "20%", "15%", "25%", "x", "y", "x", "y"].sort()
		)
	})

	it("keeps per-variable Which labels: the series name only on the last bar", () => {
		seed({
			combineVariables: false,
			fieldFormats: { value: ".0%" },
			fieldLabelPoints: { series: "last" },
		})
		const { container } = mount()
		expect(texts(container)).toEqual(
			["10%", "20%", "15%", "25%", "x", "y"].sort()
		)
	})

	it("positions and aligns each variable's labels by its own settings", () => {
		seed({
			combineVariables: false,
			fieldFormats: { value: ".0%" },
			alignment: "center",
			xOffset: 0,
			fieldAlignments: { series: "left" },
			fieldOffsets: { series: { xOffset: 20 } },
		})
		const { container } = mount()
		const labels = renderedDataLabels(container)
		const x = (t: Element) => Number(t.getAttribute("x") ?? NaN)
		const withText = (s: string) =>
			labels.filter((t) => t.textContent?.trim() === s)
		// The series labels take their own alignment + nudge; the value labels
		// on the same slices keep the layer defaults.
		for (const t of withText("x")) {
			expect(t.getAttribute("text-anchor")).toBe("start")
		}
		for (const t of [...withText("10%"), ...withText("15%")]) {
			expect(t.getAttribute("text-anchor")).toBe("middle")
		}
		// Series "x" has one slice per category: its two labels sit 20px right
		// of the two value labels on those slices.
		const seriesXs = withText("x").map(x).sort((a, b) => a - b)
		const valueXs = [...withText("10%"), ...withText("15%")]
			.map((t) => x(t) + 20)
			.sort((a, b) => a - b)
		expect(seriesXs.length).toBe(2)
		seriesXs.forEach((v, i) => expect(v).toBeCloseTo(valueXs[i]!, 5))
	})

	it("combined (the default) still arranges the variables into one label", () => {
		seed({ fieldFormats: { value: ".0%" }, labelTemplate: "{series}: {value}" })
		const { container } = mount()
		expect(texts(container)).toEqual(
			["x: 10%", "y: 20%", "x: 15%", "y: 25%"].sort()
		)
	})
})
