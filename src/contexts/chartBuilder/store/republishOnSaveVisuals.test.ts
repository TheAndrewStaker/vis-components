import { createStore } from "jotai"
import { beforeEach, describe, expect, it } from "vitest"

import { installInMemoryLocalStorage } from "../../../testSupport/localStorageShim"
import { loadRepublishOnSaveVisuals } from "../lib/storage"
import {
	republishOnSaveFor,
	republishOnSaveVisualsAtom,
	withRepublishOnSave,
} from "./atoms"

/** "Republish on every save" is a device-local map of visual id → true:
 *  sparse (off deletes the key), persisted through the same localStorage
 *  path as the other per-device conveniences, and read back by a fresh
 *  store. */

beforeEach(installInMemoryLocalStorage)

describe("republishOnSaveVisualsAtom", () => {
	it("round-trips through device storage and stays sparse", () => {
		const store = createStore()
		expect(store.get(republishOnSaveVisualsAtom)).toEqual({})
		store.set(republishOnSaveVisualsAtom, (prev) => withRepublishOnSave(prev, "dv-1", true))
		store.set(republishOnSaveVisualsAtom, (prev) => withRepublishOnSave(prev, "dv-2", true))
		expect(loadRepublishOnSaveVisuals()).toEqual({ "dv-1": true, "dv-2": true })
		store.set(republishOnSaveVisualsAtom, (prev) => withRepublishOnSave(prev, "dv-1", false))
		expect(loadRepublishOnSaveVisuals()).toEqual({ "dv-2": true })
		// A fresh store (a reload) sees the same map.
		expect(createStore().get(republishOnSaveVisualsAtom)).toEqual({ "dv-2": true })
	})

	it("helpers: read one visual; writes that change nothing keep identity", () => {
		const map = { "dv-1": true as const }
		expect(republishOnSaveFor(map, "dv-1")).toBe(true)
		expect(republishOnSaveFor(map, "dv-2")).toBe(false)
		expect(republishOnSaveFor(map, null)).toBe(false)
		expect(withRepublishOnSave(map, "dv-1", true)).toBe(map)
		expect(withRepublishOnSave(map, "dv-2", false)).toBe(map)
	})
})
