import { forwardRef } from "react"
import { combine as c } from "../../lib/cls"

// Generic select dropdown with the same Tailwind treatment as inline selects
// elsewhere in the app. Pass <option>s as children.

export type SelectProps = Omit<JSX.IntrinsicElements["select"], "ref">

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
	function Select({ className, children, ...p }, ref) {
		return (
			<select
				ref={ref}
				className={c(
					"vc-select min-w-0 rounded-control border border-stone-400 bg-white py-1 pr-7 pl-2 text-sm text-stone-900 transition-colors vc-focus-ring hover:border-stone-600 focus:border-stone-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-stone-700 dark:bg-stone-900 dark:text-white dark:hover:border-stone-600 dark:focus:border-stone-500",
					className
				)}
				{...p}
			>
				{children}
			</select>
		)
	}
)
