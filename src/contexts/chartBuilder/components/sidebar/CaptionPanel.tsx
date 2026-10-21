import { useId } from "react"
import { useAtom, useAtomValue } from "jotai"
import { CollapsibleSubsection } from "../../../../components/ui/CollapsibleSubsection"
import { ColorInput } from "../../../../components/ui/ColorInput"
import { LABEL_COL, LabelSpacer } from "../../../../components/ui/LabeledField"
import { NumberInput } from "../../../../components/ui/NumberInput"
import { ResetLink } from "../../../../components/ui/ResetLink"
import { Toggle } from "../../../../components/ui/Toggle"
import {
	DEFAULT_CAPTION_CONFIG,
	type CaptionConfig,
	type CaptionUnit,
} from "../../lib/captionConfig"
import type { FontConfig } from "../../lib/labelsConfig"
import { captionConfigFromTheme } from "../../lib/themeConfig"
import { AlignmentControl, FontEditor } from "./LabelsPanel"
import {
	currentCaptionConfigAtom,
	currentRenderedCaptionBoxAtom,
} from "../../store/atoms"
import { useCurrentTheme } from "../../store/useCurrentTheme"
import { Select } from "../../../../components/ui/Select"
import { Textarea } from "../../../../components/ui/Input"

/** A NumberInput with a trailing px/% unit selector — used for the position
 *  offsets, which sensibly start stepping from 0. */
const OffsetField = ({
	label,
	value,
	unit,
	onValue,
	onUnit,
}: {
	label: string
	value: number
	unit: CaptionUnit
	onValue: (v: number) => void
	onUnit: (u: CaptionUnit) => void
}) => (
	<NumberInput
		label={label}
		labelClassName={LABEL_COL}
		value={value}
		onChange={onValue}
		step={1}
		suffix={
			<Select
				aria-label={`${label} unit`}
				value={unit}
				onChange={(e) => onUnit(e.target.value as CaptionUnit)}
			>
				<option value="px">px</option>
				<option value="%">%</option>
			</Select>
		}
	/>
)

/** Adapter: the caption's text styling as the shared `FontEditor`'s
 *  `Partial<FontConfig>`. A field equal to the LIVE theme's caption default
 *  reads as unset, so the editor shows the theme value as its placeholder /
 *  "(…)" entry and offers a reset exactly when the value deviates. Italic /
 *  underline are set only when on. */
const captionToFont = (
	cfg: CaptionConfig,
	theme: CaptionConfig
): Partial<FontConfig> => ({
	...(cfg.fontFamily !== theme.fontFamily && { family: cfg.fontFamily }),
	...(cfg.fontSize !== theme.fontSize && { size: cfg.fontSize }),
	...(cfg.textColor !== theme.textColor && { color: cfg.textColor }),
	...(cfg.fontWeight !== theme.fontWeight && { weight: cfg.fontWeight }),
	...(cfg.italic && { italic: true }),
	...(cfg.underline && { underline: true }),
})

/** Inverse of `captionToFont`: an unset field (reset / "(…)" choice) writes
 *  the live theme value back — the same reset target the old per-row links
 *  used (`captionConfigFromTheme`). */
const fontToCaption = (
	font: Partial<FontConfig>,
	theme: CaptionConfig
): Partial<CaptionConfig> => ({
	fontFamily: font.family ?? theme.fontFamily,
	fontSize: font.size ?? theme.fontSize,
	textColor: font.color ?? theme.textColor,
	fontWeight: font.weight ?? theme.fontWeight,
	italic: font.italic || undefined,
	underline: font.underline || undefined,
})

/** Sidebar panel for the Caption subsystem. Drives `CaptionConfig` — a single
 *  free-floating text box rendered inside the plot SVG. The figure reserves a
 *  band at the bottom and shrinks to fit the caption (it never pushes content
 *  past the viewport). Position offsets nudge the box from its default
 *  (centered, pinned to the bottom of the canvas); the figure only grows (and
 *  scrolls) when what the caption DRAWS — its text, or the box when it has a
 *  background or border — is nudged past the canvas edge. Width/height each
 *  carry a px/% unit and step from the current rendered size. */
export const CaptionPanel = () => {
	const [cfg, setCfg] = useAtom(currentCaptionConfigAtom)
	const renderedBox = useAtomValue(currentRenderedCaptionBoxAtom)
	// Id base for the Width / Height inputs so their visible labels associate
	// via htmlFor (the inputs stay raw — blank means "auto", which the shared
	// NumberInput can't express).
	const dimIdBase = useId()
	const merged: CaptionConfig = { ...DEFAULT_CAPTION_CONFIG, ...cfg }
	// Resolve the LIVE theme so the text reset links compare against — and
	// reset to — the theme's Caption defaults (Settings → Themes → Text →
	// Caption) rather than the hardcoded constants. Everything the theme
	// doesn't seed (position, size, padding, box) still compares against
	// DEFAULT_CAPTION_CONFIG, which `captionConfigFromTheme` passes through.
	const theme = useCurrentTheme()
	const themeDefaults = captionConfigFromTheme(theme)

	const update = (next: Partial<CaptionConfig>) => setCfg({ ...merged, ...next })

	// Subsection "changed" dots — light when any control inside deviates from
	// the baseline the reset links restore (theme seed for the text knobs,
	// DEFAULT_CAPTION_CONFIG for the rest). Unit picks alone don't count: 0px
	// and 0% (or auto) render identically, so a unit is only a change once
	// its value is set.
	const d = themeDefaults
	const positionChanged = merged.offsetX !== d.offsetX || merged.offsetY !== d.offsetY
	const sizeChanged = merged.width > 0 || merged.height > 0
	const textChanged =
		merged.fontFamily !== d.fontFamily ||
		merged.fontSize !== d.fontSize ||
		merged.fontWeight !== d.fontWeight ||
		merged.align !== d.align ||
		merged.textColor !== d.textColor ||
		!!merged.italic ||
		!!merged.underline
	// Border color/width only count while the border toggle shows them.
	const boxChanged =
		merged.padding !== d.padding ||
		merged.backgroundColor !== d.backgroundColor ||
		merged.backgroundOpacity !== d.backgroundOpacity ||
		merged.borderRadius !== d.borderRadius ||
		merged.borderEnabled !== d.borderEnabled ||
		(merged.borderEnabled &&
			(merged.borderColor !== d.borderColor ||
				merged.borderWidth !== d.borderWidth))

	// The size the corresponding input should START stepping from. A stored
	// value wins; otherwise we fall back to the current rendered box size
	// (converted to percent when that unit is selected) so the first arrow
	// press nudges from what's on screen rather than from 0/1.
	const resolveDimStart = (dim: "width" | "height", unit: CaptionUnit): number => {
		const stored = dim === "width" ? merged.width : merged.height
		if (stored > 0) return stored
		if (!renderedBox) return unit === "%" ? 100 : dim === "width" ? 400 : 60
		const px = dim === "width" ? renderedBox.widthPx : renderedBox.heightPx
		const basis =
			dim === "width" ? renderedBox.canvasWidth : renderedBox.canvasHeight
		if (unit === "%") return basis > 0 ? Math.round((px / basis) * 100) : 100
		return Math.round(px)
	}

	// Convert a concrete stored value between px and % using the canvas basis,
	// so toggling the unit keeps the box roughly the same size instead of
	// reinterpreting "400" as "400%".
	const convertDim = (
		dim: "width" | "height",
		value: number,
		from: CaptionUnit,
		to: CaptionUnit
	): number => {
		if (value <= 0 || from === to || !renderedBox) return value
		const basis =
			dim === "width" ? renderedBox.canvasWidth : renderedBox.canvasHeight
		if (basis <= 0) return value
		const px = from === "%" ? (value / 100) * basis : value
		return to === "%" ? Math.round((px / basis) * 100) : Math.round(px)
	}

	const renderDimField = (dim: "width" | "height", label: string) => {
		const value = dim === "width" ? merged.width : merged.height
		const unit = dim === "width" ? merged.widthUnit : merged.heightUnit
		const valueKey = dim
		const unitKey = dim === "width" ? "widthUnit" : "heightUnit"
		const setValue = (v: number) =>
			update({ [valueKey]: v } as Partial<CaptionConfig>)
		return (
			<div className="flex items-center gap-2">
				{/* Blank (0) = auto. The placeholder shows the current rendered
				 *  size, and the first spinner click / arrow key steps from that
				 *  displayed number rather than from 0; `stepBase` covers the
				 *  window before any box has rendered. */}
				<NumberInput
					id={`${dimIdBase}-${dim}`}
					label={label}
					labelClassName={LABEL_COL}
					min={0}
					step={1}
					value={value > 0 ? value : null}
					placeholder={
						renderedBox ? String(resolveDimStart(dim, unit)) : "Auto"
					}
					stepBase={resolveDimStart(dim, unit)}
					onChange={(n) => {
						if (n >= 0) setValue(n)
					}}
					onClear={() => setValue(0)}
					inputClassName="w-20"
				/>
				<Select
					aria-label={`${label} unit`}
					value={unit}
					onChange={(e) => {
						const nextUnit = e.target.value as CaptionUnit
						update({
							[unitKey]: nextUnit,
							[valueKey]: convertDim(dim, value, unit, nextUnit),
						} as Partial<CaptionConfig>)
					}}
				>
					<option value="px">px</option>
					<option value="%">%</option>
				</Select>
			</div>
		)
	}

	return (
		<div className="vc-option-panel">
			{/* px-2 keeps this bare row aligned with the rows inside the p-2
			 * subsection cards below. */}
			<label className="flex items-center gap-2 px-2 text-sm">
				<input
					type="checkbox"
					checked={merged.enabled}
					onChange={(e) => update({ enabled: e.target.checked })}
					className="h-3 w-3"
				/>
				<span className="vc-muted">Show caption</span>
			</label>

			{merged.enabled && (
				<>
					<label className="flex flex-col gap-1 text-sm">
						<span className="vc-muted">
							Caption text
						</span>
						<Textarea
							value={merged.text}
							onChange={(e) => update({ text: e.target.value })}
							placeholder="A short caption shown below the x-axis title…"
							rows={2}
							autoSize
						/>
					</label>

					<CollapsibleSubsection title="Adjust position" changed={positionChanged}>
						<div className="flex flex-col gap-2">
							<OffsetField
								label="X"
								value={merged.offsetX}
								unit={merged.offsetXUnit}
								onValue={(v) => update({ offsetX: v })}
								onUnit={(u) => update({ offsetXUnit: u })}
							/>
							{/* Y shows math convention (positive = up); the stored value
							 * stays in screen coords (positive = down), so the sign flips
							 * here in both directions. */}
							<OffsetField
								label="Y"
								value={-merged.offsetY}
								unit={merged.offsetYUnit}
								onValue={(v) => update({ offsetY: -v })}
								onUnit={(u) => update({ offsetYUnit: u })}
							/>
						</div>
					</CollapsibleSubsection>

					<CollapsibleSubsection title="Size" changed={sizeChanged}>
						<div className="flex flex-col gap-2">
							{renderDimField("width", "Width")}
							{renderDimField("height", "Height")}
						</div>
					</CollapsibleSubsection>

					<CollapsibleSubsection title="Text" changed={textChanged}>
						<div className="flex flex-col gap-2">
							{/* div, not label: AlignmentControl is a button group, not a form control */}
							<div className="flex items-center gap-2 text-sm">
								<span className={LABEL_COL}>Align</span>
								<AlignmentControl
									value={merged.align}
									onChange={(align) => update({ align })}
								/>
							</div>
							<FontEditor
								value={captionToFont(merged, themeDefaults)}
								onChange={(font) =>
									update(fontToCaption(font, themeDefaults))
								}
								showResetFields
								baseColor={themeDefaults.textColor}
								baseSize={themeDefaults.fontSize}
								baseFamily={themeDefaults.fontFamily}
								baseWeight={themeDefaults.fontWeight}
							/>
						</div>
					</CollapsibleSubsection>

					<CollapsibleSubsection title="Box" changed={boxChanged}>
						<div className="flex flex-col gap-2">
							<div className="flex flex-wrap items-center gap-2">
								<ColorInput
									label="Background"
									labelClassName={LABEL_COL}
									value={merged.backgroundColor}
									onChange={(c) => update({ backgroundColor: c })}
								/>
								{merged.backgroundColor !==
									DEFAULT_CAPTION_CONFIG.backgroundColor && (
									<ResetLink
										onClick={() =>
											update({
												backgroundColor:
													DEFAULT_CAPTION_CONFIG.backgroundColor,
											})
										}
									/>
								)}
							</div>
							<div className="flex items-center gap-2">
								<NumberInput
									label="Opacity"
									labelClassName={LABEL_COL}
									value={merged.backgroundOpacity}
									onChange={(v) => update({ backgroundOpacity: v })}
									min={0}
									max={1}
									step={0.05}
									clamp
								/>
								{merged.backgroundOpacity !==
									DEFAULT_CAPTION_CONFIG.backgroundOpacity && (
									<ResetLink
										onClick={() =>
											update({
												backgroundOpacity:
													DEFAULT_CAPTION_CONFIG.backgroundOpacity,
											})
										}
									/>
								)}
							</div>
							<div className="flex items-center gap-2">
								<NumberInput
									label="Corner radius"
									labelClassName={LABEL_COL}
									value={merged.borderRadius}
									onChange={(v) => update({ borderRadius: v })}
									min={0}
									step={1}
									suffix="px"
								/>
								{merged.borderRadius !==
									DEFAULT_CAPTION_CONFIG.borderRadius && (
									<ResetLink
										onClick={() =>
											update({
												borderRadius: DEFAULT_CAPTION_CONFIG.borderRadius,
											})
										}
									/>
								)}
							</div>
							<div className="flex items-center gap-2">
								<NumberInput
									label="Padding"
									labelClassName={LABEL_COL}
									value={merged.padding}
									onChange={(v) => update({ padding: v })}
									min={0}
									step={1}
									suffix="px"
								/>
								{merged.padding !== DEFAULT_CAPTION_CONFIG.padding && (
									<ResetLink
										onClick={() =>
											update({ padding: DEFAULT_CAPTION_CONFIG.padding })
										}
									/>
								)}
							</div>
							<div className="flex items-center gap-2">
								<LabelSpacer />
								<Toggle
									label="Border"
									checked={merged.borderEnabled}
									onChange={(on) => update({ borderEnabled: on })}
								/>
							</div>
							{merged.borderEnabled && (
								<>
									<div className="flex flex-wrap items-center gap-2">
										<ColorInput
											label="Border color"
											labelClassName={LABEL_COL}
											value={merged.borderColor}
											onChange={(c) => update({ borderColor: c })}
										/>
										{merged.borderColor !==
											DEFAULT_CAPTION_CONFIG.borderColor && (
											<ResetLink
												onClick={() =>
													update({
														borderColor:
															DEFAULT_CAPTION_CONFIG.borderColor,
													})
												}
											/>
										)}
									</div>
									<div className="flex items-center gap-2">
										<NumberInput
											label="Border thickness"
											labelClassName={LABEL_COL}
											value={merged.borderWidth}
											onChange={(v) => update({ borderWidth: v })}
											min={0}
											step={0.5}
											suffix="px"
										/>
										{merged.borderWidth !==
											DEFAULT_CAPTION_CONFIG.borderWidth && (
											<ResetLink
												onClick={() =>
													update({
														borderWidth:
															DEFAULT_CAPTION_CONFIG.borderWidth,
													})
												}
											/>
										)}
									</div>
								</>
							)}
						</div>
					</CollapsibleSubsection>
				</>
			)}
		</div>
	)
}
