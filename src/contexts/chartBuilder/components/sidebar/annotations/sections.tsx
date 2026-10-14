import type { ReactNode } from "react"
import { useAtomValue } from "jotai"
import { CollapsibleSubsection } from "../../../../../components/ui/CollapsibleSubsection"
import { ColorInput } from "../../../../../components/ui/ColorInput"
import { LABEL_COL } from "../../../../../components/ui/LabeledField"
import { NumberInput } from "../../../../../components/ui/NumberInput"
import { ResetLink } from "../../../../../components/ui/ResetLink"
import { SelectInput } from "../../../../../components/ui/SelectInput"
import {
	isPixelSystem,
	type AnnotationCoordSystem,
} from "../../../lib/annotationPixels"
import type {
	BoxAnnotationStyle,
	RectangleTextStyle,
} from "../../../lib/annotationsConfig"
import { fontWeightOptionsFor } from "../../../lib/labelsConfig"
import { currentRenderedPanelInnerDimsAtom } from "../../../store/atoms"
import {
	useFontFamilyOptions,
	useUserFontWeights,
} from "../../../store/useFontOptions"
import { AlignmentControl } from "../LabelsPanel"
import { DashStylePicker } from "../channelOptions/dashControls"
import {
	convertCoord,
	toNumber,
	cleanNumber,
	type AxisInfo,
	type PlotDims,
} from "./axisInfo"
import { AxisValueInput, LayerRow } from "./controls"
import { Textarea } from "../../../../../components/ui/Input"

/** The rendered plot's size, so unit toggles can convert the stored numbers
 *  and keep the annotation where it is. */
export const usePlotDims = (): PlotDims =>
	useAtomValue(currentRenderedPanelInnerDimsAtom)

/** The "Adjust by" dropdown every annotation kind's Position subsection
 *  opens with: how the coordinate boxes below it are read.
 *
 *  - **Percent (0–100)**: fractions of the plot rect, origin bottom-left.
 *  - **Values (data units)**: through the chart's position scales.
 *  - **Pixels (from top-left / bottom-left / top-right / bottom-right)**:
 *    whole px from that corner of the plot, +x right and +y up in every
 *    case — only the origin moves. These are the ones to use for anything
 *    placed OUTSIDE the plot: a percent past 0 or 100 is a fraction of the
 *    plot's size, so it drifts across the fixed-height chrome (panel titles,
 *    the title band) as the chart resizes, while "14px above the top-left
 *    corner" is 14px on every viewport. Pick the corner on the side the
 *    annotation hangs off: a note under the plot measured from the top
 *    scales with the plot height again (and lands at a different depth under
 *    each panel of a facet grid whose panels differ in height).
 *
 *  The caller converts its stored coordinates on change (`convertCoord`) so
 *  the new boxes show the same position in the new unit. */
export const CoordSystemSelect = ({
	value,
	onChange,
	disableValues,
}: {
	value: AnnotationCoordSystem
	onChange: (next: AnnotationCoordSystem) => void
	/** Gray out "Values (data units)" on polar charts (radar / pie), which
	 *  have no cartesian axes for the coordinates to map against. */
	disableValues?: boolean
}) => (
	<SelectInput
		label="Adjust by"
		labelClassName={LABEL_COL}
		value={value}
		options={[
			{ value: "percent", label: "Percent (0–100)" },
			{
				value: "values",
				label: "Values (data units)",
				disabled: disableValues,
			},
			{ value: "pixels", label: "Pixels (from top-left)" },
			{ value: "pixelsBottomLeft", label: "Pixels (from bottom-left)" },
			{ value: "pixelsTopRight", label: "Pixels (from top-right)" },
			{ value: "pixelsBottomRight", label: "Pixels (from bottom-right)" },
		]}
		onChange={(v) => {
			const next = v as AnnotationCoordSystem
			if (next === value) return
			if (next === "values" && disableValues) return
			onChange(next)
		}}
	/>
)

export const PIXELS_HELP =
	"Whole pixels from the plot's top-left corner — x to the right, y up (negative y is inside the plot). The spot holds still as the chart resizes."
export const PIXELS_BOTTOM_LEFT_HELP =
	"Whole pixels from the plot's bottom-left corner — x to the right, y up (negative y is below the plot). The spot holds still as the chart resizes, and sits the same distance under every facet panel."
export const PIXELS_TOP_RIGHT_HELP =
	"Whole pixels from the plot's top-right corner — x to the right, y up (negative x or y is inside the plot). The spot holds still as the chart resizes."
export const PIXELS_BOTTOM_RIGHT_HELP =
	"Whole pixels from the plot's bottom-right corner — x to the right, y up (negative x is inside the plot, negative y is below it). The spot holds still as the chart resizes."

/** The helper line for whichever pixel corner is selected (null for the
 *  non-pixel units). */
export const pixelsHelpFor = (system: AnnotationCoordSystem): string | null => {
	switch (system) {
		case "pixels":
			return PIXELS_HELP
		case "pixelsBottomLeft":
			return PIXELS_BOTTOM_LEFT_HELP
		case "pixelsTopRight":
			return PIXELS_TOP_RIGHT_HELP
		case "pixelsBottomRight":
			return PIXELS_BOTTOM_RIGHT_HELP
		default:
			return null
	}
}

/** The coordinate fields rectangles and line segments share: four edge /
 *  endpoint values plus how they're interpreted. Both annotation types store
 *  exactly these members, so one Position section serves both editors. */
type EdgeCoords = {
	coordSystem: AnnotationCoordSystem
	xMin: number | string
	xMax: number | string
	yMin: number | string
	yMax: number | string
}

/** The layer field every annotation stores: drawn under or over the chart
 *  marks. Each Position subsection ends with its toggle, under a divider. */
type LayerProps = {
	zOrder: "behind" | "front"
	onZOrderChange: (zOrder: "behind" | "front") => void
}

/** "Position" subsection for the two edge-coordinate annotation kinds
 *  (rectangle + line segment): the "Adjust by" unit toggle, the four
 *  coordinate inputs, and the layer toggle. The position
 *  math is plot-area-relative — see `annotationsConfig.ts` for the coordinate
 *  convention. The actual drawing happens in PlotCanvas, which converts the
 *  coords to pixel coords against each panel's `inner` rect. */
export const EdgePositionSection = ({
	coords,
	onChange,
	xAxis,
	yAxis,
	disableValues,
	zOrder,
	onZOrderChange,
}: {
	coords: EdgeCoords
	onChange: (patch: Partial<EdgeCoords>) => void
	xAxis: AxisInfo
	yAxis: AxisInfo
	/** Gray out "Values (data units)" on polar charts (radar / pie), which
	 *  have no cartesian axes for the edges to map against. */
	disableValues?: boolean
} & LayerProps) => {
	const dims = usePlotDims()
	const pxInput = (
		key: "xMin" | "xMax" | "yMin" | "yMax",
		label: string
	) => (
		<NumberInput
			label={label}
			labelClassName={LABEL_COL}
			value={cleanNumber(toNumber(coords[key]))}
			step={1}
			onChange={(v) => onChange({ [key]: v })}
			suffix="px"
		/>
	)
	return (
		<CollapsibleSubsection title="Position">
			<div className="flex flex-col gap-2">
				<CoordSystemSelect
					value={coords.coordSystem}
					disableValues={disableValues}
					onChange={(next) => {
						// Convert the stored coords so the new boxes show the
						// equivalent position in the target system. Without this
						// the user sees raw percents being treated as data values
						// (or vice versa).
						const cur = coords.coordSystem
						const convert = (
							val: number | string,
							ax: AxisInfo,
							dim: "x" | "y"
						) => convertCoord(val, cur, next, ax, dim, dims)
						onChange({
							coordSystem: next,
							xMin: convert(coords.xMin, xAxis, "x"),
							xMax: convert(coords.xMax, xAxis, "x"),
							yMin: convert(coords.yMin, yAxis, "y"),
							yMax: convert(coords.yMax, yAxis, "y"),
						})
					}}
				/>

				{coords.coordSystem === "percent" ? (
					<div className="flex flex-col gap-2">
						<NumberInput
							label="left %"
							labelClassName={LABEL_COL}
							value={cleanNumber(toNumber(coords.xMin) * 100)}
							step={1}
							onChange={(v) => onChange({ xMin: v / 100 })}
							suffix="%"
						/>
						<NumberInput
							label="right %"
							labelClassName={LABEL_COL}
							value={cleanNumber(toNumber(coords.xMax) * 100)}
							step={1}
							onChange={(v) => onChange({ xMax: v / 100 })}
							suffix="%"
						/>
						<NumberInput
							label="bottom %"
							labelClassName={LABEL_COL}
							value={cleanNumber(toNumber(coords.yMin) * 100)}
							step={1}
							onChange={(v) => onChange({ yMin: v / 100 })}
							suffix="%"
						/>
						<NumberInput
							label="top %"
							labelClassName={LABEL_COL}
							value={cleanNumber(toNumber(coords.yMax) * 100)}
							step={1}
							onChange={(v) => onChange({ yMax: v / 100 })}
							suffix="%"
						/>
					</div>
				) : coords.coordSystem === "values" ? (
					<div className="flex flex-col gap-2">
						<AxisValueInput
							label="left"
							labelClassName={LABEL_COL}
							value={coords.xMin}
							axis={xAxis}
							onChange={(v) => onChange({ xMin: v })}
						/>
						<AxisValueInput
							label="right"
							labelClassName={LABEL_COL}
							value={coords.xMax}
							axis={xAxis}
							onChange={(v) => onChange({ xMax: v })}
						/>
						<AxisValueInput
							label="bottom"
							labelClassName={LABEL_COL}
							value={coords.yMin}
							axis={yAxis}
							onChange={(v) => onChange({ yMin: v })}
						/>
						<AxisValueInput
							label="top"
							labelClassName={LABEL_COL}
							value={coords.yMax}
							axis={yAxis}
							onChange={(v) => onChange({ yMax: v })}
						/>
					</div>
				) : (
					<div className="flex flex-col gap-2">
						{pxInput("xMin", "left")}
						{pxInput("xMax", "right")}
						{pxInput("yMin", "bottom")}
						{pxInput("yMax", "top")}
						<p className="vc-help">{pixelsHelpFor(coords.coordSystem)}</p>
					</div>
				)}
			</div>
			<div className="vc-divider-group">
				<LayerRow zOrder={zOrder} onChange={onZOrderChange} />
			</div>
		</CollapsibleSubsection>
	)
}

/** The coordinate fields a single-anchor annotation stores. Only the text
 *  annotation uses this today: it's a point, not a region, because its box is
 *  auto-sized to the text. */
type PointCoords = {
	coordSystem: AnnotationCoordSystem
	x: number | string
	y: number | string
}

/** "Position" subsection for point-anchored annotations: the "Adjust by" unit
 *  toggle, one x and one y input, and the layer toggle. Same coordinate
 *  convention and same conversion-on-toggle behavior as `EdgePositionSection`
 *  — see `annotationsConfig.ts`. */
export const PointPositionSection = ({
	coords,
	onChange,
	xAxis,
	yAxis,
	disableValues,
	help,
	zOrder,
	onZOrderChange,
}: {
	coords: PointCoords
	onChange: (patch: Partial<PointCoords>) => void
	xAxis: AxisInfo
	yAxis: AxisInfo
	/** Gray out "Values (data units)" on polar charts (radar / pie), which
	 *  have no cartesian axes for the anchor to map against. */
	disableValues?: boolean
	/** Helper prose explaining what the anchor point means for this kind. */
	help?: string
} & LayerProps) => {
	const dims = usePlotDims()
	return (
		<CollapsibleSubsection title="Position">
			<CoordSystemSelect
				value={coords.coordSystem}
				disableValues={disableValues}
				onChange={(next) => {
					// Convert the stored coords so the new boxes show the equivalent
					// position in the target system (see EdgePositionSection).
					const cur = coords.coordSystem
					onChange({
						coordSystem: next,
						x: convertCoord(coords.x, cur, next, xAxis, "x", dims),
						y: convertCoord(coords.y, cur, next, yAxis, "y", dims),
					})
				}}
			/>
			{coords.coordSystem === "percent" ? (
				<div className="flex flex-col gap-2">
					<NumberInput
						label="x %"
						labelClassName={LABEL_COL}
						value={cleanNumber(toNumber(coords.x) * 100)}
						step={1}
						onChange={(v) => onChange({ x: v / 100 })}
						suffix="%"
					/>
					<NumberInput
						label="y %"
						labelClassName={LABEL_COL}
						value={cleanNumber(toNumber(coords.y) * 100)}
						step={1}
						onChange={(v) => onChange({ y: v / 100 })}
						suffix="%"
					/>
				</div>
			) : coords.coordSystem === "values" ? (
				<div className="flex flex-col gap-2">
					<AxisValueInput
						label="x"
						labelClassName={LABEL_COL}
						value={coords.x}
						axis={xAxis}
						onChange={(v) => onChange({ x: v })}
					/>
					<AxisValueInput
						label="y"
						labelClassName={LABEL_COL}
						value={coords.y}
						axis={yAxis}
						onChange={(v) => onChange({ y: v })}
					/>
				</div>
			) : (
				<div className="flex flex-col gap-2">
					<NumberInput
						label="x"
						labelClassName={LABEL_COL}
						value={cleanNumber(toNumber(coords.x))}
						step={1}
						onChange={(v) => onChange({ x: v })}
						suffix="px"
					/>
					<NumberInput
						label="y"
						labelClassName={LABEL_COL}
						value={cleanNumber(toNumber(coords.y))}
						step={1}
						onChange={(v) => onChange({ y: v })}
						suffix="px"
					/>
				</div>
			)}
			{help && <p className="vc-help">{help}</p>}
			{isPixelSystem(coords.coordSystem) && (
				<p className="vc-help">{pixelsHelpFor(coords.coordSystem)}</p>
			)}
			<div className="vc-divider-group">
				<LayerRow zOrder={zOrder} onChange={onZOrderChange} />
			</div>
		</CollapsibleSubsection>
	)
}

/** The fill fields rectangles and circles share (from BoxAnnotationStyle). */
type FillStyle = Pick<BoxAnnotationStyle, "backgroundColor" | "backgroundOpacity">

/** "Fill" subsection shared by the two filled annotation kinds (rectangle +
 *  circle): fill color + opacity with reset links against the theme-seeded
 *  `defaults` baseline. */
export const FillSection = ({
	style,
	defaults,
	onChange,
}: {
	style: FillStyle
	/** Theme-seeded style baseline the reset links compare against. */
	defaults: FillStyle
	onChange: (patch: Partial<FillStyle>) => void
}) => (
	<CollapsibleSubsection title="Fill">
		<div className="flex flex-col gap-2">
			<div className="flex flex-wrap items-center gap-2">
				<ColorInput
					label="Fill"
					labelClassName={LABEL_COL}
					value={style.backgroundColor}
					onChange={(c) => onChange({ backgroundColor: c })}
				/>
				{style.backgroundColor !== defaults.backgroundColor && (
					<ResetLink
						onClick={() =>
							onChange({
								backgroundColor: defaults.backgroundColor,
							})
						}
					/>
				)}
			</div>
			<div className="flex items-center gap-2">
				<NumberInput
					label="Fill opacity"
					labelClassName={LABEL_COL}
					value={style.backgroundOpacity}
					step={0.05}
					min={0}
					max={1}
					onChange={(v) => onChange({ backgroundOpacity: v })}
				/>
				{style.backgroundOpacity !== defaults.backgroundOpacity && (
					<ResetLink
						onClick={() =>
							onChange({
								backgroundOpacity: defaults.backgroundOpacity,
							})
						}
					/>
				)}
			</div>
		</div>
	</CollapsibleSubsection>
)

/** The border fields rectangles and circles share (from BoxAnnotationStyle).
 *  `borderDasharray` stays optional to match the annotation types, where
 *  it's absent on shapes saved before the Custom dash choice existed. */
type BorderStyle = Pick<
	BoxAnnotationStyle,
	"borderColor" | "borderThickness" | "borderOpacity" | "borderDash"
> & {
	borderDasharray?: string | null
}

/** "Border" subsection shared by the two filled annotation kinds (rectangle +
 *  circle): stroke color / thickness / opacity plus the shared DashStylePicker
 *  (custom dasharray wins over the preset pattern). */
export const BorderSection = ({
	style,
	defaults,
	onChange,
	ariaContext,
	children,
}: {
	style: BorderStyle
	/** Theme-seeded style baseline the reset links compare against. */
	defaults: Pick<BorderStyle, "borderColor" | "borderThickness" | "borderOpacity">
	onChange: (patch: Partial<BorderStyle>) => void
	/** Accessible-name context for the dash picker's radio group, e.g.
	 *  "rectangle border" / "circle border". */
	ariaContext: string
	/** Extra rows appended after the dash picker — the text annotation's
	 *  corner-radius control, which only that kind has. */
	children?: ReactNode
}) => (
	<CollapsibleSubsection title="Border">
		<div className="flex flex-col gap-2">
			<div className="flex flex-wrap items-center gap-2">
				<ColorInput
					label="Color"
					labelClassName={LABEL_COL}
					value={style.borderColor}
					onChange={(c) => onChange({ borderColor: c })}
				/>
				{style.borderColor !== defaults.borderColor && (
					<ResetLink
						onClick={() =>
							onChange({ borderColor: defaults.borderColor })
						}
					/>
				)}
			</div>
			<div className="flex items-center gap-2">
				<NumberInput
					label="Thickness"
					labelClassName={LABEL_COL}
					value={style.borderThickness}
					step={0.5}
					min={0}
					onChange={(v) => onChange({ borderThickness: v })}
					suffix="px"
				/>
				{style.borderThickness !== defaults.borderThickness && (
					<ResetLink
						onClick={() =>
							onChange({
								borderThickness: defaults.borderThickness,
							})
						}
					/>
				)}
			</div>
			<div className="flex items-center gap-2">
				<NumberInput
					label="Opacity"
					labelClassName={LABEL_COL}
					value={style.borderOpacity}
					step={0.05}
					min={0}
					max={1}
					onChange={(v) => onChange({ borderOpacity: v })}
				/>
				{style.borderOpacity !== defaults.borderOpacity && (
					<ResetLink
						onClick={() =>
							onChange({ borderOpacity: defaults.borderOpacity })
						}
					/>
				)}
			</div>
			<div className="flex items-start gap-2 text-sm">
				<span className={`${LABEL_COL} shrink-0 pt-1.5`}>Dash</span>
				<DashStylePicker
					pattern={style.borderDash}
					customDasharray={style.borderDasharray ?? null}
					onChange={({ pattern, customDasharray }) =>
						onChange({
							borderDash: pattern,
							borderDasharray: customDasharray,
						})
					}
					ariaContext={ariaContext}
				/>
			</div>
			{children}
		</div>
	</CollapsibleSubsection>
)

/** The text content + styling an annotation's label carries. The rectangle
 *  stores these optionally (they postdate the shape), the text annotation
 *  requires them, so the section reads through `??` fallbacks and writes the
 *  same field names for both. */
type TextStyle = Partial<RectangleTextStyle> & { text?: string }

/** "Text" subsection shared by the rectangle's inner label and the
 *  free-standing text annotation: the text box plus font family / size /
 *  color / weight / alignment / padding, each with a reset link against the
 *  theme-seeded `defaults` baseline. */
/** The annotation's text content: a labeled, auto-sizing textarea. The
 *  rectangle keeps it inside its "Text" subsection (the label is optional
 *  there); the text annotation hoists it to the top of the card, outside any
 *  subsection, because the text IS the annotation and hiding it behind a
 *  collapsed header led users to type it into the name box instead. */
export const TextContentField = ({
	value,
	onChange,
	placeholder,
	className,
	label = "Text",
}: {
	value: string | undefined
	onChange: (text: string) => void
	/** Placeholder for the text box, naming where the label is drawn. */
	placeholder: string
	className?: string
	/** Visible caption above the box. `null` hides it (the text annotation
	 *  hoists the box to the top of its card, where a "Text" caption just
	 *  repeats the card's own kind); the textarea keeps it as its
	 *  accessible name. */
	label?: string | null
}) => (
	<label className={`flex flex-col gap-1 text-sm ${className ?? ""}`}>
		{label !== null && <span className="vc-muted">{label}</span>}
		<Textarea
			aria-label={label === null ? "Text" : undefined}
			value={value ?? ""}
			onChange={(e) => onChange(e.target.value)}
			placeholder={placeholder}
			rows={2}
			autoSize
		/>
	</label>
)

export const TextStyleSection = ({
	style,
	defaults,
	onChange,
	placeholder,
	alignmentHelp,
	title = "Text",
}: {
	style: TextStyle
	/** Theme-seeded text baseline the reset links compare against. */
	defaults: RectangleTextStyle
	onChange: (patch: Partial<TextStyle>) => void
	/** Placeholder for the text box, naming where the label is drawn. Omit
	 *  to leave the text box out of the subsection (the caller renders a
	 *  `TextContentField` elsewhere) so this holds formatting only. */
	placeholder?: string
	/** Extra prose under the Alignment row — the text annotation's alignment
	 *  also picks which edge of the box lands on the anchor point. */
	alignmentHelp?: string
	/** Subsection header; "Text formatting" when the text box lives outside. */
	title?: string
}) => {
	const familyOptions = useFontFamilyOptions()
	const userFontWeights = useUserFontWeights()
	const fontFamily = style.textFontFamily ?? defaults.textFontFamily
	const fontSize = style.textFontSize ?? defaults.textFontSize
	const color = style.textColor ?? defaults.textColor
	const weight = style.textFontWeight ?? defaults.textFontWeight
	const align = style.textAlign ?? defaults.textAlign
	const padding = style.textPadding ?? defaults.textPadding
	return (
		<CollapsibleSubsection title={title}>
			{placeholder !== undefined && (
				<TextContentField
					value={style.text}
					onChange={(text) => onChange({ text })}
					placeholder={placeholder}
				/>
			)}
			<SelectInput
				label="Font"
				labelClassName={LABEL_COL}
				value={fontFamily}
				options={familyOptions}
				onChange={(textFontFamily) => onChange({ textFontFamily })}
				selectClassName="flex-1"
			/>
			<div className="flex items-center gap-2">
				<NumberInput
					label="Size"
					labelClassName={LABEL_COL}
					value={fontSize}
					min={1}
					step={1}
					onChange={(v) => onChange({ textFontSize: v })}
					suffix="pt"
				/>
				{fontSize !== defaults.textFontSize && (
					<ResetLink
						onClick={() => onChange({ textFontSize: defaults.textFontSize })}
					/>
				)}
			</div>
			<div className="flex flex-wrap items-center gap-2">
				<ColorInput
					label="Color"
					labelClassName={LABEL_COL}
					value={color}
					onChange={(c) => onChange({ textColor: c })}
					paletteKind="text"
				/>
				{color !== defaults.textColor && (
					<ResetLink
						onClick={() => onChange({ textColor: defaults.textColor })}
					/>
				)}
			</div>
			<div className="flex items-center gap-2">
				<SelectInput
					label="Weight"
					labelClassName={LABEL_COL}
					value={String(weight)}
					options={fontWeightOptionsFor(
						fontFamily,
						weight,
						userFontWeights
					).map((w) => ({ value: String(w.value), label: w.label }))}
					onChange={(w) => onChange({ textFontWeight: Number(w) })}
				/>
				{weight !== defaults.textFontWeight && (
					<ResetLink
						onClick={() =>
							onChange({ textFontWeight: defaults.textFontWeight })
						}
					/>
				)}
			</div>
			{/* div, not label: AlignmentControl is a button group, not a form control */}
			<div className="flex items-center gap-2 text-sm">
				<span className={LABEL_COL}>Alignment</span>
				<AlignmentControl
					value={align}
					onChange={(textAlign) => onChange({ textAlign })}
				/>
			</div>
			{alignmentHelp && <p className="vc-help">{alignmentHelp}</p>}
			<div className="flex items-center gap-2">
				<NumberInput
					label="Padding"
					labelClassName={LABEL_COL}
					value={padding}
					min={0}
					step={1}
					onChange={(v) => onChange({ textPadding: v })}
					suffix="px"
				/>
				{padding !== defaults.textPadding && (
					<ResetLink
						onClick={() => onChange({ textPadding: defaults.textPadding })}
					/>
				)}
			</div>
		</CollapsibleSubsection>
	)
}
