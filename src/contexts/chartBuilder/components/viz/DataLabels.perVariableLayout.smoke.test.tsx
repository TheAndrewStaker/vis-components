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

/** Per-variable text layout with separate variables (Combine variables
 *  unchecked), through the production path on a stacked bar chart: each
 *  variable's own angle / wrapping / overlap avoidance
 *  (`DataLabelsConfig.fieldLayouts`) applies to ITS labels only, the
 *  layer-wide values backing the rest. */

const DATASET_ID = "ds-per-variable-layout"
const settings = ["Home", "Away"]
// Two-word level names so character wrapping has somewhere to break.
const levels = ["alpha one", "beta two", "gamma three"]

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
		JSON.stringify({
			...DEFAULT_DATA_LABELS_CONFIG,
			combineVariables: false,
			...labelsCfg,
		})
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

const dataLabels = (container: HTMLElement) =>
	[
		...container.querySelectorAll(
			'g[aria-hidden="true"][pointer-events="none"]'
		),
	].flatMap((g) => [...g.querySelectorAll("text")])

const isLevel = (t: Element) => levels.includes(t.textContent?.trim() ?? "")
const isValue = (t: Element) => /^\d+$/.test(t.textContent?.trim() ?? "")
const num = (el: Element, attr: string) => Number(el.getAttribute(attr) ?? NaN)

describe("Data labels — per-variable layout with separate variables", () => {
	it("angle: only the variable with its own angle rotates", () => {
		seed({ fieldLayouts: { level: { textAngle: 45 } } })
		const { container } = mount()
		const labels = dataLabels(container)
		expect(labels.filter(isLevel)).toHaveLength(6)
		expect(labels.filter(isValue)).toHaveLength(6)
		for (const t of labels) {
			const transform = t.parentElement?.getAttribute("transform") ?? ""
			if (isLevel(t)) expect(transform).toMatch(/^rotate\(45 /)
			else expect(transform).toBe("")
		}
	})

	it("angle: a variable's entry overrides a layer-wide angle, others keep it", () => {
		seed({ textAngle: 30, fieldLayouts: { value: { textAngle: 0 } } })
		const { container } = mount()
		for (const t of dataLabels(container)) {
			const transform = t.parentElement?.getAttribute("transform") ?? ""
			if (isValue(t)) expect(transform).toBe("")
			else expect(transform).toMatch(/^rotate\(30 /)
		}
	})

	it("wrapping: only the variable with wrapping on breaks into lines", () => {
		seed({ fieldLayouts: { level: { wrapText: true, wrapMaxChars: 6 } } })
		const { container } = mount()
		// Wrapped lines are the tspans carrying a `dy` (line step); a
		// single-line label has none. A wrapped level's textContent loses
		// its space ("alphaone"), so classify by the numeric value labels.
		const labels = dataLabels(container)
		expect(labels).toHaveLength(12)
		for (const t of labels) {
			const lines = t.querySelectorAll("tspan[dy]").length
			if (isValue(t)) expect(lines).toBe(0)
			else expect(lines).toBeGreaterThan(1)
		}
	})

	it("overlap avoidance: variables with it on move out of each other's way; a variable with it off stays put", () => {
		// Both variables sit on the same anchor, so their labels coincide.
		seed({})
		const plain = mount()
		const yOf = (labels: Element[]) =>
			labels.map((t) => num(t, "y")).sort((a, b) => a - b)
		const plainValueY = yOf(dataLabels(plain.container).filter(isValue))
		const plainLevelY = yOf(dataLabels(plain.container).filter(isLevel))
		expect(plainLevelY).toEqual(plainValueY)
		plain.unmount()

		// Only "level" participates: its labels spread apart (the headless
		// chart is tiny, so the stack's labels collide), the value labels —
		// no entry, layer-wide switch off — stay exactly put.
		seed({ fieldLayouts: { level: { avoidOverlaps: true } } })
		const one = mount()
		expect(yOf(dataLabels(one.container).filter(isLevel))).not.toEqual(plainLevelY)
		expect(yOf(dataLabels(one.container).filter(isValue))).toEqual(plainValueY)
		one.unmount()

		// Both participate: coincident pairs separate; the value labels,
		// which carry no entry, follow the layer-wide switch too.
		seed({
			avoidOverlaps: true,
			fieldLayouts: { level: { avoidOverlaps: true } },
		})
		const both = mount()
		const levelY = yOf(dataLabels(both.container).filter(isLevel))
		const valueY = yOf(dataLabels(both.container).filter(isValue))
		expect(levelY).not.toEqual(valueY)
		both.unmount()

		// Layer-wide on but "value" opted out: its labels stay where they
		// were; only the level labels can move.
		seed({ avoidOverlaps: true, fieldLayouts: { value: { avoidOverlaps: false } } })
		const optOut = mount()
		expect(yOf(dataLabels(optOut.container).filter(isValue))).toEqual(plainValueY)
	})
})
