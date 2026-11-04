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
import { modulateColor } from "../../lib/scales"
import { emptyEncodings, type Dataset } from "../../lib/types"

import { ChartCanvas } from "./ChartCanvas"

/** The Saturation / Brightness menus' "Violin / box fill" and "Violin / box
 *  outline" slots modulate the overlay body and its strokes, absolutely per
 *  part like the points' Outline slot. A body pattern keeps pairing its ink
 *  on the PRE-modulation fill (the palette's exact hex), while its tile shows
 *  the modulated color — the same rule a mark follows. */

const DATASET_ID = "ds-box-modulation"

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

const seed = (configs: Partial<ChannelConfigs>) => {
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

const BASE_FILL = DEFAULT_DISTRIBUTION_OVERLAY_CONFIG.fillColor
const BASE_STROKE = DEFAULT_DISTRIBUTION_OVERLAY_CONFIG.color

// Box body rects: outside any <pattern>, painted with a plain color.
const bodyRects = (container: HTMLElement) =>
	[...container.querySelectorAll("rect")].filter(
		(r) => r.closest("pattern") === null && (r.getAttribute("fill") ?? "").startsWith("#")
	)
// The median line is the box stroke drawn 1.5× wide — a stable handle on
// the body's stroke color.
const medianStrokes = (container: HTMLElement) =>
	[...container.querySelectorAll("line")]
		.filter((l) => l.getAttribute("stroke-width") === "1.5")
		.map((l) => l.getAttribute("stroke"))

describe("box-plot body saturation / brightness slots", () => {
	it("draws the plain overlay colors when no slot is set", () => {
		seed({})
		const { container } = mount()
		const fills = bodyRects(container).map((r) => r.getAttribute("fill"))
		expect(fills).toEqual([BASE_FILL, BASE_FILL])
		expect(medianStrokes(container)).toEqual([BASE_STROKE, BASE_STROKE])
	})

	it("a Violin / box fill brightness level modulates the body, not the outline", () => {
		seed({ brightnessSlots: { violinFill: { field: null, level: 0.9 } } })
		const { container } = mount()
		const expected = modulateColor(BASE_FILL, null, 0.9)
		expect(expected).not.toBe(BASE_FILL)
		const fills = bodyRects(container).map((r) => r.getAttribute("fill"))
		expect(fills).toEqual([expected, expected])
		expect(medianStrokes(container)).toEqual([BASE_STROKE, BASE_STROKE])
	})

	it("a Violin / box outline saturation level modulates the strokes, not the body", () => {
		seed({ saturationSlots: { violinStroke: { field: null, level: 0.1 } } })
		const { container } = mount()
		const expected = modulateColor(BASE_STROKE, 0.1, null)
		expect(expected).not.toBe(BASE_STROKE)
		expect(medianStrokes(container)).toEqual([expected, expected])
		const fills = bodyRects(container).map((r) => r.getAttribute("fill"))
		expect(fills).toEqual([BASE_FILL, BASE_FILL])
	})

	it("a patterned body tiles over the modulated fill", () => {
		seed({
			brightnessSlots: { violinFill: { field: null, level: 0.9 } },
			pattern: { ...DEFAULT_PATTERN_CONFIG, defaultViolinPattern: 1 },
		})
		const { container } = mount()
		const ref = [...container.querySelectorAll("rect")]
			.map((r) => r.getAttribute("fill") ?? "")
			.find((f) => f.startsWith("url(#vc-pat-"))
		expect(ref).toBeTruthy()
		const def = container.querySelector(`pattern[id="${ref!.slice("url(#".length, -1)}"]`)
		expect(def).not.toBeNull()
		// The tile (the def's background rect) carries the modulated fill.
		const tile = def!.querySelector("rect")?.getAttribute("fill")
		expect(tile).toBe(modulateColor(BASE_FILL, null, 0.9))
	})
})
