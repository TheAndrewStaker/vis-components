import { cleanup, createEvent, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { buildDataset } from "../../../../testSupport/fixtures"
import { installInMemoryLocalStorage } from "../../../../testSupport/localStorageShim"
import { TestProvider, type TestStore } from "../../../../testSupport/TestProvider"
import type { Dataset, Field } from "../../lib/types"
import {
	currentDatasetIdAtom,
	currentReshapeConfigAtom,
	loadedDatasetsAtom,
} from "../../store/atoms"

import { DataTable } from "./DataTable"

/** Dragging a column header reorders the DATA SET's columns (every version's
 *  own list included), and the drag is off while a reshape is applied. */

afterEach(cleanup)

const ID = "ds-reorder-table"

const FIELDS: Field[] = [
	{ name: "city", inferredType: "categorical" },
	{ name: "sales", inferredType: "quantitative" },
	{ name: "units", inferredType: "quantitative" },
]
const ROWS = [
	{ city: "Lima", sales: "10", units: "1" },
	{ city: "Quito", sales: "20", units: "2" },
]

const dataset = (): Dataset =>
	buildDataset({
		id: ID,
		name: "sales",
		fields: FIELDS,
		versions: [
			{
				id: "v1",
				filename: "sales.csv",
				rows: ROWS,
				createdAt: 0,
				fields: [{ name: "old", inferredType: "categorical" }, ...FIELDS],
			},
			{ id: "v2", filename: "sales.csv", rows: ROWS, createdAt: 1 },
		],
	})

let store: TestStore
const mount = (init?: (s: TestStore) => void) => {
	const storage = installInMemoryLocalStorage()
	/* eslint-disable @vc/use-wrapped-json-functions */
	storage.set("vis-components:datasets", JSON.stringify({ [ID]: dataset() }))
	storage.set("vis-components:currentDatasetId", JSON.stringify(ID))
	/* eslint-enable @vc/use-wrapped-json-functions */
	return render(
		<TestProvider
			initializeState={(s) => {
				store = s
				s.set(loadedDatasetsAtom, { [ID]: dataset() })
				s.set(currentDatasetIdAtom, ID)
				init?.(s)
			}}
		>
			<DataTable />
		</TestProvider>
	)
}

const headers = () =>
	[...document.querySelectorAll("thead th[scope=col]")]
		.map((th) => th.querySelector("div > button[title]")?.textContent?.trim() ?? "")
		.filter((t) => t !== "")

const headerOf = (name: string) =>
	document.querySelector(`thead th button[title="${name}"]`)!.closest("th")!

const makeFakeDataTransfer = () => {
	const data: Record<string, string> = {}
	return {
		setData: (k: string, v: string) => {
			data[k] = v
		},
		getData: (k: string) => data[k] ?? "",
		effectAllowed: "all",
		dropEffect: "none",
	}
}

/** Drop `source` onto the given half of `target`. */
const drag = (source: HTMLElement, target: HTMLElement, half: "left" | "right") => {
	const dataTransfer = makeFakeDataTransfer()
	const left = 100
	const width = 80
	target.getBoundingClientRect = () =>
		({ left, width, right: left + width, top: 0, bottom: 20, height: 20, x: left, y: 0 }) as DOMRect
	const clientX = half === "left" ? left + 1 : left + width - 1
	const dragEvent = (kind: "dragOver" | "drop", node: HTMLElement) => {
		const event = createEvent[kind](node, { dataTransfer })
		Object.defineProperty(event, "clientX", { value: clientX })
		fireEvent(node, event)
	}
	fireEvent.dragStart(source, { dataTransfer })
	dragEvent("dragOver", target)
	dragEvent("drop", target)
	fireEvent.dragEnd(source, { dataTransfer })
}

describe("DataTable — drag a column header to reorder", () => {
	it("moves the column in the data set and in an older version's own list", async () => {
		mount()
		expect(headers()).toEqual(["city", "sales", "units"])
		drag(headerOf("units"), headerOf("city"), "left")
		await new Promise((r) => setTimeout(r, 0))
		expect(headers()).toEqual(["units", "city", "sales"])
		const d = store.get(loadedDatasetsAtom)[ID]!
		expect(d.fields.map((f) => f.name)).toEqual(["units", "city", "sales"])
		expect(d.versions[0]!.fields!.map((f) => f.name)).toEqual(["units", "city", "sales", "old"])
		expect(d.versions[0]!.rows).toBe(ROWS)

		// Onto the right half of the last column: to the end.
		drag(headerOf("units"), headerOf("sales"), "right")
		await new Promise((r) => setTimeout(r, 0))
		expect(headers()).toEqual(["city", "sales", "units"])
	})

	it("is a no-op drop next to where the column already is", async () => {
		mount()
		drag(headerOf("sales"), headerOf("units"), "left")
		await new Promise((r) => setTimeout(r, 0))
		expect(headers()).toEqual(["city", "sales", "units"])
	})

	it("does not drag while a reshape is applied", () => {
		mount((s) =>
			s.set(currentReshapeConfigAtom, {
				idFields: ["city"],
				meltFields: ["sales", "units"],
				variableName: "measure",
				valueName: "value",
			})
		)
		expect(document.querySelector("thead th[draggable=true]")).toBeNull()
	})
})
