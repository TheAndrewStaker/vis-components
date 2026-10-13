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
	type DataLabelsEncodings,
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

import { defaultComposedLabels } from "../../lib/dataLabelsSelection"
import { DataLabelsPanel } from "./DataLabelsPanel"

/** With two or more label variables, Size / Text properties / Text
 *  background grow one block per variable (like Color's slots); with one
 *  variable they don't. "Avoid overlapping labels" lives under Adjust
 *  position and alignment, and the selection subsection is "Label
 *  selection". */

const DATASET_ID = "ds-labels-per-variable"

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
	fields: string[] | null
	cfg?: Partial<DataLabelsConfig>
}) => {
	installInMemoryLocalStorage()
	const encodings = {
		...emptyEncodings(),
		x: { field: "x" },
		y: { field: "y" },
	}
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
		// The new-mapping default: one label per checked variable.
		...(opts.fields ? { composedLabels: defaultComposedLabels(opts.fields) } : {}),
		...(opts.cfg ?? {}),
	}
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
	return {
		container,
		readCfg: () => snapRef!.get(currentDataLabelsConfigAtom),
	}
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

const openChannel = (container: HTMLElement, label: string) => {
	const btn = container.querySelector<HTMLButtonElement>(
		`button[aria-label="Toggle settings for ${label}"]`
	)
	expect(btn, `channel chevron "${label}"`).not.toBeNull()
	fireEvent.click(btn!)
}

describe("DataLabelsPanel — per-variable blocks", () => {
	afterEach(cleanup)

	it("renames the selection subsection and moves Avoid overlaps under Adjust position", () => {
		const { container } = mountPanel({ fields: null })
		expect(sectionHeader(container, "Label selection")).not.toBeNull()
		expect(sectionHeader(container, "Label selection and overlap")).toBeNull()
		expand(container, "Label selection")
		expect(container.textContent).not.toContain("Avoid overlapping labels")
		expand(container, "Adjust position and alignment")
		const text = container.textContent ?? ""
		expect(text.indexOf("Avoid overlapping labels")).toBeGreaterThan(
			text.indexOf("Wrap text")
		)
	})

	it("single-variable labels show no per-variable blocks", () => {
		const { container } = mountPanel({ fields: null })
		openChannel(container, "Size")
		expand(container, "Text properties")
		expand(container, "Text background")
		expect(sectionHeader(container, "y")).toBeNull()
	})

	it("single-variable labels show the Default size input", () => {
		const { container } = mountPanel({ fields: null })
		openChannel(container, "Size")
		expect(
			[...container.querySelectorAll("label")].some(
				(l) => l.textContent?.trim() === "Default size"
			)
		).toBe(true)
	})

	it("two variables hide the Default size input and get a Size block each that stores a per-variable size", () => {
		const { container, readCfg } = mountPanel({ fields: ["y", "g"] })
		openChannel(container, "Size")
		expect(
			[...container.querySelectorAll("label")].some(
				(l) => l.textContent?.trim() === "Default size"
			)
		).toBe(false)
		expect(sectionHeader(container, "y")).not.toBeNull()
		expect(sectionHeader(container, "g")).not.toBeNull()
		expand(container, "y")
		const input = [...container.querySelectorAll<HTMLInputElement>("input")].find(
			(i) => i.placeholder === String(DEFAULT_DATA_LABELS_CONFIG.fontSize)
		)
		expect(input).toBeDefined()
		fireEvent.change(input!, { target: { value: "18" } })
		expect(readCfg().fieldSizes).toEqual({ y: 18 })
		// Emptying the field drops the override (back to the label's size).
		fireEvent.change(input!, { target: { value: "" } })
		expect(readCfg().fieldSizes).toEqual({})
	})

	it("two variables replace the layer-wide Text properties with one block each", () => {
		const { container, readCfg } = mountPanel({ fields: ["y", "g"] })
		expand(container, "Text properties")
		// No layer-wide Family select — only the per-variable blocks.
		expect(container.textContent).not.toContain("Family")
		expand(container, "g")
		expect(container.textContent).toContain("Family")
		const italic = container.querySelector<HTMLButtonElement>(
			'button[aria-label="Italic (g)"]'
		)
		expect(italic).not.toBeNull()
		fireEvent.click(italic!)
		expect(readCfg().fieldFonts).toEqual({ g: { italic: true } })
		expect(readCfg().italic).toBe(false)
		// The style row's reset drops the variable back to the layer value.
		const reset = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(b) => b.textContent?.trim() === "reset"
		)
		expect(reset).toBeDefined()
		fireEvent.click(reset!)
		expect(readCfg().fieldFonts).toEqual({})
	})

	it("two variables replace the layer-wide Text background with a toggle per variable", () => {
		const { container, readCfg } = mountPanel({ fields: ["y", "g"] })
		expand(container, "Text background")
		// The layer-wide toggle stands down; each variable has its own.
		expect(container.textContent).not.toContain("Show text background")
		expand(container, "g")
		const toggle = [...container.querySelectorAll("label")].find(
			(l) => l.textContent?.trim() === "Show text background"
		)
		expect(toggle).toBeDefined()
		const input = container.querySelector<HTMLInputElement>(
			`#${CSS.escape(toggle!.htmlFor)}`
		)
		expect(input?.checked).toBe(false)
		fireEvent.click(input!)
		expect(readCfg().fieldBackgrounds).toEqual({ g: { textBackground: true } })
		expect(container.textContent).toContain("Corner radius")
		fireEvent.click(input!)
		expect(readCfg().fieldBackgrounds).toEqual({ g: { textBackground: false } })
	})

	it("separate labels get one Adjust-position subsection per variable holding alignment, angle, wrap, overlap, and X / Y", () => {
		const { container, readCfg } = mountPanel({
			fields: ["y", "g"],
			cfg: { combineVariables: false },
		})
		expand(container, "Adjust position and alignment")
		const text = container.textContent ?? ""
		expect(text).not.toContain("All labels")
		// The layer-wide controls hide; each variable is a collapsed block.
		const labelsNamed = (name: string) =>
			[...container.querySelectorAll("label")].filter(
				(l) => l.textContent?.trim() === name
			)
		expect(labelsNamed("Angle")).toHaveLength(0)
		expect(labelsNamed("X")).toHaveLength(0)
		expect(container.querySelectorAll('button[aria-label="Align left"]')).toHaveLength(0)
		expand(container, "y")
		expand(container, "g")
		const alignButtons = container.querySelectorAll('button[aria-label="Align left"]')
		expect(alignButtons.length).toBe(2)
		fireEvent.click(alignButtons[1]!)
		expect(readCfg().fieldAlignments).toEqual({ g: "left" })
		expect(readCfg().alignment).toBe("center")
		// One of each per variable; the second writes g's entry.
		const inputsNamed = (name: string) =>
			labelsNamed(name).map((l) =>
				container.querySelector<HTMLInputElement>(`#${CSS.escape(l.htmlFor)}`)
			)
		expect(inputsNamed("Angle")).toHaveLength(2)
		fireEvent.change(inputsNamed("Angle")[1]!, { target: { value: "45" } })
		expect(readCfg().fieldLayouts).toEqual({ g: { textAngle: 45 } })
		expect(readCfg().textAngle ?? 0).toBe(0)
		const wrapToggles = [...container.querySelectorAll("label")].filter(
			(l) => l.textContent?.trim() === "Wrap text"
		)
		const avoidToggles = [...container.querySelectorAll("label")].filter(
			(l) => l.textContent?.trim() === "Avoid overlapping labels"
		)
		expect(wrapToggles).toHaveLength(2)
		expect(avoidToggles).toHaveLength(2)
		fireEvent.click(avoidToggles[0]!.querySelector("input") ?? avoidToggles[0]!)
		expect(readCfg().fieldLayouts?.y?.avoidOverlaps).toBe(true)
		expect(readCfg().avoidOverlaps).toBe(false)
		const xInputs = inputsNamed("X")
		expect(xInputs.length).toBe(2)
		fireEvent.change(xInputs[1]!, { target: { value: "12" } })
		expect(readCfg().fieldOffsets).toEqual({ g: { xOffset: 12 } })
		expect(readCfg().xOffset).toBe(0)
	})

	it("a lone label keeps the shared Alignment row", () => {
		const { container } = mountPanel({ fields: ["y"] })
		expand(container, "Adjust position and alignment")
		expect(container.querySelectorAll('button[aria-label="Align left"]').length).toBe(1)
	})

	it("Value composes the labels: one box per variable, '+ Add another label' adds an empty one, × removes", () => {
		const { container, readCfg } = mountPanel({ fields: ["y", "g"] })
		openChannel(container, "Value")
		expect(container.textContent).toContain("Compose labels")
		expect(container.textContent).not.toContain("Combine variables")
		const boxes = () =>
			[...container.querySelectorAll<HTMLInputElement>('input[aria-label$=" text"]')]
		expect(boxes().map((b) => b.value)).toEqual(["{y}", "{g}"])
		const add = [...container.querySelectorAll("button")].find(
			(b) => b.textContent?.trim() === "+ Add another label"
		)
		expect(add).toBeDefined()
		fireEvent.click(add!)
		expect(boxes().map((b) => b.value)).toEqual(["{y}", "{g}", ""])
		fireEvent.change(boxes()[2]!, { target: { value: "{y} ({g})" } })
		expect(readCfg().composedLabels?.[2]?.template).toBe("{y} ({g})")
		const remove = container.querySelector<HTMLButtonElement>(
			'button[aria-label="Remove label g"]'
		)
		expect(remove).not.toBeNull()
		fireEvent.click(remove!)
		expect(readCfg().composedLabels?.map((l) => l.template)).toEqual([
			"{y}",
			"{y} ({g})",
		])
		// Text format stays — it formats each variable wherever it appears.
		expect(container.textContent).toContain("Text format")
	})

	it("checking a field adds its label; unchecking removes the labels composing just it", () => {
		const { container, readCfg } = mountPanel({ fields: ["y"] })
		openChannel(container, "Value")
		const checkbox = (name: string) =>
			[...container.querySelectorAll("label")]
				.find((l) => l.textContent?.trim() === name)
				?.querySelector<HTMLInputElement>('input[type="checkbox"]')
		fireEvent.click(checkbox("g")!)
		expect(readCfg().composedLabels?.map((l) => l.template)).toEqual(["{y}", "{g}"])
	})

	it("each variable's Color block carries its own text color rules", () => {
		const { container, readCfg } = mountPanel({ fields: ["y", "g"] })
		openChannel(container, "Color")
		expand(container, "y")
		// The rules show only their add link until one exists — no condition
		// box until the user asks for a rule.
		expect(
			container.querySelector('input[aria-label="Condition for y rule 1"]')
		).toBeNull()
		const add = [
			...container.querySelectorAll<HTMLButtonElement>("button"),
		].find((b) => b.textContent?.trim() === "+ Add text color rule")
		expect(add, '"+ Add text color rule"').not.toBeNull()
		fireEvent.click(add!)
		const condition = container.querySelector<HTMLInputElement>(
			'input[aria-label="Condition for y rule 1"]'
		)
		expect(condition).not.toBeNull()
		fireEvent.change(condition!, { target: { value: "> 5" } })
		expect(readCfg().fieldColorRules?.y).toEqual([
			{ condition: "> 5", color: DEFAULT_DATA_LABELS_CONFIG.color },
		])
		// The layer-wide rules are untouched.
		expect(readCfg().textColorRules).toEqual([])
	})
})
