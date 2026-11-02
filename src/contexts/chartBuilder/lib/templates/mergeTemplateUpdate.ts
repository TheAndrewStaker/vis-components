import type { AppUser } from "../../../../lib/currentUser"
import type { TemplateMeta, Visual } from "../types"
import type { TemplateBody } from "./buildTemplateBody"
import { mergeFormatMemory } from "./formatSurfaces"

/** "Update template": the existing template row takes the current visual's
 * design (body), its source fields and thumbnail, and LEARNS its formats —
 * format memory is deep-merged (same surface + kind overwrites, a new kind
 * is added, other kinds are kept). Identity and library placement (id,
 * name, folder, createdAt) are kept. `updatedBy` follows `useSaveVisual`:
 * the saver when known; otherwise the previous saver stays. */
export const mergeTemplateUpdate = (
	existing: Visual,
	next: { body: TemplateBody; meta: TemplateMeta; thumbnail: string | null },
	now: number,
	user?: AppUser,
): Visual => {
	const { updatedBy: _prev, ...kept } = existing
	const updatedBy = user ?? existing.updatedBy
	return {
		...kept,
		...next.body,
		id: existing.id,
		name: existing.name,
		folderId: existing.folderId,
		createdAt: existing.createdAt,
		template: {
			sourceFields: next.meta.sourceFields,
			formatMemory: mergeFormatMemory(
				existing.template?.formatMemory ?? {},
				next.meta.formatMemory,
			),
		},
		thumbnail: next.thumbnail,
		thumbnailAt: now,
		updatedAt: now,
		...(updatedBy ? { updatedBy } : {}),
	}
}
