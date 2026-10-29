import { useCallback } from "react"
import { Link, useNavigate, useParams, useRouter } from "@tanstack/react-router"

import { ThemesPage, type NavigationGuard } from "./ThemesPage"

/** `/settings/themes/$themeId` — the editor for one theme, reached from a
 *  gallery card or a rail entry. Owns the routing around the editor (the
 *  way back to the gallery, leaving it after a delete, and the guard that
 *  stops a navigation while there are unsaved changes) so `ThemesPage`
 *  itself stays router-free and mountable in tests. */
export const ThemeEditorPage = () => {
	const { themeId } = useParams({ from: "/settings/themes/$themeId" })
	const navigate = useNavigate()
	const { history } = useRouter()
	// The editor registers its unsaved-changes guard with the router's
	// history: every in-app navigation — the rail, the gallery link, the
	// header — asks it first, and while one is registered the browser puts
	// up its own prompt on a reload or a closed tab.
	const blockNavigation = useCallback(
		(guard: NavigationGuard) => history.block(guard),
		[history]
	)
	const backToGallery = () => void navigate({ to: "/settings/themes" })
	return (
		<ThemesPage
			// Keyed so switching themes mounts a fresh editor — and a fresh
			// draft, read from the library rather than carried over.
			key={themeId}
			themeId={themeId}
			onDeleted={backToGallery}
			onDone={backToGallery}
			blockNavigation={blockNavigation}
			backLink={
				<Link
					to="/settings/themes"
					className="inline-flex items-center gap-1 text-sm hover:text-stone-900 dark:hover:text-white vc-muted"
				>
					<span aria-hidden="true">&larr;</span> All themes
				</Link>
			}
		/>
	)
}
