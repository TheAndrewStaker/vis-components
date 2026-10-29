import { combine as c } from "../../lib/cls"

/** Single source for the sidebar's chevron glyphs so every expander shares
 *  one shape, size (10px), and stroke weight. Two variants for the two
 *  affordances in the UI:
 *  - SectionChevron: points right, rotates to point down when open. Used by
 *    section / subsection headers (AsideSection, CollapsibleSubsection).
 *  - DisclosureChevron: points down, flips up when open. Used by dropdown
 *    and menu indicators (header menu, save bar, palette picker).
 *  - RowChevron: the same glyph at 16px in brand purple. Used by the inline
 *    row expanders (encoding rows, field rows, label rows, data-label
 *    channel rows) — the button at the end of a selector row that opens
 *    that row's options. Bigger and coloured so it reads as a control
 *    beside the dropdown rather than decoration (Nancy, 2026-10-29).
 *  - RailChevron: a double chevron pointing left or right, for the buttons
 *    that collapse a side rail fully away and bring it back.
 */
const ChevronSvg = ({
	d,
	className,
	size = 10,
}: {
	d: string
	className: string
	size?: number
}) => (
	<svg
		viewBox="0 0 12 12"
		width={size}
		height={size}
		aria-hidden="true"
		className={className}
	>
		<path
			d={d}
			fill="none"
			stroke="currentColor"
			strokeWidth={1.5}
			strokeLinecap="round"
			strokeLinejoin="round"
		/>
	</svg>
)

export const SectionChevron = ({ open }: { open: boolean }) => (
	<ChevronSvg
		d="M3.5 2l4 4-4 4"
		className={c("flex-shrink-0 transition-transform", open ? "rotate-90" : "")}
	/>
)

export const DisclosureChevron = ({ open }: { open: boolean }) => (
	<ChevronSvg
		d="M3 4.5l3 3 3-3"
		className={c(
			"flex-shrink-0 transition-transform",
			open ? "rotate-180" : ""
		)}
	/>
)

export const RowChevron = ({ open }: { open: boolean }) => (
	<ChevronSvg
		d="M3 4.5l3 3 3-3"
		size={16}
		className={c(
			"text-vc-brand-text flex-shrink-0 transition-transform dark:text-brand-300",
			open ? "rotate-180" : ""
		)}
	/>
)

export const RailChevron = ({ direction }: { direction: "left" | "right" }) => (
	<ChevronSvg
		d={
			direction === "left"
				? "M6.5 2.5L3 6l3.5 3.5M10 2.5L6.5 6 10 9.5"
				: "M5.5 2.5L9 6l-3.5 3.5M2 2.5L5.5 6 2 9.5"
		}
		className="flex-shrink-0"
	/>
)
