import { useAtomCallback } from "jotai/utils"
import { useCallback } from "react"
import { getCurrentUser } from "../../../lib/currentUser"
import {
	buildTemplateBody,
	buildTemplateMeta,
} from "../lib/templates/buildTemplateBody"
import {
	diffTemplate,
	templateSideOf,
	type TemplateDiff,
} from "../lib/templates/templateDiff"
import type { Visual } from "../lib/types"

import { currentVisualIdAtom, visualsAtom } from "./atoms"
import { assembleDraftVisual } from "./saveVisual"
import { currentDatasetViewAtom } from "./useCurrentDatasetView"

export type TemplateDiffReport = {
	diff: TemplateDiff
	/** The template was saved after this visual was started, by someone
	 * else (or by an unidentified session) — so some differences may be
	 * theirs, not this visual's. */
	changedSinceStart: boolean
}

/** What "Update template" would change: the open draft, stripped the way
 * a save-as-template strips it, compared section by section against the
 * template row AS IT IS NOW (`diffTemplate`). Same draft a save reads. */
export const useTemplateDiff = () =>
	useAtomCallback(
		useCallback((get, _set, template: Visual): TemplateDiffReport => {
			const draft = assembleDraftVisual(get)
			const viewFields = get(currentDatasetViewAtom)?.fields ?? []
			const visual = {
				body: buildTemplateBody(draft),
				meta: buildTemplateMeta(draft, viewFields),
			}
			const diff = diffTemplate(templateSideOf(template), visual)
			const saved = get(visualsAtom).find(
				(v) => v.id === get(currentVisualIdAtom)
			)
			const user = getCurrentUser()
			const changedSinceStart =
				saved !== undefined &&
				template.updatedAt > saved.createdAt &&
				!(user !== null && template.updatedBy?.id === user.id)
			return { diff, changedSinceStart }
		}, [])
	)
