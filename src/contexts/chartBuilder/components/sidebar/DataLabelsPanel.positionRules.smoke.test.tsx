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

import { DataLabelsPanel } from "./DataLabelsPanel"

/** Position rules belong to a LABEL, so "+ Add rule" lives inside each
 *  label's own subsection under "Adjust position and alignment": one link
 *  per subheader — as many as the user mapped labels — and none loose at
 *  the bottom of the section. With the variables combined there's one
 *  label (the arranged one), so the one link stays layer-wide. */

const DATASET_ID = "ds-labels-position-rules"

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
	const dataLabelsEncodings: DataLabelsEncodings = {
		...emptyDataLabelsEncodings(),
		x: { field: "x" },
		y: { field: "y" },
		value: opts.fields
			? { field: null, multiField: true, fields: opts.fields }
			: { field: "y" },
	}
	let snapRef: TestStore | null = null
	const init = (snap: TestStore) => {
		snapRef = snap
		snap.set(loadedDatasetsAtom, { [DATASET_ID]: buildDataset() })
		snap.set(currentDatasetIdAtom, DATASET_ID)
		snap.set(previewVersionIdAtom, null)
		snap.set(currentEncodingsAtom, {
			...emptyEncodings(),
			x: { field: "x" },
			y: { field: "y" },
		})
		snap.set(currentChannelConfigsAtom, EMPTY_CHANNEL_CONFIGS)
		snap.set(currentLabelsAtom, DEFAULT_LABELS_CONFIG)
		snap.set(currentDataLabelsEncodingsAtom, dataLabelsEncodings)
		snap.set(currentDataLabelsConfigAtom, {
			...DEFAULT_DATA_LABELS_CONFIG,
			...(opts.cfg ?? {}),
		})
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

const header = (container: HTMLElement, title: string) =>
	[...container.querySelectorAll<HTMLButtonElement>("button")].find(
		(b) =>
			b.getAttribute("aria-expanded") !== null &&
			b.textContent?.trim() === title
	) ?? null

const expand = (container: HTMLElement, title: string) => {
	const h = header(container, title)
	expect(h, `subsection header "${title}"`).not.toBeNull()
	fireEvent.click(h!)
}

const addRuleLinks = (container: HTMLElement) =>
	[...container.querySelectorAll<HTMLButtonElement>("button")].filter(
		(b) => b.textContent?.trim() === "+ Add rule"
	)

/** The "+ Add rule" link sitting inside the given subsection's body.
 *  `CollapsibleSubsection` wraps a header ROW and the body as siblings, so
 *  the subsection is the header button's grandparent. */
const addRuleIn = (container: HTMLElement, title: string) => {
	const h = header(container, title)
	expect(h, `subsection header "${title}"`).not.toBeNull()
	const section = h!.parentElement?.parentElement
	const found = [
		...(section?.querySelectorAll<HTMLButtonElement>("button") ?? []),
	].filter((b) => b.textContent?.trim() === "+ Add rule")
	expect(found, `"+ Add rule" inside "${title}"`).toHaveLength(1)
	return found[0]
}

describe("DataLabelsPanel — position rules live with each label", () => {
	afterEach(cleanup)

	it("one variable: the single link stays with the layer-wide controls", () => {
		const { container } = mountPanel({ fields: null })
		expand(container, "Adjust position and alignment")
		expect(addRuleLinks(container)).toHaveLength(1)
	})

	it("separate variables: one link per variable subheader, none loose", () => {
		const { container } = mountPanel({
			fields: ["y", "g"],
			cfg: { combineVariables: false },
		})
		expand(container, "Adjust position and alignment")
		expand(container, "y")
		expand(container, "g")
		// Exactly one per variable — and each inside ITS subsection, so the
		// section has no link of its own.
		expect(addRuleLinks(container)).toHaveLength(2)
		addRuleIn(container, "y")
		addRuleIn(container, "g")
	})

	it("a variable's link writes that variable's rules only", () => {
		const { container, readCfg } = mountPanel({
			fields: ["y", "g"],
			cfg: { combineVariables: false, xOffset: 4, yOffset: -3 },
		})
		expand(container, "Adjust position and alignment")
		expand(container, "g")
		fireEvent.click(addRuleIn(container, "g"))
		const cfg = readCfg()
		// Seeded from the label's effective base offsets, so a fresh rule is
		// a no-op until the user diverges from it.
		expect(cfg.fieldPositionRules).toEqual({
			g: [{ condition: "", xOffset: 4, yOffset: -3 }],
		})
		expect(cfg.positionRules ?? []).toHaveLength(0)
		// Editing the condition keeps it on that variable.
		const box = container.querySelector<HTMLInputElement>(
			'input[aria-label="Condition for g position rule 1"]'
		)
		expect(box).not.toBeNull()
		fireEvent.change(box!, { target: { value: "< 0" } })
		expect(readCfg().fieldPositionRules?.g?.[0].condition).toBe("< 0")
	})

	it("a variable's own base offsets seed its rule", () => {
		const { container, readCfg } = mountPanel({
			fields: ["y", "g"],
			cfg: {
				combineVariables: false,
				xOffset: 4,
				yOffset: -3,
				fieldOffsets: { y: { xOffset: 12, yOffset: 9 } },
			},
		})
		expand(container, "Adjust position and alignment")
		expand(container, "y")
		fireEvent.click(addRuleIn(container, "y"))
		expect(readCfg().fieldPositionRules?.y).toEqual([
			{ condition: "", xOffset: 12, yOffset: 9 },
		])
	})

	it("removing a variable's last rule drops its entry", () => {
		const { container, readCfg } = mountPanel({
			fields: ["y", "g"],
			cfg: {
				combineVariables: false,
				fieldPositionRules: {
					g: [{ condition: "< 0", xOffset: 5, yOffset: 5 }],
				},
			},
		})
		expand(container, "Adjust position and alignment")
		expand(container, "g")
		const remove = container.querySelector<HTMLButtonElement>(
			'button[aria-label="Remove g position rule 1"]'
		)
		expect(remove).not.toBeNull()
		fireEvent.click(remove!)
		expect(readCfg().fieldPositionRules).toEqual({})
	})

	it("combined variables: the arranged label keeps the layer-wide link", () => {
		const { container, readCfg } = mountPanel({
			fields: ["y", "g"],
			cfg: { combineVariables: true },
		})
		expand(container, "Adjust position and alignment")
		const links = addRuleLinks(container)
		expect(links).toHaveLength(1)
		fireEvent.click(links[0])
		expect(readCfg().positionRules).toHaveLength(1)
		expect(readCfg().fieldPositionRules ?? {}).toEqual({})
	})
})
