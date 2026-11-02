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

/** "Multiple variables…" on PIES through the production path (ChartCanvas →
 *  PlotCanvas → PiePlot → DataLabelsLayer). Reported: a chart rebuilt from a
 *  stacked bar into pies kept its composed labels (Rating + Bar total) and
 *  drew NO labels at all — pie anchors carried no row to compose from, and
 *  the layer dropped them instead of falling back. Pies now hand the layer a
 *  per-wedge row, so each composed label draws on every wedge; a field a
 *  wedge has no value for (the bar-only Bar total) composes nothing and the
 *  other labels still draw. */

const DATASET_ID = "ds-pie-composed-labels"
const settings = ["Home", "Away"]
const levels = ["a", "b", "c"]

const buildDataset = (): Dataset =>
	buildDatasetFixture({
		id: DATASET_ID,
		name: "pies",
		filename: "pies.csv",
		fields: [
			{ name: "Setting", inferredType: "categorical" },
			{ name: "level", inferredType: "categorical" },
			{ name: "value", inferredType: "quantitative" },
		],
		rows: settings.flatMap((s) =>
			levels.map((l, i) => ({ Setting: s, level: l, value: String(10 + i) }))
		),
	})

const seed = (labelsCfg: Partial<DataLabelsConfig>, fields: string[]) => {
	const store = installInMemoryLocalStorage()
	// x + angle (no length) → pies-x: one pie per Setting, a wedge per level.
	const encodings: Encodings = {
		...emptyEncodings(),
		x: { field: "Setting" },
		angle: { field: "value" },
		hue: { field: "level" },
	}
	/* eslint-disable @vc/use-wrapped-json-functions */
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
			// Pies gate on the Angle slot alone.
			angle: { field: "value" },
			value: { field: null, multiField: true, fields },
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

const texts = (container: HTMLElement) =>
	[
		...container.querySelectorAll(
			'g[aria-hidden="true"][pointer-events="none"] text'
		),
	]
		.map((t) => t.textContent?.trim() ?? "")
		.sort()

describe("Data labels — composed labels on pies", () => {
	it("every composed label draws once per wedge", () => {
		seed(
			{
				composedLabels: [
					{ id: "level", template: "{level}" },
					{ id: "value", template: "{value}" },
				],
			},
			["level", "value"]
		)
		const { container } = mount()
		expect(texts(container)).toEqual(
			[...levels, ...levels, "10", "11", "12", "10", "11", "12"].sort()
		)
	})

	it("a combination composes its template per wedge", () => {
		seed(
			{ composedLabels: [{ id: "lbl-1", template: "{level}: {value}" }] },
			["level", "value"]
		)
		const { container } = mount()
		expect(texts(container)).toEqual(
			[
				...levels.map((l, i) => `${l}: ${10 + i}`),
				...levels.map((l, i) => `${l}: ${10 + i}`),
			].sort()
		)
	})

	it("a leftover bar-only Bar total composes nothing; the other label still draws", () => {
		seed(
			{
				composedLabels: [
					{ id: "level", template: "{level}" },
					{ id: "Bar total", template: "{Bar total}" },
				],
			},
			["level", "Bar total"]
		)
		const { container } = mount()
		expect(texts(container)).toEqual([...levels, ...levels].sort())
	})

	it("a label's own Which labels puts it on each pie's last wedge only", () => {
		seed(
			{
				labelPointsScope: "stack",
				fieldLabelPoints: { value: "last" },
				composedLabels: [
					{ id: "level", template: "{level}" },
					{ id: "value", template: "{value}" },
				],
			},
			["level", "value"]
		)
		const { container } = mount()
		// Every wedge's level, plus the last wedge's value on each of the 2 pies.
		expect(texts(container)).toEqual([...levels, ...levels, "12", "12"].sort())
	})
})

/** "Outward" alignment through the production path: each label's
 *  `text-anchor` is the side away from its pie's center — `start` on the
 *  right half, `end` on the left — never the layer-wide middle. */
describe("Data labels — outward alignment on pies", () => {
	it("hangs every label away from its pie's center", () => {
		seed(
			{
				alignment: "outward",
				composedLabels: [{ id: "level", template: "{level}" }],
			},
			["level"]
		)
		const { container } = mount()
		const anchors = [
			...container.querySelectorAll(
				'g[aria-hidden="true"][pointer-events="none"] text'
			),
		].map((t) => t.getAttribute("text-anchor"))
		// Wedges of 10 / 11 / 12 sweep to 109° / 229° / 360°: midpoints at
		// 55° and 169° fall on the right half (start), 295° on the left (end).
		// Two pies → twice over.
		expect(anchors).toHaveLength(6)
		expect(anchors.filter((a) => a === "start")).toHaveLength(4)
		expect(anchors.filter((a) => a === "end")).toHaveLength(2)
	})
})
