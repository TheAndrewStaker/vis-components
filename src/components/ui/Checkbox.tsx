import { useId, type ReactNode } from "react"
import { combine as c } from "../../lib/cls"

/** THE on/off control for the sidebar: a checkbox with a properly-associated
 *  label to its right. Every on/off setting renders through this (never a raw
 *  `<input type="checkbox">`), so all checkbox rows look identical. Choosing
 *  BETWEEN options is not a checkbox — that is the `Segmented` toggle.
 *  Differs from `LabeledField` because the label sits to the RIGHT of the box
 *  (the conventional layout). `changed` shows the per-line "changed" dot. */
export const Checkbox = ({
	id,
	label,
	checked,
	onChange,
	disabled,
	className,
	changed,
}: {
	id?: string
	label: ReactNode
	checked: boolean
	onChange: (next: boolean) => void
	disabled?: boolean
	className?: string
	/** Shows the per-line "changed" dot in front of the toggle. */
	changed?: boolean
}) => {
	const generatedId = useId()
	const inputId = id ?? generatedId
	return (
		<div className={c("flex items-center gap-2 text-sm", className)}>
			<input
				id={inputId}
				type="checkbox"
				checked={checked}
				onChange={(e) => onChange(e.target.checked)}
				disabled={disabled}
				className="cursor-pointer rounded border-stone-300 disabled:cursor-not-allowed disabled:opacity-60 dark:border-stone-700"
			/>
			<label
				htmlFor={inputId}
				className={c(
					"cursor-pointer vc-text",
					disabled && "cursor-not-allowed opacity-60",
					changed && "font-semibold !text-vc-section-header"
				)}
			>
				{label}
			</label>
		</div>
	)
}
