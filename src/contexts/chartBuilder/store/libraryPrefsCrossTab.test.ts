/** Library folder collapse state is device-local and shared by every tab of
 *  the origin. A tab caches the set in memory after its first write, so
 *  without cross-tab sync a stale library tab (e.g. the one left behind when
 *  a card was Cmd-clicked open) saved its old set over a newer one the next
 *  time it toggled a folder — users saw folders "randomly" re-expand. */
import { createStore } from "jotai"
import { beforeEach, describe, expect, it } from "vitest"
import { stringifyJsonDangerous } from "../../../lib/json"
import { installInMemoryLocalStorage } from "../../../testSupport/localStorageShim"
import { libraryCollapsedFoldersAtom, libraryRailCollapsedAtom } from "./atoms"

const FOLDERS_KEY = "vis-components:libraryCollapsedFolders"
const RAIL_KEY = "vis-components:libraryRailCollapsed"

let ls: Map<string, string>
beforeEach(() => {
	ls = installInMemoryLocalStorage()
})

/** What the browser does when ANOTHER tab writes: the value lands in the
 *  shared storage and this tab gets a `storage` event for that key. */
const writeFromOtherTab = (key: string, value: string[] | boolean) => {
	ls.set(key, stringifyJsonDangerous(value))
	window.dispatchEvent(new StorageEvent("storage", { key }))
}

describe("library prefs sync across tabs", () => {
	it("a stale tab's toggle keeps folders another tab collapsed", () => {
		const tab = createStore()
		const unsub = tab.sub(libraryCollapsedFoldersAtom, () => {})
		// This tab has written once, so it now holds the set in memory.
		tab.set(libraryCollapsedFoldersAtom, new Set(["a"]))

		writeFromOtherTab(FOLDERS_KEY, ["a", "b"])
		expect([...tab.get(libraryCollapsedFoldersAtom)]).toEqual(["a", "b"])

		tab.set(libraryCollapsedFoldersAtom, (prev) => new Set([...prev, "c"]))
		expect(JSON.parse(ls.get(FOLDERS_KEY) ?? "[]")).toEqual(["a", "b", "c"])
		unsub()
	})

	it("ignores writes to unrelated keys", () => {
		const tab = createStore()
		const unsub = tab.sub(libraryCollapsedFoldersAtom, () => {})
		tab.set(libraryCollapsedFoldersAtom, new Set(["a"]))
		const before = tab.get(libraryCollapsedFoldersAtom)

		writeFromOtherTab("vis-components:currentVisualId", false)
		expect(tab.get(libraryCollapsedFoldersAtom)).toBe(before)
		unsub()
	})

	it("syncs the rail-collapsed flag too", () => {
		const tab = createStore()
		const unsub = tab.sub(libraryRailCollapsedAtom, () => {})
		tab.set(libraryRailCollapsedAtom, false)

		writeFromOtherTab(RAIL_KEY, true)
		expect(tab.get(libraryRailCollapsedAtom)).toBe(true)
		unsub()
	})
})
