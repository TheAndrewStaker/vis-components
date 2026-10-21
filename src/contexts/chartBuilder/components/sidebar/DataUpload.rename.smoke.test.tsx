import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { TestProvider, type TestStore } from "../../../../testSupport/TestProvider"
import { buildDataset } from "../../../../testSupport/fixtures"
import { datasetContentHash } from "../../lib/datasetDedupe"
import {
	currentDatasetIdAtom,
	datasetIndexAtom,
	loadedDatasetsAtom,
	previewVersionIdAtom,
} from "../../store/atoms"
import { DataUpload } from "./DataUpload"

// The upload-prompt modal inside DataUpload calls `useNavigate`; stubbing it
// beats standing up a RouterProvider for a rename assertion.
vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => () => {},
}))

afterEach(cleanup)

/** The bound data set's name in the Upload data panel is a click-to-edit
 *  rename control. The rename lands on the dataset body AND, through the
 *  derived index, on everything that lists data sets by name (library
 *  table/grid, version badge) — one write, no mirrors. */

const ID = "ds-rename"

const dataset = (name = "Q3 Sales") =>
	buildDataset({
		id: ID,
		name,
		fields: [
			{ name: "region", inferredType: "categorical" },
			{ name: "revenue", inferredType: "quantitative" },
		],
		rows: [
			{ region: "East", revenue: "1200" },
			{ region: "West", revenue: "800" },
		],
	})

const mount = (init?: (store: TestStore) => void) => {
	let store: TestStore | null = null
	render(
		<TestProvider
			initializeState={(s) => {
				store = s
				s.set(loadedDatasetsAtom, { [ID]: dataset() })
				s.set(currentDatasetIdAtom, ID)
				s.set(previewVersionIdAtom, null)
				init?.(s)
			}}
		>
			<DataUpload />
		</TestProvider>
	)
	return store!
}

const openEditor = () => {
	fireEvent.click(screen.getByRole("button", { name: /rename data set/i }))
	return screen.getByLabelText("New data set name") as HTMLInputElement
}

describe("DataUpload data set rename", () => {
	it("renames on Enter and refreshes the content hash and index", async () => {
		const store = mount()
		expect(screen.getByRole("button", { name: /rename data set/i }).textContent).toBe(
			"Q3 Sales"
		)
		const input = openEditor()
		expect(input.value).toBe("Q3 Sales")
		fireEvent.change(input, { target: { value: "  Q3 Sales (final)  " } })
		fireEvent.keyDown(input, { key: "Enter" })

		await waitFor(() =>
			expect(store.get(loadedDatasetsAtom)[ID].name).toBe("Q3 Sales (final)")
		)
		const renamed = store.get(loadedDatasetsAtom)[ID]
		// The hash covers the name, so it must follow — or the next upload of
		// this file under its new name would miss the reuse hint.
		expect(renamed.contentHash).toBe(datasetContentHash(renamed))
		expect(renamed.contentHash).not.toBe(datasetContentHash(dataset()))
		// Everything that lists data sets by name reads the index.
		expect(store.get(datasetIndexAtom)[ID].name).toBe("Q3 Sales (final)")
		await waitFor(() => expect(screen.queryByLabelText("New data set name")).toBeNull())
		expect(screen.getByRole("button", { name: /rename data set/i }).textContent).toBe(
			"Q3 Sales (final)"
		)
	})

	it("cancels on Escape and on an emptied box", () => {
		const store = mount()
		let input = openEditor()
		fireEvent.change(input, { target: { value: "Something else" } })
		fireEvent.keyDown(input, { key: "Escape" })
		expect(screen.queryByLabelText("New data set name")).toBeNull()
		expect(store.get(loadedDatasetsAtom)[ID].name).toBe("Q3 Sales")

		input = openEditor()
		fireEvent.change(input, { target: { value: "   " } })
		fireEvent.keyDown(input, { key: "Enter" })
		expect(screen.queryByLabelText("New data set name")).toBeNull()
		expect(store.get(loadedDatasetsAtom)[ID].name).toBe("Q3 Sales")
	})

	it("warns while typing a name another data set carries, without blocking", async () => {
		const store = mount((s) => {
			s.set(loadedDatasetsAtom, {
				[ID]: dataset(),
				"ds-other": { ...dataset("Other"), id: "ds-other" },
			})
		})
		const input = openEditor()
		fireEvent.change(input, { target: { value: "other" } })
		expect(screen.getByText(/already exists/).textContent).toContain("other")
		fireEvent.keyDown(input, { key: "Enter" })
		await waitFor(() =>
			expect(store.get(loadedDatasetsAtom)[ID].name).toBe("other")
		)
		expect(store.get(loadedDatasetsAtom)["ds-other"].name).toBe("Other")
	})
})
