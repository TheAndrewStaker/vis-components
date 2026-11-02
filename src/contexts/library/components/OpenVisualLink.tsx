import { Link } from "@tanstack/react-router"

import type { Visual } from "../../chartBuilder/lib/types"
import { isTemplate } from "../../chartBuilder/lib/visualTrash"

/** The library's one "open this row" link. An ordinary visual opens in the
 *  editor; a template never opens as a chart — clicking it starts a NEW
 *  visual from it (`/editor/new?templateId=`). Cards, table rows and tree
 *  rows all go through here so the three can't disagree. */
export const OpenVisualLink = ({
	visual,
	className,
	draggable,
	children,
}: {
	visual: Pick<Visual, "id" | "template">
	className?: string
	draggable?: boolean
	children: React.ReactNode
}) =>
	isTemplate(visual) ? (
		<Link
			to="/editor/new"
			search={{ templateId: visual.id }}
			className={className}
			draggable={draggable}
		>
			{children}
		</Link>
	) : (
		<Link
			to="/editor/$visualId"
			params={{ visualId: visual.id }}
			className={className}
			draggable={draggable}
		>
			{children}
		</Link>
	)

/** Small "Template" chip shown on template cards, table rows and tree
 *  rows. Brand-tinted like the Themes gallery's "Default" pill. */
export const TemplateChip = ({ className }: { className?: string }) => (
	<span
		className={`inline-flex flex-shrink-0 items-center rounded bg-brand-100 px-1.5 py-0.5 text-xs font-semibold tracking-wide text-brand-800 uppercase dark:bg-brand-900/40 dark:text-brand-200 ${className ?? ""}`}
	>
		Template
	</span>
)
