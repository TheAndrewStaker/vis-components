// The header half of the stale-build guard (see staleBuild.ts), kept free of
// React so a Node consumer (the MCP package) can name the same content
// version this build writes without pulling in the banner hook.

import { CONTENT_MIGRATIONS } from "./migrations"

export const CONTENT_VERSION_HEADER = "x-vis-content-version"

/** The versioned collection a write to `collection` is judged against:
 *  the collection itself, or `visuals` for a published embed (its payload
 *  IS a visual). Sub-resource paths (`datasets/<id>`) resolve to their
 *  collection. `null` for an unversioned collection. */
export const guardedCollection = (collection: string): string | null => {
	const base = collection.split("/")[0] ?? ""
	const guarded = base === "embeds" ? "visuals" : base
	return guarded in CONTENT_MIGRATIONS ? guarded : null
}

/** The header a write to `collection` carries — empty for an unversioned
 *  collection. */
export const contentVersionHeader = (
	collection: string
): Record<string, string> => {
	const guarded = guardedCollection(collection)
	return guarded === null
		? {}
		: { [CONTENT_VERSION_HEADER]: String(CONTENT_MIGRATIONS[guarded].currentVersion) }
}
