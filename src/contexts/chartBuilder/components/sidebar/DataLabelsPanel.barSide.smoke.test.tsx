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

/** The bar side placement under the "Placement" group of Adjust position
 *  and alignment: bars only, named by the screen direction it moves labels
 *  in — "Horizontal" on vertical bars (left / right of the bar), "Vertical"
 *  on horizontal bars (above / below) — while the measure-axis placement
 *  takes the other name. On vertical bars a side fixes the text
 *  alignment, so the Alignment controls hide while one is set; horizontal
 *  bars keep them. */

const DATASET_ID = "ds-labels-bar-side"

const buildDataset = (): Dataset =>
	buildDatasetFixture({
		id: DATASET_ID,
		name: "bars",
		fields: [
			{ name: "cat", inferredType: "categorical" },
			{ name: "val", inferredType: "quantitative" },
		],
		rows: [
			{ cat: "A", val: "10" },
			{ cat: "B", val: "20" },
		],
	})

const mountPanel = (opts: {
	chart: "vertical-bars" | "horizontal-bars" | "scatter"
	cfg?: Partial<DataLabelsConfig>
	/** Multi-field Value with these fields checked (separate-variables mode
	 *  when `cfg.combineVariables === false`). */
	fields?: string[]
}) => {
	const store = installInMemoryLocalStorage()
	const encodings: Encodings = {
		...emptyEncodings(),
		...(opts.chart === "vertical-bars"
			? { x: { field: "cat" }, length: { field: "val" } }
			: opts.chart === "horizontal-bars"
				? { y: { field: "cat" }, length: { field: "val" } }
				: { x: { field: "val" }, y: { field: "val" } }),
	}
	const dataLabelsEncodings = {
		...emptyDataLabelsEncodings(),
		x: { field: "cat" },
		y: { field: "val" },
		value: opts.fields
			? { field: null, multiField: true, fields: opts.fields }
			: { field: "val" },
	}
	const cfg: DataLabelsConfig = {
		...DEFAULT_DATA_LABELS_CONFIG,
		...(opts.cfg ?? {}),
	}
	/* eslint-disable @th/use-wrapped-json-functions */
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
	/* eslint-enable @th/use-wrapped-json-functions */

	let snapRef: TestStore | null = null
	const init = (snap: TestStore) => {
		snapRef = snap
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

	const { container } = render(
		<TestProvider initializeState={init}>
			<DataLabelsPanel />
		</TestProvider>
	)
	const header = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
		(b) =>
			b.getAttribute("aria-expanded") !== null &&
			b.textContent?.trim() === "Adjust position and alignment"
	)
	expect(header).toBeDefined()
	fireEvent.click(header!)
	return {
		container,
		readCfg: () => snapRef!.get(currentDataLabelsConfigAtom),
	}
}

/** The <select> whose <label> text is exactly `text`. */
const selectLabeled = (container: HTMLElement, text: string) => {
	const label = [...container.querySelectorAll("label")].find(
		(l) => l.textContent?.trim() === text
	)
	if (!label?.htmlFor) return null
	return container.querySelector<HTMLSelectElement>(
		`#${CSS.escape(label.htmlFor)}`
	)
}

const optionLabels = (select: HTMLSelectElement) =>
	[...select.options].map((o) => o.textContent?.trim())

const expand = (container: HTMLElement, title: string) => {
	const header = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
		(b) =>
			b.getAttribute("aria-expanded") !== null &&
			b.textContent?.trim() === title
	)
	expect(header, `subsection header "${title}"`).toBeDefined()
	fireEvent.click(header!)
}

const hasGroupHeader = (container: HTMLElement, text: string) =>
	[...container.querySelectorAll("span.vc-group-header")].some(
		(s) => s.textContent?.trim() === text
	)

const hasAlignmentRow = (container: HTMLElement) =>
	[...container.querySelectorAll("span")].some(
		(s) => s.textContent?.trim() === "Alignment"
	)

describe("DataLabelsPanel — bar side placement", () => {
	afterEach(cleanup)

	it("is hidden off bar charts", () => {
		const { container } = mountPanel({ chart: "scatter" })
		expect(selectLabeled(container, "Horizontal")).toBeNull()
		expect(selectLabeled(container, "Vertical")).toBeNull()
		expect(hasGroupHeader(container, "Placement")).toBe(false)
		expect(hasAlignmentRow(container)).toBe(true)
	})

	it("vertical bars: 'Horizontal' names the sides left / right and writes barLabelSide; the measure placement is 'Vertical'", () => {
		const { container, readCfg } = mountPanel({ chart: "vertical-bars" })
		expect(hasGroupHeader(container, "Placement")).toBe(true)
		const measure = selectLabeled(container, "Vertical")
		expect(measure).not.toBeNull()
		expect(measure!.value).toBe("center")
		expect(optionLabels(measure!)[0]).toBe("Center of bar (default)")
		const select = selectLabeled(container, "Horizontal")
		expect(select).not.toBeNull()
		expect(select!.value).toBe("center")
		expect(optionLabels(select!)).toEqual([
			"Centered on the bar (default)",
			"Left of the bar",
			"Right of the bar",
		])
		fireEvent.change(select!, { target: { value: "after" } })
		expect(readCfg().barLabelSide).toBe("after")
	})

	it("horizontal bars: the names swap — 'Vertical' names the sides above / below", () => {
		const { container } = mountPanel({ chart: "horizontal-bars" })
		const measure = selectLabeled(container, "Horizontal")
		expect(measure).not.toBeNull()
		expect(optionLabels(measure!)[0]).toBe("Center of bar (default)")
		const select = selectLabeled(container, "Vertical")
		expect(select).not.toBeNull()
		expect(optionLabels(select!)).toEqual([
			"Centered on the bar (default)",
			"Above the bar",
			"Below the bar",
		])
	})

	it("a side on vertical bars hides the Alignment control (the side sets it)", () => {
		const centered = mountPanel({ chart: "vertical-bars" })
		expect(hasAlignmentRow(centered.container)).toBe(true)
		cleanup()
		const beside = mountPanel({
			chart: "vertical-bars",
			cfg: { barLabelSide: "after" },
		})
		expect(hasAlignmentRow(beside.container)).toBe(false)
	})

	it("separate variables: one Vertical / Horizontal pair per variable, writing fieldBarPlacements", () => {
		const { container, readCfg } = mountPanel({
			chart: "vertical-bars",
			fields: ["cat", "val"],
			cfg: { combineVariables: false },
		})
		// Each variable's Placement sits in its own (collapsed) subsection;
		// no layer-wide pair shows.
		expect(hasGroupHeader(container, "Placement")).toBe(false)
		expand(container, "cat")
		expand(container, "val")
		expect(hasGroupHeader(container, "Placement")).toBe(true)
		// Two of each — one per variable.
		const verticals = [...container.querySelectorAll("label")].filter(
			(l) => l.textContent?.trim() === "Vertical"
		)
		const horizontals = [...container.querySelectorAll("label")].filter(
			(l) => l.textContent?.trim() === "Horizontal"
		)
		expect(verticals).toHaveLength(2)
		expect(horizontals).toHaveLength(2)
		const secondSide = container.querySelector<HTMLSelectElement>(
			`#${CSS.escape(horizontals[1].htmlFor)}`
		)
		fireEvent.change(secondSide!, { target: { value: "after" } })
		expect(readCfg().fieldBarPlacements).toEqual({ val: { side: "after" } })
		expect(readCfg().barLabelSide ?? "center").toBe("center")
	})

	it("separate variables: a variable beside a vertical bar loses only ITS alignment row", () => {
		const { container } = mountPanel({
			chart: "vertical-bars",
			fields: ["cat", "val"],
			cfg: { combineVariables: false, fieldBarPlacements: { val: { side: "before" } } },
		})
		expand(container, "cat")
		expand(container, "val")
		// One Alignment row left — cat's; val's side set its alignment.
		expect(
			[...container.querySelectorAll("span")].filter(
				(s) => s.textContent?.trim() === "Alignment"
			)
		).toHaveLength(1)
	})

	it("a side on horizontal bars keeps the Alignment control", () => {
		const { container } = mountPanel({
			chart: "horizontal-bars",
			cfg: { barLabelSide: "before" },
		})
		expect(hasAlignmentRow(container)).toBe(true)
	})
})
