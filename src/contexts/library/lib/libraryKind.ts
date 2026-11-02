import { isTemplate } from "../../chartBuilder/lib/visualTrash"
import type { Visual } from "../../chartBuilder/lib/types"

/** The library's Visuals | Templates | All filter, as carried in the
 *  `?kind=` search param. Absent (`undefined`) = ordinary visuals only, so
 *  the clean URL keeps showing what the library always showed. */
export type LibraryKind = "templates" | "all"

export const parseLibraryKind = (raw: unknown): LibraryKind | undefined =>
	raw === "templates" || raw === "all" ? raw : undefined

/** Row predicate for one `kind`: absent → not a template; "templates" →
 *  templates only; "all" → everything. Shared by the grid, the table and
 *  the folder tree so the three listings always agree. */
export const kindPredicate = (
	kind: LibraryKind | undefined
): ((v: Pick<Visual, "template">) => boolean) => {
	if (kind === "all") return () => true
	if (kind === "templates") return (v) => isTemplate(v)
	return (v) => !isTemplate(v)
}
