import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { installInMemoryLocalStorage } from "../../../../testSupport/localStorageShim"
import { TestProvider } from "../../../../testSupport/TestProvider"
import type { CanvasSizeConfig } from "../../lib/channelConfig"
import { emptyEncodings, type Dataset } from "../../lib/types"

import { ChartCanvas } from "./ChartCanvas"

/** Fixed-canvas margins (Aesthetics → Canvas size → Margins): with a fixed
 *  canvas the chart box sits in a margin frame whose per-side inset is the
 *  user's margin (auto sides at 0, until the ink measurement corrects a set
 *  side); without one, no frame at all. happy-dom has no layout, so the
 *  measure → correct loop is a no-op here (covered by inkExtent.test.ts). */

afterEach(cleanup)

const DATASET_ID = "ds-canvas-margins"

const buildDataset = (): Dataset => ({
	id: DATASET_ID,
	name: "m",
	fields: [
		{ name: "x", inferredType: "quantitative" },
		{ name: "y", inferredType: "quantitative" },
	],
	versions: [
		{
			id: "v1",
			filename: "m.csv",
			rows: [
				{ x: "1", y: "10" },
				{ x: "2", y: "20" },
			],
			createdAt: 0,
		},
	],
	latestVersionId: "v1",
	createdAt: 0,
})

const seed = (canvasSize?: CanvasSizeConfig) => {
	const store = installInMemoryLocalStorage()
	/* eslint-disable @th/use-wrapped-json-functions */
	store.set("vis-components:datasets", JSON.stringify({ [DATASET_ID]: buildDataset() }))
	store.set("vis-components:currentDatasetId", JSON.stringify(DATASET_ID))
	store.set("vis-components:previewVersionId", JSON.stringify(null))
	store.set(
		"vis-components:currentEncodings",
		JSON.stringify({ ...emptyEncodings(), x: { field: "x" }, y: { field: "y" } })
	)
	store.set(
		"vis-components:currentChannelConfigs",
		JSON.stringify(canvasSize ? { canvasSize } : {})
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

describe("ChartCanvas — fixed-canvas margins", () => {
	it("renders no margin frame while the canvas size is off", () => {
		seed()
		const { container } = mount()
		expect(container.querySelector("[data-canvas-margin-frame]")).toBeNull()
		expect(container.querySelector("svg")).not.toBeNull()
	})

	it("wraps the chart in a frame whose insets are the set margins, 0 for auto sides", () => {
		seed({
			enabled: true,
			width: 400,
			height: 300,
			margins: { top: 20, left: 0 },
		})
		const { container } = mount()
		const box = container.querySelector<HTMLElement>("[data-canvas-margin-box]")
		expect(box).not.toBeNull()
		expect(box!.style.top).toBe("20px")
		expect(box!.style.left).toBe("0px")
		expect(box!.style.right).toBe("0px")
		expect(box!.style.bottom).toBe("0px")
		// The chart itself still renders inside the box.
		expect(box!.querySelector("svg")).not.toBeNull()
	})

	it("frames a fixed canvas with no margins at all (auto everywhere)", () => {
		seed({ enabled: true, width: 400, height: 300 })
		const { container } = mount()
		const box = container.querySelector<HTMLElement>("[data-canvas-margin-box]")
		expect(box).not.toBeNull()
		for (const side of ["top", "right", "bottom", "left"] as const) {
			expect(box!.style[side]).toBe("0px")
		}
	})
})
