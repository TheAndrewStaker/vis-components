import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { buildDataset } from "../../../../testSupport/fixtures"
import {
	TestProvider,
	type TestStore,
} from "../../../../testSupport/TestProvider"
import { installInMemoryLocalStorage } from "../../../../testSupport/localStorageShim"
import { DEFAULT_AXIS_CONFIG, EMPTY_CHANNEL_CONFIGS } from "../../lib/channelConfig"
import {
	DEFAULT_DATA_TABLE_CONFIG,
	type DataTableConfig,
} from "../../lib/dataTableConfig"
import { emptyEncodings } from "../../lib/types"
import {
	currentChannelConfigsAtom,
	currentDataTableConfigAtom,
	currentDatasetIdAtom,
	currentEncodingsAtom,
	currentFieldLevelOrdersAtom,
	currentFieldOverridesAtom,
	currentVisualNameAtom,
	loadedDatasetsAtom,
	previewVersionIdAtom,
} from "../../store/atoms"

import { DataTableBlock } from "./DataTableBlock"

afterEach(cleanup)

const ID = "ds-data-table"

const mount = (cfg: Partial<DataTableConfig>) => {
	installInMemoryLocalStorage()
	const init = (s: TestStore) => {
		s.set(
			loadedDatasetsAtom,
			{
				[ID]: buildDataset({
					id: ID,
					name: "sales",
					fields: [
						{ name: "region", inferredType: "categorical" },
						{ name: "sales", inferredType: "quantitative" },
						{ name: "unused", inferredType: "categorical" },
					],
					rows: [
						{ region: "West", sales: "1200", unused: "a" },
						{ region: "East", sales: "300", unused: "b" },
						{ region: "North", sales: "50", unused: "c" },
					],
				}),
			}
		)
		s.set(currentDatasetIdAtom, ID)
		s.set(previewVersionIdAtom, null)
		s.set(currentEncodingsAtom, {
			...emptyEncodings(),
			x: { field: "region" },
			y: { field: "sales" },
		})
		s.set(currentChannelConfigsAtom, {
			...EMPTY_CHANNEL_CONFIGS,
			y: { ...DEFAULT_AXIS_CONFIG, customFormat: "$,.0f" },
		})
		s.set(currentFieldOverridesAtom, {})
		s.set(currentFieldLevelOrdersAtom, {})
		s.set(currentVisualNameAtom, "Regional sales")
		s.set(currentDataTableConfigAtom, { ...DEFAULT_DATA_TABLE_CONFIG, ...cfg })
	}
	return render(
		<TestProvider initializeState={init}>
			<DataTableBlock />
		</TestProvider>
	)
}

describe("DataTableBlock", () => {
	it("renders nothing while disabled", () => {
		const utils = mount({ enabled: false })
		expect(utils.container.innerHTML).toBe("")
	})

	it("renders a semantic table: caption, column headers, formatted cells", () => {
		const utils = mount({ enabled: true })
		const table = utils.getByRole("table")
		expect(table.querySelector("caption")?.textContent).toBe(
			"Data for Regional sales"
		)
		const headers = [...table.querySelectorAll("thead th")]
		expect(headers.map((h) => h.textContent)).toEqual(["region", "sales"])
		expect(headers.every((h) => h.getAttribute("scope") === "col")).toBe(true)
		// The y axis's Format reaches the cells, as it reaches the tooltip.
		expect(utils.getByText("$1,200")).toBeTruthy()
		// Numbers right-align by default.
		expect(utils.getByText("$1,200").className).toContain("vc-data-table-num-right")
		expect(utils.getByRole("button", { name: "Download CSV" })).toBeTruthy()
	})

	it('"All variables" shows every column', () => {
		const utils = mount({ enabled: true, columns: "all" })
		expect(utils.getAllByRole("columnheader")).toHaveLength(3)
	})

	it("uses the custom caption", () => {
		const utils = mount({ enabled: true, caption: "Sales table" })
		expect(utils.getByRole("table").querySelector("caption")?.textContent).toBe(
			"Sales table"
		)
	})

	it("cuts at Max rows and offers the rest", () => {
		const utils = mount({ enabled: true, maxRows: 2, showDownload: false })
		expect(utils.getAllByRole("row")).toHaveLength(3) // header + 2
		expect(utils.queryByRole("button", { name: "Download CSV" })).toBeNull()
		fireEvent.click(utils.getByRole("button", { name: "Show all 3 rows" }))
		expect(utils.getAllByRole("row")).toHaveLength(4)
	})

	it("behind a button: a real toggle wired with aria-expanded / aria-controls", () => {
		const utils = mount({ enabled: true, placement: "button" })
		const button = utils.getByRole("button", { name: "View data" })
		expect(button.getAttribute("aria-expanded")).toBe("false")
		const region = document.getElementById(button.getAttribute("aria-controls") ?? "")
		expect(region).toBeTruthy()
		expect(region?.hidden).toBe(true)
		expect(utils.queryByRole("table")).toBeNull()

		fireEvent.click(button)
		const hide = utils.getByRole("button", { name: "Hide data" })
		expect(hide.getAttribute("aria-expanded")).toBe("true")
		expect(region?.hidden).toBe(false)
		expect(utils.getByRole("table")).toBeTruthy()
	})
})
