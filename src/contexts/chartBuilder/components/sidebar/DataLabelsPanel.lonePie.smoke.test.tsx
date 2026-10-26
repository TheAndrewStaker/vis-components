import { cleanup, fireEvent, render } from "@testing-library/react"
import { TestProvider, type TestStore } from "../../../../testSupport/TestProvider"
import { installInMemoryLocalStorage } from "../../../../testSupport/localStorageShim"
import { buildDataset as buildDatasetFixture } from "../../../../testSupport/fixtures"
import { afterEach, describe, expect, it } from "vitest"

import {
	DEFAULT_DATA_LABELS_CONFIG,
	EMPTY_CHANNEL_CONFIGS,
	type DataLabelsConfig,
} from "../../lib/channelConfig"
import { DEFAULT_LABELS_CONFIG } from "../../lib/labelsConfig"
import {
	emptyDataLabelsEncodings,
	emptyEncodings,
	type Dataset,
	type Encodings,
} from "../../lib/types"
import {
	currentChannelConfigsAtom,
	currentDataLabelsConfigAtom,
	currentDataLabelsEncodingsAtom,
	currentDatasetIdAtom,
	currentEncodingsAtom,
	currentFieldLevelOrdersAtom,
	currentFieldOverridesAtom,
	currentLabelsAtom,
	loadedDatasetsAtom,
	previewVersionIdAtom,
} from "../../store/atoms"

import { DataLabelsPanel } from "./DataLabelsPanel"

/** A LONE pie — one not lined up along a category band, faceted single
 *  pies included — has no series to run "First / Last" across, so the
 *  "Of each" select stands down and the ends run over each pie's wedges.
 *  The "Which labels" choices say so ("First wedge"), where a banded chart
 *  says "per series" or shows the scope select. */

const DATASET_ID = "ds-labels-lone-pie"

const buildDataset = (): Dataset =>
	buildDatasetFixture({
		id: DATASET_ID,
		name: "pie",
		fields: [
			{ name: "val", inferredType: "quantitative" },
			{ name: "g", inferredType: "categorical" },
			{ name: "f", inferredType: "categorical" },
		],
		rows: [
			{ val: "10", g: "x", f: "P1" },
			{ val: "20", g: "y", f: "P2" },
		],
	})

const mountPanel = (opts: { faceted?: boolean; alongBand?: boolean }) => {
	const store = installInMemoryLocalStorage()
	// angle + hue = a pie of wedges; `x` lines several pies up along a band.
	const encodings: Encodings = {
		...emptyEncodings(),
		angle: { field: "val" },
		hue: { field: "g" },
		...(opts.alongBand ? { x: { field: "f" } } : {}),
		...(opts.faceted ? { facet: { field: "f" } } : {}),
	}
	const dataLabelsEncodings = {
		...emptyDataLabelsEncodings(),
		value: { field: "val" },
	}
	const cfg: DataLabelsConfig = {
		...DEFAULT_DATA_LABELS_CONFIG,
		labelPoints: "first",
	}
	/* eslint-disable @vc/use-wrapped-json-functions */
	store.set(
		"vis-components:datasets",
		JSON.stringify({ [DATASET_ID]: buildDataset() })
	)
	store.set("vis-components:currentDatasetId", JSON.stringify(DATASET_ID))
	store.set("vis-components:previewVersionId", JSON.stringify(null))
	store.set("vis-components:currentEncodings", JSON.stringify(encodings))
	store.set(
		"vis-components:currentDataLabelsEncodings",
		JSON.stringify(dataLabelsEncodings)
	)
	store.set("vis-components:currentDataLabelsConfig", JSON.stringify(cfg))
	/* eslint-enable @vc/use-wrapped-json-functions */

	const init = (snap: TestStore) => {
		snap.set(loadedDatasetsAtom, { [DATASET_ID]: buildDataset() })
		snap.set(currentDatasetIdAtom, DATASET_ID)
		snap.set(previewVersionIdAtom, null)
		snap.set(currentEncodingsAtom, encodings)
		snap.set(currentChannelConfigsAtom, EMPTY_CHANNEL_CONFIGS)
		snap.set(currentLabelsAtom, DEFAULT_LABELS_CONFIG)
		snap.set(currentDataLabelsEncodingsAtom, dataLabelsEncodings)
		snap.set(currentDataLabelsConfigAtom, cfg)
		snap.set(currentFieldOverridesAtom, {})
		snap.set(currentFieldLevelOrdersAtom, {})
	}

	return render(
		<TestProvider initializeState={init}>
			<DataLabelsPanel />
		</TestProvider>
	)
}

/** Open the collapsed "Label selection" subsection; returns its wrapper. */
const openLabelSelection = (root: ParentNode): HTMLElement => {
	const header = [...root.querySelectorAll<HTMLButtonElement>("button")].find(
		(b) =>
			b.getAttribute("aria-expanded") !== null &&
			b.textContent?.trim() === "Label selection"
	)
	expect(header, "Label selection header").toBeDefined()
	fireEvent.click(header!)
	return header!.parentElement!.parentElement as HTMLElement
}

const selectLabelled = (root: ParentNode, text: string) => {
	const label = [...root.querySelectorAll("label")].find(
		(l) => l.textContent?.trim() === text
	)
	if (!label) return null
	return (
		(label.htmlFor
			? root.querySelector<HTMLSelectElement>(`#${CSS.escape(label.htmlFor)}`)
			: null) ?? label.querySelector<HTMLSelectElement>("select")
	)
}

const optionTexts = (sel: HTMLSelectElement) =>
	[...sel.options].map((o) => o.textContent?.trim())

describe("DataLabelsPanel — lone pie Which labels", () => {
	afterEach(cleanup)

	it("a single pie: no Of each, and the ends read as wedges", () => {
		const { container } = mountPanel({})
		const selection = openLabelSelection(container)
		const which = selectLabelled(selection, "Which labels")
		expect(which).not.toBeNull()
		expect(optionTexts(which!)).toEqual([
			"All labels",
			"First wedge",
			"Last wedge",
			"First and last wedge",
		])
		expect(selectLabelled(selection, "Of each")).toBeNull()
	})

	it("a faceted single pie is still a lone pie", () => {
		const { container } = mountPanel({ faceted: true })
		const selection = openLabelSelection(container)
		const which = selectLabelled(selection, "Which labels")
		expect(optionTexts(which!)).toContain("First wedge")
		expect(selectLabelled(selection, "Of each")).toBeNull()
	})

	it("pies along a band keep the Of each select (Series / Pie)", () => {
		const { container } = mountPanel({ alongBand: true })
		const selection = openLabelSelection(container)
		const which = selectLabelled(selection, "Which labels")
		expect(optionTexts(which!)).toContain("First")
		const ofEach = selectLabelled(selection, "Of each")
		expect(ofEach).not.toBeNull()
		expect(optionTexts(ofEach!)).toEqual(["Series", "Pie"])
	})
})
