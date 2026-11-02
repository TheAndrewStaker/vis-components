import type { Visual } from "../types"
import { isTemplate, isTrashed } from "../visualTrash"

/** The editor holds a draft started from a template that has not yet been
 * given data: a template id is set, the draft isn't a saved visual yet,
 * no data set is attached, and the template row is still a live template.
 * While pending, the draft is not saved and Save is disabled. */
export const isTemplatePending = (
	{
		templateId,
		visualId,
		datasetId,
	}: {
		templateId: string | null
		visualId: string | null
		datasetId: string | null
	},
	visuals: readonly Visual[],
): boolean => {
	if (templateId === null || visualId !== null || datasetId !== null)
		return false
	const row = visuals.find((v) => v.id === templateId)
	return row !== undefined && isTemplate(row) && !isTrashed(row)
}
