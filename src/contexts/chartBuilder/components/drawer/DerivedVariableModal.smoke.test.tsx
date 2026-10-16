import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { buildDataset as buildDatasetFixture } from "../../../../testSupport/fixtures"
import { installInMemoryLocalStorage } from "../../../../testSupport/localStorageShim"
import {
	TestProvider,
	type TestStore,
} from "../../../../testSupport/TestProvider"
import {
	DEFAULT_DERIVED_VARIABLES_CONFIG,
	type DerivedVariablesConfig,
} from "../../lib/derivedVariables"
import type { Dataset, Field } from "../../lib/types"
import {
	currentDatasetIdAtom,
	currentDerivedVariablesAtom,
	derivedVariableEditorAtom,
	loadedDatasetsAtom,
	previewVersionIdAtom,
} from "../../store/atoms"

import { DerivedVariableModal } from "./DerivedVariableModal"

/** Smoke coverage for the derived-variable popup: it renders only while the
 *  editor atom targets something, previews a valid formula against the
 *  current data, flips between the three function bodies, disables Save on a
 *  broken draft, and pre-fills when editing an existing variable. */

// Explicit cleanup: this file imports vitest APIs directly (no globals), so
// testing-library's automatic afterEach unmount never registers — and the
// modal portals into document.body, which must be reset between tests.
afterEach(cleanup)

const ID = "ds-derived-modal"

const FIELDS: Field[] = [
	{ name: "region", inferredType: "categorical" },
	{ name: "sales", inferredType: "quantitative" },
]

const ROWS = [
	{ region: "West", sales: "10" },
	{ region: "East", sales: "9" },
]

const buildDataset = (rows = ROWS): Dataset =>
	buildDatasetFixture({
		id: ID,
		name: "derived",
		filename: "derived.csv",
		fields: FIELDS,
		rows,
	})

const mount = (
	editor: null | { mode: "new" } | { mode: "edit"; id: string },
	config: DerivedVariablesConfig = DEFAULT_DERIVED_VARIABLES_CONFIG,
	rows = ROWS
) => {
	// Atom storage effects re-load from localStorage on init and would reset a
	// snapshot-only seed to defaults, so the fixture goes into BOTH.
	const store = installInMemoryLocalStorage()
	/* eslint-disable @th/use-wrapped-json-functions */
	const set = (k: string, v: unknown) => store.set(k, JSON.stringify(v))
	set("vis-components:datasets", { [ID]: buildDataset(rows) })
	set("vis-components:currentDatasetId", ID)
	set("vis-components:previewVersionId", null)
	set("vis-components:currentDerivedVariables", { _v: 1, data: config })
	/* eslint-enable @th/use-wrapped-json-functions */
	const init = (snap: TestStore) => {
		snap.set(loadedDatasetsAtom, { [ID]: buildDataset(rows) })
		snap.set(currentDatasetIdAtom, ID)
		snap.set(previewVersionIdAtom, null)
		snap.set(currentDerivedVariablesAtom, config)
		// Transient editor target — not persisted, so snapshot-only.
		snap.set(derivedVariableEditorAtom, editor)
	}
	return render(
		<TestProvider initializeState={init}>
			<DerivedVariableModal />
		</TestProvider>
	)
}

describe("DerivedVariableModal", () => {
	it("renders nothing while the editor atom is null", () => {
		const utils = mount(null)
		expect(utils.baseElement.textContent).toBe("")
	})

	it("previews a valid math formula against the current data", () => {
		const utils = mount({ mode: "new" })
		const formula = utils.getByPlaceholderText(
			"{Sales} / {Count}"
		) as HTMLInputElement
		fireEvent.change(formula, { target: { value: "{sales} * 2" } })
		// Preview table: the default-name result column with computed cells.
		expect(utils.getAllByText("Variable 1").length).toBeGreaterThan(0)
		expect(utils.getByText("20")).toBeTruthy()
		expect(utils.getByText("18")).toBeTruthy()
		expect(
			(utils.getByRole("button", { name: "Save" }) as HTMLButtonElement)
				.disabled
		).toBe(false)
	})

	it("disables Save and shows the issue for a broken draft", () => {
		const utils = mount({ mode: "new" })
		const formula = utils.getByPlaceholderText(
			"{Sales} / {Count}"
		) as HTMLInputElement
		fireEvent.change(formula, { target: { value: "{profit} + 1" } })
		expect(
			utils.getByText("{profit} isn't a variable in the data.")
		).toBeTruthy()
		expect(
			(utils.getByRole("button", { name: "Save" }) as HTMLButtonElement)
				.disabled
		).toBe(true)
	})

	it("disables Save when a math formula reaches a text column", () => {
		const utils = mount({ mode: "new" })
		const formula = utils.getByPlaceholderText(
			"{Sales} / {Count}"
		) as HTMLInputElement
		fireEvent.change(formula, { target: { value: "{sales} * {region}" } })
		expect(
			utils.getByText(
				'{region} isn\'t a number in every row — row 1 is "West". Math needs numeric variables.'
			)
		).toBeTruthy()
		expect(
			(utils.getByRole("button", { name: "Save" }) as HTMLButtonElement)
				.disabled
		).toBe(true)
	})

	it("flips between the three function bodies, keeping the variable buttons", () => {
		const utils = mount({ mode: "new" })
		const buttons = () =>
			utils.getByRole("group", { name: "Insert variable" })
		expect(buttons().textContent).toBe("regionsales")
		fireEvent.click(utils.getByRole("radio", { name: "If / else" }))
		expect(utils.getByLabelText("Rule 1 left side")).toBeTruthy()
		expect(utils.getByLabelText("Rule 1 comparison")).toBeTruthy()
		expect(utils.getByLabelText("Rule 1 right side")).toBeTruthy()
		expect(utils.getByLabelText("Otherwise output")).toBeTruthy()
		expect(buttons().textContent).toBe("regionsales")
		fireEvent.click(utils.getByRole("radio", { name: "Combine text" }))
		expect(utils.getByPlaceholderText("Some text: {Region}")).toBeTruthy()
		expect(buttons().textContent).toBe("regionsales")
	})

	it("variable buttons insert a braced token into the focused box", () => {
		const utils = mount({ mode: "new" })
		// Nothing focused yet: the function's only box takes it.
		fireEvent.click(utils.getByRole("button", { name: "sales" }))
		const formula = utils.getByLabelText("Formula") as HTMLInputElement
		expect(formula.value).toBe("{sales}")
		fireEvent.change(formula, { target: { value: "{sales} * " } })
		formula.focus()
		formula.setSelectionRange(formula.value.length, formula.value.length)
		fireEvent.click(utils.getByRole("button", { name: "sales" }))
		expect(formula.value).toBe("{sales} * {sales}")

		// If/else: the last-focused box is the target, wherever it sits.
		fireEvent.click(utils.getByRole("radio", { name: "If / else" }))
		const right = utils.getByLabelText("Rule 1 right side") as HTMLInputElement
		fireEvent.focus(right)
		fireEvent.click(utils.getByRole("button", { name: "region" }))
		expect(right.value).toBe("{region}")
		expect(
			(utils.getByLabelText("Rule 1 left side") as HTMLInputElement).value
		).toBe("")
	})

	it("builds an If/else rule from the three boxes, quoting plain text", () => {
		const utils = mount({ mode: "new" })
		fireEvent.click(utils.getByRole("radio", { name: "If / else" }))
		fireEvent.change(utils.getByLabelText("Rule 1 left side"), {
			target: { value: "{region}" },
		})
		fireEvent.change(utils.getByLabelText("Rule 1 right side"), {
			target: { value: "West" },
		})
		fireEvent.change(utils.getByLabelText("Rule 1 output"), {
			target: { value: "yes" },
		})
		fireEvent.change(utils.getByLabelText("Otherwise output"), {
			target: { value: "no" },
		})
		// Preview: West → yes, East → no.
		expect(utils.getByText("yes")).toBeTruthy()
		expect(utils.getByText("no")).toBeTruthy()
		expect(
			(utils.getByRole("button", { name: "Save" }) as HTMLButtonElement)
				.disabled
		).toBe(false)

		// A half-filled row blocks Save with a row-level message.
		fireEvent.change(utils.getByLabelText("Rule 1 right side"), {
			target: { value: "" },
		})
		expect(
			utils.getByText("Both sides of the comparison need a value.")
		).toBeTruthy()
		expect(
			(utils.getByRole("button", { name: "Save" }) as HTMLButtonElement)
				.disabled
		).toBe(true)
	})

	it("offers a categorical variable's levels as a dropdown on the right side", () => {
		const utils = mount({ mode: "new" })
		fireEvent.click(utils.getByRole("radio", { name: "If / else" }))
		const left = utils.getByLabelText("Rule 1 left side")
		// A number column keeps the text box…
		fireEvent.change(left, { target: { value: "{sales}" } })
		expect(utils.getByLabelText("Rule 1 right side").tagName).toBe("INPUT")
		// …a lone categorical token swaps in its levels.
		fireEvent.change(left, { target: { value: "{region}" } })
		const select = utils.getByLabelText("Rule 1 right side") as HTMLSelectElement
		expect(select.tagName).toBe("SELECT")
		expect([...select.options].map((o) => o.textContent)).toEqual([
			"Choose a value…",
			"West",
			"East",
			"Formula…",
		])
		fireEvent.change(select, { target: { value: "East" } })
		fireEvent.change(utils.getByLabelText("Rule 1 output"), {
			target: { value: "yes" },
		})
		fireEvent.change(utils.getByLabelText("Otherwise output"), {
			target: { value: "no" },
		})
		// Preview: West → no, East → yes.
		expect(utils.getByText("yes")).toBeTruthy()
		expect(utils.getByText("no")).toBeTruthy()
		// A chip click while the list is selected turns it back into a text
		// box holding the variable, so variable-vs-variable still works.
		fireEvent.focus(utils.getByLabelText("Rule 1 right side"))
		fireEvent.click(utils.getByRole("button", { name: "sales" }))
		const right = utils.getByLabelText("Rule 1 right side") as HTMLInputElement
		expect(right.tagName).toBe("INPUT")
		expect(right.value).toBe("{sales}")
	})

	it("lists (blank) among the levels of a column with empty cells, as the blank test", () => {
		const utils = mount({ mode: "new" }, DEFAULT_DERIVED_VARIABLES_CONFIG, [
			...ROWS,
			{ region: "", sales: "3" },
		])
		fireEvent.click(utils.getByRole("radio", { name: "If / else" }))
		fireEvent.change(utils.getByLabelText("Rule 1 left side"), {
			target: { value: "{region}" },
		})
		const select = utils.getByLabelText("Rule 1 right side") as HTMLSelectElement
		expect([...select.options].map((o) => o.textContent)).toEqual([
			"Choose a value…",
			"West",
			"East",
			"(blank)",
			"Formula…",
		])
		// The blank level is stored as the empty text literal and stays
		// selected in the list.
		fireEvent.change(select, { target: { value: `""` } })
		expect(
			(utils.getByLabelText("Rule 1 right side") as HTMLSelectElement).value
		).toBe(`""`)
		fireEvent.change(utils.getByLabelText("Rule 1 output"), {
			target: { value: "missing" },
		})
		fireEvent.change(utils.getByLabelText("Otherwise output"), {
			target: { value: "present" },
		})
		// Preview: West, East → present; the blank row → missing.
		expect(utils.getByText("missing")).toBeTruthy()
		expect(utils.getAllByText("present").length).toBe(2)
		expect(
			(utils.getByRole("button", { name: "Save" }) as HTMLButtonElement)
				.disabled
		).toBe(false)
	})

	it("Formula… in the value list folds the row into a condition box with the level quoted", () => {
		const utils = mount({ mode: "new" })
		fireEvent.click(utils.getByRole("radio", { name: "If / else" }))
		fireEvent.change(utils.getByLabelText("Rule 1 left side"), {
			target: { value: "{region}" },
		})
		const select = utils.getByLabelText("Rule 1 right side") as HTMLSelectElement
		fireEvent.change(select, { target: { value: "East" } })
		const formulaValue =
			[...select.options].find((o) => o.textContent === "Formula…")?.value ?? ""
		fireEvent.change(select, { target: { value: formulaValue } })
		// The chosen level arrives written the way a formula needs it.
		const condition = utils.getByLabelText("Rule 1 condition") as HTMLInputElement
		expect(condition.value).toBe('{region} == "East"')
		expect(utils.queryByLabelText("Rule 1 right side")).toBeNull()
		fireEvent.change(condition, {
			target: { value: '{region} == "East" OR {sales} > 100' },
		})
		fireEvent.blur(condition)
		expect(utils.getByLabelText("Rule 1 condition")).toBeTruthy()
		fireEvent.change(utils.getByLabelText("Rule 1 output"), {
			target: { value: "yes" },
		})
		fireEvent.change(utils.getByLabelText("Otherwise output"), {
			target: { value: "no" },
		})
		// Preview: East → yes, West → no.
		expect(utils.getByText("yes")).toBeTruthy()
		expect(utils.getByText("no")).toBeTruthy()
	})

	it("a right box being typed in holds as a text box until it loses focus", () => {
		const utils = mount({ mode: "new" })
		fireEvent.click(utils.getByRole("radio", { name: "If / else" }))
		fireEvent.change(utils.getByLabelText("Rule 1 left side"), {
			target: { value: "{region}" },
		})
		// A chip click on the list swaps in a text box holding the variable.
		fireEvent.focus(utils.getByLabelText("Rule 1 right side"))
		fireEvent.click(utils.getByRole("button", { name: "sales" }))
		const right = utils.getByLabelText("Rule 1 right side") as HTMLInputElement
		expect(right.tagName).toBe("INPUT")
		fireEvent.focus(right)
		// While it's focused, a value that happens to be a level doesn't snap
		// it back to the list…
		fireEvent.change(right, { target: { value: "West" } })
		expect(utils.getByLabelText("Rule 1 right side").tagName).toBe("INPUT")
		// …leaving the box does, with that level selected.
		fireEvent.blur(right)
		const back = utils.getByLabelText("Rule 1 right side") as HTMLSelectElement
		expect(back.tagName).toBe("SELECT")
		expect(back.value).toBe("West")
	})

	it("offers only = and ≠ for a lone categorical variable, all six otherwise", () => {
		const utils = mount({ mode: "new" })
		fireEvent.click(utils.getByRole("radio", { name: "If / else" }))
		const left = utils.getByLabelText("Rule 1 left side")
		const ops = () =>
			[...(utils.getByLabelText("Rule 1 comparison") as HTMLSelectElement).options].map(
				(o) => o.textContent
			)
		fireEvent.change(left, { target: { value: "{sales}" } })
		expect(ops()).toEqual(["=", "≠", ">", "<", "≥", "≤", "Formula…"])
		fireEvent.change(utils.getByLabelText("Rule 1 comparison"), {
			target: { value: ">" },
		})
		// A calculation keeps every comparator and an open right side.
		fireEvent.change(left, { target: { value: "{sales} / 2" } })
		expect(ops()).toEqual(["=", "≠", ">", "<", "≥", "≤", "Formula…"])
		expect(utils.getByLabelText("Rule 1 right side").tagName).toBe("INPUT")
		// A lone category: two comparators, and the stale ">" reads as "=".
		fireEvent.change(left, { target: { value: "{region}" } })
		expect(ops()).toEqual(["=", "≠", "Formula…"])
		expect(
			(utils.getByLabelText("Rule 1 comparison") as HTMLSelectElement).value
		).toBe("==")
	})

	it("Formula… folds a row into one condition box for AND / OR; a single comparison unfolds on blur", () => {
		const utils = mount({ mode: "new" })
		fireEvent.click(utils.getByRole("radio", { name: "If / else" }))
		fireEvent.change(utils.getByLabelText("Rule 1 left side"), {
			target: { value: "{sales}" },
		})
		fireEvent.change(utils.getByLabelText("Rule 1 comparison"), {
			target: { value: ">" },
		})
		fireEvent.change(utils.getByLabelText("Rule 1 right side"), {
			target: { value: "5" },
		})
		const select = utils.getByLabelText("Rule 1 comparison") as HTMLSelectElement
		const formulaValue =
			[...select.options].find((o) => o.textContent === "Formula…")?.value ?? ""
		fireEvent.change(select, { target: { value: formulaValue } })
		// The three boxes become one, holding what they composed to.
		const condition = utils.getByLabelText("Rule 1 condition") as HTMLInputElement
		expect(condition.value).toBe("{sales} > 5")
		expect(utils.queryByLabelText("Rule 1 left side")).toBeNull()
		fireEvent.change(condition, {
			target: { value: '{sales} > 5 AND {region} == "West"' },
		})
		fireEvent.blur(condition)
		expect(utils.getByLabelText("Rule 1 condition")).toBeTruthy()
		fireEvent.change(utils.getByLabelText("Rule 1 output"), {
			target: { value: "yes" },
		})
		fireEvent.change(utils.getByLabelText("Otherwise output"), {
			target: { value: "no" },
		})
		// Preview: West/10 → yes, East/9 → no.
		expect(utils.getByText("yes")).toBeTruthy()
		expect(utils.getByText("no")).toBeTruthy()
		// Reduced to a single comparison and left, the row is three boxes again.
		fireEvent.change(utils.getByLabelText("Rule 1 condition"), {
			target: { value: '{region} == "West"' },
		})
		fireEvent.blur(utils.getByLabelText("Rule 1 condition"))
		expect(
			(utils.getByLabelText("Rule 1 left side") as HTMLInputElement).value
		).toBe("{region}")
		const right = utils.getByLabelText("Rule 1 right side") as HTMLSelectElement
		expect(right.tagName).toBe("SELECT")
		expect(right.value).toBe("West")
	})

	it("splits a stored comparison into the boxes and keeps AND / OR rules as text", () => {
		const utils = mount(
			{ mode: "edit", id: "dvr-2" },
			{
				variables: [
					{
						id: "dvr-2",
						name: "bucket",
						kind: "rules",
						rules: {
							rules: [
								{ condition: '{region} == "West"', output: "W" },
								{ condition: "{sales} > 5 AND {sales} < 20", output: "mid" },
							],
							fallback: "other",
						},
					},
				],
			}
		)
		expect(
			(utils.getByLabelText("Rule 1 left side") as HTMLInputElement).value
		).toBe("{region}")
		expect(
			(utils.getByLabelText("Rule 1 comparison") as HTMLSelectElement).value
		).toBe("==")
		expect(
			(utils.getByLabelText("Rule 1 right side") as HTMLInputElement).value
		).toBe("West")
		expect(
			(utils.getByLabelText("Rule 2 condition") as HTMLInputElement).value
		).toBe("{sales} > 5 AND {sales} < 20")
		expect(utils.queryByLabelText("Rule 2 left side")).toBeNull()
	})

	it("pre-fills when editing an existing variable and offers Delete", () => {
		const utils = mount(
			{ mode: "edit", id: "dvr-1" },
			{
				variables: [
					{
						id: "dvr-1",
						name: "doubled",
						kind: "math",
						math: { formula: "{sales} * 2" },
					},
				],
			}
		)
		expect(
			(utils.getByPlaceholderText("doubled") as HTMLInputElement).value
		).toBe("doubled")
		expect(
			(utils.getByPlaceholderText("{Sales} / {Count}") as HTMLInputElement)
				.value
		).toBe("{sales} * 2")
		expect(utils.getByRole("button", { name: "Delete" })).toBeTruthy()
	})
})
