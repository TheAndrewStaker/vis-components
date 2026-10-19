import { useStaleBuild } from "../contexts/chartBuilder/lib/storage/staleBuild"
import { Button } from "./ui/Button"

/** Shown once the server has refused a write from this build as behind its
 *  content schema (a deploy landed while this tab was open). Saving is off
 *  until the page reloads; the editor draft lives in localStorage, so a
 *  reload picks the unsaved work back up. */
export const StaleBuildBanner = () => {
	const stale = useStaleBuild()
	if (!stale) return null
	return (
		<div
			role="alert"
			className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
		>
			<span>
				A newer version of this app has been deployed, so this tab can no
				longer save. Reload to keep working — your unsaved changes are kept.
			</span>
			<Button compact onClick={() => window.location.reload()}>
				Reload
			</Button>
		</div>
	)
}
