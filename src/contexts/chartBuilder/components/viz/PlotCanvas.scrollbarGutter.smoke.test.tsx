import { render } from "@testing-library/react"
import { TestProvider } from "../../../../testSupport/TestProvider"
import { installInMemoryLocalStorage } from "../../../../testSupport/localStorageShim"
import { describe, expect, it, vi } from "vitest"
import { DEFAULT_FACET_CONFIG } from "../../lib/channelConfig"
import { DEFAULT_LABELS_CONFIG } from "../../lib/labelsConfig"
import { emptyEncodings, type Dataset } from "../../lib/types"

import { ChartCanvas } from "./ChartCanvas"

/** A canvas that overflows the container on ONE axis scrolls inside a box
 *  the size of the container. With classic (space-taking) scrollbars the
 *  bar takes its width out of the other axis, so a canvas solved to the
 *  full container width overflowed by exactly that much and grew a second,
 *  useless scrollbar (user-reported Oct 2026 on a ridgeline with a pixel
 *  panel height). PlotCanvas re-solves with the gutter taken out of the
 *  non-scrolling axis and scrolls each axis only when the SVG overflows it.
 *
 *  Headless Chrome on macOS only has overlay scrollbars (gutter 0), so the
 *  measurement is mocked to a classic 15px bar here; jsdom measures the
 *  canvas as 0×0, so the measure hook is mocked to a real-sized box. */
vi.mock("react-use-measure", () => ({
	default: () => [
		() => {},
		{ x: 0, y: 0, top: 0, left: 0, right: 800, bottom: 600, width: 800, height: 600 },
	],
}))
vi.mock("../../lib/scrollbarWidth", () => ({
	measureScrollbarWidth: () => 15,
}))

const DATASET_ID = "ds-scroll-gutter"

const buildRowDataset = (): Dataset => ({
	id: DATASET_ID,
	name: "rows",
	fields: [
		{ name: "x", inferredType: "quantitative" },
		{ name: "y", inferredType: "quantitative" },
		{ name: "region", inferredType: "categorical" },
	],
	versions: [
		{
			id: "v1",
			filename: "rows.csv",
			rows: [
				{ x: "1", y: "10", region: "N" },
				{ x: "2", y: "20", region: "N" },
				{ x: "3", y: "30", region: "S" },
				{ x: "4", y: "40", region: "S" },
			],
			createdAt: 0,
		},
	],
	latestVersionId: "v1",
	createdAt: 0,
})

const seedRowFacets = (panelHeight: number | null) => {
	const store = installInMemoryLocalStorage()
	const ds = buildRowDataset()
	/* eslint-disable @vc/use-wrapped-json-functions */
	store.set("vis-components:datasets", JSON.stringify({ [DATASET_ID]: ds }))
	store.set("vis-components:currentDatasetId", JSON.stringify(DATASET_ID))
	store.set("vis-components:previewVersionId", JSON.stringify(null))
	store.set(
		"vis-components:currentEncodings",
		JSON.stringify({
			...emptyEncodings(),
			x: { field: "x" },
			y: { field: "y" },
			facetRow: { field: "region" },
		})
	)
	store.set(
		"vis-components:currentChannelConfigs",
		JSON.stringify({ facet: { ...DEFAULT_FACET_CONFIG, panelHeight } })
	)
	store.set(
		"vis-components:currentLabels",
		JSON.stringify({ _v: 1, data: DEFAULT_LABELS_CONFIG })
	)
	/* eslint-enable @vc/use-wrapped-json-functions */
}

const chartSvg = (container: HTMLElement): SVGSVGElement => {
	const svg = container.querySelector("[data-row-header]")?.closest("svg")
	if (!svg) throw new Error("chart svg not rendered")
	return svg
}

const mount = () =>
	render(
		<TestProvider>
			<div style={{ width: 800, height: 600 }}>
				<ChartCanvas />
			</div>
		</TestProvider>
	).container

describe("PlotCanvas — scrollbar gutter", () => {
	it("a canvas that overflows only vertically is re-solved a gutter narrower and scrolls on one axis", () => {
		// Two 400px panels stack past the 600px container; the width fits.
		seedRowFacets(400)
		const svg = chartSvg(mount())
		expect(Number(svg.getAttribute("height"))).toBeGreaterThan(600)
		expect(Number(svg.getAttribute("width"))).toBeCloseTo(800 - 15, 3)
		const box = svg.parentElement as HTMLElement
		expect(box.style.width).toBe("800px")
		expect(box.style.height).toBe("600px")
		expect(box.style.overflowY).toBe("auto")
		expect(box.style.overflowX).toBe("hidden")
	})

	it("a canvas that fits keeps the full container width", () => {
		seedRowFacets(null)
		const svg = chartSvg(mount())
		expect(Number(svg.getAttribute("width"))).toBeCloseTo(800, 3)
		expect(Number(svg.getAttribute("height"))).toBeCloseTo(600, 3)
	})
})
