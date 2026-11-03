/** Visuals composed from chart specs draw through the published-embed
 *  runtime, which loads a visual exactly as the editor opens one: the proof
 *  an API-made chart renders like an editor-made one. */

import { render, waitFor } from "@testing-library/react"
import { Provider } from "jotai"
import { afterEach, describe, expect, it } from "vitest"

import { composeVisual, type ChartSpec } from "../contexts/chartBuilder/lib/chartSpec"
import { clearExampleOverlay } from "../contexts/chartBuilder/lib/exampleOverlay"
import { LIGHT_THEME_BASE } from "../contexts/chartBuilder/lib/systemThemes"
import { buildDataset } from "../testSupport/fixtures"
import { installInMemoryLocalStorage } from "../testSupport/localStorageShim"
import { bootEmbedRuntime } from "./boot"
import { EmbedRoot } from "./EmbedRoot"

const dataset = buildDataset({
	id: "ds-spec",
	name: "sales",
	fields: [
		{ name: "category", inferredType: "categorical" },
		{ name: "value", inferredType: "quantitative" },
		{ name: "cost", inferredType: "quantitative" },
	],
	rows: [
		{ category: "A", value: "10", cost: "4" },
		{ category: "B", value: "20", cost: "9" },
		{ category: "C", value: "15", cost: "7" },
	],
})

const mount = (spec: Omit<ChartSpec, "datasetId" | "folderId">) => {
	const { visual, problems } = composeVisual(
		{ datasetId: dataset.id, folderId: null, ...spec },
		{
			fields: dataset.fields.map((f) => ({ name: f.name, type: f.inferredType })),
			theme: LIGHT_THEME_BASE,
		}
	)
	expect(problems).toEqual([])
	installInMemoryLocalStorage()
	const store = bootEmbedRuntime({ visual, dataset, theme: null, fonts: [] })
	return render(
		<Provider store={store}>
			<div style={{ width: 800, height: 600 }}>
				<EmbedRoot part="full" visualId={visual.id} />
			</div>
		</Provider>
	).container
}

afterEach(() => {
	clearExampleOverlay()
})

describe("chart-spec visuals render through the embed runtime", () => {
	it("a composed bar chart draws one bar per row", async () => {
		const container = mount({
			family: "bar",
			encodings: { x: "category", length: "value" },
			title: "Sales",
		})
		// Mark rects carry a stroke (outline); background rects don't.
		await waitFor(() => {
			const bars = [...container.querySelectorAll("svg rect")].filter(
				(r) => r.getAttribute("stroke") !== null
			)
			expect(bars).toHaveLength(3)
		})
		expect(container.textContent).toContain("Sales")
	})

	it("a composed scatter draws one point per row", async () => {
		const container = mount({ encodings: { x: "value", y: "cost" } })
		await waitFor(() => {
			// Point glyphs are symbol paths; axes draw lines.
			expect(container.querySelectorAll("svg path[d]")).toHaveLength(3)
		})
	})
})
