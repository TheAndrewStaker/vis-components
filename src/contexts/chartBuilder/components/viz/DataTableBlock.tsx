import { useId, useMemo, useState, type CSSProperties, type ReactNode } from "react"
import { useAtomValue } from "jotai"

import { buildDataTable, dataTableToCsv, type DataTableModel } from "../../lib/dataTable"
import {
	defaultDataTableTitle,
	migrateDataTableConfig,
	columnAlignOf,
	resolveDataTableStyle,
	type DataTableConfig,
	type ResolvedDataTableStyle,
} from "../../lib/dataTableConfig"
import { sanitizeVisualFilename } from "../../lib/downloadVisuals"
import { effectiveType } from "../../lib/fieldType"
import { ptToPx } from "../../lib/fontUnit"
import { plottedRows } from "../../lib/plottedData"
import {
	currentDataTableConfigAtom,
	currentEncodingsAtom,
	currentFieldLevelOrdersAtom,
	currentFieldOverridesAtom,
	currentLabelsAtom,
	currentVisualNameAtom,
} from "../../store/atoms"
import {
	renderChannelConfigsAtom,
	tooltipFieldFormatsAtom,
} from "../../store/renderConfigs"
import { useChartModeDef } from "../../store/useChartModeDef"
import { useCurrentDatasetView } from "../../store/useCurrentDatasetView"
import { useCurrentTheme } from "../../store/useCurrentTheme"

/** Rows rendered before a "Show all" button when the user set no Max rows:
 *  a safety window so a 50k-row data set can't stall the page. The CSV
 *  download always carries every row. */
export const DATA_TABLE_SAFETY_ROWS = 1000

/** The table's colors / font, every null resolved against the live theme
 *  (`resolveDataTableStyle`). Exposed as CSS custom properties on the block;
 *  `.vc-data-table` in vis-components.css reads them (one inline style for
 *  the user's choices, everything structural stays in classes). */
const tableStyle = (look: ResolvedDataTableStyle): CSSProperties =>
	({
		fontFamily: look.fontFamily,
		fontSize: `${ptToPx(look.fontSize)}px`,
		fontWeight: look.fontWeight,
		"--vc-dt-text": look.textColor,
		"--vc-dt-first-family": look.firstColumnFontFamily,
		"--vc-dt-first-size": `${ptToPx(look.firstColumnFontSize)}px`,
		"--vc-dt-first-weight": String(look.firstColumnFontWeight),
		"--vc-dt-first-color": look.firstColumnColor,
		"--vc-dt-border": look.borderColor,
		"--vc-dt-stripe": look.striped ? look.stripeColor : "transparent",
		"--vc-dt-head-bg": look.headerBackground ?? "transparent",
		"--vc-dt-head-text": look.headerTextColor,
		"--vc-dt-head-family": look.headerFontFamily,
		"--vc-dt-head-size": `${ptToPx(look.headerFontSize)}px`,
		"--vc-dt-head-weight": String(look.headerFontWeight),
		"--vc-dt-head-rule": `${look.headerBorderWidth}px solid ${look.headerBorderColor}`,
		"--vc-dt-title-family": look.titleFontFamily,
		"--vc-dt-title-size": `${ptToPx(look.titleFontSize)}px`,
		"--vc-dt-title-color": look.titleColor,
		"--vc-dt-title-weight": String(look.titleFontWeight),
		"--vc-dt-title-align": look.titleAlign,
		"--vc-dt-cap-family": look.captionFontFamily,
		"--vc-dt-cap-size": `${ptToPx(look.captionFontSize)}px`,
		"--vc-dt-cap-color": look.captionColor,
		"--vc-dt-cap-weight": String(look.captionFontWeight),
		"--vc-dt-cap-align": look.captionAlign,
	}) as CSSProperties

const downloadCsv = (model: DataTableModel, name: string): void => {
	const blob = new Blob([dataTableToCsv(model)], {
		type: "text/csv;charset=utf-8",
	})
	const url = URL.createObjectURL(blob)
	try {
		const a = document.createElement("a")
		a.href = url
		a.download = `${sanitizeVisualFilename(name)}-data.csv`
		a.click()
	} finally {
		URL.revokeObjectURL(url)
	}
}

/** The table itself. Mounted only while the table is enabled (and, behind a
 *  button, open), so a disabled table costs nothing. */
const DataTable = ({
	cfg,
	look,
	titleText,
	fileName,
}: {
	cfg: DataTableConfig
	look: ResolvedDataTableStyle
	titleText: string
	fileName: string
}) => {
	const view = useCurrentDatasetView()
	const encodings = useAtomValue(currentEncodingsAtom)
	const overrides = useAtomValue(currentFieldOverridesAtom)
	const fieldLevelOrders = useAtomValue(currentFieldLevelOrdersAtom)
	const formats = useAtomValue(tooltipFieldFormatsAtom)
	// The renderers' channel configs (theme-resolved), so histogram bins,
	// hexbin counts and flow endpoints come out exactly as drawn.
	const channelConfigs = useAtomValue(renderChannelConfigsAtom)
	const modeId = useChartModeDef().id
	const [showAll, setShowAll] = useState(false)
	const noteId = useId()
	const captionId = useId()

	const model = useMemo(() => {
		if (!view) return null
		const plotted = plottedRows({
			view,
			encodings,
			mode: modeId,
			channelConfigs,
			getType: (name) => effectiveType(view, name, overrides),
			levelOrders: fieldLevelOrders,
		})
		return buildDataTable({
			view,
			encodings,
			columns: cfg.columns,
			selectedColumns: cfg.selectedColumns,
			overrides,
			fieldLevelOrders,
			formats,
			plotted,
		})
	}, [view, encodings, modeId, channelConfigs, cfg.columns, cfg.selectedColumns, overrides, fieldLevelOrders, formats])
	if (!model) return null

	const total = model.rows.length
	const limit = cfg.maxRows ?? DATA_TABLE_SAFETY_ROWS
	/** More rows than the cut — the Show all / Show first toggle applies. */
	const cuttable = total > limit
	const shown = showAll || !cuttable ? model.rows : model.rows.slice(0, limit)
	// One class per column — its own alignment pick, else left for text and
	// the numbers & dates default for numbers and dates. The header cell
	// aligns with its column.
	const alignClass = model.columns.map(
		(c) => `vc-data-table-align-${columnAlignOf(c, cfg, look)}`
	)

	return (
		<>
			{/* The scroll wrapper is a focusable, named region so keyboard users
			 *  can scroll a table wider than the page. */}
			<div
				className="vc-data-table-scroll"
				role="region"
				aria-label={titleText}
				// eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable region must be focusable (WCAG 2.1.1)
				tabIndex={0}
			>
				<table
					className="vc-data-table"
					aria-describedby={
						[cfg.caption !== null && captionId, model.note && noteId]
							.filter(Boolean)
							.join(" ") || undefined
					}
				>
					{/* The title is the HTML caption: it names the table. */}
					<caption>{titleText}</caption>
					<thead>
						<tr>
							{model.columns.map((c, ci) => (
								<th
									key={c.name}
									scope="col"
									className={alignClass[ci]}
								>
									{c.name}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{shown.map((row) => (
							<tr key={row.index}>
								{model.columns.map((col, ci) => (
									<td
									key={col.name}
									className={
										ci === 0 && !look.firstColumnLikeOthers
											? `${alignClass[ci]} vc-data-table-first`
											: alignClass[ci]
									}
								>
										{row.cells[ci]?.text}
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
			{cfg.caption !== null && (
				<p id={captionId} className="vc-data-table-caption">
					{cfg.caption}
				</p>
			)}
			{model.note && (
				<p id={noteId} className="vc-data-table-note">
					{model.note}
				</p>
			)}
			{(cuttable || cfg.showDownload) && (
				<div className="vc-data-table-actions">
					{/* One toggle, not two buttons: it stays in place, so keyboard
					 *  focus survives the switch either way. */}
					{cuttable && (
						<button
							type="button"
							className="vc-data-table-link"
							onClick={() => setShowAll((v) => !v)}
						>
							{showAll
								? `Show first ${limit.toLocaleString()} rows`
								: `Show all ${total.toLocaleString()} rows`}
						</button>
					)}
					{cfg.showDownload && (
						<button
							type="button"
							className="vc-data-table-link"
							onClick={() => downloadCsv(model, fileName)}
						>
							Download CSV
						</button>
					)}
				</div>
			)}
		</>
	)
}

/** The optional data table under the chart (Sidebar → Data table). Renders
 *  OUTSIDE the layout solver and the fixed canvas, in the editor, the
 *  in-app embed and the published embed; never in image exports. Returns
 *  null while disabled so callers can mount it unconditionally. */
export const DataTableBlock = ({ className }: { className?: string }) => {
	const cfg = migrateDataTableConfig(useAtomValue(currentDataTableConfigAtom))
	if (!cfg.enabled) return null
	return <EnabledDataTableBlock cfg={cfg} className={className} />
}

const EnabledDataTableBlock = ({
	cfg,
	className,
}: {
	cfg: DataTableConfig
	className?: string
}) => {
	const theme = useCurrentTheme()
	const title = useAtomValue(currentLabelsAtom).title
	const name = useAtomValue(currentVisualNameAtom)
	const background = useAtomValue(renderChannelConfigsAtom).backgroundColor
	const [open, setOpen] = useState(false)
	const regionId = useId()
	const titleText = cfg.title ?? defaultDataTableTitle(title, name)
	const look = resolveDataTableStyle(cfg, theme)
	const style: CSSProperties = {
		...tableStyle(look),
		...(background ? { backgroundColor: background } : {}),
	}
	const table = (
		<DataTable
			cfg={cfg}
			look={look}
			titleText={titleText}
			fileName={name || title || "chart"}
		/>
	)

	return (
		<div
			className={`vc-data-table-block${className ? ` ${className}` : ""}`}
			style={style}
			data-data-table
		>
			{cfg.placement === "button" ? (
				<>
					<button
						type="button"
						className="vc-data-table-button"
						aria-expanded={open}
						aria-controls={regionId}
						onClick={() => setOpen((o) => !o)}
					>
						{open ? "Hide data" : "View data"}
					</button>
					<div id={regionId} hidden={!open}>
						{open && table}
					</div>
				</>
			) : (
				table
			)}
		</div>
	)
}

/** The embed page's layout while a data table is on: a scrolling column —
 *  the chart first (it grows to fill whatever the table leaves, never below
 *  a readable floor), the table under it. The no-table embed keeps its
 *  original full-viewport wrapper untouched; callers pick this layout only
 *  when the table is enabled. `data-export-root` stays on the outer box. */
export const EmbedTableLayout = ({ children }: { children: ReactNode }) => (
	<div data-export-root className="flex h-screen w-screen flex-col overflow-y-auto">
		<div className="vc-embed-chart-with-table">{children}</div>
		<DataTableBlock />
	</div>
)
