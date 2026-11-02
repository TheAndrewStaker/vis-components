import { useEffect, useRef, useState } from "react"

import { Button } from "./Button"

/** Two overlapping pages — the shared "copy" glyph. */
export const CopyIcon = () => (
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

const CheckIcon = () => (
	<svg
		viewBox="0 0 16 16"
		width={12}
		height={12}
		aria-hidden="true"
		fill="none"
		stroke="currentColor"
		strokeWidth={2}
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<path d="M3 8.5l3 3 7-7" />
	</svg>
)

const COPIED_MS = 1500

/** Icon-only copy-to-clipboard button. `label` is the hover text and the
 *  accessible name ("Copy snippet", "Copy link"); after a copy the glyph
 *  turns into a check and the hover text reads "Copied" for a moment.
 *  Clipboard failures (older browsers, denied permission) are silent — the
 *  value sits in a selectable field beside the button. */
export const CopyButton = ({
	value,
	label,
	className,
	onCopied,
}: {
	value: string
	label: string
	className?: string
	/** Runs after a successful copy (not on a clipboard failure). */
	onCopied?: () => void
}) => {
	const [copied, setCopied] = useState(false)
	const timer = useRef<number | null>(null)
	useEffect(
		() => () => {
			if (timer.current !== null) window.clearTimeout(timer.current)
		},
		[]
	)
	const onCopy = async () => {
		try {
			await globalThis.navigator.clipboard.writeText(value)
			setCopied(true)
			if (timer.current !== null) window.clearTimeout(timer.current)
			timer.current = window.setTimeout(() => setCopied(false), COPIED_MS)
			onCopied?.()
		} catch {
			// Let the user select + copy by hand.
		}
	}
	const text = copied ? "Copied" : label
	return (
		<Button
			compact
			type="button"
			onClick={() => void onCopy()}
			title={text}
			aria-label={text}
			className={`px-2${className ? ` ${className}` : ""}`}
		>
			{copied ? <CheckIcon /> : <CopyIcon />}
		</Button>
	)
}
