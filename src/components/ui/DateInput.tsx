import { useEffect, useId, useRef, useState } from "react"
import { combine as c } from "../../lib/cls"
import {
	formatLocalDate,
	localMidnight,
	parseLocalDate,
} from "../../contexts/chartBuilder/lib/localDate"
import { Input } from "./Input"
import { Select } from "./Select"

/**
 * A date field: a text box taking "YYYY-MM-DD" plus a calendar button that
 * opens a small picker with SEPARATE Month and Year selects over a day
 * grid, so picking a day is one click in each. (The browser's native date
 * picker folds month and year into one long "Month YYYY" list, which is a
 * slog across decades.) The value is epoch ms at LOCAL midnight — the same
 * clock the chart's time scale lays its ticks on — or null for "blank".
 */
export type DateInputProps = {
	value: number | null
	onChange: (ms: number | null) => void
	/** Layout utilities for the whole field (width etc.). */
	className?: string
	placeholder?: string
	"aria-label"?: string
}

const MONTHS = [
	"Jan", "Feb", "Mar", "Apr", "May", "Jun",
	"Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
const YEAR_FLOOR = 1900
const YEAR_CEIL = 2100

const CalendarGlyph = () => (
	<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4">
		<rect x="2" y="3" width="12" height="11" rx="1.5" />
		<path d="M2 6.5h12M5 1.5v3M11 1.5v3" />
	</svg>
)

export const DateInput = ({
	value,
	onChange,
	className,
	placeholder = "YYYY-MM-DD",
	"aria-label": ariaLabel,
}: DateInputProps) => {
	const wrapperRef = useRef<HTMLDivElement>(null)
	const popoverId = useId()
	const [open, setOpen] = useState(false)
	const [text, setText] = useState(value === null ? "" : formatLocalDate(value))
	// Re-sync the text when the value changes from outside (another visual
	// loads, a reset) unless the box already reads as that value, so
	// in-progress typing survives a re-render.
	useEffect(() => {
		const shown = text.trim() === "" ? null : parseLocalDate(text)
		const same =
			value === null ? text.trim() === "" : Number.isFinite(shown) && shown === value
		// eslint-disable-next-line react-hooks/set-state-in-effect -- mirrors an external value into a text box, like BreaksField
		if (!same) setText(value === null ? "" : formatLocalDate(value))
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [value])

	const anchor = value === null ? new Date() : new Date(value)
	const [viewYear, setViewYear] = useState(anchor.getFullYear())
	const [viewMonth, setViewMonth] = useState(anchor.getMonth())

	const openPicker = () => {
		const d = value === null ? new Date() : new Date(value)
		setViewYear(d.getFullYear())
		setViewMonth(d.getMonth())
		setOpen(true)
	}
	const close = () => setOpen(false)

	const commitText = (raw: string) => {
		if (raw.trim() === "") {
			if (value !== null) onChange(null)
			return
		}
		const ms = parseLocalDate(raw)
		if (!Number.isFinite(ms)) {
			// Unparseable: put the stored value back rather than keep junk.
			setText(value === null ? "" : formatLocalDate(value))
			return
		}
		if (ms !== value) onChange(ms)
		setText(formatLocalDate(ms))
	}

	const pickDay = (day: number) => {
		const ms = localMidnight(viewYear, viewMonth, day).getTime()
		setText(formatLocalDate(ms))
		if (ms !== value) onChange(ms)
		close()
	}

	// Close when focus leaves the field + popover entirely; moving focus
	// between the text box, the selects and the day buttons keeps it open.
	// Attached to each interactive child (not the wrapper) so the wrapper
	// stays inert, like PalettePickerButton.
	const onBlur = (e: React.FocusEvent) => {
		if (!wrapperRef.current?.contains(e.relatedTarget as Node | null)) close()
	}
	const onKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Escape" && open) {
			e.stopPropagation()
			close()
		}
	}

	const years: number[] = []
	const lo = Math.min(YEAR_FLOOR, viewYear)
	const hi = Math.max(YEAR_CEIL, viewYear)
	for (let y = lo; y <= hi; y++) years.push(y)

	const firstWeekday = localMidnight(viewYear, viewMonth, 1).getDay()
	const daysInMonth = localMidnight(viewYear, viewMonth + 1, 0).getDate()
	const cells: Array<number | null> = [
		...Array.from({ length: firstWeekday }, () => null),
		...Array.from({ length: daysInMonth }, (_, i) => i + 1),
	]
	while (cells.length % 7 !== 0) cells.push(null)
	const selected = value === null ? null : new Date(value)
	const today = new Date()
	const isSelected = (day: number) =>
		selected !== null &&
		selected.getFullYear() === viewYear &&
		selected.getMonth() === viewMonth &&
		selected.getDate() === day
	const isToday = (day: number) =>
		today.getFullYear() === viewYear &&
		today.getMonth() === viewMonth &&
		today.getDate() === day

	return (
		<div ref={wrapperRef} className={c("relative flex items-center", className)}>
			<Input
				type="text"
				inputMode="numeric"
				value={text}
				placeholder={placeholder}
				aria-label={ariaLabel}
				onChange={(e) => setText(e.target.value)}
				onBlur={(e) => {
					commitText(e.target.value)
					onBlur(e)
				}}
				onKeyDown={(e) => {
					if (e.key === "Enter") commitText((e.target as HTMLInputElement).value)
					onKeyDown(e)
				}}
				className="w-full pr-7 font-mono"
			/>
			<button
				type="button"
				aria-label="Pick a date"
				aria-expanded={open}
				aria-controls={open ? popoverId : undefined}
				onClick={() => (open ? close() : openPicker())}
				onBlur={onBlur}
				onKeyDown={onKeyDown}
				className="absolute right-1.5 flex h-5 w-5 items-center justify-center rounded text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-white"
			>
				<CalendarGlyph />
			</button>
			{open && (
				<div
					id={popoverId}
					role="dialog"
					aria-label="Choose a date"
					className="absolute right-0 top-full z-20 mt-1 flex w-max flex-col gap-2 rounded border border-stone-300 bg-white p-2 shadow-lg dark:border-stone-600 dark:bg-stone-800"
				>
					<div className="flex items-center gap-1">
						<Select
							aria-label="Month"
							value={viewMonth}
							onChange={(e) => setViewMonth(Number(e.target.value))}
							onBlur={onBlur}
							onKeyDown={onKeyDown}
							className="flex-1"
						>
							{MONTHS.map((m, i) => (
								<option key={m} value={i}>
									{m}
								</option>
							))}
						</Select>
						<Select
							aria-label="Year"
							value={viewYear}
							onChange={(e) => setViewYear(Number(e.target.value))}
							onBlur={onBlur}
							onKeyDown={onKeyDown}
							className="w-24"
						>
							{years.map((y) => (
								<option key={y} value={y}>
									{y}
								</option>
							))}
						</Select>
					</div>
					<div className="grid grid-cols-7 gap-0.5 text-center text-xs">
						{WEEKDAYS.map((w) => (
							<span key={w} className="vc-muted py-0.5">
								{w}
							</span>
						))}
						{cells.map((day, i) =>
							day === null ? (
								// eslint-disable-next-line react/no-array-index-key -- blank grid cells
								<span key={`blank-${i}`} />
							) : (
								<button
									key={day}
									type="button"
									aria-label={formatLocalDate(
										localMidnight(viewYear, viewMonth, day).getTime()
									)}
									aria-pressed={isSelected(day)}
									onClick={() => pickDay(day)}
									// Keep focus where it is while clicking a day so the
									// blur handler doesn't close the picker mid-click.
									onMouseDown={(e) => e.preventDefault()}
									onBlur={onBlur}
									onKeyDown={onKeyDown}
									className={c(
										"h-7 w-7 rounded tabular-nums",
										isSelected(day)
											? "bg-vc-section-header text-white"
											: "vc-text hover:bg-stone-100 dark:hover:bg-stone-700",
										isToday(day) && !isSelected(day)
											? "ring-1 ring-inset ring-stone-400"
											: ""
									)}
								>
									{day}
								</button>
							)
						)}
					</div>
				</div>
			)}
		</div>
	)
}
