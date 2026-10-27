/** The stock-examples shelf: the folder(s) the PUBLIC seed bundle
 *  (`src/seed/examples.json`) ships, registered at boot from the public seed
 *  whichever seed actually won. A private `examples.local.json` override
 *  shares the public folder's id (it was exported from a library that had
 *  it), and a library seeded under the older persist-once behaviour holds
 *  it durably — so the identity is the public seed's folder-id set, never
 *  the ephemeral overlay's registry (absent on both of those paths).
 *
 *  The app owns the shelf: it is pinned to the bottom of its sibling group,
 *  read-only in the library tree (see `isStockFolder` in
 *  library/lib/folderOrder.ts), and carries the PUBLIC seed's name on every
 *  read — `withStockFolderNames` runs at the folder load seams, so a copy
 *  persisted under an older name shows the current one everywhere and
 *  re-persists under it on its next save. */

import type { Folder } from "./types"

let names = new Map<string, string>()

/** Register the public seed's folders. Call once, before the app renders. */
export const setStockFolders = (folders: readonly Folder[]): void => {
	names = new Map(folders.map((f) => [f.id, f.name]))
}

/** Forget them (tests). */
export const clearStockFolders = (): void => {
	names = new Map()
}

export const isStockFolderId = (id: string | null | undefined): boolean =>
	id != null && names.has(id)

/** Stock folders renamed to what the public seed calls them; every other
 *  folder — and the array itself, when nothing changes — passes through
 *  untouched. */
export const withStockFolderNames = (folders: Folder[]): Folder[] => {
	if (names.size === 0) return folders
	let changed = false
	const out = folders.map((f) => {
		const name = names.get(f.id)
		if (name === undefined || name === f.name) return f
		changed = true
		return { ...f, name }
	})
	return changed ? out : folders
}
