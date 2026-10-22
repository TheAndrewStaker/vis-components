import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { buildDataset as buildDatasetFixture } from "../../../../testSupport/fixtures"
import { installInMemoryLocalStorage } from "../../../../testSupport/localStorageShim"
import { TestProvider, type TestStore } from "../../../../testSupport/TestProvider"
import {
	DEFAULT_DERIVED_VARIABLES_CONFIG,
	type DerivedVariable,
} from "../../lib/derivedVariables"
import { DEFAULT_RESHAPE_CONFIG, type ReshapeConfig } from "../../lib/reshape"
import type { Dataset, Field } from "../../lib/types"
import {
	currentDatasetIdAtom,
	currentDerivedVariablesAtom,
	currentReshapeConfigAtom,
	derivedVariableEditorAtom,
	loadedDatasetsAtom,
	previewVersionIdAtom,
	reshapePanelOpenAtom,
} from "../../store/atoms"

import { ReshapePanel } from "./ReshapePanel"

/** Smoke coverage for the wide→long Reshape panel: it renders only while
 *  its menu is open, lists the RAW (wide) columns even while the reshape is
 *  applied, moves a column out of Combine when it's checked as an ID,
 *  surfaces naming collisions as warnings, and "Save and close" hides the
 *  menu without touching the reshape config. */

// Explicit cleanup: this file imports vitest APIs directly (no globals), so
// testing-library's automatic afterEach unmount never registers.
afterEach(cleanup)

const ID = "ds-reshape-panel"

const FIELDS: Field[] = [
	{ name: "store", inferredType: "categorical" },
	{ name: "monday", inferredType: "quantitative" },
	{ name: "tuesday", inferredType: "quantitative" },
]

const ROWS = [
	{ store: "A", monday: "1", tuesday: "2" },
	{ store: "B", monday: "3", tuesday: "4" },
]

const buildDataset = (): Dataset =>
	buildDatasetFixture({
		id: ID,
		name: "reshape",
		filename: "reshape.csv",
		fields: FIELDS,
		rows: ROWS,
	})

/** `total` is computable from the wide columns; `sign` needs the melt's
 * value column, so the panel must not list it. */
const DERIVED: DerivedVariable[] = [
	{
		id: "dv-total",
		name: "total",
		kind: "math",
		math: { formula: "{monday} + {tuesday}" },
	},
	{
		id: "dv-sign",
		name: "sign",
		kind: "rules",
		rules: {
			rules: [{ condition: "{value} > 0", output: "positive" }],
			fallback: "negative",
		},
	},
]

const mount = (
	reshape: Partial<ReshapeConfig> = {},
	open = true,
	derived: DerivedVariable[] = []
) => {
	// Atom storage effects re-load from localStorage on init and would reset a
	// snapshot-only seed to defaults, so the fixture goes into BOTH.
	const store = installInMemoryLocalStorage()
	const reshapeConfig: ReshapeConfig = {
		...DEFAULT_RESHAPE_CONFIG,
		...reshape,
	}
	const derivedConfig = { ...DEFAULT_DERIVED_VARIABLES_CONFIG, variables: derived }
	/* eslint-disable @vc/use-wrapped-json-functions */
	const set = (k: string, v: unknown) => store.set(k, JSON.stringify(v))
	set("vis-components:datasets", { [ID]: buildDataset() })
	set("vis-components:currentDatasetId", ID)
	set("vis-components:previewVersionId", null)
	set("vis-components:currentReshapeConfig", { _v: 1, data: reshapeConfig })
	set("vis-components:currentDerivedVariables", { _v: 1, data: derivedConfig })
	/* eslint-enable @vc/use-wrapped-json-functions */
	let snapshot: TestStore | undefined
	const init = (snap: TestStore) => {
		snapshot = snap
		snap.set(loadedDatasetsAtom, { [ID]: buildDataset() })
		snap.set(currentDatasetIdAtom, ID)
		snap.set(previewVersionIdAtom, null)
		snap.set(currentReshapeConfigAtom, reshapeConfig)
		snap.set(currentDerivedVariablesAtom, derivedConfig)
		// Transient menu visibility — not persisted, so snapshot-only.
		snap.set(reshapePanelOpenAtom, open)
	}
	const utils = render(
		<TestProvider initializeState={init}>
			<ReshapePanel />
		</TestProvider>
	)
	return { ...utils, store: () => snapshot }
}

describe("ReshapePanel", () => {
	it("renders nothing while the menu is closed", () => {
		const utils = mount({}, false)
		expect(utils.container.innerHTML).toBe("")
	})

	it("Save and close hides the menu without touching the reshape", () => {
		const utils = mount({
			idFields: ["store"],
			meltFields: ["monday", "tuesday"],
		})
		fireEvent.click(utils.getByRole("button", { name: "Save and close" }))
		expect(utils.container.innerHTML).toBe("")
	})

	it("lists the raw wide columns even while the reshape is applied", () => {
		const utils = mount({
			idFields: ["store"],
			meltFields: ["monday", "tuesday"],
			variableName: "day",
			valueName: "sales",
		})
		// ID list carries all 3 wide columns; the melted view's "day"/"sales"
		// never appear as checkboxes.
		for (const name of ["store", "monday", "tuesday"])
			expect(utils.getAllByText(name).length).toBeGreaterThan(0)
		expect(
			utils.getByText("2 rows × 3 columns → 4 rows × 3 columns.")
		).toBeTruthy()
	})

	it("checking a Combine column as an ID withdraws it from Combine", () => {
		const utils = mount({
			idFields: [],
			meltFields: ["monday", "tuesday"],
		})
		// "monday" appears in both lists (ID list always shows every column).
		const [idCheckbox] = utils
			.getAllByRole("checkbox")
			.filter((el) => el.parentElement?.textContent === "monday")
		fireEvent.click(idCheckbox)
		// Now it's an ID column: it leaves the Combine list entirely.
		const mondayBoxes = utils
			.getAllByRole("checkbox")
			.filter((el) => el.parentElement?.textContent === "monday")
		expect(mondayBoxes).toHaveLength(1)
		expect((mondayBoxes[0] as HTMLInputElement).checked).toBe(true)
	})

	it("warns when a new name collides with a kept ID column", () => {
		const utils = mount({
			idFields: ["store"],
			meltFields: ["monday", "tuesday"],
			variableName: "store",
			valueName: "sales",
		})
		expect(
			utils.getByText('"store" is already the name of an ID column.')
		).toBeTruthy()
	})

	it("edits the pair names through the labeled inputs", () => {
		const utils = mount({
			idFields: ["store"],
			meltFields: ["monday", "tuesday"],
		})
		const variable = utils.getByLabelText(
			"Combined variable name"
		) as HTMLInputElement
		expect(variable.value).toBe("category")
		fireEvent.change(variable, { target: { value: "day" } })
		expect(
			(utils.getByLabelText("Combined variable name") as HTMLInputElement)
				.value
		).toBe("day")
	})

	it("lists wide-computable derived variables with an ƒ edit button, not long-only ones", () => {
		const utils = mount({}, true, DERIVED)
		// `total` sits after the data columns in both lists; `sign` ({value}
		// only exists after the melt) is in neither.
		const idLabels = utils
			.getAllByRole("checkbox")
			.map((el) => el.parentElement?.textContent ?? "")
		expect(idLabels.filter((t) => t.includes("total"))).toHaveLength(2)
		expect(idLabels.some((t) => t.includes("sign"))).toBe(false)
		expect(idLabels.indexOf("ƒtotal")).toBeGreaterThan(idLabels.indexOf("tuesday"))

		const [marker] = utils.getAllByRole("button", {
			name: "Edit derived variable total",
		})
		fireEvent.click(marker)
		expect(utils.store()?.get(derivedVariableEditorAtom)).toEqual({
			mode: "edit",
			id: "dv-total",
		})
		// The ƒ click edits — it does not toggle the checkbox it sits in.
		const [idCheckbox] = utils
			.getAllByRole("checkbox")
			.filter((el) => el.parentElement?.textContent === "ƒtotal")
		expect((idCheckbox as HTMLInputElement).checked).toBe(false)
	})

	it("a checked derived variable is computed wide and survives the melt", () => {
		const utils = mount(
			{ idFields: ["store", "total"], meltFields: ["monday", "tuesday"] },
			true,
			DERIVED
		)
		// 3 wide columns + total → 2 IDs + the pair, and the long-only `sign`
		// still appends after the melt.
		expect(
			utils.getByText("2 rows × 4 columns → 4 rows × 5 columns.")
		).toBeTruthy()
	})
})
