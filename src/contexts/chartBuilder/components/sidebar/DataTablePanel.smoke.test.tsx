import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
	TestProvider,
	type TestStore,
} from "../../../../testSupport/TestProvider"
import { installInMemoryLocalStorage } from "../../../../testSupport/localStorageShim"
import {
	DEFAULT_DATA_TABLE_CONFIG,
	type DataTableConfig,
} from "../../lib/dataTableConfig"
import { buildDataset } from "../../../../testSupport/fixtures"
import { emptyEncodings } from "../../lib/types"
import {
	currentDataTableConfigAtom,
	currentDatasetIdAtom,
	currentEncodingsAtom,
	loadedDatasetsAtom,
	previewVersionIdAtom,
} from "../../store/atoms"

import { DataTablePanel } from "./DataTablePanel"

afterEach(cleanup)

const mount = (cfg: Partial<DataTableConfig> = {}) => {
	installInMemoryLocalStorage()
	const captured: { store?: TestStore } = {}
	const utils = render(
		<TestProvider
			initializeState={(s) => {
				captured.store = s
				s.set(currentDataTableConfigAtom, { ...DEFAULT_DATA_TABLE_CONFIG, ...cfg })
			}}
		>
			<DataTablePanel />
		</TestProvider>
	)
	return { ...utils, store: captured.store! }
}

describe("DataTablePanel", () => {
	it("shows only the master toggle while the table is off", () => {
		const utils = mount()
		const toggle = utils.getByLabelText(
			"Show a data table under the chart"
		) as HTMLInputElement
		expect(toggle.checked).toBe(false)
		expect(utils.queryByLabelText("Placement")).toBeNull()
		expect(utils.queryByLabelText("Caption")).toBeNull()
		expect(utils.queryByText("Table text")).toBeNull()
	})

	it("reveals every option once enabled, and writes through", () => {
		const utils = mount()
		fireEvent.click(utils.getByLabelText("Show a data table under the chart"))
		expect(utils.store.get(currentDataTableConfigAtom).enabled).toBe(true)
		for (const label of ["Placement", "Caption", "Columns", "Max rows"])
			expect(utils.getByLabelText(label)).toBeTruthy()
		expect(utils.getByText("Table text")).toBeTruthy()
		expect(utils.getByText("Header")).toBeTruthy()
		expect(utils.getByText("Rows")).toBeTruthy()

		fireEvent.change(utils.getByLabelText("Columns"), { target: { value: "all" } })
		expect(utils.store.get(currentDataTableConfigAtom).columns).toBe("all")
	})

	it("hides Stripe color while rows aren't striped", () => {
		const utils = mount({ enabled: true, striped: false })
		expect(utils.queryByLabelText("Stripe color")).toBeNull()
	})

	it("hides Columns (inert) on a chart type that aggregates, with a note why", () => {
		installInMemoryLocalStorage()
		const utils = render(
			<TestProvider
				initializeState={(s) => {
					s.set(loadedDatasetsAtom, {
						ds: buildDataset({
							id: "ds",
							name: "d",
							fields: [
								{ name: "region", inferredType: "categorical" },
								{ name: "sales", inferredType: "quantitative" },
							],
							rows: [{ region: "West", sales: "1" }],
						}),
					})
					s.set(currentDatasetIdAtom, "ds")
					s.set(previewVersionIdAtom, null)
					s.set(currentEncodingsAtom, {
						...emptyEncodings(),
						x: { field: "region" },
						length: { field: "sales" },
					})
					s.set(currentDataTableConfigAtom, { ...DEFAULT_DATA_TABLE_CONFIG, enabled: true })
				}}
			>
				<DataTablePanel />
			</TestProvider>
		)
		expect(utils.queryByLabelText("Columns")).toBeNull()
		expect(utils.getByText(/aggregates its data/)).toBeTruthy()
	})
})
