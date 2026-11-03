import type { AppUser } from "../../../../lib/currentUser"
import type { TemplateMeta, Visual } from "../types"
import type { TemplateBody } from "./buildTemplateBody"
import { applyTemplateUpdate, templateSideOf } from "./templateDiff"
import {
	ALL_TEMPLATE_SECTIONS,
	type TemplateSectionId,
} from "./templateSections"

/** "Update template": the existing template row takes the chosen sections
 * of the current visual's design (`applyTemplateUpdate` — every section by
 * default), LEARNS their formats (format memory deep-merged per surface +
 * kind), and takes the visual's thumbnail. Identity and library placement
 * (id, name, folder, createdAt) are kept. `updatedBy` follows
 * `useSaveVisual`: the saver when known; otherwise the previous saver
 * stays. */
export const mergeTemplateUpdate = (
	existing: Visual,
	next: { body: TemplateBody; meta: TemplateMeta; thumbnail: string | null },
	now: number,
	user?: AppUser,
	sections: ReadonlySet<TemplateSectionId> = ALL_TEMPLATE_SECTIONS,
): Visual => {
	const { updatedBy: _prev, ...kept } = existing
	const updatedBy = user ?? existing.updatedBy
	const update = applyTemplateUpdate(
		templateSideOf(existing),
		{ body: next.body, meta: next.meta },
		sections,
	)
	return {
		...kept,
		...update.body,
		id: existing.id,
		name: existing.name,
		folderId: existing.folderId,
		createdAt: existing.createdAt,
		template: update.meta,
		thumbnail: next.thumbnail,
		thumbnailAt: now,
		updatedAt: now,
		...(updatedBy ? { updatedBy } : {}),
	}
}
