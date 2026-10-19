import type { Folder } from "../../chartBuilder/lib/types"

/** Reserved folder-selection value meaning "visuals not in any folder".
 *  Lives in the same URL slot as a folder id (`?folder=unfiled`), so it
 *  must never collide with a real id — real ids are `fl-…`. Absent/null
 *  still means "all visualizations". */
export const UNFILED_FOLDER_ID = "unfiled"

/** The visual filter a sidebar selection implies: null → everything;
 *  `UNFILED_FOLDER_ID` → only visuals with no folder; a folder id → that
 *  folder's whole subtree. Takes the visual's folderId (undefined and null
 *  both mean root). */
export const folderSelectionPredicate = (
	folders: Folder[],
	selectedFolderId: string | null
): ((visualFolderId: string | null | undefined) => boolean) => {
	if (selectedFolderId === null) return () => true
	if (selectedFolderId === UNFILED_FOLDER_ID) {
		return (visualFolderId) => (visualFolderId ?? null) === null
	}
	const subtree = folderSubtreeIds(folders, selectedFolderId)
	return (visualFolderId) =>
		visualFolderId !== null &&
		visualFolderId !== undefined &&
		subtree.has(visualFolderId)
}

/** The folder plus all of its descendants. Selecting a folder in the
 *  sidebar filters to its whole subtree's visuals, not just direct
 *  children. The seen-check doubles as a guard against corrupt data
 *  with a parentId cycle. */
export const folderSubtreeIds = (
	folders: Folder[],
	folderId: string
): Set<string> => {
	const ids = new Set<string>()
	const collect = (id: string) => {
		if (ids.has(id)) return
		ids.add(id)
		for (const f of folders) {
			if (f.parentId === id) collect(f.id)
		}
	}
	collect(folderId)
	return ids
}

/** The folder's path from the root down to (and including) itself — the
 *  editor's breadcrumb trail. Empty for a null/unknown id. Stops at a
 *  missing parent or a parentId cycle rather than looping. */
export const folderAncestors = (
	folders: readonly Folder[],
	folderId: string | null | undefined
): Folder[] => {
	const path: Folder[] = []
	const seen = new Set<string>()
	let cursor = folderId ?? null
	while (cursor !== null && !seen.has(cursor)) {
		seen.add(cursor)
		const folder = folders.find((f) => f.id === cursor)
		if (!folder) break
		path.unshift(folder)
		cursor = folder.parentId
	}
	return path
}
