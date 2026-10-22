import { cleanup, fireEvent, render } from "@testing-library/react"
import { TestProvider, type TestStore } from "../../../../testSupport/TestProvider"
import { installInMemoryLocalStorage } from "../../../../testSupport/localStorageShim"
import { buildDataset as buildDatasetFixture } from "../../../../testSupport/fixtures"
import { afterEach, describe, expect, it } from "vitest"

import {
	DEFAULT_CATEGORICAL_HUE_CONFIG,
	DEFAULT_DATA_LABELS_CONFIG,
	EMPTY_CHANNEL_CONFIGS,
	type ChannelConfigs,
	type DataLabelsConfig,
} from "../../lib/channelConfig"
import { BAR_TOTAL_FIELD } from "../../lib/barTotalLabel"
import { defaultComposedLabels } from "../../lib/dataLabelsSelection"
import { DEFAULT_LABELS_CONFIG } from "../../lib/labelsConfig"
import {
	emptyDataLabelsEncodings,
	emptyEncodings,
	type DataLabelsEncodings,
	type Dataset,
	type Encodings,
	type Field,
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

/** The derived **Bar total** under Value (`lib/barTotalLabel.ts`): offered
 *  on bars layered by a stack / overlay channel — where the Stack scope is
 *  — ahead of the data set's variables and in the multi-variable checklist;
 *  kept while mapped; shadowed by a column of the same name. Picking it
 *  seeds the last layer of each stack, outside the end; a lone composed
 *  label's Placement reads and writes its own entry. */

const DATASET_ID = "ds-labels-bar-total"

const buildDataset = (columnNamedBarTotal: boolean): Dataset => {
	const fields: Field[] = [
		{ name: "cat", inferredType: "categorical" },
		{ name: "level", inferredType: "categorical" },
		{ name: "val", inferredType: "quantitative" },
	]
	if (columnNamedBarTotal)
		fields.push({ name: BAR_TOTAL_FIELD, inferredType: "quantitative" })
	const extra: Record<string, string> = columnNamedBarTotal
		? { [BAR_TOTAL_FIELD]: "1" }
		: {}
	return buildDatasetFixture({
		id: DATASET_ID,
		name: "bars",
		fields,
		rows: [
			{ cat: "A", level: "a", val: "10", ...extra },
			{ cat: "A", level: "b", val: "20", ...extra },
			{ cat: "B", level: "a", val: "5", ...extra },
		],
	})
}

type Chart = "stacked" | "grouped" | "plain" | "scatter"

const mountPanel = (opts: {
	chart: Chart
	value?: DataLabelsEncodings["value"]
	cfg?: Partial<DataLabelsConfig>
	columnNamedBarTotal?: boolean
}) => {
	installInMemoryLocalStorage()
	const dataset = buildDataset(opts.columnNamedBarTotal === true)
	const encodings: Encodings = {
		...emptyEncodings(),
		...(opts.chart === "scatter"
			? { x: { field: "val" }, y: { field: "val" } }
			: { x: { field: "cat" }, length: { field: "val" } }),
		...(opts.chart === "stacked" || opts.chart === "grouped"
			? { hue: { field: "level" } }
			: {}),
	}
	const channelConfigs: ChannelConfigs =
		opts.chart === "grouped"
			? {
					...EMPTY_CHANNEL_CONFIGS,
					hue: { ...DEFAULT_CATEGORICAL_HUE_CONFIG, stackMode: "group" },
				}
			: EMPTY_CHANNEL_CONFIGS
	const dataLabelsEncodings: DataLabelsEncodings = {
		...emptyDataLabelsEncodings(),
		value: opts.value ?? { field: null },
	}
	const cfg: DataLabelsConfig = {
		...DEFAULT_DATA_LABELS_CONFIG,
		...(opts.cfg ?? {}),
	}
	let snapRef: TestStore | null = null
	const init = (snap: TestStore) => {
		snapRef = snap
		snap.set(loadedDatasetsAtom, { [DATASET_ID]: dataset })
		snap.set(currentDatasetIdAtom, DATASET_ID)
		snap.set(previewVersionIdAtom, null)
		snap.set(currentEncodingsAtom, encodings)
		snap.set(currentChannelConfigsAtom, channelConfigs)
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
	return {
		container,
		readCfg: () => snapRef!.get(currentDataLabelsConfigAtom),
		readEnc: () => snapRef!.get(currentDataLabelsEncodingsAtom),
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

const optionValues = (select: HTMLSelectElement) =>
	[...select.options].map((o) => o.value)

const expand = (container: HTMLElement, title: string) => {
	const header = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
		(b) =>
			b.getAttribute("aria-expanded") !== null &&
			b.textContent?.trim() === title
	)
	expect(header, `subsection header "${title}"`).toBeDefined()
	fireEvent.click(header!)
}

const openChannel = (container: HTMLElement, label: string) => {
	const btn = container.querySelector<HTMLButtonElement>(
		`button[aria-label="Toggle settings for ${label}"]`
	)
	expect(btn, `channel chevron "${label}"`).not.toBeNull()
	fireEvent.click(btn!)
}

const checkbox = (container: HTMLElement, name: string) => {
	const label = [...container.querySelectorAll("label")].find(
		(l) => l.textContent?.trim() === name
	)
	return label?.htmlFor
		? container.querySelector<HTMLInputElement>(`#${CSS.escape(label.htmlFor)}`)
		: (label?.querySelector<HTMLInputElement>('input[type="checkbox"]') ?? null)
}

describe("DataLabelsPanel — the derived Bar total", () => {
	afterEach(cleanup)

	it("stacked bars offer it under Value, ahead of the data set's variables", () => {
		const { container } = mountPanel({ chart: "stacked" })
		const values = optionValues(selectLabeled(container, "Value")!)
		expect(values).toContain(BAR_TOTAL_FIELD)
		expect(values.indexOf(BAR_TOTAL_FIELD)).toBeLessThan(values.indexOf("cat"))
	})

	it("is not offered where no bar has layers: plain bars, grouped bars, a scatter", () => {
		for (const chart of ["plain", "grouped", "scatter"] as const) {
			const { container } = mountPanel({ chart })
			expect(optionValues(selectLabeled(container, "Value")!)).not.toContain(
				BAR_TOTAL_FIELD
			)
			cleanup()
		}
	})

	it("stays listed while mapped, so a Stack → Group toggle keeps the pick", () => {
		const { container } = mountPanel({
			chart: "grouped",
			value: { field: BAR_TOTAL_FIELD },
		})
		const select = selectLabeled(container, "Value")!
		expect(optionValues(select)).toContain(BAR_TOTAL_FIELD)
		expect(select.value).toBe(BAR_TOTAL_FIELD)
	})

	it("a data set column of the same name wins: the derived value is not offered and the pick seeds nothing", () => {
		const { container, readCfg } = mountPanel({
			chart: "stacked",
			columnNamedBarTotal: true,
		})
		const select = selectLabeled(container, "Value")!
		expect(
			optionValues(select).filter((v) => v === BAR_TOTAL_FIELD)
		).toHaveLength(1)
		fireEvent.change(select, { target: { value: BAR_TOTAL_FIELD } })
		expect(readCfg().barLabelPosition ?? "center").toBe("center")
		expect(readCfg().labelPointsScope ?? "series").toBe("series")
	})

	it("picking it maps the Value and seeds Last of each Stack, outside the end of the bar", () => {
		const { container, readCfg, readEnc } = mountPanel({ chart: "stacked" })
		fireEvent.change(selectLabeled(container, "Value")!, {
			target: { value: BAR_TOTAL_FIELD },
		})
		expect(readEnc().value.field).toBe(BAR_TOTAL_FIELD)
		expect(readCfg().labelPoints).toBe("last")
		expect(readCfg().labelPointsScope).toBe("stack")
		expect(readCfg().barLabelPosition).toBe("outside-end")
	})

	it("Multiple variables…: the checklist offers it; checking it adds its label with its own selection and placement", () => {
		const { container, readCfg, readEnc } = mountPanel({
			chart: "stacked",
			value: { field: null, multiField: true, fields: ["val"] },
			cfg: { composedLabels: defaultComposedLabels(["val"]) },
		})
		openChannel(container, "Value")
		const box = checkbox(container, BAR_TOTAL_FIELD)
		expect(box).not.toBeNull()
		fireEvent.click(box!)
		expect(readEnc().value.fields).toEqual(["val", BAR_TOTAL_FIELD])
		expect(readCfg().composedLabels?.map((l) => l.template)).toEqual([
			"{val}",
			`{${BAR_TOTAL_FIELD}}`,
		])
		expect(readCfg().fieldLabelPoints?.[BAR_TOTAL_FIELD]).toBe("last")
		expect(readCfg().fieldLabelPointsScope?.[BAR_TOTAL_FIELD]).toBe("stack")
		expect(readCfg().fieldBarPlacements?.[BAR_TOTAL_FIELD]?.position).toBe(
			"outside-end"
		)
		// The other label is left where it was.
		expect(readCfg().fieldBarPlacements?.val).toBeUndefined()
		expect(readCfg().barLabelPosition ?? "center").toBe("center")
	})

	it("a lone composed label's Placement reads and writes the label's own entry", () => {
		const { container, readCfg } = mountPanel({
			chart: "stacked",
			value: { field: null, multiField: true, fields: [BAR_TOTAL_FIELD] },
			cfg: {
				composedLabels: defaultComposedLabels([BAR_TOTAL_FIELD]),
				fieldBarPlacements: { [BAR_TOTAL_FIELD]: { position: "outside-end" } },
			},
		})
		expand(container, "Position and alignment")
		const position = selectLabeled(container, "Vertical")!
		expect(position.value).toBe("outside-end")
		fireEvent.change(position, { target: { value: "inside-end" } })
		expect(readCfg().fieldBarPlacements?.[BAR_TOTAL_FIELD]?.position).toBe(
			"inside-end"
		)
		expect(readCfg().barLabelPosition ?? "center").toBe("center")
	})
})
