import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { TestProvider, type TestStore } from "../../../../../testSupport/TestProvider"
import { installInMemoryLocalStorage } from "../../../../../testSupport/localStorageShim"
import { buildDataset as buildDatasetFixture } from "../../../../../testSupport/fixtures"

import {
	DEFAULT_DATA_LABELS_CONFIG,
	EMPTY_CHANNEL_CONFIGS,
	type DataLabelsConfig,
} from "../../../lib/channelConfig"
import { defaultComposedLabels } from "../../../lib/dataLabelsSelection"
import { DEFAULT_LABELS_CONFIG } from "../../../lib/labelsConfig"
import { LIGHT_THEME_BASE } from "../../../lib/systemThemes"
import {
	emptyDataLabelsEncodings,
	emptyEncodings,
	type Dataset,
	type DataLabelsEncodings,
	type SavedTheme,
} from "../../../lib/types"
import {
	currentChannelConfigsAtom,
	currentDataLabelsConfigAtom,
	currentDataLabelsEncodingsAtom,
	currentDatasetIdAtom,
	currentEncodingsAtom,
	currentFieldLevelOrdersAtom,
	currentFieldOverridesAtom,
	currentLabelsAtom,
	currentThemeIdAtom,
	loadedDatasetsAtom,
	previewVersionIdAtom,
	themesAtom,
} from "../../../store/atoms"

import { DataLabelsPanel } from "../DataLabelsPanel"

/** Labels are TEXT, so coloring them BY a categorical variable starts from
 *  the theme's designated TEXT palette rather than the mark palette — the
 *  mark palette's lighter slots don't survive at text size. Both the
 *  layer-wide Color mapping and a per-variable slot's "Vary by" seed it;
 *  the Palette dropdown then re-picks.
 *
 *  Also: the conditional text-color rules no longer hide inside a
 *  collapsible subsection, and carry no header of their own — just the
 *  right-aligned "+ Add text color rule" link, which names them. */

const DATASET_ID = "ds-labels-text-palette"

const MARK_COLORS = ["#aaccee", "#bbddff", "#cceeff"]
const TEXT_COLORS = ["#113355", "#224466", "#335577"]

const THEME: SavedTheme = {
	...LIGHT_THEME_BASE,
	id: "t-text-palette",
	name: "Text palette",
	isSystem: false,
	categoricalPalettes: [
		{ id: "mark", name: "Mark", colors: [...MARK_COLORS] },
		{ id: "text", name: "Text", colors: [...TEXT_COLORS] },
	],
	defaultCategoricalPaletteId: "mark",
	defaultTextPaletteId: "text",
}

const buildDataset = (): Dataset =>
	buildDatasetFixture({
		id: DATASET_ID,
		name: "sales",
		fields: [
			{ name: "x", inferredType: "quantitative" },
			{ name: "y", inferredType: "quantitative" },
			{ name: "g", inferredType: "categorical" },
		],
		rows: [
			{ x: "1", y: "10", g: "A" },
			{ x: "2", y: "20", g: "B" },
		],
	})

const mountPanel = (opts: {
	fields?: string[] | null
	cfg?: Partial<DataLabelsConfig>
} = {}) => {
	installInMemoryLocalStorage()
	const encodings = { ...emptyEncodings(), x: { field: "x" }, y: { field: "y" } }
	const dataLabelsEncodings: DataLabelsEncodings = {
		...emptyDataLabelsEncodings(),
		x: { field: "x" },
		y: { field: "y" },
		value: opts.fields
			? { field: null, multiField: true, fields: opts.fields }
			: { field: "y" },
	}
	const cfg: DataLabelsConfig = {
		...DEFAULT_DATA_LABELS_CONFIG,
		...(opts.fields ? { composedLabels: defaultComposedLabels(opts.fields) } : {}),
		...(opts.cfg ?? {}),
	}
	let snapRef: TestStore | null = null
	const init = (snap: TestStore) => {
		snapRef = snap
		snap.set(themesAtom, [THEME])
		snap.set(currentThemeIdAtom, THEME.id)
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
	return { container, readCfg: () => snapRef!.get(currentDataLabelsConfigAtom) }
}

/** The control a `<label>` with this exact text points at. */
const controlFor = (root: ParentNode, labelText: string) => {
	const label = [...root.querySelectorAll("label")].find(
		(l) => l.textContent?.trim() === labelText
	)
	return label?.ownerDocument.getElementById(label.htmlFor) ?? null
}

const headerFor = (root: ParentNode, title: string) =>
	[...root.querySelectorAll<HTMLButtonElement>("button")].find(
		(b) =>
			b.getAttribute("aria-expanded") !== null &&
			b.textContent?.trim() === title
	) ?? null

const openSection = (root: ParentNode, title: string): HTMLElement => {
	const header = headerFor(root, title)
	expect(header, `subsection header "${title}"`).not.toBeNull()
	fireEvent.click(header!)
	return header!.parentElement!.parentElement as HTMLElement
}

const openChannel = (container: HTMLElement, label: string) => {
	const btn = container.querySelector<HTMLButtonElement>(
		`button[aria-label="Toggle settings for ${label}"]`
	)
	expect(btn, `channel chevron "${label}"`).not.toBeNull()
	fireEvent.click(btn!)
}

const addRuleLink = (root: ParentNode) =>
	[...root.querySelectorAll<HTMLButtonElement>("button")].find(
		(b) => b.textContent?.trim() === "+ Add text color rule"
	) ?? null

describe("Data Labels color — the text palette is the categorical default", () => {
	afterEach(cleanup)

	it("seeds the theme's text palette when Color maps a categorical field", () => {
		const { container, readCfg } = mountPanel()
		const colorSelect = controlFor(container, "Color") as HTMLSelectElement
		expect(colorSelect).not.toBeNull()
		fireEvent.change(colorSelect, { target: { value: "g" } })
		expect(readCfg().paletteId).toBe("text")
		expect(readCfg().palette).toEqual(TEXT_COLORS)
	})

	it("leaves a palette the user already picked alone", () => {
		const { container, readCfg } = mountPanel({
			cfg: { paletteId: "mark", palette: [...MARK_COLORS] },
		})
		fireEvent.change(controlFor(container, "Color") as HTMLSelectElement, {
			target: { value: "g" },
		})
		expect(readCfg().paletteId).toBe("mark")
	})

	it("doesn't seed a categorical palette for a quantitative field", () => {
		const { container, readCfg } = mountPanel()
		fireEvent.change(controlFor(container, "Color") as HTMLSelectElement, {
			target: { value: "x" },
		})
		expect(readCfg().paletteId).toBeNull()
		expect(readCfg().palette).toEqual([])
	})

	it("seeds it in a per-variable slot's Vary by too", () => {
		const { container, readCfg } = mountPanel({ fields: ["y", "g"] })
		openChannel(container, "Color")
		const block = openSection(container, "y")
		const varyBy = controlFor(block, "Vary by") as HTMLSelectElement
		expect(varyBy).not.toBeNull()
		fireEvent.change(varyBy, { target: { value: "g" } })
		expect(readCfg().fieldColors?.y?.paletteId).toBe("text")
		expect(readCfg().fieldColors?.y?.palette).toEqual(TEXT_COLORS)
	})
})

describe("Data Labels text color rules — no header, add on demand", () => {
	afterEach(cleanup)

	it("shows only the self-naming add link until a rule exists", () => {
		const { container, readCfg } = mountPanel()
		openChannel(container, "Color")
		// No subsection and no standing header — the link names them.
		expect(headerFor(container, "Text color rules")).toBeNull()
		expect(container.textContent).not.toContain("Text color rules")
		expect(addRuleLink(container)).not.toBeNull()
		expect(
			container.querySelector('textarea[aria-label="Condition for rule 1"]')
		).toBeNull()
		fireEvent.click(addRuleLink(container)!)
		expect(readCfg().textColorRules).toEqual([
			{ condition: "", color: DEFAULT_DATA_LABELS_CONFIG.color },
		])
	})

	it("keeps the add link below the rows, so rules stack", () => {
		const { container, readCfg } = mountPanel({
			cfg: { textColorRules: [{ condition: "> 0", color: "#00ff00" }] },
		})
		openChannel(container, "Color")
		const condition = container.querySelector<HTMLTextAreaElement>(
			'textarea[aria-label="Condition for rule 1"]'
		)
		expect(condition).not.toBeNull()
		fireEvent.click(addRuleLink(container)!)
		expect(readCfg().textColorRules).toHaveLength(2)
		// Every row is a real rule now, so every row can be removed.
		fireEvent.click(
			container.querySelector<HTMLButtonElement>(
				'button[aria-label="Remove rule 1"]'
			)!
		)
		expect(readCfg().textColorRules).toEqual([
			{ condition: "", color: DEFAULT_DATA_LABELS_CONFIG.color },
		])
	})
})
