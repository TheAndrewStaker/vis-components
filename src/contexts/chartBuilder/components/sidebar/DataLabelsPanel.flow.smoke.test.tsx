import { cleanup, fireEvent, render } from "@testing-library/react"
import { TestProvider, type TestStore } from "../../../../testSupport/TestProvider"
import { installInMemoryLocalStorage } from "../../../../testSupport/localStorageShim"
import { buildDataset as buildDatasetFixture } from "../../../../testSupport/fixtures"
import { afterEach, describe, expect, it } from "vitest"

import { type ChannelConfigs } from "../../lib/channelConfig"
import { DEFAULT_LABELS_CONFIG } from "../../lib/labelsConfig"
import { emptyEncodings, type Dataset } from "../../lib/types"
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

import { DataLabelsPanel } from "./DataLabelsPanel"

/** Flow diagrams label NODES: the X / Y rows grey out (labels sit beside
 *  each node) but stay visible, Value / Size offer the flow-only values,
 *  and "Which labels" is the by-flow-direction node selection — five
 *  choices on a sankey, three on a chord. */

const DATASET_ID = "ds-flow-panel"

const buildDataset = (rows?: Record<string, string>[]): Dataset =>
	buildDatasetFixture({
		id: DATASET_ID,
		name: "flows",
		filename: "flows.csv",
		fields: [
			{ name: "Start", inferredType: "categorical" },
			{ name: "Stop", inferredType: "categorical" },
			{ name: "Value", inferredType: "quantitative" },
		],
		rows: rows ?? [
			{ Start: "Clinic", Stop: "General", Value: "5" },
			{ Start: "General", Stop: "Home", Value: "3" },
		],
	})

const mountPanel = (
	layout: "chord" | "sankey",
	rows?: Record<string, string>[]
) => {
	const store = installInMemoryLocalStorage()
	const encodings = {
		...emptyEncodings(),
		connection: { field: "Start" },
		area: { field: "Value" },
	}
	const configs: ChannelConfigs = {
		connection: { hierarchyLayout: layout } as never,
	}
	/* eslint-disable @vc/use-wrapped-json-functions */
	store.set(
		"vis-components:datasets",
		JSON.stringify({ [DATASET_ID]: buildDataset(rows) })
	)
	store.set("vis-components:currentDatasetId", JSON.stringify(DATASET_ID))
	store.set("vis-components:previewVersionId", JSON.stringify(null))
	store.set("vis-components:currentEncodings", JSON.stringify(encodings))
	store.set("vis-components:currentChannelConfigs", JSON.stringify(configs))
	/* eslint-enable @vc/use-wrapped-json-functions */

	const init = (snap: TestStore) => {
		snap.set(loadedDatasetsAtom, { [DATASET_ID]: buildDataset(rows) })
		snap.set(currentDatasetIdAtom, DATASET_ID)
		snap.set(previewVersionIdAtom, null)
		snap.set(currentEncodingsAtom, encodings)
		snap.set(currentChannelConfigsAtom, configs)
		snap.set(currentLabelsAtom, DEFAULT_LABELS_CONFIG)
		snap.set(currentFieldOverridesAtom, {})
		snap.set(currentFieldLevelOrdersAtom, {})
	}

	const { container } = render(
		<TestProvider initializeState={init}>
			<DataLabelsPanel />
		</TestProvider>
	)
	return container
}

const sectionHeader = (container: HTMLElement, title: string) =>
	[...container.querySelectorAll<HTMLButtonElement>("button")].find(
		(b) =>
			b.getAttribute("aria-expanded") !== null &&
			b.textContent?.trim() === title
	) ?? null

const expand = (container: HTMLElement, title: string) => {
	const header = sectionHeader(container, title)
	expect(header, `subsection header "${title}"`).not.toBeNull()
	fireEvent.click(header!)
}

/** The `<select>` labelled `label` (channel rows and SelectInputs both
 *  associate their visible label with the control). */
const selectFor = (container: HTMLElement, label: string) => {
	const lbl = [...container.querySelectorAll("label")].find(
		(l) => l.textContent?.trim() === label
	)
	const id = lbl?.getAttribute("for")
	return id
		? container.querySelector<HTMLSelectElement>(`select[id="${CSS.escape(id)}"]`)
		: null
}
const optionLabels = (sel: HTMLSelectElement | null) =>
	[...(sel?.options ?? [])].map((o) => o.textContent)

describe("DataLabelsPanel — flow diagrams", () => {
	afterEach(cleanup)

	it("greys out (but keeps) the X / Y position rows", () => {
		const c = mountPanel("sankey")
		const x = selectFor(c, "X position")
		const y = selectFor(c, "Y position")
		expect(x).not.toBeNull()
		expect(y).not.toBeNull()
		expect(x?.disabled).toBe(true)
		expect(y?.disabled).toBe(true)
		expect(c.textContent).toContain("Labels sit beside each node")
		// Value / Color / Size stay live.
		expect(selectFor(c, "Value")?.disabled).toBe(false)
		expect(selectFor(c, "Color")?.disabled).toBe(false)
	})

	it("Value starts on the source column (the node names), selected", () => {
		const c = mountPanel("sankey")
		const value = selectFor(c, "Value")
		expect(value?.value).toBe("Start")
		// Its Label format is available without picking anything first.
		expect(
			c.querySelector('button[aria-label="Toggle settings for Value"]')
		).not.toBeNull()
	})

	it('picking "— none —" sticks (no labels), and Multiple variables starts on the names', () => {
		const c = mountPanel("chord")
		const value = selectFor(c, "Value")!
		fireEvent.change(value, { target: { value: "" } })
		expect(selectFor(c, "Value")?.value).toBe("")
		fireEvent.change(selectFor(c, "Value")!, {
			target: { value: "__multiple__" },
		})
		expect(selectFor(c, "Value")?.value).toBe("__multiple__")
		fireEvent.click(
			c.querySelector('button[aria-label="Toggle settings for Value"]')!
		)
		const startBox = [...c.querySelectorAll("label")]
			.find((l) => l.textContent?.trim() === "Start")
			?.querySelector<HTMLInputElement>('input[type="checkbox"]')
		expect(startBox?.checked).toBe(true)
	})

	it("Value and Size offer the flow-only values alongside the variables", () => {
		const c = mountPanel("sankey")
		for (const row of ["Value", "Size"]) {
			const opts = optionLabels(selectFor(c, row))
			expect(opts, row).toEqual(
				expect.arrayContaining(["Flow in", "Flow out", "Node total", "Start"])
			)
		}
		// The target column repeats the names and the weight column Flow
		// out on a node, so neither is listed.
		for (const row of ["Value", "Size"]) {
			const opts = optionLabels(selectFor(c, row))
			expect(opts, row).not.toContain("Stop")
			expect(opts, row).not.toContain("Value")
		}
		// Color stays on the data set's own variables.
		expect(optionLabels(selectFor(c, "Color"))).not.toContain("Node total")
	})

	it("sankey's Which labels offers the five by-direction choices", () => {
		const c = mountPanel("sankey")
		expand(c, "Label selection")
		expect(optionLabels(selectFor(c, "Which labels"))).toEqual([
			"All nodes",
			"First senders",
			"All senders",
			"Last receivers",
			"All receivers",
		])
		expect(c.textContent).toContain("First senders have no incoming flow")
	})

	it("chord's Which labels offers three, with a same-set hint on a full cycle", () => {
		const c = mountPanel("chord", [
			{ Start: "A", Stop: "B", Value: "1" },
			{ Start: "B", Stop: "A", Value: "2" },
		])
		expand(c, "Label selection")
		expect(optionLabels(selectFor(c, "Which labels"))).toEqual([
			"All nodes",
			"Senders",
			"Receivers",
		])
		expect(c.textContent).toContain("these options label the same nodes")
	})

	it("keeps Adjust position, Text and Box", () => {
		const c = mountPanel("chord")
		expect(sectionHeader(c, "Adjust position and alignment")).not.toBeNull()
		expect(sectionHeader(c, "Text")).not.toBeNull()
		expect(sectionHeader(c, "Box")).not.toBeNull()
	})
})
