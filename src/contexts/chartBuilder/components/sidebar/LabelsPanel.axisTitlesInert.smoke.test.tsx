import { cleanup, fireEvent, render } from "@testing-library/react"
import { TestProvider, type TestStore } from "../../../../testSupport/TestProvider"
import { installInMemoryLocalStorage } from "../../../../testSupport/localStorageShim"
import { buildDataset as buildDatasetFixture } from "../../../../testSupport/fixtures"
import { afterEach, describe, expect, it } from "vitest"

import { type ChannelConfigs } from "../../lib/channelConfig"
import { DEFAULT_LABELS_CONFIG } from "../../lib/labelsConfig"
import { emptyEncodings, type Dataset, type Encodings } from "../../lib/types"
import {
	currentChannelConfigsAtom,
	currentDatasetIdAtom,
	currentEncodingsAtom,
	currentFieldLevelOrdersAtom,
	currentFieldOverridesAtom,
	currentLabelsAtom,
	loadedDatasetsAtom,
	previewVersionIdAtom,
} from "../../store/atoms"

import { LabelsPanel } from "./LabelsPanel"

/** Axis titles grey out (stay visible, can't be edited) on a chart that
 *  draws no such axis — flow diagrams here; polar charts stay live because
 *  the pie bands and the radar's R axis draw from these titles. */

const DATASET_ID = "ds-axis-inert"

const buildDataset = (): Dataset =>
	buildDatasetFixture({
		id: DATASET_ID,
		name: "flows",
		filename: "flows.csv",
		fields: [
			{ name: "Start", inferredType: "categorical" },
			{ name: "Stop", inferredType: "categorical" },
			{ name: "Value", inferredType: "quantitative" },
			{ name: "Other", inferredType: "quantitative" },
		],
		rows: [
			{ Start: "Clinic", Stop: "General", Value: "5", Other: "1" },
			{ Start: "General", Stop: "Home", Value: "3", Other: "2" },
		],
	})

const mountPanel = (encodings: Encodings, configs: ChannelConfigs = {}) => {
	const store = installInMemoryLocalStorage()
	/* eslint-disable @vc/use-wrapped-json-functions */
	store.set(
		"vis-components:datasets",
		JSON.stringify({ [DATASET_ID]: buildDataset() })
	)
	store.set("vis-components:currentDatasetId", JSON.stringify(DATASET_ID))
	store.set("vis-components:previewVersionId", JSON.stringify(null))
	store.set("vis-components:currentEncodings", JSON.stringify(encodings))
	store.set("vis-components:currentChannelConfigs", JSON.stringify(configs))
	/* eslint-enable @vc/use-wrapped-json-functions */
	const init = (snap: TestStore) => {
		snap.set(loadedDatasetsAtom, { [DATASET_ID]: buildDataset() })
		snap.set(currentDatasetIdAtom, DATASET_ID)
		snap.set(previewVersionIdAtom, null)
		snap.set(currentEncodingsAtom, encodings)
		snap.set(currentChannelConfigsAtom, configs)
		snap.set(currentLabelsAtom, DEFAULT_LABELS_CONFIG)
		snap.set(currentFieldOverridesAtom, {})
		snap.set(currentFieldLevelOrdersAtom, {})
	}
	return render(
		<TestProvider initializeState={init}>
			<LabelsPanel />
		</TestProvider>
	).container
}

/** The title's text box and its font-settings toggle (opens the collapsed
 *  "Axis titles" subsection first). */
const titleRow = (container: HTMLElement, label: string) => {
	if (
		!container.querySelector(
			`button[aria-label="Toggle font settings for ${label}"]`
		)
	) {
		const header = [...container.querySelectorAll("button")].find(
			(b) =>
				b.getAttribute("aria-expanded") !== null &&
				b.textContent?.trim() === "Axis titles"
		)
		if (header) fireEvent.click(header)
	}
	const toggle = container.querySelector<HTMLButtonElement>(
		`button[aria-label="Toggle font settings for ${label}"]`
	)
	const text = [...container.querySelectorAll("label")]
		.find((l) => l.textContent?.includes(label))
		?.querySelector("textarea")
	return { toggle, text }
}

describe("LabelsPanel — axis titles on charts without axes", () => {
	afterEach(cleanup)

	it("greys out both axis titles on a sankey (still rendered)", () => {
		const c = mountPanel(
			{
				...emptyEncodings(),
				connection: { field: "Start" },
				area: { field: "Value" },
			},
			{ connection: { hierarchyLayout: "sankey" } as never }
		)
		for (const label of ["X-axis title", "Y-axis title"]) {
			const { toggle, text } = titleRow(c, label)
			expect(toggle, label).not.toBeNull()
			expect(toggle?.disabled, label).toBe(true)
			expect(text?.disabled, label).toBe(true)
		}
		expect(c.textContent).toContain("This chart has no x or y axis to title.")
	})

	it("keeps them editable on a scatter", () => {
		const c = mountPanel({
			...emptyEncodings(),
			x: { field: "Value" },
			y: { field: "Other" },
		})
		for (const label of ["X-axis title", "Y-axis title"]) {
			const { toggle, text } = titleRow(c, label)
			expect(toggle?.disabled, label).toBe(false)
			expect(text?.disabled, label).toBe(false)
		}
		expect(c.textContent).not.toContain("no x or y axis")
	})
})
