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

/** Underlined brand-purple text link, right-aligned like the "+ Add …"
 *  links, that jumps to another spot in the sidebar. Place it LAST in its
 *  subsection so it reads as "done here? go there" rather than leading the
 *  controls. */
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
			className="text-vc-brand-text self-end text-sm underline hover:opacity-80 dark:text-brand-300"
		>
			{label}
		</button>
	)
}
