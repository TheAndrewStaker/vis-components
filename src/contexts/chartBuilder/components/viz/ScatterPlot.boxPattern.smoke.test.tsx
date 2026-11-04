import { render } from "@testing-library/react"
import { TestProvider } from "../../../../testSupport/TestProvider"
import { installInMemoryLocalStorage } from "../../../../testSupport/localStorageShim"
import { buildDataset as buildDatasetFixture } from "../../../../testSupport/fixtures"
import { describe, expect, it } from "vitest"
import {
	DEFAULT_AXIS_CONFIG,
	DEFAULT_DISTRIBUTION_OVERLAY_CONFIG,
	DEFAULT_PATTERN_CONFIG,
	type ChannelConfigs,
} from "../../lib/channelConfig"
import { DEFAULT_LABELS_CONFIG } from "../../lib/labelsConfig"
import { emptyEncodings, type Dataset, type Encodings } from "../../lib/types"

import { ChartCanvas } from "./ChartCanvas"

/** The box / violin body takes the Pattern menu's SEPARATE "Violin / box
 *  fill" pick: `pattern.defaultViolinPattern` (no pattern variable) or
 *  `pattern.violinOverrides` (per category, opt-in). The point-fill pick
 *  (`defaultPattern` / `pattern.overrides`) never reaches the body, and
 *  every referenced `<pattern>` def is emitted upfront. */

const DATASET_ID = "ds-box-pattern"

const buildDataset = (): Dataset =>
	buildDatasetFixture({
		id: DATASET_ID,
		name: "scores",
		filename: "scores.csv",
		fields: [
			{ name: "group", inferredType: "categorical" },
			{ name: "score", inferredType: "quantitative" },
		],
		rows: ["A", "B"].flatMap((group) =>
			Array.from({ length: 6 }, (_, i) => ({ group, score: String(i + 1) }))
		),
	})

const seed = (encodings: Partial<Encodings>, configs: Partial<ChannelConfigs>) => {
	installInMemoryLocalStorage()
	/* eslint-disable no-restricted-globals, @vc/no-storage-outside-try, @vc/use-wrapped-json-functions */
	const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v))
	set("vis-components:datasets", { [DATASET_ID]: buildDataset() })
	set("vis-components:currentDatasetId", DATASET_ID)
	set("vis-components:previewVersionId", null)
	set("vis-components:currentEncodings", {
		...emptyEncodings(),
		x: { field: "group" },
		y: { field: "score" },
		...encodings,
	})
	set("vis-components:currentChannelConfigs", {
		y: {
			...DEFAULT_AXIS_CONFIG,
			distributionOverlay: {
				...DEFAULT_DISTRIBUTION_OVERLAY_CONFIG,
				showBoxPlot: true,
				showPoints: false,
			},
		},
		...configs,
	})
	set("vis-components:currentLabels", { _v: 1, data: DEFAULT_LABELS_CONFIG })
	/* eslint-enable no-restricted-globals, @vc/no-storage-outside-try, @vc/use-wrapped-json-functions */
}

const mount = () =>
	render(
		<TestProvider>
			<div style={{ width: 800, height: 600 }}>
				<ChartCanvas />
			</div>
		</TestProvider>
	)

// The box bodies are the only <rect>s painted with the overlay fill — plain
// (the default box fill) or a pattern reference. A pattern def's own tile
// rect carries the same fill color, so rects inside <pattern> are skipped.
const bodyFills = (container: HTMLElement): string[] =>
	[...container.querySelectorAll("rect")]
		.filter((r) => r.closest("pattern") === null)
		.map((r) => r.getAttribute("fill") ?? "")
		.filter(
			(f) =>
				f === DEFAULT_DISTRIBUTION_OVERLAY_CONFIG.fillColor ||
				f.startsWith("url(#vc-pat-")
		)

const isPatternRef = (f: string) => f.startsWith("url(#vc-pat-")

describe("box-plot body fill pattern", () => {
	it("draws plain bodies by default", () => {
		seed({}, {})
		const fills = bodyFills(mount().container)
		expect(fills).toHaveLength(2)
		expect(fills.some(isPatternRef)).toBe(false)
	})

	it("tiles every body with pattern.defaultViolinPattern and emits its def", () => {
		seed({}, { pattern: { ...DEFAULT_PATTERN_CONFIG, defaultViolinPattern: 2 } })
		const { container } = mount()
		const fills = bodyFills(container)
		expect(fills).toHaveLength(2)
		expect(fills.every(isPatternRef)).toBe(true)
		for (const f of fills) {
			const id = f.slice("url(#".length, -1)
			expect(container.querySelector(`pattern[id="${id}"]`)).not.toBeNull()
		}
	})

	it("ignores the POINT-fill default pattern — the picks are separate", () => {
		seed({}, { defaultPattern: 2 })
		const fills = bodyFills(mount().container)
		expect(fills).toHaveLength(2)
		expect(fills.some(isPatternRef)).toBe(false)
	})

	it("with a pattern variable mapped, only the categories with a violin pick are tiled", () => {
		seed(
			{ pattern: { field: "group" } },
			{ pattern: { ...DEFAULT_PATTERN_CONFIG, violinOverrides: { A: 1 } } }
		)
		const fills = bodyFills(mount().container)
		expect(fills).toHaveLength(2)
		expect(fills.filter(isPatternRef)).toHaveLength(1)
	})

	it("Vary by 'none' with a pattern variable mapped: the default violin pattern tiles every body", () => {
		seed(
			{ pattern: { field: "group" } },
			{ pattern: { ...DEFAULT_PATTERN_CONFIG, violinField: null, defaultViolinPattern: 2 } }
		)
		const fills = bodyFills(mount().container)
		expect(fills).toHaveLength(2)
		expect(fills.every(isPatternRef)).toBe(true)
	})

	it("Vary by its own variable with NO pattern variable mapped: that variable's picks tile the bodies", () => {
		seed(
			{},
			{
				pattern: {
					...DEFAULT_PATTERN_CONFIG,
					violinField: "group",
					violinOverrides: { A: 1 },
				},
			}
		)
		const { container } = mount()
		const fills = bodyFills(container)
		expect(fills).toHaveLength(2)
		const refs = fills.filter(isPatternRef)
		expect(refs).toHaveLength(1)
		const id = refs[0]!.slice("url(#".length, -1)
		expect(container.querySelector(`pattern[id="${id}"]`)).not.toBeNull()
	})
})
