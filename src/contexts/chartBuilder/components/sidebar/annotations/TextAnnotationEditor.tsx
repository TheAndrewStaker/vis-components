import { useRef, type ReactNode } from "react"
import { CollapsibleSubsection } from "../../../../../components/ui/CollapsibleSubsection"
import { ColorInput } from "../../../../../components/ui/ColorInput"
import { LABEL_COL, LabelSpacer } from "../../../../../components/ui/LabeledField"
import { NumberInput } from "../../../../../components/ui/NumberInput"
import { ResetLink } from "../../../../../components/ui/ResetLink"
import { Checkbox } from "../../../../../components/ui/Checkbox"
import {
	type RectangleTextStyle,
	type TextAnnotation,
	type TextAnnotationBoxStyle,
} from "../../../lib/annotationsConfig"
import type { AxisInfo } from "./axisInfo"
import { DashStylePicker } from "../channelOptions/dashControls"
import { AnnotationCard } from "./controls"
import {
	PaddingRow,
	PointPositionSection,
	TextContentField,
	TextStyleSection,
} from "./sections"

/** Sidebar editor for free-standing text annotations. Same text styling a
 *  rectangle has, but fill + border + corner radius + padding fold into ONE
 *  "Box" subsection (the box exists only to frame the text) — the other
 *  difference is
 *  position: a text annotation is anchored at ONE point, because its box is
 *  auto-sized to the label rather than dragged out by the user. `textAlign`
 *  picks which edge of that box lands on the anchor (see
 *  `lib/textAnnotationGeometry.ts`).
 *
 *  Body order: the text box first and OUTSIDE any subsection (it's the
 *  annotation itself, so it must never hide behind a collapsed header), then
 *  "Text", then Position (which ends with the layer toggle), then Box:
 *  Background · Opacity · Corner radius · Padding · Border toggle · Border
 *  color · Border thickness · Border opacity · Dash (the last four only while the border is
 *  on). */
export const TextAnnotationEditor = ({
	anno,
	defaults,
	onChange,
	onRemove,
	open,
	onToggle,
	xAxis,
	yAxis,
	disableValues,
	fallbackName,
	facetScope,
}: {
	anno: TextAnnotation
	/** Theme-seeded style baseline the reset links compare against. */
	defaults: TextAnnotationBoxStyle & RectangleTextStyle
	onChange: (patch: Partial<TextAnnotation>) => void
	onRemove: () => void
	/** Whether the editor body is expanded; the name row always shows. */
	open: boolean
	onToggle: () => void
	xAxis: AxisInfo
	yAxis: AxisInfo
	/** Gray out the "Values (data units)" option — used on polar charts
	 *  (radar / pie) where the anchor has no cartesian axes to map against. */
	disableValues?: boolean
	/** Name shown when the stored one is blank (pre-default-name saves). */
	fallbackName: string
	/** Facet-targeting control, rendered at the top when faceted (else null). */
	facetScope?: ReactNode
}) => {
	// The Border toggle has no field of its own: off stores thickness 0, on
	// restores the last non-zero thickness this editor saw (or the default).
	// Remembered for the session only — a reload falls back to the default.
	const lastThickness = useRef(
		anno.borderThickness > 0 ? anno.borderThickness : defaults.borderThickness
	)
	// A text annotation's border arrives at opacity 0 (invisible), so "on"
	// means "visible": thickness AND opacity above 0. Turning the toggle on
	// restores both; the Border opacity row below stays editable while on.
	const borderOn = anno.borderThickness > 0 && anno.borderOpacity > 0
	const setBorder = (on: boolean) => {
		if (!on && anno.borderThickness > 0) lastThickness.current = anno.borderThickness
		onChange(
			on
				? {
						borderThickness:
							lastThickness.current > 0 ? lastThickness.current : 1,
						borderOpacity:
							anno.borderOpacity > 0
								? anno.borderOpacity
								: defaults.borderOpacity > 0
									? defaults.borderOpacity
									: 1,
					}
				: { borderThickness: 0 }
		)
	}
	return (
		<AnnotationCard
			kind="text"
			name={anno.name}
			fallbackName={fallbackName}
			onNameChange={(name) => onChange({ name })}
			onRemove={onRemove}
			open={open}
			onToggle={onToggle}
		>
			{facetScope}

			{/* px-2 aligns the bare field with the rows inside the boxed subsections. */}
			<TextContentField
				className="px-2"
				label={null}
				value={anno.text}
				onChange={(text) => onChange({ text })}
				placeholder="Text drawn on the chart…"
			/>

			<TextStyleSection
				style={anno}
				defaults={defaults}
				onChange={onChange}
				alignmentHelp="Also sets the anchor: left starts the text at x, center straddles it, right ends there."
			/>

			<PointPositionSection
				coords={anno}
				onChange={onChange}
				xAxis={xAxis}
				yAxis={yAxis}
				disableValues={disableValues}
				help="The label is centered on y. Align picks which side of it sits at x."
				zOrder={anno.zOrder}
				onZOrderChange={(zOrder) => onChange({ zOrder })}
			/>

			<CollapsibleSubsection title="Box">
				<div className="flex flex-col gap-2">
					<div className="flex flex-wrap items-center gap-2">
						<ColorInput
							label="Background"
							labelClassName={LABEL_COL}
							value={anno.backgroundColor}
							onChange={(c) => onChange({ backgroundColor: c })}
						/>
						{anno.backgroundColor !== defaults.backgroundColor && (
							<ResetLink
								onClick={() =>
									onChange({ backgroundColor: defaults.backgroundColor })
								}
							/>
						)}
					</div>
					<div className="flex items-center gap-2">
						<NumberInput
							label="Opacity"
							labelClassName={LABEL_COL}
							value={anno.backgroundOpacity}
							step={0.05}
							min={0}
							max={1}
							onChange={(v) => onChange({ backgroundOpacity: v })}
						/>
						{anno.backgroundOpacity !== defaults.backgroundOpacity && (
							<ResetLink
								onClick={() =>
									onChange({ backgroundOpacity: defaults.backgroundOpacity })
								}
							/>
						)}
					</div>
					<div className="flex items-center gap-2">
						<NumberInput
							label="Corner radius"
							labelClassName={LABEL_COL}
							value={anno.cornerRadius}
							min={0}
							step={1}
							onChange={(v) => onChange({ cornerRadius: v })}
							suffix="px"
						/>
						{anno.cornerRadius !== defaults.cornerRadius && (
							<ResetLink
								onClick={() => onChange({ cornerRadius: defaults.cornerRadius })}
							/>
						)}
					</div>
					<PaddingRow
						value={anno.textPadding}
						defaultValue={defaults.textPadding}
						onChange={(textPadding) => onChange({ textPadding })}
					/>
					<div className="flex items-center gap-2">
						<LabelSpacer />
						<Checkbox label="Border" checked={borderOn} onChange={setBorder} />
					</div>
					{borderOn && (
						<>
							<div className="flex flex-wrap items-center gap-2">
								<ColorInput
									label="Border color"
									labelClassName={LABEL_COL}
									value={anno.borderColor}
									onChange={(c) => onChange({ borderColor: c })}
								/>
								{anno.borderColor !== defaults.borderColor && (
									<ResetLink
										onClick={() => onChange({ borderColor: defaults.borderColor })}
									/>
								)}
							</div>
							<div className="flex items-center gap-2">
								<NumberInput
									label="Border thickness"
									labelClassName={LABEL_COL}
									value={anno.borderThickness}
									step={0.5}
									min={0}
									onChange={(v) => {
										if (v > 0) lastThickness.current = v
										onChange({ borderThickness: v })
									}}
									suffix="px"
								/>
								{anno.borderThickness !== defaults.borderThickness && (
									<ResetLink
										onClick={() =>
											onChange({ borderThickness: defaults.borderThickness })
										}
									/>
								)}
							</div>
							<div className="flex items-center gap-2">
								<NumberInput
									label="Border opacity"
									labelClassName={LABEL_COL}
									value={anno.borderOpacity}
									step={0.05}
									min={0}
									max={1}
									onChange={(v) => onChange({ borderOpacity: v })}
								/>
								{anno.borderOpacity !== defaults.borderOpacity && (
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
									pattern={anno.borderDash}
									customDasharray={anno.borderDasharray ?? null}
									onChange={({ pattern, customDasharray }) =>
										onChange({
											borderDash: pattern,
											borderDasharray: customDasharray,
										})
									}
									ariaContext="text annotation border"
								/>
							</div>
						</>
					)}
				</div>
			</CollapsibleSubsection>
		</AnnotationCard>
	)
}
