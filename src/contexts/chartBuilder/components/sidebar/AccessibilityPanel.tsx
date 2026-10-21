import { useId } from "react"
import { useAtom, useAtomValue } from "jotai"

import { Textarea } from "../../../../components/ui/Input"
import { LabeledField } from "../../../../components/ui/LabeledField"
import { ResetLink } from "../../../../components/ui/ResetLink"
import {
	autoChartDescription,
	migrateAccessibilityConfig,
} from "../../lib/accessibilityConfig"
import {
	currentAccessibilityConfigAtom,
	currentLabelsAtom,
} from "../../store/atoms"

/** Sidebar panel for the chart's screen-reader description
 *  (`AccessibilityConfig`). While no override is stored the box SHOWS the
 *  derived "Title. Subtitle." text as its value and follows title edits
 *  live; the first keystroke stores an override, and "Reset to title"
 *  (shown only when overridden) returns to the automatic text. The authored
 *  title / subtitle are used even when "Titles shown" hides them — the
 *  description is for readers who can't see the figure. */
export const AccessibilityPanel = () => {
	const [stored, setCfg] = useAtom(currentAccessibilityConfigAtom)
	const cfg = migrateAccessibilityConfig(stored)
	const labels = useAtomValue(currentLabelsAtom)
	const id = useId()

	const auto = autoChartDescription({
		title: labels.title,
		subtitle: labels.subtitle,
	})
	const overridden = cfg.description !== null
	const shown = cfg.description ?? auto
	const clearedToEmpty = overridden && shown.trim() === ""

	return (
		<div className="vc-option-panel">
			<p className="vc-help">
				Read aloud by screen readers in place of the figure, in the editor,
				embeds and SVG exports.
			</p>
			<LabeledField
				id={id}
				label="Description"
				inline={false}
				changed={overridden}
			>
				<Textarea
					id={id}
					className="flex-1"
					value={shown}
					onChange={(e) => setCfg({ description: e.target.value })}
					rows={4}
					autoSize
				/>
			</LabeledField>
			{clearedToEmpty && (
				<p className="vc-help">
					With the description empty, screen readers hear the visual&rsquo;s
					name instead.
				</p>
			)}
			{overridden && (
				<ResetLink
					label="Reset to title"
					className="self-end"
					onClick={() => setCfg({ description: null })}
				/>
			)}
			<p className="vc-help">
				The Accessibility check (header button) reviews contrast, color-only
				encodings and text size.
			</p>
		</div>
	)
}
