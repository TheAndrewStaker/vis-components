import { afterEach, describe, expect, it } from "vitest"

import {
	clearStockFolders,
	isStockFolderId,
	setStockFolders,
	withStockFolderNames,
} from "./stockFolders"
import type { Folder } from "./types"

const mk = (id: string, name: string): Folder => ({
	id,
	name,
	parentId: null,
	createdAt: 0,
})

afterEach(clearStockFolders)

describe("stockFolders", () => {
	it("knows nothing until registered", () => {
		expect(isStockFolderId("fl-stock")).toBe(false)
		const folders = [mk("fl-stock", "Examples")]
		expect(withStockFolderNames(folders)).toBe(folders)
	})

	it("identifies the registered ids and nothing else", () => {
		setStockFolders([mk("fl-stock", "Stock Examples")])
		expect(isStockFolderId("fl-stock")).toBe(true)
		expect(isStockFolderId("fl-user")).toBe(false)
		expect(isStockFolderId(null)).toBe(false)
	})

	it("renames a stock folder held under an older name, leaving the rest alone", () => {
		setStockFolders([mk("fl-stock", "Stock Examples")])
		const user = mk("fl-user", "Mine")
		const out = withStockFolderNames([mk("fl-stock", "Examples"), user])
		expect(out.map((f) => f.name)).toEqual(["Stock Examples", "Mine"])
		expect(out[1]).toBe(user)
	})

	it("returns the same array when every name already matches", () => {
		setStockFolders([mk("fl-stock", "Stock Examples")])
		const folders = [mk("fl-stock", "Stock Examples"), mk("fl-user", "Mine")]
		expect(withStockFolderNames(folders)).toBe(folders)
	})
})
