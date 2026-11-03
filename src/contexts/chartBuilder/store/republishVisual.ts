/** One-click "Republish" for every published pin of the open visual.
 *
 *  Web embeds and the PowerPoint add-in only ever see PUBLISHED content, so
 *  after an edit the user has to push it out again — for each pin, until
 *  now via Export → Embed → Republish. `useRepublishVisual` republishes
 *  every published instance of a visual in one go (sequentially: each
 *  publish captures the on-screen figure for its picture, and two captures
 *  at once would race the DOM), reusing each pin's own versionId and split
 *  choice so the public urls never change.
 *
 *  Coalescing: autosave calls this too ("Republish on every save"), and a
 *  burst of saves must end with exactly ONE up-to-date publish, not a
 *  stack of them. `republishStateAtom.busy` is the lock; a call that lands
 *  while a pass is running only raises `pending`, and the running pass
 *  makes one more pass when it finishes. */

import { useCallback } from "react"
import { atom } from "jotai"
import { useAtomCallback } from "jotai/utils"

import { publishedInstancesOf } from "../lib/embedInstances"
import { isTemplate } from "../lib/visualTrash"
import { embedInstancesAtom, visualsAtom } from "./atoms"
import { usePublishEmbed } from "./publishEmbed"

export type RepublishState = {
	/** A pass is running. */
	busy: boolean
	/** A call arrived mid-pass; the running pass will go once more. */
	pending: boolean
	/** The first error of the last pass that failed; cleared by a later
	 *  successful pass. */
	error: string | null
	/** Epoch ms of the last pass that republished at least one instance. */
	lastAt: number | null
}

export const republishStateAtom = atom<RepublishState>({
	busy: false,
	pending: false,
	error: null,
	lastAt: null,
})

export type RepublishOptions = {
	/** Inline the ZCTA topology (ZIP-level maps) — the caller sits in the
	 *  editor, where the effective geography level is a hook. */
	includeZctaTopology: boolean
}

type RepublishRequest = { visualId: string; opts: RepublishOptions }

/** The request that raised `pending`: the follow-up pass runs with the
 *  LATEST arguments, not the ones the running pass started with. */
const queuedRequestAtom = atom<RepublishRequest | null>(null)

/** Republish every published instance of `visualId`. Resolves to the
 *  number of instances republished by the passes this call ran (0 when the
 *  visual is unsaved, a template, has no published pin, or when the call
 *  was folded into a pass already running — that pass's result shows up in
 *  `republishStateAtom`). Never rejects: the first failing instance aborts
 *  the pass and lands in `republishStateAtom.error`. */
export const useRepublishVisual = () => {
	const publishEmbed = usePublishEmbed()
	return useAtomCallback(
		useCallback(
			async (get, set, visualId: string, opts: RepublishOptions): Promise<number> => {
				const visual = get(visualsAtom).find((v) => v.id === visualId)
				if (!visual || isTemplate(visual)) return 0

				/** One pass: every pin that is published right now, in order.
				 *  Re-read per pass (not captured at call time) so a pin
				 *  unpublished mid-burst isn't resurrected. */
				const republishPass = async (request: RepublishRequest): Promise<number> => {
					const targets = publishedInstancesOf(get(embedInstancesAtom), request.visualId)
					for (const instance of targets) {
						await publishEmbed({
							visualId: request.visualId,
							versionId: instance.versionId,
							split: instance.publishedParts?.includes("chart") ?? false,
							includeZctaTopology: request.opts.includeZctaTopology,
						})
					}
					return targets.length
				}

				if (get(republishStateAtom).busy) {
					set(queuedRequestAtom, { visualId, opts })
					set(republishStateAtom, (s) => ({ ...s, pending: true }))
					return 0
				}

				set(republishStateAtom, (s) => ({ ...s, busy: true, pending: false }))
				let total = 0
				let next: RepublishRequest | null = { visualId, opts }
				try {
					while (next !== null) {
						const request: RepublishRequest = next
						next = null
						try {
							const count = await republishPass(request)
							total += count
							set(republishStateAtom, (s) => ({
								...s,
								error: null,
								...(count > 0 ? { lastAt: Date.now() } : {}),
							}))
						} catch (e) {
							set(republishStateAtom, (s) => ({
								...s,
								error: e instanceof Error ? e.message : String(e),
							}))
						}
						if (get(republishStateAtom).pending) {
							next = get(queuedRequestAtom) ?? request
							set(queuedRequestAtom, null)
							set(republishStateAtom, (s) => ({ ...s, pending: false }))
						}
					}
				} finally {
					set(republishStateAtom, (s) => ({ ...s, busy: false }))
				}
				return total
			},
			[publishEmbed]
		)
	)
}
