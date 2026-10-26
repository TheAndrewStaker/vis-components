import { cleanup, fireEvent, render, waitFor } from "@testing-library/react"
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
 *  its menu is open, holds a DRAFT the chart doesn't see until "Apply
 *  reshape" saves the long table as a new data version (a fork of imported
 *  data, an append to a working copy), lists the wide columns, moves a
 *  column out of Combine when it's checked as an ID, surfaces naming
 *  collisions as warnings, and Cancel hides the menu without saving. An
 *  older visual's live reshape and derived variables seed the draft and are
 *  folded into the version. */

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

/** A working copy: the import plus a hand-edited version. */
const workingCopy = (): Dataset =>
	buildDatasetFixture({
		id: ID,
		name: "reshape (edited)",
		fields: FIELDS,
		versions: [
			{ id: "v1", filename: "reshape.csv", rows: ROWS, createdAt: 0 },
			{
				id: "v2",
				filename: "Edited data",
				rows: [ROWS[0]!, { store: "B", monday: "30", tuesday: "4" }],
				createdAt: 1,
				editedFrom: "v1",
			},
		],
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
	derived: DerivedVariable[] = [],
	dataset: Dataset = buildDataset()
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
	set("vis-components:datasets", { [ID]: dataset })
	set("vis-components:currentDatasetId", ID)
	set("vis-components:previewVersionId", null)
	set("vis-components:currentReshapeConfig", { _v: 1, data: reshapeConfig })
	set("vis-components:currentDerivedVariables", { _v: 1, data: derivedConfig })
	/* eslint-enable @vc/use-wrapped-json-functions */
	let snapshot: TestStore | undefined
	const init = (snap: TestStore) => {
		snapshot = snap
		snap.set(loadedDatasetsAtom, { [ID]: dataset })
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
	return { ...utils, store: () => snapshot! }
}

describe("ReshapePanel", () => {
	it("renders nothing while the menu is closed", () => {
		const utils = mount({}, false)
		expect(utils.container.innerHTML).toBe("")
	})

	it("Cancel hides the menu without saving anything", () => {
		const utils = mount({
			idFields: ["store"],
			meltFields: ["monday", "tuesday"],
		})
		fireEvent.click(utils.getByRole("button", { name: "Cancel" }))
		expect(utils.container.innerHTML).toBe("")
		expect(utils.store().get(loadedDatasetsAtom)[ID]).toEqual(buildDataset())
		expect(utils.store().get(currentDatasetIdAtom)).toBe(ID)
	})

	it("lists the wide columns and reads out what Apply would save", () => {
		const utils = mount({
			idFields: ["store"],
			meltFields: ["monday", "tuesday"],
			variableName: "day",
			valueName: "sales",
		})
		// ID list carries all 3 wide columns; the melted "day"/"sales" never
		// appear as checkboxes — the draft is not applied to anything yet.
		for (const name of ["store", "monday", "tuesday"])
			expect(utils.getAllByText(name).length).toBeGreaterThan(0)
		expect(
			utils.getByText("2 rows × 3 columns → 4 rows × 3 columns.")
		).toBeTruthy()
		expect(utils.store().get(loadedDatasetsAtom)[ID]!.versions).toHaveLength(1)
	})

	it("disables Apply until a Combine column is checked", () => {
		const utils = mount()
		const apply = utils.getByRole("button", { name: "Apply reshape" }) as HTMLButtonElement
		expect(apply.disabled).toBe(true)
		const [mondayCombine] = utils
			.getAllByRole("checkbox")
			.filter((el) => el.parentElement?.textContent === "monday")
			.slice(-1)
		fireEvent.click(mondayCombine!)
		expect(
			(utils.getByRole("button", { name: "Apply reshape" }) as HTMLButtonElement).disabled
		).toBe(false)
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
		fireEvent.click(idCheckbox!)
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
		expect(
			(utils.getByRole("button", { name: "Apply reshape" }) as HTMLButtonElement).disabled
		).toBe(true)
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

	it("applies as a NEW data set: the long table as v2, the wide table kept as v1 with its own columns", async () => {
		const utils = mount({
			idFields: ["store"],
			meltFields: ["monday", "tuesday"],
			variableName: "day",
			valueName: "sales",
		})
		expect(utils.container.textContent).toContain("creates a new data set altogether")
		const name = utils.getByLabelText("Data set name") as HTMLInputElement
		expect(name.value).toBe("reshape (reshaped)")
		fireEvent.click(utils.getByRole("button", { name: "Apply reshape" }))

		const store = utils.store()
		await waitFor(() => expect(store.get(currentDatasetIdAtom)).not.toBe(ID))
		const forked = store.get(loadedDatasetsAtom)[store.get(currentDatasetIdAtom)!]!
		expect(forked.name).toBe("reshape (reshaped)")
		expect(forked.fields.map((f) => f.name)).toEqual(["store", "day", "sales"])
		expect(forked.versions.map((v) => v.filename)).toEqual([
			"reshape.csv",
			"Reshaped data",
		])
		const [wide, long] = forked.versions
		// The copy of the wide table keeps the wide columns as its own list.
		expect(wide!.fields?.map((f) => f.name)).toEqual(["store", "monday", "tuesday"])
		expect(wide!.rows).toBe(ROWS)
		expect(long!.editedFrom).toBe(wide!.id)
		expect(long!.transform).toEqual({
			reshape: {
				idFields: ["store"],
				meltFields: ["monday", "tuesday"],
				variableName: "day",
				valueName: "sales",
			},
		})
		expect(long!.rows).toEqual([
			{ store: "A", day: "monday", sales: "1" },
			{ store: "A", day: "tuesday", sales: "2" },
			{ store: "B", day: "monday", sales: "3" },
			{ store: "B", day: "tuesday", sales: "4" },
		])
		// The imported data set is untouched, the live config is cleared, and
		// the menu closed.
		expect(store.get(loadedDatasetsAtom)[ID]).toEqual(buildDataset())
		expect(store.get(currentReshapeConfigAtom)).toEqual(DEFAULT_RESHAPE_CONFIG)
		expect(store.get(reshapePanelOpenAtom)).toBe(false)
	})

	it("appends a version to a working copy, with no name box", async () => {
		const utils = mount(
			{ idFields: ["store"], meltFields: ["monday", "tuesday"] },
			true,
			[],
			workingCopy()
		)
		expect(utils.container.textContent).toContain("adds a new version to this data set")
		expect(utils.queryByLabelText("Data set name")).toBeNull()
		fireEvent.click(utils.getByRole("button", { name: "Apply reshape" }))

		const store = utils.store()
		await waitFor(() =>
			expect(store.get(loadedDatasetsAtom)[ID]!.versions).toHaveLength(3)
		)
		expect(store.get(currentDatasetIdAtom)).toBe(ID)
		const ds = store.get(loadedDatasetsAtom)[ID]!
		const [v1, v2, v3] = ds.versions
		expect(ds.fields.map((f) => f.name)).toEqual(["store", "category", "value"])
		expect(ds.latestVersionId).toBe(v3!.id)
		expect(v3!.editedFrom).toBe("v2")
		expect(v3!.rows).toHaveLength(4)
		expect(v3!.rows[2]).toEqual({ store: "B", category: "monday", value: "30" })
		// The versions before the reshape keep the wide columns.
		for (const v of [v1!, v2!])
			expect(v.fields?.map((f) => f.name)).toEqual(["store", "monday", "tuesday"])
	})

	it("+ Add another group: a second Combine list whose columns pair with the first by position", async () => {
		const utils = mount({
			idFields: ["store"],
			meltFields: ["monday"],
			variableName: "day",
			valueName: "sales",
		})
		fireEvent.click(utils.getByRole("button", { name: "+ Add another group" }))
		// The second group's names default to numbered placeholders…
		const variable2 = utils.getByLabelText(
			"Combined variable name (group 2)"
		) as HTMLInputElement
		expect(variable2.value).toBe("category 2")
		fireEvent.change(variable2, { target: { value: "other day" } })
		fireEvent.change(utils.getByLabelText("Value variable name (group 2)"), {
			target: { value: "other" },
		})
		// …and its list offers only the columns no other list combines:
		// "monday" sits in group 1, so group 2 shows "tuesday" alone.
		const group2Boxes = utils
			.getAllByRole("checkbox")
			.filter((el) => el.parentElement?.textContent === "tuesday")
		// ID list + group 1 + group 2
		expect(group2Boxes).toHaveLength(3)
		fireEvent.click(group2Boxes[2]!)
		// Checking it in group 2 withdraws it from group 1's list.
		expect(
			utils
				.getAllByRole("checkbox")
				.filter((el) => el.parentElement?.textContent === "tuesday")
		).toHaveLength(2)
		expect(
			utils.getByText("2 rows × 3 columns → 2 rows × 5 columns.")
		).toBeTruthy()
		fireEvent.click(utils.getByRole("button", { name: "Apply reshape" }))

		const store = utils.store()
		await waitFor(() => expect(store.get(currentDatasetIdAtom)).not.toBe(ID))
		const forked = store.get(loadedDatasetsAtom)[store.get(currentDatasetIdAtom)!]!
		expect(forked.fields.map((f) => f.name)).toEqual([
			"store",
			"day",
			"sales",
			"other day",
			"other",
		])
		const long = forked.versions[1]!
		expect(long.transform?.reshape).toEqual({
			idFields: ["store"],
			meltFields: ["monday"],
			variableName: "day",
			valueName: "sales",
			extraGroups: [
				{ meltFields: ["tuesday"], variableName: "other day", valueName: "other" },
			],
		})
		expect(long.rows).toEqual([
			{ store: "A", day: "monday", sales: "1", "other day": "tuesday", other: "2" },
			{ store: "B", day: "monday", sales: "3", "other day": "tuesday", other: "4" },
		])
	})

	it("says when a shorter group will pad with blanks, and × removes a group", () => {
		const utils = mount({
			meltFields: ["store", "monday"],
			extraGroups: [{ meltFields: ["tuesday"], variableName: "k", valueName: "v" }],
		})
		expect(utils.container.textContent).toContain("The groups differ in size")
		expect(
			utils.getByText("2 rows × 3 columns → 4 rows × 4 columns.")
		).toBeTruthy()
		fireEvent.click(utils.getByRole("button", { name: "Remove group 2" }))
		expect(utils.queryByLabelText("Combined variable name (group 2)")).toBeNull()
		expect(utils.container.textContent).not.toContain("The groups differ in size")
		expect(
			utils.getByText("2 rows × 3 columns → 4 rows × 2 columns.")
		).toBeTruthy()
	})

	it("warns when two groups mint the same name", () => {
		const utils = mount({
			meltFields: ["monday"],
			extraGroups: [
				{ meltFields: ["tuesday"], variableName: "category", valueName: "v" },
			],
		})
		expect(utils.getByText('"category" is used by two groups.')).toBeTruthy()
		expect(
			(utils.getByRole("button", { name: "Apply reshape" }) as HTMLButtonElement).disabled
		).toBe(true)
	})

	it("lists wide-computable live derived variables with an ƒ edit button, not long-only ones", () => {
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
		fireEvent.click(marker!)
		expect(utils.store().get(derivedVariableEditorAtom)).toEqual({
			mode: "edit",
			id: "dv-total",
		})
		// The ƒ click edits — it does not toggle the checkbox it sits in.
		const [idCheckbox] = utils
			.getAllByRole("checkbox")
			.filter((el) => el.parentElement?.textContent === "ƒtotal")
		expect((idCheckbox as HTMLInputElement).checked).toBe(false)
	})

	it("folds a checked live derived variable in wide and the rest after the melt", async () => {
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
		fireEvent.click(utils.getByRole("button", { name: "Apply reshape" }))
		const store = utils.store()
		await waitFor(() => expect(store.get(currentDatasetIdAtom)).not.toBe(ID))
		const forked = store.get(loadedDatasetsAtom)[store.get(currentDatasetIdAtom)!]!
		expect(forked.fields.map((f) => f.name)).toEqual([
			"store",
			"total",
			"category",
			"value",
			"sign",
		])
		const long = forked.versions[1]!
		expect(long.transform?.added?.map((v) => v.name)).toEqual(["total", "sign"])
		expect(long.rows[0]).toEqual({
			store: "A",
			total: "3",
			category: "monday",
			value: "1",
			sign: "positive",
		})
		// Both live variables now live in the data: the config is emptied.
		expect(store.get(currentDerivedVariablesAtom)).toEqual(
			DEFAULT_DERIVED_VARIABLES_CONFIG
		)
	})
})
