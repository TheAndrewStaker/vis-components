import { Checkbox } from "../../../../components/ui/Checkbox"
import { ColorInput as UiColorInput } from "../../../../components/ui/ColorInput"
import { NumberInput as UiNumberInput } from "../../../../components/ui/NumberInput"
import {
	themeDataTableStyle,
	type ResolvedDataTableStyle,
} from "../../../chartBuilder/lib/dataTableConfig"
import type { Theme } from "../../../chartBuilder/lib/types"
import {
	AlignmentRow,
	FontFamilyRow,
	FontWeightRow,
	NumberInput,
	Section,
	SectionGroup,
	THEME_LABEL_CLASS,
} from "./controls"
import type { ThemeSectionProps } from "./types"

type NullableColorKey =
	| "dataTableTextColor"
	| "dataTableHeaderBackground"
	| "dataTableHeaderTextColor"
	| "dataTableBorderColor"
	| "dataTableStripeColor"
	| "dataTableTitleColor"
	| "dataTableCaptionColor"
	| "dataTableHeaderBorderColor"
	| "dataTableFirstColumnColor"

/** A color the theme may leave empty — empty derives from the text color
 *  (the placeholder says what it becomes). No palette picker, as on the
 *  rest of this page: the swatches here define the theme. */
const OptionalColorRow = ({
	label,
	field,
	placeholder,
	theme,
	set,
}: {
	label: string
	field: NullableColorKey
	placeholder: string
	theme: Theme
	set: ThemeSectionProps["set"]
}) => (
	<UiColorInput
		label={label}
		labelClassName={THEME_LABEL_CLASS}
		showPalettePicker={false}
		value={theme[field]}
		placeholder={placeholder}
		onChange={(c) => set(field, c)}
		onClear={() => set(field, null)}
	/>
)

/** A titled sub-block inside a section — the sidebar's divider-group
 *  header ("Bottom line", "Column alignment"), so the two read the same. */
const SubHeading = ({ children }: { children: string }) => (
	<span className="vc-group-header pt-1">{children}</span>
)

/** Checkbox lined up with the label column of the rows around it. */
const CheckRow = ({
	label,
	checked,
	onChange,
}: {
	label: string
	checked: boolean
	onChange: (v: boolean) => void
}) => (
	<div className="flex items-center gap-2 text-sm">
		<span className={`${THEME_LABEL_CLASS} shrink-0`} aria-hidden="true" />
		<Checkbox label={label} checked={checked} onChange={onChange} />
	</div>
)

/** A font size the theme may leave empty (empty = `placeholder`'s size). */
const OptionalSizeRow = ({
	value,
	placeholder,
	onChange,
}: {
	value: number | null
	placeholder: number
	onChange: (v: number | null) => void
}) => (
	<UiNumberInput
		label="Size"
		labelClassName={THEME_LABEL_CLASS}
		value={value}
		placeholder={String(placeholder)}
		stepBase={placeholder}
		min={1}
		max={72}
		step={1}
		suffix="pt"
		onChange={(n) => {
			if (n > 0) onChange(n)
		}}
		onClear={() => onChange(null)}
		inputClassName="w-20"
	/>
)

/** Title / Caption: family, size, weight, color, alignment. Empty family /
 *  size / color follow the table text (`look` gives the resolved value
 *  for each placeholder). */
const TextBlockRows = ({
	slot,
	theme,
	look,
	set,
}: {
	slot: "Title" | "Caption"
	theme: Theme
	look: ResolvedDataTableStyle
	set: ThemeSectionProps["set"]
}) => {
	const family = `dataTable${slot}FontFamily` as const
	const size = `dataTable${slot}FontSize` as const
	const color = `dataTable${slot}Color` as const
	const align = `dataTable${slot}Align` as const
	const resolvedFamily = slot === "Title" ? look.titleFontFamily : look.captionFontFamily
	return (
		<>
			<FontFamilyRow
				label="Family"
				value={theme[family] ?? undefined}
				onChange={(f) => set(family, f)}
				onDefault={() => set(family, null)}
			/>
			<OptionalSizeRow
				value={theme[size]}
				placeholder={look.fontSize}
				onChange={(v) => set(size, v)}
			/>
			{slot === "Title" ? (
				<FontWeightRow
					family={resolvedFamily}
					value={theme.dataTableTitleFontWeight}
					onChange={(w) => set("dataTableTitleFontWeight", w)}
				/>
			) : (
				<FontWeightRow
					family={resolvedFamily}
					value={theme.dataTableCaptionFontWeight ?? undefined}
					onChange={(w) => set("dataTableCaptionFontWeight", w)}
					onDefault={() => set("dataTableCaptionFontWeight", null)}
				/>
			)}
			<OptionalColorRow
				label="Color"
				field={color}
				placeholder={look.textColor}
				theme={theme}
				set={set}
			/>
			<AlignmentRow
				label="Alignment"
				value={theme[align]}
				onChange={(a) => set(align, a)}
			/>
		</>
	)
}

/** Settings → Themes → Data tables: the look of the optional HTML table
 *  under the chart (Sidebar → Data table). Every visual starts from these;
 *  the sidebar shows them as placeholders and stores only what a visual
 *  changes (`resolveDataTableStyle`). Empty table-text rows follow the
 *  theme's base text font, and empty title / caption rows follow the table
 *  text, so both track a later Text fonts change. */
export const DataTablesSection = ({ theme, set, isReadOnly }: ThemeSectionProps) => {
	const look = themeDataTableStyle(theme)
	return (
		<SectionGroup title="Data tables" isReadOnly={isReadOnly}>
			<p className="text-xs vc-muted">
				What the data table under a chart starts as on every visual. The
				sidebar&apos;s Data table section overrides these per visual.
			</p>
			<Section title="Title">
				<p className="text-xs vc-muted">
					Above the table. Empty rows follow the table text.
				</p>
				<TextBlockRows slot="Title" theme={theme} look={look} set={set} />
			</Section>
			<Section title="Header">
				<p className="text-xs vc-muted">
					Empty family / size / text color rows follow the table text.
				</p>
				<FontFamilyRow
					label="Family"
					value={theme.dataTableHeaderFontFamily ?? undefined}
					onChange={(f) => set("dataTableHeaderFontFamily", f)}
					onDefault={() => set("dataTableHeaderFontFamily", null)}
				/>
				<OptionalSizeRow
					value={theme.dataTableHeaderFontSize}
					placeholder={look.fontSize}
					onChange={(v) => set("dataTableHeaderFontSize", v)}
				/>
				<FontWeightRow
					family={look.headerFontFamily}
					value={theme.dataTableHeaderFontWeight}
					onChange={(w) => set("dataTableHeaderFontWeight", w)}
				/>
				<OptionalColorRow
					label="Text color"
					field="dataTableHeaderTextColor"
					placeholder={look.textColor}
					theme={theme}
					set={set}
				/>
				<OptionalColorRow
					label="Background"
					field="dataTableHeaderBackground"
					placeholder="(none)"
					theme={theme}
					set={set}
				/>
				<SubHeading>Bottom line</SubHeading>
				<NumberInput
					label="Thickness"
					value={theme.dataTableHeaderBorderWidth}
					min={0}
					max={20}
					step={0.5}
					suffix="px"
					onChange={(v) => set("dataTableHeaderBorderWidth", v)}
				/>
				{/* Shown even at 0: a visual that turns the line on still
				 *  takes this color. */}
				<OptionalColorRow
					label="Color"
					field="dataTableHeaderBorderColor"
					placeholder="(row border)"
					theme={theme}
					set={set}
				/>
			</Section>
			<Section title="Table text">
				<p className="text-xs vc-muted">
					The cells. Empty rows follow the theme&apos;s text font.
				</p>
				<FontFamilyRow
					label="Family"
					value={theme.dataTableFontFamily ?? undefined}
					onChange={(f) => set("dataTableFontFamily", f)}
					onDefault={() => set("dataTableFontFamily", null)}
				/>
				<OptionalSizeRow
					value={theme.dataTableFontSize}
					placeholder={theme.textFontSize}
					onChange={(v) => set("dataTableFontSize", v)}
				/>
				<FontWeightRow
					family={look.fontFamily}
					value={theme.dataTableFontWeight ?? undefined}
					onChange={(w) => set("dataTableFontWeight", w)}
					onDefault={() => set("dataTableFontWeight", null)}
				/>
				<OptionalColorRow
					label="Color"
					field="dataTableTextColor"
					placeholder={theme.textFontColor}
					theme={theme}
					set={set}
				/>
				<CheckRow
					label="Format first column like other columns"
					checked={theme.dataTableFirstColumnLikeOthers}
					onChange={(v) => set("dataTableFirstColumnLikeOthers", v)}
				/>
				{/* Shown even while checked: a visual that unchecks the box
				 *  takes these. */}
				<SubHeading>First column</SubHeading>
				<p className="text-xs vc-muted">
					The first column&apos;s cells, when a visual formats it on its own.
					Empty rows follow the table text.
				</p>
				<FontFamilyRow
					label="Family"
					value={theme.dataTableFirstColumnFontFamily ?? undefined}
					onChange={(f) => set("dataTableFirstColumnFontFamily", f)}
					onDefault={() => set("dataTableFirstColumnFontFamily", null)}
				/>
				<OptionalSizeRow
					value={theme.dataTableFirstColumnFontSize}
					placeholder={look.fontSize}
					onChange={(v) => set("dataTableFirstColumnFontSize", v)}
				/>
				<FontWeightRow
					family={look.firstColumnFontFamily}
					value={theme.dataTableFirstColumnFontWeight ?? undefined}
					onChange={(w) => set("dataTableFirstColumnFontWeight", w)}
					onDefault={() => set("dataTableFirstColumnFontWeight", null)}
				/>
				<OptionalColorRow
					label="Color"
					field="dataTableFirstColumnColor"
					placeholder={look.textColor}
					theme={theme}
					set={set}
				/>
				<SubHeading>Column alignment</SubHeading>
				<p className="text-xs vc-muted">
					Where number and date columns start; every other column starts
					left. Each visual can set every column on its own.
				</p>
				<AlignmentRow
					label="Numbers & dates"
					value={theme.dataTableNumberAlign}
					onChange={(a) => set("dataTableNumberAlign", a)}
				/>
			</Section>
			<Section title="Rows">
				<OptionalColorRow
					label="Border color"
					field="dataTableBorderColor"
					placeholder="(auto)"
					theme={theme}
					set={set}
				/>
				<CheckRow
					label="Striped rows"
					checked={theme.dataTableStriped}
					onChange={(v) => set("dataTableStriped", v)}
				/>
				{/* Shown even unchecked: a visual that turns stripes on still
				 *  takes this color. */}
				<OptionalColorRow
					label="Stripe color"
					field="dataTableStripeColor"
					placeholder="(auto)"
					theme={theme}
					set={set}
				/>
			</Section>
			<Section title="Caption">
				<p className="text-xs vc-muted">
					Below the table, when a visual writes one. Empty rows follow the
					table text.
				</p>
				<TextBlockRows slot="Caption" theme={theme} look={look} set={set} />
			</Section>
		</SectionGroup>
	)
}
