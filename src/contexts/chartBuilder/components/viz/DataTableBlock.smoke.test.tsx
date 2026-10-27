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
		expect(utils.getByText("$1,200").className).toContain("vc-data-table-align-right")
		expect(utils.getByRole("button", { name: "Download CSV" })).toBeTruthy()
	})

	it('"Select variables" shows only the checked ones, in the data\'s order', () => {
		const utils = mount({
			enabled: true,
			columns: "select",
			selectedColumns: ["unused", "region"],
		})
		expect(utils.getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
			"region",
			"unused",
		])
	})

	it('"All variables" shows every column', () => {
		const utils = mount({ enabled: true, columns: "all" })
		expect(utils.getAllByRole("columnheader")).toHaveLength(3)
	})

	it("puts the title above (as the table's caption element) and the caption below", () => {
		const utils = mount({ enabled: true, title: "Sales table", caption: "Source: survey" })
		const table = utils.getByRole("table")
		expect(table.querySelector("caption")?.textContent).toBe("Sales table")
		const below = utils.getByText("Source: survey")
		expect(below.tagName).toBe("P")
		expect(table.getAttribute("aria-describedby")).toContain(below.id)
	})

	it("renders no caption paragraph when the caption is empty", () => {
		const utils = mount({ enabled: true })
		expect(utils.container.querySelector(".vc-data-table-caption")).toBeNull()
	})

	it("aligns text columns left and number columns right by default, header included", () => {
		const utils = mount({ enabled: true })
		const [regionHead, salesHead] = utils.getAllByRole("columnheader")
		expect(regionHead!.className).toBe("vc-data-table-align-left")
		expect(salesHead!.className).toBe("vc-data-table-align-right")
		expect(utils.getByText("$1,200").className).toBe("vc-data-table-align-right")
	})

	it("styles the first column's body cells on their own only when unchecked", () => {
		const same = mount({ enabled: true })
		expect(same.container.querySelector(".vc-data-table-first")).toBeNull()
		cleanup()
		const own = mount({ enabled: true, firstColumnLikeOthers: false, firstColumnFontWeight: 700 })
		expect(own.getByText("West").classList.contains("vc-data-table-first")).toBe(true)
		expect(own.getByText("$1,200").classList.contains("vc-data-table-first")).toBe(false)
		const block = own.container.querySelector<HTMLElement>("[data-data-table]")!
		expect(block.style.getPropertyValue("--vc-dt-first-weight")).toBe("700")
	})

	it("a column's own alignment wins", () => {
		const utils = mount({ enabled: true, columnAlign: { region: "center", sales: "left" } })
		const [regionHead, salesHead] = utils.getAllByRole("columnheader")
		expect(regionHead!.className).toBe("vc-data-table-align-center")
		expect(salesHead!.className).toBe("vc-data-table-align-left")
		expect(utils.getByText("West").className).toBe("vc-data-table-align-center")
	})

	it("cuts at Max rows and offers the rest", () => {
		const utils = mount({ enabled: true, maxRows: 2, showDownload: false })
		expect(utils.getAllByRole("row")).toHaveLength(3) // header + 2
		expect(utils.queryByRole("button", { name: "Download CSV" })).toBeNull()
		fireEvent.click(utils.getByRole("button", { name: "Show all 3 rows" }))
		expect(utils.getAllByRole("row")).toHaveLength(4)
		// …and back to the cut, from the same button.
		fireEvent.click(utils.getByRole("button", { name: "Show first 2 rows" }))
		expect(utils.getAllByRole("row")).toHaveLength(3)
		expect(utils.getByRole("button", { name: "Show all 3 rows" })).toBeTruthy()
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
