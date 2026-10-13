import type { ReactNode } from "react"
import { CollapsibleSubsection } from "../../../../../components/ui/CollapsibleSubsection"
import { LABEL_COL } from "../../../../../components/ui/LabeledField"
import { NumberInput } from "../../../../../components/ui/NumberInput"
import {
	type BoxAnnotationStyle,
	type CircleAnnotation,
} from "../../../lib/annotationsConfig"
import {
	convertCoord,
	convertRadius,
	toNumber,
	cleanNumber,
	type AxisInfo,
} from "./axisInfo"
import { AnnotationCard, AxisValueInput, LayerRow } from "./controls"
import {
	BorderSection,
	CoordSystemSelect,
	FillSection,
	PIXELS_HELP,
	usePlotDims,
} from "./sections"

/** Sidebar editor for circle annotations. Mirrors RectangleEditor, but a
 *  circle is center + radius rather than four edges. The radius is measured
 *  against a single chosen axis (`radiusAxis`) so it always renders as a true
 *  on-screen circle — see `circleAnnotationGeometry.ts` for the placement. */
export const CircleEditor = ({
	circle,
	defaults,
	onChange,
	onRemove,
	open,
	onToggle,
	xAxis,
	yAxis,
	isRadar,
	disableValues,
	namePlaceholder,
	facetScope,
}: {
	circle: CircleAnnotation
	/** Theme-seeded style baseline the reset links compare against. */
	defaults: BoxAnnotationStyle
	onChange: (patch: Partial<CircleAnnotation>) => void
	onRemove: () => void
	/** Whether the editor body is expanded; the name row always shows. */
	open: boolean
	onToggle: () => void
	xAxis: AxisInfo
	yAxis: AxisInfo
	/** Radar: value-mode center is polar — x=angle, y=r — and the radius is
	 *  always measured on the r-axis, so we relabel the inputs and hide the
	 *  x/y radius-axis toggle. */
	isRadar?: boolean
	/** Gray out the "Values (data units)" option (non-radar polar / pie). */
	disableValues?: boolean
	/** Light suggestion shown when the user hasn't named the annotation. */
	namePlaceholder?: string
	/** Facet-targeting control, rendered at the top when faceted (else null). */
	facetScope?: ReactNode
}) => {
	// On radar the radius is always in r-axis units (yAxis); off-radar it
	// follows the user's radius-axis choice.
	const radiusAxisInfo = isRadar
		? yAxis
		: circle.radiusAxis === "x"
			? xAxis
			: yAxis
	const dims = usePlotDims()
	// Pixels-mode radius converts against the radius axis's plot extent.
	const radiusExtentPx =
		dims === null
			? null
			: circle.radiusAxis === "x"
				? dims.widthPx
				: dims.heightPx
	return (
		<AnnotationCard
			kind="circle"
			name={circle.name}
			namePlaceholder={namePlaceholder}
			onNameChange={(name) => onChange({ name })}
			onRemove={onRemove}
			open={open}
			onToggle={onToggle}
		>
			{facetScope}

			<CollapsibleSubsection title="Position">
				<div className="flex flex-col gap-2">
					<CoordSystemSelect
						value={circle.coordSystem}
						disableValues={disableValues}
						onChange={(next) => {
							// Convert center + radius so the new boxes show the equivalent
							// position in the target system, same as RectangleEditor.
							const cur = circle.coordSystem
							onChange({
								coordSystem: next,
								centerX: convertCoord(
									circle.centerX,
									cur,
									next,
									xAxis,
									"x",
									dims
								),
								centerY: convertCoord(
									circle.centerY,
									cur,
									next,
									yAxis,
									"y",
									dims
								),
								radius: convertRadius(
									circle.radius,
									cur,
									next,
									radiusAxisInfo,
									radiusExtentPx
								),
							})
						}}
					/>

					{circle.coordSystem === "percent" ? (
						<div className="flex flex-col gap-2">
							<NumberInput
								label="center x %"
								labelClassName={LABEL_COL}
								value={cleanNumber(toNumber(circle.centerX) * 100)}
								step={1}
								onChange={(v) => onChange({ centerX: v / 100 })}
								suffix="%"
							/>
							<NumberInput
								label="center y %"
								labelClassName={LABEL_COL}
								value={cleanNumber(toNumber(circle.centerY) * 100)}
								step={1}
								onChange={(v) => onChange({ centerY: v / 100 })}
								suffix="%"
							/>
							<NumberInput
								label="radius %"
								labelClassName={LABEL_COL}
								value={cleanNumber(toNumber(circle.radius) * 100)}
								step={1}
								min={0}
								onChange={(v) => onChange({ radius: v / 100 })}
								suffix="%"
							/>
						</div>
					) : circle.coordSystem === "values" ? (
						<div className="flex flex-col gap-2">
							<AxisValueInput
								label={isRadar ? "center angle" : "center x"}
								labelClassName={LABEL_COL}
								value={circle.centerX}
								axis={xAxis}
								onChange={(v) => onChange({ centerX: v })}
							/>
							<AxisValueInput
								label={isRadar ? "center r" : "center y"}
								labelClassName={LABEL_COL}
								value={circle.centerY}
								axis={yAxis}
								onChange={(v) => onChange({ centerY: v })}
							/>
							<NumberInput
								label={isRadar ? "radius (r)" : `radius (${circle.radiusAxis})`}
								labelClassName={LABEL_COL}
								value={cleanNumber(toNumber(circle.radius))}
								step={1}
								min={0}
								onChange={(v) => onChange({ radius: v })}
							/>
						</div>
					) : (
						<div className="flex flex-col gap-2">
							<NumberInput
								label="center x"
								labelClassName={LABEL_COL}
								value={cleanNumber(toNumber(circle.centerX))}
								step={1}
								onChange={(v) => onChange({ centerX: v })}
								suffix="px"
							/>
							<NumberInput
								label="center y"
								labelClassName={LABEL_COL}
								value={cleanNumber(toNumber(circle.centerY))}
								step={1}
								onChange={(v) => onChange({ centerY: v })}
								suffix="px"
							/>
							<NumberInput
								label="radius"
								labelClassName={LABEL_COL}
								value={cleanNumber(toNumber(circle.radius))}
								step={1}
								min={0}
								onChange={(v) => onChange({ radius: v })}
								suffix="px"
							/>
							<p className="vc-help">{PIXELS_HELP}</p>
						</div>
					)}

					{/* Radar radius is always measured on the r-axis, so the x/y
					    radius-axis choice is meaningless there — hide it. */}
					{!isRadar && (
						<div className="flex items-center gap-2 text-sm">
							<span className={LABEL_COL}>
								Radius axis
							</span>
							<div
								role="group"
								aria-label="Radius axis"
								className="inline-flex overflow-hidden rounded border border-vc-brand-text"
							>
								<button
									type="button"
									onClick={() => onChange({ radiusAxis: "x" })}
									className={
										circle.radiusAxis === "x"
											? "vc-toggle-on px-2 py-1 text-sm"
											: "vc-toggle-off px-2 py-1 text-sm"
									}
									aria-pressed={circle.radiusAxis === "x"}
								>
									x
								</button>
								<button
									type="button"
									onClick={() => onChange({ radiusAxis: "y" })}
									className={
										circle.radiusAxis === "y"
											? "vc-toggle-on px-2 py-1 text-sm"
											: "vc-toggle-off px-2 py-1 text-sm"
									}
									aria-pressed={circle.radiusAxis === "y"}
								>
									y
								</button>
							</div>
						</div>
					)}
				</div>
			</CollapsibleSubsection>

			<FillSection style={circle} defaults={defaults} onChange={onChange} />

			<BorderSection
				style={circle}
				defaults={defaults}
				onChange={onChange}
				ariaContext="circle border"
			/>

			<LayerRow
				zOrder={circle.zOrder}
				onChange={(zOrder) => onChange({ zOrder })}
			/>
		</AnnotationCard>
	)
}
