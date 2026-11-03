import { useEffect } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useAtom, useAtomValue } from "jotai"

import { Button } from "../../../components/ui/Button"
import { Modal } from "../../../components/ui/Modal"
import {
	currentVisualIdAtom,
	currentVisualPublishedAtom,
	PUBLISHED_EDIT_SNOOZE_MS,
	publishedEditAckAtom,
	publishedEditSnoozeUntilAtom,
} from "../store/atoms"

/** Acknowledge-to-continue notice shown when the user opens a visual that is
 *  already published: the editor autosaves, and a republish pushes whatever
 *  is here into content someone has embedded elsewhere.
 *
 *  Mounted from the existing-visual route (not EditorLayout) — a brand-new
 *  visual can't be published, and the "Go back" action needs the router.
 *  Reactive rather than fired once on load: in server mode the embed
 *  instances hydrate asynchronously, so a check at load time would often run
 *  before the publish records had arrived. `publishedEditAckAtom` keeps it
 *  from re-appearing — including right after the user publishes from inside
 *  the editor. Backdrop clicks don't dismiss it (see UploadNoticeModal for
 *  the same choice); Escape reads as "Just once!" so a stray keypress
 *  can't throw away an editing session. "Remind me in an hour" is for
 *  someone bouncing between published visuals all afternoon: it stamps a
 *  device-wide snooze so re-entries stay quiet for an hour, while the
 *  viewport frame keeps standing in for the notice. */
export const PublishedEditGate = () => {
	const visualId = useAtomValue(currentVisualIdAtom)
	const published = useAtomValue(currentVisualPublishedAtom)
	const [ack, setAck] = useAtom(publishedEditAckAtom)
	const [snoozeUntil, setSnoozeUntil] = useAtom(publishedEditSnoozeUntilAtom)
	const navigate = useNavigate()

	// Re-arm on leaving the editor so a later re-entry warns again.
	useEffect(() => () => setAck(null), [setAck])

	const snoozed = snoozeUntil > Date.now()
	const open = published && visualId !== null && ack !== visualId && !snoozed
	const acknowledge = () => setAck(visualId)
	const snooze = () => {
		setSnoozeUntil(Date.now() + PUBLISHED_EDIT_SNOOZE_MS)
		acknowledge()
	}

	return (
		<Modal
			open={open}
			onClose={acknowledge}
			dismissOnBackdrop={false}
			title={
				<span className="text-brand-500 dark:text-brand-300">
					Already embedded
				</span>
			}
			// `!` because these fight the panel's own neutral border utilities,
			// which Tailwind emits at the same specificity — source order in the
			// class attribute wouldn't decide the winner. Purple, matching the
			// frame the editor viewport now carries.
			panelClassName="!border-2 !border-brand-500 [&>div:first-child]:!border-brand-300 dark:[&>div:first-child]:!border-brand-800"
		>
			<div className="flex flex-col gap-4">
				<div className="text-sm vc-text">
					This visual is already embedded. Edits you make here will affect
					published content.
				</div>
				<div className="flex justify-end gap-2">
					<Button compact onClick={() => void navigate({ to: "/" })}>
						Go back
					</Button>
					{/* The two "edit anyway" choices are pink — a soft warning,
					    not the brand purple of the safe "Go back". */}
					<Button compact caution onClick={snooze}>
						Remind me in an hour
					</Button>
					<Button compact caution onClick={acknowledge}>
						Just once!
					</Button>
				</div>
			</div>
		</Modal>
	)
}
