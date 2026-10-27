import { ColorInput, NumberInput, Section, SectionGroup } from "./controls"
import type { ThemeSectionProps } from "./types"

/** One Auto / Custom color: the tooltip's outline and background follow
 *  the light / dark UI unless the theme names a color. The radio pair is
 *  the Legend section's "Automatic / Custom color" pattern. */
const AutoColorRow = ({
	label,
	autoLabel,
	value,
	seed,
	onChange,
}: {
	label: string
	autoLabel: string
	value: string | null
	seed: string
	onChange: (v: string | null) => void
}) => (
	<div className="flex flex-col gap-1.5">
		<span className="text-sm vc-muted">{label}</span>
		<label className="flex items-center gap-2 text-sm">
			<input
				type="radio"
				checked={value === null}
				onChange={() => onChange(null)}
			/>
			<span className="vc-text">{autoLabel}</span>
		</label>
		<label className="flex items-center gap-2 text-sm">
			<input
				type="radio"
				checked={value !== null}
				onChange={() => onChange(value ?? seed)}
			/>
			<span className="vc-text">Custom color</span>
		</label>
		{value !== null && (
			<ColorInput label="Color" value={value} onChange={onChange} />
		)}
	</div>
)

/** Settings → Themes → Tooltips: the box every hover tooltip renders in.
 *  The Tooltips panel's Box group shows these values live and stores an
 *  override only where a visual deviates (`resolveTooltipBox`). */
export const TooltipsSection = ({ theme, set, isReadOnly }: ThemeSectionProps) => (
	<SectionGroup title="Tooltips" isReadOnly={isReadOnly}>
		<Section title="Tooltip box">
			<p className="text-xs vc-muted">
				What the hover tooltip&apos;s box starts as on every visual. Text
				wraps inside the max width. Tooltips and hover&apos;s Box group
				overrides these per visual.
			</p>
			<NumberInput
				label="Max width"
				value={theme.tooltipMaxWidth}
				min={40}
				max={1000}
				step={10}
				suffix="px"
				onChange={(v) => set("tooltipMaxWidth", v)}
			/>
			<NumberInput
				label="Corner radius"
				value={theme.tooltipCornerRadius}
				min={0}
				max={60}
				step={1}
				suffix="px"
				onChange={(v) => set("tooltipCornerRadius", v)}
			/>
			<AutoColorRow
				label="Outline color"
				autoLabel="Automatic (a hairline that follows light / dark mode)"
				value={theme.tooltipOutlineColor}
				seed="#e7e5e4"
				onChange={(v) => set("tooltipOutlineColor", v)}
			/>
			<AutoColorRow
				label="Background color"
				autoLabel="Automatic (white, or dark in dark mode)"
				value={theme.tooltipBackgroundColor}
				seed="#ffffff"
				onChange={(v) => set("tooltipBackgroundColor", v)}
			/>
			<NumberInput
				label="Background opacity"
				value={theme.tooltipBackgroundOpacity}
				min={0}
				max={1}
				step={0.05}
				onChange={(v) => set("tooltipBackgroundOpacity", v)}
			/>
			<NumberInput
				label="Shadow size"
				value={theme.tooltipShadowSize}
				min={0}
				max={80}
				step={1}
				suffix="px"
				onChange={(v) => set("tooltipShadowSize", v)}
			/>
			{theme.tooltipShadowSize > 0 && (
				<>
					<ColorInput
						label="Shadow color"
						value={theme.tooltipShadowColor}
						onChange={(v) => set("tooltipShadowColor", v)}
					/>
					<NumberInput
						label="Shadow opacity"
						value={theme.tooltipShadowOpacity}
						min={0}
						max={1}
						step={0.05}
						onChange={(v) => set("tooltipShadowOpacity", v)}
					/>
				</>
			)}
		</Section>
	</SectionGroup>
)
