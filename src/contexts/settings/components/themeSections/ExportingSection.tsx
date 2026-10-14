import { NumberInput as UiNumberInput } from "../../../../components/ui/NumberInput"
import { SelectInput as UiSelectInput } from "../../../../components/ui/SelectInput"
import {
	CANVAS_SIDES,
	withCanvasMargin,
	type CanvasSide,
} from "../../../chartBuilder/lib/channelConfig"
import { pxToUnit, unitToPx, UNIT_STEP } from "../../../chartBuilder/lib/displayUnits"

import { Section, SectionGroup, THEME_LABEL_CLASS } from "./controls"
import type { ThemeSectionProps } from "./types"

const SIDE_LABEL: Record<CanvasSide, string> = {
	top: "Top",
	right: "Right",
	bottom: "Bottom",
	left: "Left",
}

type MarginUnit = "px" | "in"

/** Settings → Themes → Exporting: theme-level defaults for the fixed
 *  canvas's margins (Aesthetics → Canvas size → Margins). A visual with a
 *  canvas size inherits every side it hasn't set itself, live — editing
 *  the theme moves open charts. Values are px-truth; the unit only
 *  converts what the inputs show (96 px/inch). */
export const ExportingSection = ({ theme, set, isReadOnly }: ThemeSectionProps) => {
	const unit: MarginUnit = theme.exportMarginUnit ?? "px"
	const margins = theme.exportCanvasMargins
	return (
		<SectionGroup title="Exporting" isReadOnly={isReadOnly}>
			<Section title="Canvas margins">
				<p className="text-sm vc-muted">
					Default white space between the edge of a fixed-size canvas
					(Aesthetics → Canvas size) and the nearest content on each side —
					the title, an axis title, the legend. A visual uses these unless it
					sets its own margins; a blank side keeps whatever the layout
					leaves. 0 puts the content flush against the edge.
				</p>
				{/* The page's SelectInput wrapper stretches selects to the row
				 *  (`flex-1`); a two-option unit picker only needs a short box, so
				 *  this one uses the primitive directly with a fixed width. */}
				<UiSelectInput<MarginUnit>
					label="Units"
					labelClassName={THEME_LABEL_CLASS}
					selectClassName="w-20"
					value={unit}
					onChange={(v) => set("exportMarginUnit", v)}
					options={[
						{ label: "px", value: "px" },
						{ label: "in", value: "in" },
					]}
				/>
				{CANVAS_SIDES.map((side) => {
					const px = margins?.[side]
					return (
						<UiNumberInput
							key={side}
							label={SIDE_LABEL[side]}
							labelClassName={THEME_LABEL_CLASS}
							value={px == null ? null : pxToUnit(px, unit)}
							onChange={(v) =>
								set(
									"exportCanvasMargins",
									withCanvasMargin(margins, side, Math.max(0, unitToPx(v, unit))),
								)
							}
							onClear={() =>
								set("exportCanvasMargins", withCanvasMargin(margins, side, null))
							}
							placeholder="auto"
							stepBase={0}
							min={0}
							step={UNIT_STEP[unit]}
							clamp
							suffix={unit}
						/>
					)
				})}
			</Section>
		</SectionGroup>
	)
}
