import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { buildDataset as buildDatasetFixture } from "../../../../testSupport/fixtures"
import { installInMemoryLocalStorage } from "../../../../testSupport/localStorageShim"
import {
	TestProvider,
	type TestStore,
} from "../../../../testSupport/TestProvider"
import { emptyEncodings, type Dataset, type Field } from "../../lib/types"
import {
	currentDatasetIdAtom,
	currentEncodingsAtom,
	drawerOpenAtom,
	loadedDatasetsAtom,
	previewVersionIdAtom,
} from "../../store/atoms"

import { DataDrawer } from "./DataDrawer"

/** The tray's Edit dialog: the first edit of imported data forks a new data
 *  set (a copy of the shown version as v1, the edit as v2) that the editor
 *  moves onto, the table outlines the changed cells, a changed header is a
 *  variable rename the encodings follow, and editing the copy again appends
 *  a version instead of forking once more. */

afterEach(cleanup)

const ID = "ds-edit-tray"

const FIELDS: Field[] = [
	{ name: "city", inferredType: "categorical" },
	{ name: "sales", inferredType: "quantitative" },
]

const ROWS = [
	{ city: "Lima", sales: "10" },
	{ city: "Quito", sales: "20" },
	{ city: "Bogotá", sales: "30" },
]

const imported = (): Dataset =>
	buildDatasetFixture({
		id: ID,
		name: "sales",
		filename: "sales.csv",
		fields: FIELDS,
		rows: ROWS,
	})

const handEdited = (): Dataset =>
	buildDatasetFixture({
		id: ID,
		name: "sales (edited)",
		fields: FIELDS,
		versions: [
			{ id: "v1", filename: "sales.csv", rows: ROWS, createdAt: 0 },
			{
				id: "v2",
				filename: "Edited data",
				rows: [ROWS[0]!, { city: "Quito", sales: "25" }, ROWS[2]!],
				createdAt: 1,
				editedFrom: "v1",
			},
		],
	})

const mount = (dataset: Dataset) => {
	const storage = installInMemoryLocalStorage()
	/* eslint-disable @vc/use-wrapped-json-functions */
	storage.set("vis-components:datasets", JSON.stringify({ [ID]: dataset }))
	storage.set("vis-components:currentDatasetId", JSON.stringify(ID))
	/* eslint-enable @vc/use-wrapped-json-functions */
	let store: TestStore | null = null
	render(
		<TestProvider
			initializeState={(s) => {
				store = s
				s.set(drawerOpenAtom, true)
				s.set(loadedDatasetsAtom, { [ID]: dataset })
				s.set(currentDatasetIdAtom, ID)
				s.set(previewVersionIdAtom, null)
				s.set(currentEncodingsAtom, {
					...emptyEncodings(),
					x: { field: "city" },
					y: { field: "sales" },
				})
			}}
		>
			<DataDrawer />
		</TestProvider>
	)
	return store!
}

const openDialog = () => {
	fireEvent.click(screen.getByText("Edit"))
	return screen.getByRole("dialog")
}

const textBox = () =>
	screen.getByLabelText("Data to edit") as HTMLTextAreaElement

const editedCells = () =>
	[...document.querySelectorAll("td[data-edited]")].map((td) => td.textContent)

describe("Edit data in the tray", () => {
	it("forks a new data set from a cell edit and outlines the changed cell", async () => {
		const store = mount(imported())
		const dialog = openDialog()
		expect(dialog.textContent).toContain("creates a new data set altogether")
		expect(textBox().value).toBe("city,sales\nLima,10\nQuito,20\nBogotá,30")
		const save = screen.getByText("Save as new data set").closest("button")!
		expect(save.disabled).toBe(true)
		expect(dialog.textContent).toContain("No changes yet.")
		expect(
			(screen.getByLabelText("Data set name") as HTMLInputElement).value
		).toBe("sales (edited)")

		fireEvent.change(textBox(), {
			target: { value: "city,sales\nLima,10\nQuito,25\nBogotá,30" },
		})
		await waitFor(() =>
			expect(dialog.textContent).toContain(
				"3 rows · 2 columns · 1 cell changed"
			)
		)
		await waitFor(() => expect(save.disabled).toBe(false))
		fireEvent.click(save)

		await waitFor(() => expect(store.get(currentDatasetIdAtom)).not.toBe(ID))
		const newId = store.get(currentDatasetIdAtom)!
		const forked = store.get(loadedDatasetsAtom)[newId]!
		expect(forked.name).toBe("sales (edited)")
		expect(forked.versions.map((v) => v.filename)).toEqual([
			"sales.csv",
			"Edited data",
		])
		expect(forked.versions[1]!.editedFrom).toBe(forked.versions[0]!.id)
		expect(forked.latestVersionId).toBe(forked.versions[1]!.id)
		expect(forked.versions[1]!.rows[1]).toEqual({ city: "Quito", sales: "25" })
		// The imported data set is untouched.
		expect(store.get(loadedDatasetsAtom)[ID]).toEqual(imported())
		expect(screen.queryByRole("dialog")).toBeNull()

		await waitFor(() => expect(editedCells()).toEqual(["25"]))
		expect(document.querySelector("td[data-edited]")!.className).toContain(
			"vc-edited-cell"
		)
	})

	it("treats a changed header as a rename the encodings follow", async () => {
		const store = mount(imported())
		openDialog()
		fireEvent.change(textBox(), {
			target: { value: "city,revenue\nLima,10\nQuito,20\nBogotá,30" },
		})
		await waitFor(() =>
			expect(screen.getByRole("dialog").textContent).toContain(
				"renamed: sales → revenue"
			)
		)
		const save = screen.getByText("Save as new data set").closest("button")!
		await waitFor(() => expect(save.disabled).toBe(false))
		fireEvent.click(save)

		await waitFor(() => expect(store.get(currentDatasetIdAtom)).not.toBe(ID))
		const forked =
			store.get(loadedDatasetsAtom)[store.get(currentDatasetIdAtom)!]!
		expect(forked.fields[1]).toEqual({
			name: "revenue",
			inferredType: "quantitative",
			sourceNames: ["sales"],
		})
		expect(store.get(currentEncodingsAtom).y.field).toBe("revenue")
		// Values didn't change, only the header: nothing is outlined.
		await waitFor(() => expect(screen.getByText("revenue")).toBeTruthy())
		expect(editedCells()).toEqual([])
	})

	it("refuses unparseable text and an empty name, warns on a colliding name, and cancels cleanly", async () => {
		const store = mount(imported())
		const dialog = openDialog()
		const save = screen.getByText("Save as new data set").closest("button")!

		// Header only: no data row to save.
		fireEvent.change(textBox(), { target: { value: "city,sales\n" } })
		await waitFor(() =>
			expect(dialog.textContent).toContain("at least one data row")
		)
		expect(save.disabled).toBe(true)

		// A real change, but no name.
		fireEvent.change(textBox(), {
			target: { value: "city,sales\nLima,10\nQuito,25\nBogotá,30" },
		})
		await waitFor(() => expect(save.disabled).toBe(false))
		const nameBox = screen.getByLabelText("Data set name")
		fireEvent.change(nameBox, { target: { value: "  " } })
		expect(save.disabled).toBe(true)

		// The imported data set's own name: allowed, with the warning.
		fireEvent.change(nameBox, { target: { value: "sales" } })
		expect(dialog.textContent).toContain(
			"A data set named “sales” already exists"
		)
		expect(save.disabled).toBe(false)

		fireEvent.click(screen.getByText("Cancel"))
		expect(screen.queryByRole("dialog")).toBeNull()
		expect(store.get(currentDatasetIdAtom)).toBe(ID)
		expect(Object.keys(store.get(loadedDatasetsAtom))).toEqual([ID])
		expect(editedCells()).toEqual([])
	})

	it("appends a version when the data set is already a hand-edited copy", async () => {
		const store = mount(handEdited())
		await waitFor(() => expect(editedCells()).toEqual(["25"]))
		const dialog = openDialog()
		expect(dialog.textContent).toContain("already a hand-edited copy")
		fireEvent.change(textBox(), {
			target: { value: "city,sales\nLima,11\nQuito,25\nBogotá,30\nCusco,5" },
		})
		await waitFor(() =>
			expect(dialog.textContent).toContain("1 cell changed · 1 row added")
		)
		const save = screen.getByText("Save new version").closest("button")!
		await waitFor(() => expect(save.disabled).toBe(false))
		fireEvent.click(save)

		await waitFor(() =>
			expect(store.get(loadedDatasetsAtom)[ID]!.versions).toHaveLength(3)
		)
		expect(store.get(currentDatasetIdAtom)).toBe(ID)
		const v3 = store.get(loadedDatasetsAtom)[ID]!.versions[2]!
		expect(v3.editedFrom).toBe("v2")
		expect(v3.rows).toHaveLength(4)
		// Outlines accumulate against the import: both hand edits plus the
		// added row's two cells.
		await waitFor(() =>
			expect(editedCells()).toEqual(["11", "25", "Cusco", "5"])
		)
	})
})
