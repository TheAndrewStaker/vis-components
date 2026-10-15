type Props = {
	visualId: string
	visualName: string
	/** Opens the destination picker; the page does the actual copy. */
	onDuplicate: (visualId: string) => void
}

const CopyIcon = () => (
	<svg
		viewBox="0 0 16 16"
		width={12}
		height={12}
		aria-hidden="true"
		fill="currentColor"
	>
		<path d="M5 1.5A1.5 1.5 0 016.5 0h5A1.5 1.5 0 0113 1.5v7A1.5 1.5 0 0111.5 10h-5A1.5 1.5 0 015 8.5v-7zm1.5-.5a.5.5 0 00-.5.5v7a.5.5 0 00.5.5h5a.5.5 0 00.5-.5v-7a.5.5 0 00-.5-.5h-5z" />
		<path d="M3 5.5a.5.5 0 00-.5.5v7a.5.5 0 00.5.5h5a.5.5 0 00.5-.5V12h1v1.5A1.5 1.5 0 018 15H3a1.5 1.5 0 01-1.5-1.5v-7A1.5 1.5 0 013 5h1v1H3z" />
	</svg>
)

/**
 * Hover-over-tile button that asks where to put an independent copy of a
 * visual (the picker defaults to the original's folder).
 */
export const DuplicateVisualButton = ({
	visualId,
	visualName,
	onDuplicate,
}: Props) => {
	const onClick = (e: React.MouseEvent) => {
		e.preventDefault()
		e.stopPropagation()
		onDuplicate(visualId)
	}

	return (
		<button
			type="button"
			onClick={onClick}
			title="Duplicate visualization…"
			aria-label={`Duplicate ${visualName}`}
			className="flex h-6 w-6 items-center justify-center rounded bg-white/90 shadow-sm ring-1 ring-stone-200 hover:bg-stone-100 hover:text-stone-700 dark:bg-stone-800/90 dark:ring-stone-700 dark:hover:bg-stone-700 dark:hover:text-stone-200 vc-muted"
		>
			<CopyIcon />
		</button>
	)
}
