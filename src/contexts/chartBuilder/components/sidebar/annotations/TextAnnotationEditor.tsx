import type { ReactNode } from "react"
import { LABEL_COL } from "../../../../../components/ui/LabeledField"
import { NumberInput } from "../../../../../components/ui/NumberInput"
import { ResetLink } from "../../../../../components/ui/ResetLink"
import {
	type RectangleTextStyle,
	type TextAnnotation,
	type TextAnnotationBoxStyle,
} from "../../../lib/annotationsConfig"
import type { AxisInfo } from "./axisInfo"
import { AnnotationCard } from "./controls"
import {
	BorderSection,
	FillSection,
	PointPositionSection,
	TextContentField,
	TextStyleSection,
} from "./sections"

/** Sidebar editor for free-standing text annotations. Same text / fill /
 *  border controls a rectangle has, plus a corner radius — the difference is
 *  position: a text annotation is anchored at ONE point, because its box is
 *  auto-sized to the label rather than dragged out by the user. `textAlign`
 *  picks which edge of that box lands on the anchor (see
 *  `lib/textAnnotationGeometry.ts`).
 *
 *  Body order: the text box first and OUTSIDE any subsection (it's the
 *  annotation itself, so it must never hide behind a collapsed header), then
 *  "Text formatting", then Position (which ends with the layer toggle),
 *  Fill, Border. */
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
}) => (
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
			title="Text formatting"
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
			help="The label is centered on y. Alignment picks which side of it sits at x."
			zOrder={anno.zOrder}
			onZOrderChange={(zOrder) => onChange({ zOrder })}
		/>

		<FillSection style={anno} defaults={defaults} onChange={onChange} />

		<BorderSection
			style={anno}
			defaults={defaults}
			onChange={onChange}
			ariaContext="text annotation border"
		>
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
		</BorderSection>
	</AnnotationCard>
)
