import { createStore, Provider } from "jotai"
import { renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { ReactNode } from "react"
import { datasetMetaFrom } from "../lib/datasetMeta"
import {
	localStorageAdapter,
	type StorageContentAdapter,
} from "../lib/storage/adapter"
import { setStorageAdapter } from "../lib/storage/registry"
import type { Dataset } from "../lib/types"
import { installInMemoryLocalStorage } from "../../../testSupport/localStorageShim"

import {
	currentDatasetIdAtom,
	datasetIndexAtom,
	previewVersionIdAtom,
} from "./atoms"
import { useEnsureCurrentDatasetLoaded } from "./useCurrentDatasetView"
import { useEditedCells } from "./useEditedCells"

/** The hand-edit outlines on the path a RELOADED session takes: the index
 *  first, the drawn version's rows on demand — and then the edit chain's
 *  BASE rows, which nothing else would have fetched, through the same
 *  per-version read. Whole-body sessions (a fresh fork) are covered by the
 *  dialog's smoke test. */

const ID = "ds-edited-lazy"

const dataset = (): Dataset => ({
	id: ID,
	name: "sales (edited)",
	fields: [
		{ name: "city", inferredType: "categorical" },
		{ name: "revenue", inferredType: "quantitative", sourceNames: ["sales"] },
	],
	versions: [
		{
			id: "v1",
			filename: "sales.csv",
			// Imported under the FORMER header: the base must compare under the
			// current name, as the view does.
			rows: [
				{ city: "Lima", sales: "10" },
				{ city: "Quito", sales: "20" },
			],
			createdAt: 0,
		},
		{
			id: "v2",
			filename: "Edited data",
			rows: [
				{ city: "Lima", revenue: "10" },
				{ city: "Quito", revenue: "25" },
			],
			createdAt: 1,
			editedFrom: "v1",
		},
		{
			id: "v3",
			filename: "Edited data",
			rows: [
				{ city: "Lima", revenue: "12" },
				{ city: "Quito", revenue: "25" },
			],
			createdAt: 2,
			editedFrom: "v2",
		},
	],
	latestVersionId: "v3",
	createdAt: 0,
})

const stubAdapter = (
	datasets: Record<string, Dataset>
): StorageContentAdapter & { log: string[] } => {
	const log: string[] = []
	return {
		...localStorageAdapter,
		capabilities: { remoteLoad: true },
		log,
		loadDatasetIndex: async () => {
			log.push("index")
			return Object.fromEntries(
				Object.entries(datasets).map(([id, d]) => [id, datasetMetaFrom(d)])
			)
		},
		loadDatasetVersion: async (id, versionId) => {
			log.push(`version:${id}:${versionId}`)
			return (
				datasets[id]?.versions.find((v) => v.id === versionId)?.rows ?? null
			)
		},
		loadDataset: async (id) => {
			log.push(`body:${id}`)
			return datasets[id] ?? null
		},
	}
}

beforeEach(() => {
	installInMemoryLocalStorage()
})
afterEach(() => {
	setStorageAdapter(localStorageAdapter)
})

const mount = (store: ReturnType<typeof createStore>) =>
	renderHook(
		() => {
			useEnsureCurrentDatasetLoaded()
			return useEditedCells()
		},
		{
			wrapper: ({ children }: { children: ReactNode }) => (
				<Provider store={store}>{children}</Provider>
			),
		}
	)

const cellsOf = (result: ReturnType<typeof useEditedCells>) =>
	[...(result?.cells.entries() ?? [])].map(([i, s]) => [i, [...s]])

describe("useEditedCells on a reloaded session", () => {
	it("fetches the chain's base version once and outlines against it under current names", async () => {
		const adapter = stubAdapter({ [ID]: dataset() })
		setStorageAdapter(adapter)
		const store = createStore()
		store.set(currentDatasetIdAtom, ID)
		store.sub(datasetIndexAtom, () => {})

		const { result } = mount(store)
		await waitFor(() => expect(result.current).not.toBeNull())
		// v3 vs v1 (not v2): both hand edits show, renamed column compared
		// under `revenue`.
		expect(cellsOf(result.current)).toEqual([
			[0, ["revenue"]],
			[1, ["revenue"]],
		])
		expect(result.current!.changedCellCount).toBe(2)
		// The drawn version, then the base — each once, and never the body.
		expect(adapter.log).toEqual([
			"index",
			`version:${ID}:v3`,
			`version:${ID}:v1`,
		])
	})

	it("outlines nothing for an imported version, and follows a preview pin", async () => {
		const adapter = stubAdapter({ [ID]: dataset() })
		setStorageAdapter(adapter)
		const store = createStore()
		store.set(currentDatasetIdAtom, ID)
		store.set(previewVersionIdAtom, "v1")
		store.sub(datasetIndexAtom, () => {})

		const { result } = mount(store)
		await waitFor(() => expect(adapter.log).toContain(`version:${ID}:v1`))
		expect(result.current).toBeNull()

		// Pin v2: its base is v1, already in memory — one more read for v2's
		// own rows, none for the base.
		store.set(previewVersionIdAtom, "v2")
		await waitFor(() => expect(result.current).not.toBeNull())
		expect(cellsOf(result.current)).toEqual([[1, ["revenue"]]])
		expect(adapter.log.filter((l) => l === `version:${ID}:v1`)).toHaveLength(1)
	})
})
