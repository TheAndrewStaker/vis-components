/** The import must not claim success before storage has accepted the
 *  writes. The atoms' own saves are fire-and-forget; an import that reported
 *  "Imported 1 visualization" while the server rejected the PUT left a visual
 *  that vanished on the next load. */
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { ReactNode } from "react"
import { stringifyJsonDangerous } from "../../../lib/json"
import { TestProvider, type TestStore } from "../../../testSupport/TestProvider"
import { installInMemoryLocalStorage } from "../../../testSupport/localStorageShim"
import {
	localStorageAdapter,
	type StorageContentAdapter,
} from "../lib/storage/adapter"
import { setStorageAdapter } from "../lib/storage/registry"
import { visualsAtom } from "./atoms"
import { useImportLibraryBundle } from "./importBundle"

beforeEach(() => {
	installInMemoryLocalStorage()
})

afterEach(() => {
	cleanup()
	setStorageAdapter(localStorageAdapter)
})

const renderInStore = <T,>(hook: () => T) => {
	const captured: { store?: TestStore } = {}
	const { result } = renderHook(hook, {
		wrapper: ({ children }: { children: ReactNode }) => (
			<TestProvider
				initializeState={(s) => {
					captured.store = s
				}}
			>
				{children}
			</TestProvider>
		),
	})
	return { result, store: captured.store! }
}

const bundleFile = (value: unknown): File =>
	new File([stringifyJsonDangerous(value as never)], "bundle.json", {
		type: "application/json",
	})

const minimalBundle = () => ({
	visuals: [
		{
			id: "vs-chart-1",
			name: "My chart",
			folderId: null,
			datasetId: "ds-data-1",
			createdAtVersionId: "dv-data-1",
		},
	],
	datasets: {
		"ds-data-1": {
			id: "ds-data-1",
			name: "My data",
			fields: [{ name: "sales", inferredType: "quantitative" }],
			versions: [
				{ id: "dv-data-1", filename: "d.csv", createdAt: 0, rows: [{ sales: "1" }] },
			],
			latestVersionId: "dv-data-1",
			createdAt: 0,
		},
	},
	folders: [],
})

describe("useImportLibraryBundle", () => {
	it("imports a well-formed bundle and reports what landed", async () => {
		const { result, store } = renderInStore(() => useImportLibraryBundle())
		let outcome!: Awaited<ReturnType<typeof result.current.importBundle>>
		await act(async () => {
			outcome = await result.current.importBundle(bundleFile(minimalBundle()))
		})
		expect(outcome.ok).toBe(true)
		expect(outcome.message).toMatch(/Imported 1 visualization and 1 data set/)
		expect(store.get(visualsAtom).map((v) => v.id)).toContain("vs-chart-1")
	})

	it("rejects a bad file with the problem list and changes nothing", async () => {
		const { result, store } = renderInStore(() => useImportLibraryBundle())
		const bad = minimalBundle()
		bad.visuals[0]!.id = ""
		bad.visuals[0]!.datasetId = "ds-elsewhere"
		let outcome!: Awaited<ReturnType<typeof result.current.importBundle>>
		await act(async () => {
			outcome = await result.current.importBundle(bundleFile(bad))
		})
		expect(outcome.ok).toBe(false)
		expect(outcome.message).toMatch(/the file has 2 problems\. Nothing was changed/)
		expect(outcome.problems).toEqual([
			'visualization #1 ("My chart") has no id',
			'visualization #1 ("My chart") points at data set "ds-elsewhere", which isn\'t in the file (a visual\'s data travels inside the same bundle)',
		])
		expect(store.get(visualsAtom)).toEqual([])
	})

	it("reports a storage failure instead of success", async () => {
		const rejecting: StorageContentAdapter = {
			...localStorageAdapter,
			saveVisuals: async () => {
				throw new Error("PUT /api/visuals/vs-chart-1 failed: 400")
			},
		}
		setStorageAdapter(rejecting)
		const { result } = renderInStore(() => useImportLibraryBundle())
		let outcome!: Awaited<ReturnType<typeof result.current.importBundle>>
		await act(async () => {
			outcome = await result.current.importBundle(bundleFile(minimalBundle()))
		})
		expect(outcome.ok).toBe(false)
		expect(outcome.message).toMatch(
			/Import failed while saving: PUT \/api\/visuals\/vs-chart-1 failed: 400/
		)
		expect(outcome.message).toMatch(/reload the page/)
		expect(outcome.problems).toBeUndefined()
	})
})
