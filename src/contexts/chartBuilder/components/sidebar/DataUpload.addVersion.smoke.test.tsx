import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { TestProvider, type TestStore } from "../../../../testSupport/TestProvider"
import { installInMemoryLocalStorage } from "../../../../testSupport/localStorageShim"
import type { ParsedUpload } from "../../lib/types"
import { chainDataset } from "../../lib/versionReplay.fixtures"
import {
	currentDatasetIdAtom,
	loadedDatasetsAtom,
	pendingUploadAtom,
	previewVersionIdAtom,
} from "../../store/atoms"
import { DataUpload } from "./DataUpload"

// The upload-prompt modal calls `useNavigate`; stubbing it beats standing up
// a RouterProvider for a dialog assertion.
vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => () => {},
}))

afterEach(cleanup)

/** The Add-data prompt on a working copy: the upload is judged against the
 *  import the copy descends from, the dialog says which of the copy's
 *  reshape / derived variables the new version will inherit and which it
 *  can't, and "Add version" lands the import plus the replayed versions. */

const FRESH: ParsedUpload = {
	filename: "2025.csv",
	fields: [
		{ name: "Year", inferredType: "categorical" },
		{ name: "Jan", inferredType: "quantitative" },
		{ name: "Feb", inferredType: "quantitative" },
	],
	rows: [{ Year: "2025", Jan: "10", Feb: "20" }],
}

const mount = (pending: ParsedUpload) => {
	installInMemoryLocalStorage()
	let store: TestStore | null = null
	render(
		<TestProvider
			initializeState={(s) => {
				store = s
				const ds = chainDataset()
				s.set(loadedDatasetsAtom, { [ds.id]: ds })
				s.set(currentDatasetIdAtom, ds.id)
				s.set(previewVersionIdAtom, null)
				s.set(pendingUploadAtom, pending)
			}}
		>
			<DataUpload />
		</TestProvider>
	)
	return store!
}

describe("DataUpload add-version prompt on a working copy", () => {
	it("accepts the original wide shape and previews what will re-apply", async () => {
		const store = mount(FRESH)
		expect(
			screen.getByText(/Will re-apply: reshape \(wide → long\), “Double”\./)
		).toBeTruthy()
		expect(screen.getByText(/Can.t re-apply: “Tagged” \(needs “Notes”\)/)).toBeTruthy()
		const add = screen.getByRole("button", { name: "Add version" })
		expect(add.hasAttribute("disabled")).toBe(false)
		fireEvent.click(add)
		await waitFor(() =>
			expect(store.get(loadedDatasetsAtom)["ds-chain"]!.versions).toHaveLength(8)
		)
		expect(store.get(pendingUploadAtom)).toBeNull()
		const ds = store.get(loadedDatasetsAtom)["ds-chain"]!
		expect(ds.versions.slice(5).map((v) => v.filename)).toEqual([
			"2025.csv",
			"Reshaped data",
			"Derived data",
		])
		expect(ds.latestVersionId).toBe(ds.versions[7]!.id)
	})

	it("still refuses a file that drops a column of the import", () => {
		mount({ ...FRESH, fields: FRESH.fields.slice(0, 2) })
		expect(
			screen.getByText(/Cannot add as a new version: missing column: `Feb`\./)
		).toBeTruthy()
		expect(screen.queryByText(/Will re-apply/)).toBeNull()
		expect(
			screen.getByRole("button", { name: "Add version" }).hasAttribute("disabled")
		).toBe(true)
	})
})
