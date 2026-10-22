import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
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
 *  moves onto, the table outlines the changed cells, a renamed column is a
 *  variable rename the encodings follow, and editing the copy again appends
 *  a version instead of forking once more. The data is edited in a grid of
 *  cells: see the "grid" block below for its selection, clipboard, sort and
 *  row / column manners. */

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

/** The grid's cells in shown order, as rows of text. */
const gridRows = (): string[][] =>
	[...screen.getByRole("grid").querySelectorAll("tbody tr[role=row]")].map((tr) =>
		[...tr.querySelectorAll("td")].map((td) => td.textContent ?? "")
	)

const cell = (pos: number, col: number): HTMLElement => {
	const tr = screen.getByRole("grid").querySelectorAll("tbody tr[role=row]")[pos]
	const td = tr?.querySelectorAll("td")[col]
	if (!td) throw new Error(`no cell at ${pos},${col}`)
	return td
}

const proxy = () => screen.getByLabelText("Selected cells") as HTMLTextAreaElement

/** Double-click a cell, type a value, press Enter. */
const typeInto = (pos: number, col: number, value: string) => {
	fireEvent.doubleClick(cell(pos, col))
	const input = screen.getByLabelText("Cell value") as HTMLInputElement
	fireEvent.change(input, { target: { value } })
	fireEvent.keyDown(input, { key: "Enter" })
}

/** Paste tab-separated text with the given cell as the top-left corner. */
const pasteAt = (pos: number, col: number, tsv: string) => {
	fireEvent.mouseDown(cell(pos, col))
	fireEvent.paste(proxy(), {
		clipboardData: { getData: () => tsv },
	})
}

const selectedCells = (): string[] =>
	[...document.querySelectorAll('td[role=gridcell][aria-selected="true"]')].map(
		(td) => td.textContent ?? ""
	)

/** The data TABLE's hand-edit outlines (the tray behind the dialog). */
const editedCells = () =>
	[...document.querySelectorAll("table:not([role=grid]) td[data-edited]")].map(
		(td) => td.textContent
	)

describe("Edit data in the tray", () => {
	it("forks a new data set from a cell edit and outlines the changed cell", async () => {
		const store = mount(imported())
		const dialog = openDialog()
		expect(dialog.textContent).toContain("creates a new data set altogether")
		expect(gridRows()).toEqual([
			["Lima", "10"],
			["Quito", "20"],
			["Bogotá", "30"],
		])
		const save = screen.getByText("Save as new data set").closest("button")!
		expect(save.disabled).toBe(true)
		expect(dialog.textContent).toContain("No changes yet.")
		expect(
			(screen.getByLabelText("Data set name") as HTMLInputElement).value
		).toBe("sales (edited)")

		typeInto(1, 1, "25")
		// The dialog outlines the changed cell too.
		expect(cell(1, 1).getAttribute("data-edited")).toBe("true")
		expect(cell(0, 1).getAttribute("data-edited")).toBeNull()
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

	it("treats a renamed column as a rename the encodings follow", async () => {
		const store = mount(imported())
		openDialog()
		fireEvent.doubleClick(screen.getByTitle("sales — double-click to rename"))
		const nameBox = screen.getByLabelText("Column name") as HTMLInputElement
		expect(nameBox.value).toBe("sales")
		fireEvent.change(nameBox, { target: { value: "revenue" } })
		fireEvent.keyDown(nameBox, { key: "Enter" })
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

		// Every cell blanked: no data row to save.
		fireEvent.keyDown(proxy(), { key: "a", metaKey: true })
		fireEvent.keyDown(proxy(), { key: "Delete" })
		expect(gridRows()).toEqual([
			["", ""],
			["", ""],
			["", ""],
		])
		expect(dialog.textContent).toContain("at least one data row")
		expect(save.disabled).toBe(true)
		// A blank or duplicate column name can't be saved either.
		fireEvent.keyDown(proxy(), { key: "z", metaKey: true })
		expect(gridRows()[1]).toEqual(["Quito", "20"])
		fireEvent.doubleClick(screen.getByTitle("sales — double-click to rename"))
		fireEvent.change(screen.getByLabelText("Column name"), {
			target: { value: "city" },
		})
		fireEvent.keyDown(screen.getByLabelText("Column name"), { key: "Enter" })
		expect(dialog.textContent).toContain("must be unique")
		expect(save.disabled).toBe(true)
		fireEvent.keyDown(proxy(), { key: "z", metaKey: true })

		// A real change, but no name.
		typeInto(1, 1, "25")
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
		expect(dialog.textContent).toContain("already a working copy")
		typeInto(0, 1, "11")
		fireEvent.click(screen.getByText("+ Add row"))
		expect(gridRows()).toHaveLength(4)
		pasteAt(3, 0, "Cusco\t5")
		expect(gridRows()[3]).toEqual(["Cusco", "5"])
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

	describe("grid", () => {
		it("sorts the shown rows by a column without reordering the saved rows", async () => {
			const store = mount(imported())
			const dialog = openDialog()
			const sort = screen.getByLabelText("Sort by sales")
			fireEvent.click(sort)
			expect(gridRows().map((r) => r[0])).toEqual(["Lima", "Quito", "Bogotá"])
			fireEvent.click(sort)
			expect(gridRows().map((r) => r[0])).toEqual(["Bogotá", "Quito", "Lima"])
			expect(
				screen.getByTitle("sales — double-click to rename").getAttribute("aria-sort")
			).toBe("descending")
			// Edit through the sorted view: the top row is Bogotá now.
			typeInto(0, 1, "31")
			await waitFor(() =>
				expect(dialog.textContent).toContain("1 cell changed")
			)
			fireEvent.click(screen.getByText("Save as new data set"))
			await waitFor(() => expect(store.get(currentDatasetIdAtom)).not.toBe(ID))
			const forked =
				store.get(loadedDatasetsAtom)[store.get(currentDatasetIdAtom)!]!
			expect(forked.versions[1]!.rows).toEqual([
				{ city: "Lima", sales: "10" },
				{ city: "Quito", sales: "20" },
				{ city: "Bogotá", sales: "31" },
			])
			// A third click clears the sort.
			openDialog()
			const sort2 = screen.getByLabelText("Sort by sales")
			fireEvent.click(sort2)
			fireEvent.click(sort2)
			fireEvent.click(sort2)
			expect(gridRows().map((r) => r[0])).toEqual(["Lima", "Quito", "Bogotá"])
		})

		it("selects by drag, row number and column name; Delete clears, ⌘Z undoes", () => {
			mount(imported())
			openDialog()
			// Drag from (0,0) to (1,1).
			fireEvent.mouseDown(cell(0, 0))
			fireEvent.mouseEnter(cell(1, 1))
			fireEvent.mouseUp(window)
			expect(selectedCells()).toEqual(["Lima", "10", "Quito", "20"])
			fireEvent.keyDown(proxy(), { key: "Delete" })
			expect(gridRows()).toEqual([
				["", ""],
				["", ""],
				["Bogotá", "30"],
			])
			fireEvent.keyDown(proxy(), { key: "z", metaKey: true })
			expect(gridRows()[0]).toEqual(["Lima", "10"])
			fireEvent.keyDown(proxy(), { key: "z", metaKey: true, shiftKey: true })
			expect(gridRows()[0]).toEqual(["", ""])
			fireEvent.click(screen.getByText("Undo"))
			expect(gridRows()[0]).toEqual(["Lima", "10"])

			// A row number selects the row; Shift+click on another extends.
			fireEvent.mouseDown(screen.getByText("3"))
			expect(selectedCells()).toEqual(["Bogotá", "30"])
			fireEvent.mouseDown(screen.getByText("2"), { shiftKey: true })
			expect(selectedCells()).toEqual(["Quito", "20", "Bogotá", "30"])
			expect(screen.getByText("Delete 2 rows")).toBeTruthy()

			// A column name selects the column.
			fireEvent.mouseDown(screen.getByTitle("city — double-click to rename"))
			expect(selectedCells()).toEqual(["Lima", "Quito", "Bogotá"])
			expect(screen.getByText("Delete 3 rows")).toBeTruthy()
			expect(screen.getByText("Delete column")).toBeTruthy()

			// Arrows move the focus; Shift+arrow extends.
			fireEvent.mouseDown(cell(0, 0))
			fireEvent.keyDown(proxy(), { key: "ArrowRight" })
			fireEvent.keyDown(proxy(), { key: "ArrowDown", shiftKey: true })
			expect(selectedCells()).toEqual(["10", "20"])
		})

		it("copies the selection as TSV, pastes a block (growing rows) and fills a range from one value", () => {
			mount(imported())
			openDialog()
			fireEvent.mouseDown(cell(0, 0))
			fireEvent.mouseEnter(cell(1, 1))
			const setData = vi.fn()
			fireEvent.keyDown(proxy(), { key: "c", metaKey: true })
			fireEvent.copy(proxy(), { clipboardData: { setData } })
			expect(setData).toHaveBeenCalledWith("text/plain", "Lima\t10\nQuito\t20")

			// A block pasted at the last row grows the table.
			pasteAt(2, 0, "Cusco\t5\nArequipa\t7\n")
			expect(gridRows()).toEqual([
				["Lima", "10"],
				["Quito", "20"],
				["Cusco", "5"],
				["Arequipa", "7"],
			])
			expect(selectedCells()).toEqual(["Cusco", "5", "Arequipa", "7"])

			// One value over a range fills it.
			fireEvent.mouseDown(cell(0, 1))
			fireEvent.mouseEnter(cell(3, 1))
			fireEvent.paste(proxy(), { clipboardData: { getData: () => "0" } })
			expect(gridRows().map((r) => r[1])).toEqual(["0", "0", "0", "0"])

			// Cut copies then clears.
			fireEvent.mouseDown(cell(0, 0))
			const cutData = vi.fn()
			fireEvent.cut(proxy(), { clipboardData: { setData: cutData } })
			expect(cutData).toHaveBeenCalledWith("text/plain", "Lima")
			expect(gridRows()[0]).toEqual(["", "0"])
		})

		it("writes a typed number the column's way (commas, dollars, percent)", async () => {
			const store = mount(
				buildDatasetFixture({
					id: ID,
					name: "sales",
					fields: [
						{ name: "city", inferredType: "categorical" },
						{ name: "revenue", inferredType: "quantitative" },
						{ name: "cost", inferredType: "quantitative" },
						{ name: "share", inferredType: "quantitative" },
					],
					rows: [
						{ city: "Lima", revenue: "2,123,123", cost: "$1,234.56", share: "14%" },
						{ city: "Quito", revenue: "45", cost: "$0.50", share: "25%" },
					],
				})
			)
			openDialog()
			typeInto(1, 1, "2222")
			typeInto(1, 2, "7")
			typeInto(1, 3, "5")
			// A pasted block is written the same way; text is left alone.
			pasteAt(0, 1, "1234567\tn/a")
			expect(gridRows()).toEqual([
				["Lima", "1,234,567", "n/a", "14%"],
				["Quito", "2,222", "$7.00", "5%"],
			])
			fireEvent.click(screen.getByText("Save as new data set"))
			await waitFor(() => expect(store.get(currentDatasetIdAtom)).not.toBe(ID))
			const forked =
				store.get(loadedDatasetsAtom)[store.get(currentDatasetIdAtom)!]!
			expect(forked.versions[1]!.rows[1]).toEqual({
				city: "Quito",
				revenue: "2,222",
				cost: "$7.00",
				share: "5%",
			})
		})

		it("adds and deletes rows and columns from the toolbar; typing edits the focus cell", () => {
			mount(imported())
			openDialog()
			fireEvent.click(screen.getByText("+ Add column"))
			// The new column opens its name box, prefilled and selected.
			const nameBox = screen.getByLabelText("Column name") as HTMLInputElement
			expect(nameBox.value).toBe("Column 3")
			fireEvent.change(nameBox, { target: { value: "region" } })
			fireEvent.keyDown(nameBox, { key: "Enter" })
			expect(screen.getByTitle("region — double-click to rename")).toBeTruthy()
			expect(gridRows()[0]).toEqual(["Lima", "10", ""])

			// Typing over a selected cell starts an edit with that character.
			fireEvent.mouseDown(cell(0, 2))
			fireEvent.keyDown(proxy(), { key: "S" })
			const input = screen.getByLabelText("Cell value") as HTMLInputElement
			expect(input.value).toBe("S")
			fireEvent.change(input, { target: { value: "South" } })
			fireEvent.keyDown(input, { key: "Tab" })
			expect(gridRows()[0]).toEqual(["Lima", "10", "South"])
			// Escape inside the editor cancels the edit, not the dialog.
			fireEvent.doubleClick(cell(1, 2))
			fireEvent.change(screen.getByLabelText("Cell value"), {
				target: { value: "North" },
			})
			fireEvent.keyDown(screen.getByLabelText("Cell value"), { key: "Escape" })
			expect(gridRows()[1]).toEqual(["Quito", "20", ""])
			expect(screen.getByRole("dialog")).toBeTruthy()

			fireEvent.mouseDown(screen.getByTitle("sales — double-click to rename"))
			fireEvent.click(screen.getByText("Delete column"))
			expect(gridRows()[0]).toEqual(["Lima", "South"])

			fireEvent.mouseDown(screen.getByText("2"))
			fireEvent.click(screen.getByText("Delete row"))
			expect(gridRows()).toEqual([
				["Lima", "South"],
				["Bogotá", ""],
			])
			fireEvent.click(screen.getByText("+ Add row"))
			expect(gridRows()).toHaveLength(3)
			expect(selectedCells()).toEqual([""])
		})
	})
})
