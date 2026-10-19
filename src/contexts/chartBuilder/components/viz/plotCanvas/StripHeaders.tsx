import type { FacetLayoutSpec } from "../../../lib/facetLayoutSolver"
import { facetTitleColorOf, type LabelsConfig } from "../../../lib/labelsConfig"
import type { resolveFacetTitleStyles } from "./facetTitleStyles"
import { TITLE_FILL_FALLBACK } from "./SharedText"

/** Grid-mode column / row header strips. Empty in wrap and single modes
 *  (solver returns empty arrays). The corner intersection between strips is
 *  intentionally blank — strips don't span it. Was inline in PlotCanvas's
 *  SVG, drawn after the panels (so a strip nudged into the plot area paints
 *  over the marks) and before the caption; the column strip still precedes
 *  the row strip in document order. */
export const StripHeaders = ({
	spec,
	labels,
	facetTitles,
}: {
	spec: Pick<FacetLayoutSpec, "columnHeaders" | "rowHeaders">
	/** Only the "Color by facet" lookups (`facetTitleColorOf`) read this. */
	labels: Pick<LabelsConfig, "facetTitleColorByValue" | "facetTitleColors">
	facetTitles: Pick<
		ReturnType<typeof resolveFacetTitleStyles>,
		| "facetColTitleFont"
		| "facetRowTitleFont"
		| "facetColTitleAngle"
		| "facetRowTitleAngle"
	>
}) => {
	const {
		facetColTitleFont,
		facetRowTitleFont,
		facetColTitleAngle,
		facetRowTitleAngle,
	} = facetTitles
	return (
		<>
			{spec.columnHeaders.map((h) => {
				// "Color by facet": a per-value color wins over the strip's font
				// color. Header text IS the facet value, so it doubles as the key.
				const colHdrFill =
					facetTitleColorOf(labels, h.text) ?? facetColTitleFont.color
				return (
					<text
						key={`colhdr-${h.text}`}
						data-column-header
						pointerEvents="none"
						x={h.x}
						y={h.y}
						textAnchor={h.textAnchor}
						transform={
							facetColTitleAngle
								? `rotate(${facetColTitleAngle}, ${h.x}, ${h.y})`
								: undefined
						}
						fontFamily={facetColTitleFont.family}
						fontSize={facetColTitleFont.size}
						fontWeight={facetColTitleFont.weight ?? 500}
						fontStyle={facetColTitleFont.italic ? "italic" : undefined}
						textDecoration={facetColTitleFont.underline ? "underline" : undefined}
						fill={colHdrFill}
						dominantBaseline="middle"
						className={colHdrFill ? undefined : TITLE_FILL_FALLBACK}
					>
						{h.text}
					</text>
				)
			})}
			{spec.rowHeaders.map((h) => {
				const rowHdrFill =
					facetTitleColorOf(labels, h.text) ?? facetRowTitleFont.color
				return (
					<text
						key={`rowhdr-${h.text}`}
						data-row-header
						pointerEvents="none"
						x={h.x}
						y={h.y}
						textAnchor={h.textAnchor}
						transform={
							facetRowTitleAngle
								? `rotate(${facetRowTitleAngle}, ${h.x}, ${h.y})`
								: undefined
						}
						fontFamily={facetRowTitleFont.family}
						fontSize={facetRowTitleFont.size}
						fontWeight={facetRowTitleFont.weight ?? 500}
						fontStyle={facetRowTitleFont.italic ? "italic" : undefined}
						textDecoration={facetRowTitleFont.underline ? "underline" : undefined}
						fill={rowHdrFill}
						dominantBaseline={
							h.verticalAnchor === "top"
								? "hanging"
								: h.verticalAnchor === "bottom"
									? "auto"
									: "middle"
						}
						className={rowHdrFill ? undefined : TITLE_FILL_FALLBACK}
					>
						{h.text}
					</text>
				)
			})}
		</>
	)
}
