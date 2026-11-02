import { useAtomCallback } from "jotai/utils"
import { useCallback } from "react"
import { getCurrentUser } from "../../../lib/currentUser"
import { UNTITLED_VISUAL_NAME } from "../lib/nameUniqueness"
import {
	buildTemplateBody,
	buildTemplateMeta,
} from "../lib/templates/buildTemplateBody"
import { mergeTemplateUpdate } from "../lib/templates/mergeTemplateUpdate"
import type { Visual } from "../lib/types"
import { isTemplate } from "../lib/visualTrash"

import {
	currentTemplateIdAtom,
	currentVisualIdAtom,
	foldersAtom,
	visualsAtom,
} from "./atoms"
import {
	assembleDraftVisual,
	newVisualId,
	resolveNewVisualFolder,
} from "./saveVisual"
import { currentDatasetViewAtom } from "./useCurrentDatasetView"

export type SaveTemplateArgs =
	| { kind: "new"; name: string; folderId: string | null }
	| { kind: "update"; templateId: string }

/** "Save as template" (Export modal). Builds the template from the SAME
 * draft a save writes (`assembleDraftVisual`), stripped to its design
 * (`buildTemplateBody`) plus the fields and per-kind formats it was authored
 * against (`buildTemplateMeta`), with the open visual's saved thumbnail.
 *
 *  - `new` prepends a fresh template row in the chosen folder (a folder
 *    deleted meanwhile falls back to the root). Name collisions are the
 *    caller's check (`nameCollides`); the name is only trimmed here.
 *  - `update` replaces that template's design and MERGES its format memory
 *    (`mergeTemplateUpdate`). Throws when the row is no longer a template.
 *
 * Either way the open visual is then linked to the saved template
 * (`currentTemplateIdAtom`, saved with the visual), so a later save offers
 * "Update template". Resolves with the template id once the write lands. */
export const useSaveTemplate = () =>
	useAtomCallback(
		useCallback(async (get, set, args: SaveTemplateArgs): Promise<string> => {
			const draft = assembleDraftVisual(get)
			const viewFields = get(currentDatasetViewAtom)?.fields ?? []
			const body = buildTemplateBody(draft)
			const meta = buildTemplateMeta(draft, viewFields)
			const visualId = get(currentVisualIdAtom)
			const thumbnail =
				get(visualsAtom).find((v) => v.id === visualId)?.thumbnail ?? null
			const now = Date.now()
			const user = getCurrentUser()

			let templateId: string
			if (args.kind === "new") {
				templateId = newVisualId()
				const row: Visual = {
					id: templateId,
					name: args.name.trim() || UNTITLED_VISUAL_NAME,
					folderId: resolveNewVisualFolder(args.folderId, get(foldersAtom)),
					...body,
					template: meta,
					thumbnail,
					...(thumbnail ? { thumbnailAt: now } : {}),
					createdAt: now,
					updatedAt: now,
					...(user ? { updatedBy: user } : {}),
				}
				await set(visualsAtom, (prev) => [row, ...prev])
			} else {
				templateId = args.templateId
				const existing = get(visualsAtom).find((v) => v.id === templateId)
				if (!existing || !isTemplate(existing)) {
					throw new Error("That template no longer exists.")
				}
				await set(visualsAtom, (prev) =>
					prev.map((v) =>
						v.id === templateId
							? mergeTemplateUpdate(
									v,
									{ body, meta, thumbnail },
									now,
									user ?? undefined
								)
							: v
					)
				)
			}
			set(currentTemplateIdAtom, templateId)
			return templateId
		}, [])
	)
