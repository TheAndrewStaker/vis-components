import { renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import type { ReactNode } from "react"
import type { Dataset } from "../lib/types"
import { chainDataset } from "../lib/versionReplay.fixtures"
import { installInMemoryLocalStorage } from "../../../testSupport/localStorageShim"
import { TestProvider, type TestStore } from "../../../testSupport/TestProvider"

import { useAppendImportVersion } from "./appendImportVersion"
import {
	currentDatasetIdAtom,
	loadedDatasetsAtom,
	previewVersionIdAtom,
} from "./atoms"
import {
	currentDatasetViewAtom,
	materializedDerivedAtom,
} from "./useCurrentDatasetView"

/** Uploading a fresh file into a working copy, at the store level: the
 *  import lands as a version, the chain's reshape and derived variables are
 *  re-done over it one version per step, the hand edit's column and the
 *  variable that read it are left out and named, and the editor follows the
 *  data set to the re-applied latest. */

beforeEach(() => {
	installInMemoryLocalStorage()
})

const setup = (dataset: Dataset) => {
	let store: TestStore | null = null
	const wrapper = ({ children }: { children: ReactNode }) => (
		<TestProvider
			initializeState={(s) => {
				store = s
				s.set(loadedDatasetsAtom, { [dataset.id]: dataset })
				s.set(currentDatasetIdAtom, dataset.id)
				s.set(previewVersionIdAtom, "v1")
			}}
		>
			{children}
		</TestProvider>
	)
	const { result } = renderHook(() => useAppendImportVersion(), { wrapper })
	return { append: result.current, store: store! }
}

const FRESH = {
	filename: "2025.csv",
	fields: [
		{ name: "Year", inferredType: "categorical" as const },
		{ name: "Jan", inferredType: "quantitative" as const },
		{ name: "Feb", inferredType: "quantitative" as const },
		{ name: "Mar", inferredType: "quantitative" as const },
	],
	rows: [{ Year: "2025", Jan: "10", Feb: "20", Mar: "30" }],
}

const names = (fields: ReadonlyArray<{ name: string }>) => fields.map((f) => f.name)

describe("appendImportVersion", () => {
	it("appends the import and replays the chain over it, skipping the hand edit's reader", async () => {
		const { append, store } = setup(chainDataset())
		const result = await append("ds-chain", FRESH)
		expect(result).toMatchObject({ ok: true, replayed: 2, skipped: ["Tagged"] })

		const ds = store.get(loadedDatasetsAtom)["ds-chain"]!
		expect(ds.versions).toHaveLength(8)
		const [raw, reshaped, derived] = ds.versions.slice(5)
		// The raw upload: an import (no editedFrom), keeping its own wide
		// columns — the root's plus the net-new one.
		expect(raw).toMatchObject({ filename: "2025.csv", rows: FRESH.rows })
		expect(raw!.editedFrom).toBeUndefined()
		expect(names(raw!.fields!)).toEqual(["Year", "Jan", "Feb", "Mar"])
		// The reshape, re-done: melted rows, the transform recorded.
		expect(reshaped).toMatchObject({
			filename: "Reshaped data",
			editedFrom: raw!.id,
			transform: { reshape: { meltFields: ["Jan", "Feb"] } },
		})
		expect(reshaped!.rows).toEqual([
			{ Year: "2025", month: "Jan", sales: "10" },
			{ Year: "2025", month: "Feb", sales: "20" },
		])
		expect(names(reshaped!.fields!)).toEqual(["Year", "month", "sales"])
		// The derived variable, re-done over the fresh melt; the one that
		// read the hand-added column is named as left out.
		expect(derived).toMatchObject({
			filename: "Derived data",
			editedFrom: reshaped!.id,
			transform: { skipped: ["Tagged"] },
		})
		expect(derived!.transform?.added?.map((v) => v.name)).toEqual(["Double"])
		expect(derived!.rows.map((r) => r.Double)).toEqual(["20", "40"])
		expect(derived!.fields).toBeUndefined()
		expect(ds.latestVersionId).toBe(derived!.id)
		expect(names(ds.fields)).toEqual(["Year", "month", "sales", "Double"])
		// The versions before the import keep the columns they had.
		expect(names(ds.versions[4]!.fields!)).toEqual([
			"Year",
			"month",
			"sales",
			"Notes",
			"Double",
			"Tagged",
		])

		// The editor follows: latest, re-applied table, ƒ on the column.
		expect(store.get(previewVersionIdAtom)).toBeNull()
		const view = store.get(currentDatasetViewAtom)!
		expect(view.versionId).toBe(derived!.id)
		expect(names(view.fields)).toEqual(["Year", "month", "sales", "Double"])
		expect([...store.get(materializedDerivedAtom).keys()]).toEqual(["Double"])
	})

	it("rejects an upload missing a root column, against the root's columns", async () => {
		const { append, store } = setup(chainDataset())
		const result = await append("ds-chain", {
			...FRESH,
			fields: FRESH.fields.filter((f) => f.name !== "Feb"),
		})
		expect(result).toEqual({
			ok: false,
			error: "Cannot add as a new version: missing column: `Feb`.",
		})
		expect(store.get(loadedDatasetsAtom)["ds-chain"]!.versions).toHaveLength(5)
	})

	it("simply appends to a data set of plain imports", async () => {
		const plain: Dataset = {
			...chainDataset(),
			id: "ds-plain",
			fields: chainDataset().versions[0]!.fields!,
			versions: [{ ...chainDataset().versions[0]!, fields: undefined }],
			latestVersionId: "v1",
		}
		const { append, store } = setup(plain)
		const result = await append("ds-plain", FRESH)
		expect(result).toMatchObject({ ok: true, replayed: 0, skipped: [] })
		const ds = store.get(loadedDatasetsAtom)["ds-plain"]!
		expect(ds.versions).toHaveLength(2)
		expect(ds.latestVersionId).toBe(ds.versions[1]!.id)
		expect(names(ds.fields)).toEqual(["Year", "Jan", "Feb", "Mar"])
	})
})
