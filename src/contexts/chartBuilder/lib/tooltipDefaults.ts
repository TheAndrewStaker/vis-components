/** Build a starter HTML template for the tooltip's "Custom HTML" field —
 *  what the user would otherwise see rendered when they hover, but expressed
 *  as an editable template. Enabling "Use custom HTML template" seeds an
 *  empty textarea with this, so the user sees concrete tags + their own
 *  field names and can edit from there ("reset" below the box restores it).
 *  Without this they were staring at an empty textarea with no idea what
 *  classes existed or what the placeholders should look like. */
export const buildDefaultTooltipHtml = (fields: string[]): string => {
	if (fields.length === 0) {
		return '<div class="vc-tooltip-row"><!-- map fields to your encodings, then click Reset to refresh this template --></div>'
	}
	return fields
		.map(
			(name) =>
				`<div class="vc-tooltip-row"><span class="vc-tooltip-name">${name}:</span> <span class="vc-tooltip-value">{{${name}}}</span></div>`
		)
		.join("\n")
}

import {
	resolveTooltipBox,
	type ResolvedTooltipBox,
} from "./labelsConfig"
import { LIGHT_THEME_BASE } from "./systemThemes"

/** `#rrggbb` → `rgb(r g b / a)` for the opacity lines; a color the parser
 *  can't read (or a fully opaque one) is passed through untouched. */
const withAlpha = (hex: string, alpha: number): string => {
	if (alpha >= 1) return hex
	const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
	if (!m) return hex
	const n = Number.parseInt(m[1], 16)
	const r = (n >> 16) & 255
	const g = (n >> 8) & 255
	const b = n & 255
	return `rgb(${r} ${g} ${b} / ${alpha})`
}

/** Build the CSS that mirrors what the tooltip box looks like RIGHT NOW —
 *  the resolved box (the visual's Box controls over the theme's Tooltips
 *  sheet: max width, corner radius, outline, background, opacity, shadow)
 *  written out as rules on the `.vc-tooltip` container, plus the padding
 *  and type the box always carries. Enabling "Use custom HTML template"
 *  seeds an empty Custom CSS box with this, so switching over changes
 *  nothing visible and the user edits from the look they already chose;
 *  "reset" below the box restores it. Auto colors are written as their
 *  light-UI values (CSS text can't follow the dark UI the way the box
 *  controls do). One rule per line so diffs in the textarea read clearly. */
export const buildDefaultTooltipCss = (box: ResolvedTooltipBox): string => {
	const outline = box.outlineColor ?? "#e7e5e4"
	const fill = box.backgroundColor ?? "#ffffff"
	const shadow =
		box.shadowSize > 0
			? `0 ${box.shadowSize / 2}px ${box.shadowSize}px 0 ${withAlpha(box.shadowColor, box.shadowOpacity)}`
			: "none"
	return `max-width: ${box.maxWidth}px;
border-radius: ${box.cornerRadius}px;
border: 1px solid ${outline};
background: ${withAlpha(fill, box.backgroundOpacity)};
box-shadow: ${shadow};
padding: 0.375rem 0.625rem;
font-size: 0.875rem;`
}

/** The seed CSS for a tooltip box left at the built-in theme's defaults. */
export const DEFAULT_TOOLTIP_CSS = buildDefaultTooltipCss(
	resolveTooltipBox({}, LIGHT_THEME_BASE)
)
