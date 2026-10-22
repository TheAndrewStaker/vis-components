import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { buildDataset } from "../../../testSupport/fixtures"
import { installInMemoryLocalStorage } from "../../../testSupport/localStorageShim"
import { TestProvider } from "../../../testSupport/TestProvider"
import type { Dataset } from "../lib/types"
import { currentDatasetIdAtom, loadedDatasetsAtom } from "../store/atoms"

import { VersionBadge } from "./VersionBadge"

/** The version badge after a hand edit: it reads the edited copy's version
 *  count, and the popover tags hand-edited versions. */

afterEach(cleanup)

const ID = "ds-badge-edited"

const dataset = (): Dataset =>
	buildDataset({
		id: ID,
		name: "sales (edited)",
		fields: [{ name: "a", inferredType: "quantitative" }],
		versions: [
			{ id: "v1", filename: "sales.csv", rows: [{ a: "1" }], createdAt: 0 },
			{
				id: "v2",
				filename: "Edited data",
				rows: [{ a: "2" }],
				createdAt: 1,
				editedFrom: "v1",
			},
		],
	})

/** A working copy made by computation: reshaped, then given a column. */
const computed = (): Dataset =>
	buildDataset({
		id: ID,
		name: "sales (reshaped)",
		fields: [
			{ name: "k", inferredType: "categorical" },
			{ name: "v", inferredType: "quantitative" },
			{ name: "double", inferredType: "quantitative" },
		],
		versions: [
			{
				id: "v1",
				filename: "sales.csv",
				rows: [{ a: "1" }],
				createdAt: 0,
				fields: [{ name: "a", inferredType: "quantitative" }],
			},
			{
				id: "v2",
				filename: "Reshaped data",
				rows: [{ k: "a", v: "1" }],
				createdAt: 1,
				editedFrom: "v1",
				fields: [
					{ name: "k", inferredType: "categorical" },
					{ name: "v", inferredType: "quantitative" },
				],
				transform: {
					reshape: { idFields: [], meltFields: ["a"], variableName: "k", valueName: "v" },
				},
			},
			{
				id: "v3",
				filename: "Derived data",
				rows: [{ k: "a", v: "1", double: "2" }],
				createdAt: 2,
				editedFrom: "v2",
				transform: {
					added: [{ id: "d", name: "double", kind: "math", math: { formula: "{v} * 2" } }],
				},
			},
		],
	})

const mount = (build: () => Dataset = dataset) => {
	const storage = installInMemoryLocalStorage()
	/* eslint-disable @vc/use-wrapped-json-functions */
	storage.set("vis-components:datasets", JSON.stringify({ [ID]: build() }))
	storage.set("vis-components:currentDatasetId", JSON.stringify(ID))
	/* eslint-enable @vc/use-wrapped-json-functions */
	return render(
		<TestProvider
			initializeState={(s) => {
				s.set(loadedDatasetsAtom, { [ID]: build() })
				s.set(currentDatasetIdAtom, ID)
			}}
		>
			<VersionBadge />
		</TestProvider>
	)
}

describe("VersionBadge with a hand-edited version", () => {
	it("counts the copy's versions and tags the edited one in the popover", () => {
		mount()
		const badge = screen.getByTitle("Data set versions")
		expect(badge.textContent).toContain("sales (edited)")
		expect(badge.textContent).toContain("v2 of 2 · latest")

		fireEvent.click(badge)
		const items = [...document.querySelectorAll("li")].map(
			(li) => li.textContent
		)
		expect(items).toHaveLength(2)
		expect(items[0]).toContain("Edited data · edited by hand")
		expect(items[1]).toContain("sales.csv")
		expect(items[1]).not.toContain("edited by hand")
	})

	it("tags reshaped and derived versions with what made them", () => {
		mount(computed)
		const badge = screen.getByTitle("Data set versions")
		expect(badge.textContent).toContain("v3 of 3 · latest")
		fireEvent.click(badge)
		const items = [...document.querySelectorAll("li")].map((li) => li.textContent)
		expect(items[0]).toContain("Derived data · added “double”")
		expect(items[1]).toContain("Reshaped data · reshaped (wide → long)")
		expect(items[2]).toContain("sales.csv")
		expect(items[2]).not.toContain("·  ")
	})
})
