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

import { defaultComposedLabels } from "../../lib/dataLabelsSelection"
import { DataLabelsPanel } from "./DataLabelsPanel"

/** On a pie the Adjust-position Angle / R pair is per variable in
 *  separate-variables mode (`fieldPolarPlacements`), the way the bar
 *  Placement pair is: the layer-wide pair hides and each variable's block
 *  carries its own, so the category name can sit at the rim while the
 *  value sits inside the wedge. A lone composed label keeps the layer-wide
 *  pair on screen but writes its own entry; the single-field label writes
 *  the layer-wide values. */

const DATASET_ID = "ds-labels-pie-polar-per-variable"

const buildDataset = (): Dataset =>
	buildDatasetFixture({
		id: DATASET_ID,
		name: "pie",
		fields: [
			{ name: "val", inferredType: "quantitative" },
			{ name: "g", inferredType: "categorical" },
		],
		rows: [
			{ val: "10", g: "x" },
			{ val: "20", g: "y" },
		],
	})

const mountPanel = (opts: {
	/** Multi-field Value with these fields checked; omitted = the
	 *  single-field label on `val`. */
	fields?: string[]
	cfg?: Partial<DataLabelsConfig>
}) => {
	const store = installInMemoryLocalStorage()
	const encodings: Encodings = {
		...emptyEncodings(),
		angle: { field: "val" },
		hue: { field: "g" },
	}
	const dataLabelsEncodings = {
		...emptyDataLabelsEncodings(),
		value: opts.fields
			? { field: null, multiField: true, fields: opts.fields }
			: { field: "val" },
	}
	const cfg: DataLabelsConfig = {
		...DEFAULT_DATA_LABELS_CONFIG,
		...(opts.fields ? { composedLabels: defaultComposedLabels(opts.fields) } : {}),
		...(opts.cfg ?? {}),
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
	expand(container, "Position and alignment")
	return {
		container,
		readCfg: () => snapRef!.get(currentDataLabelsConfigAtom),
	}
}

const expand = (container: HTMLElement, title: string) => {
	const header = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
		(b) =>
			b.getAttribute("aria-expanded") !== null &&
			b.textContent?.trim() === title
	)
	expect(header, `subsection header "${title}"`).toBeDefined()
	fireEvent.click(header!)
}

/** The <input>s whose <label> text is exactly `name`, in document order
 *  (the pie's Angle POSITION row is a <select> labeled "Angle" too, and
 *  isn't one of these). */
const inputsNamed = (container: HTMLElement, name: string) =>
	[...container.querySelectorAll("label")]
		.filter((l) => l.textContent?.trim() === name)
		.map((l) => container.querySelector(`#${CSS.escape(l.htmlFor)}`))
		.filter((el): el is HTMLInputElement => el instanceof HTMLInputElement)

describe("DataLabelsPanel — pie Angle / R per variable", () => {
	afterEach(cleanup)

	it("the single-field label keeps the layer-wide pair, writing polarLabelRadius", () => {
		const { container, readCfg } = mountPanel({})
		const rInputs = inputsNamed(container, "R")
		expect(rInputs).toHaveLength(1)
		fireEvent.change(rInputs[0]!, { target: { value: "60" } })
		expect(readCfg().polarLabelRadius).toBe(60)
		expect(readCfg().fieldPolarPlacements ?? {}).toEqual({})
	})

	it("separate variables: the layer-wide pair hides and each variable's block carries its own, writing fieldPolarPlacements", () => {
		const { container, readCfg } = mountPanel({
			fields: ["g", "val"],
			cfg: { combineVariables: false },
		})
		// Collapsed per-variable blocks; no layer-wide pair.
		expect(inputsNamed(container, "R")).toHaveLength(0)
		expect(inputsNamed(container, "Angle")).toHaveLength(0)
		expand(container, "g")
		expand(container, "val")
		// Per variable: a polar Angle and R, plus the text Angle — so two R
		// inputs and four Angles (polar + text, per block).
		const rInputs = inputsNamed(container, "R")
		expect(rInputs).toHaveLength(2)
		expect(inputsNamed(container, "Angle")).toHaveLength(4)
		// Effective values start on the layer-wide default.
		expect(rInputs[0]!.value).toBe("100")
		fireEvent.change(rInputs[1]!, { target: { value: "60" } })
		expect(readCfg().fieldPolarPlacements).toEqual({ val: { radius: 60 } })
		// The layer-wide value is untouched; g still shows it.
		expect(readCfg().polarLabelRadius ?? 100).toBe(100)
		expect(inputsNamed(container, "R")[0]!.value).toBe("100")
		expect(inputsNamed(container, "R")[1]!.value).toBe("60")
	})

	it("separate variables: a stored entry shows as that variable's effective value", () => {
		const { container } = mountPanel({
			fields: ["g", "val"],
			cfg: {
				combineVariables: false,
				polarLabelRadius: 80,
				fieldPolarPlacements: { g: { radius: 115, angle: 10 } },
			},
		})
		expand(container, "g")
		expand(container, "val")
		const rInputs = inputsNamed(container, "R")
		expect(rInputs[0]!.value).toBe("115")
		// val has no entry → the layer-wide value backs it.
		expect(rInputs[1]!.value).toBe("80")
	})

	it("a lone composed label shows the layer-wide pair but writes its own entry", () => {
		const { container, readCfg } = mountPanel({
			fields: ["val"],
			cfg: { polarLabelRadius: 80 },
		})
		const rInputs = inputsNamed(container, "R")
		expect(rInputs).toHaveLength(1)
		expect(rInputs[0]!.value).toBe("80")
		fireEvent.change(rInputs[0]!, { target: { value: "120" } })
		expect(readCfg().fieldPolarPlacements).toEqual({ val: { radius: 120 } })
		expect(readCfg().polarLabelRadius).toBe(80)
	})
})

describe("DataLabelsPanel — outward alignment on pies", () => {
	afterEach(cleanup)

	const outwardButtons = (container: HTMLElement) =>
		container.querySelectorAll<HTMLButtonElement>(
			'button[aria-label^="Align outward"]'
		)

	it("the Align row offers a fourth, outward, option that stores alignment: outward", () => {
		const { container, readCfg } = mountPanel({})
		const buttons = outwardButtons(container)
		expect(buttons).toHaveLength(1)
		fireEvent.click(buttons[0]!)
		expect(readCfg().alignment).toBe("outward")
		expect(buttons[0]!.getAttribute("aria-pressed")).toBe("true")
	})

	it("separate variables: each variable's Align row offers it, writing fieldAlignments", () => {
		const { container, readCfg } = mountPanel({
			fields: ["g", "val"],
			cfg: { combineVariables: false },
		})
		expand(container, "g")
		expand(container, "val")
		const buttons = outwardButtons(container)
		expect(buttons).toHaveLength(2)
		fireEvent.click(buttons[1]!)
		expect(readCfg().fieldAlignments).toEqual({ val: "outward" })
		expect(readCfg().alignment).toBe("center")
	})
})
