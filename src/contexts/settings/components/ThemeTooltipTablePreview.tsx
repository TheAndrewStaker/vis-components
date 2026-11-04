import { useMemo, type CSSProperties } from "react"

import { tableStyle } from "../../chartBuilder/components/viz/DataTableBlock"
import { boxVars } from "../../chartBuilder/components/viz/HoverTooltip"
import {
	columnAlignOf,
	DEFAULT_DATA_TABLE_CONFIG,
} from "../../chartBuilder/lib/dataTableConfig"
import type { FieldType, Theme } from "../../chartBuilder/lib/types"
import { buildThemeSamplerModel } from "../lib/themePreviewModel"

/** Sample rows: a text first column and two number columns, so the
 *  numbers' alignment and the first-column styling both show. */
const COLUMNS: ReadonlyArray<{ name: string; type: FieldType }> = [
	{ name: "Region", type: "categorical" },
	{ name: "Sales", type: "quantitative" },
	{ name: "Growth", type: "quantitative" },
]
const ROWS: ReadonlyArray<readonly [string, string, string]> = [
	["West", "1,204", "12%"],
	["East", "986", "8%"],
	["South", "1,530", "15%"],
]

/** The theme editor's HTML preview: one hover tooltip box and a small data
 *  table, drawn with the live renderers' own classes (`.vc-tooltip`,
 *  `.vc-data-table`) and style helpers (`boxVars`, `tableStyle`), so a
 *  theme's Tooltips and Data tables defaults — and the UI's light / dark
 *  fallbacks for Auto colors — look exactly as they will on a chart.
 *  Editor only; the gallery cards keep the two SVG previews. */
export const ThemeTooltipTablePreview = ({
	theme,
	name,
	className,
}: {
	theme: Theme
	name: string
	className?: string
}) => {
	const m = useMemo(() => buildThemeSamplerModel(theme), [theme])
	const box = m.tooltipBox
	const look = m.dataTable
	// A set background carries its own ink (see `boxVars`); otherwise the
	// UI's role classes print the text, as in `HoverTooltip`.
	const ownInk = !!box.backgroundColor
	// Static in-flow box: the live tooltip is `position: fixed` at the cursor.
	const tooltipStyle = boxVars(box) as CSSProperties
	// Each column aligns the way the live table aligns it: text left,
	// numbers by the theme's number alignment.
	const alignClass = COLUMNS.map(
		(c) => `vc-data-table-align-${columnAlignOf(c, DEFAULT_DATA_TABLE_CONFIG, look)}`
	)
	return (
		<div
			role="img"
			aria-label={`Tooltip and data table in the ${name} theme`}
			className={`${className ?? ""} flex flex-col gap-3 p-4`}
			style={m.background ? { backgroundColor: m.background } : undefined}
		>
			<div
				className="vc-tooltip self-start px-2.5 py-1.5 text-sm"
				style={tooltipStyle}
			>
				{[
					["Region", "West"],
					["Sales", "1,204"],
				].map(([label, value]) => (
					<div key={label} className="flex gap-2">
						<span className={ownInk ? "shrink-0 opacity-75" : "shrink-0 vc-muted"}>
							{label}:
						</span>
						<span className={ownInk ? "min-w-0 font-medium" : "min-w-0 font-medium vc-text"}>
							{value}
						</span>
					</div>
				))}
			</div>
			<div
				className="vc-data-table-block min-w-0 p-0"
				style={tableStyle(look)}
			>
				<table className="vc-data-table">
					<caption>Sales by region</caption>
					<thead>
						<tr>
							{COLUMNS.map((c, ci) => (
								<th key={c.name} scope="col" className={alignClass[ci]}>
									{c.name}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{ROWS.map((row) => (
							<tr key={row[0]}>
								{row.map((cell, ci) => (
									<td
										key={COLUMNS[ci]?.name}
										className={
											ci === 0 && !look.firstColumnLikeOthers
												? `${alignClass[ci]} vc-data-table-first`
												: alignClass[ci]
										}
									>
										{cell}
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	)
}
