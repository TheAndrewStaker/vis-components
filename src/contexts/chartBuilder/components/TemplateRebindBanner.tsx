import { useAtom } from "jotai"
import { describeRebind } from "../lib/templates/describeRebind"
import { templateRebindNoticeAtom } from "../store/atoms"

import { Button } from "../../../components/ui/Button"

/** After a template snap (§2.5 Templates): one line above the chart naming
 *  which template field went to which new field and which encoding slots
 *  found nothing. Brand tint (`vc-nav-active`), not the stale-build warning
 *  amber — it's information, not a problem. Dismiss clears the notice. */
export const TemplateRebindBanner = () => {
	const [notice, setNotice] = useAtom(templateRebindNoticeAtom)
	if (notice === null) return null
	return (
		<div
			role="status"
			className="vc-nav-active flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-stone-200 px-4 py-2 text-sm dark:border-stone-700"
		>
			<span>{describeRebind(notice)}</span>
			<Button compact aria-label="Dismiss" onClick={() => setNotice(null)}>
				Dismiss
			</Button>
		</div>
	)
}
