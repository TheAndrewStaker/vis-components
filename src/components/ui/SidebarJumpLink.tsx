import { useStore } from "jotai"
import { useCallback } from "react"

import {
	sidebarCollapsedAtom,
	sidebarJumpTargetAtom,
	type SidebarJumpTarget,
} from "../../contexts/chartBuilder/store/atoms"
import { asideSectionId } from "./AsideSection"

/** Returns `jumpTo(target)`: un-collapses the named AsideSection and sets the
 *  transient jump target, which the `CollapsibleSubsection` with a matching
 *  `jumpId` consumes (opens + scrolls into view). If no subsection claims the
 *  target (none named, or the named one isn't rendered — e.g. its "Titles
 *  shown" box is off), the section body is scrolled into view instead after
 *  the section has had a couple of frames to mount. */
export const useSidebarJump = () => {
	const store = useStore()
	return useCallback(
		(target: SidebarJumpTarget) => {
			store.set(sidebarCollapsedAtom, (prev) => ({
				...prev,
				[target.section]: false,
			}))
			store.set(sidebarJumpTargetAtom, target)
			const fallback = () => {
				if (store.get(sidebarJumpTargetAtom) !== target) return
				store.set(sidebarJumpTargetAtom, null)
				document
					.getElementById(asideSectionId(target.section))
					?.scrollIntoView?.({ block: "start", behavior: "smooth" })
			}
			if (typeof window.requestAnimationFrame === "function")
				window.requestAnimationFrame(() =>
					window.requestAnimationFrame(fallback)
				)
			else setTimeout(fallback, 0)
		},
		[store]
	)
}

/** Underlined muted text link (same look as `ResetLink`'s underlined
 *  variant), right-aligned like the "+ Add …" links, that jumps to another
 *  spot in the sidebar. */
export const SidebarJumpLink = ({
	label,
	target,
}: {
	label: string
	target: SidebarJumpTarget
}) => {
	const jumpTo = useSidebarJump()
	return (
		<button
			type="button"
			onClick={() => jumpTo(target)}
			className="vc-muted self-end text-sm underline hover:text-stone-900 dark:hover:text-white"
		>
			{label}
		</button>
	)
}
