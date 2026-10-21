import { useId, useMemo, useState, type CSSProperties, type ReactNode } from "react"
import { useAtomValue } from "jotai"

import { buildDataTable, dataTableToCsv, type DataTableModel } from "../../lib/dataTable"
import {
	defaultDataTableCaption,
	migrateDataTableConfig,
	type DataTableConfig,
} from "../../lib/dataTableConfig"
import { sanitizeVisualFilename } from "../../lib/downloadVisuals"
import { effectiveType } from "../../lib/fieldType"
import { ptToPx } from "../../lib/fontUnit"
import { plottedRows } from "../../lib/plottedData"
import type { Theme } from "../../lib/types"
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

/** The table's colors / font, every null resolved against the live theme.
 *  Exposed as CSS custom properties on the block; `.vc-data-table` in
 *  vis-components.css reads them (one inline style for the user's choices,
 *  everything structural stays in classes). */
const tableStyle = (cfg: DataTableConfig, theme: Theme): CSSProperties => {
	const text = cfg.textColor ?? theme.textFontColor
	return {
		fontFamily: cfg.fontFamily ?? theme.textFontFamily,
		fontSize: `${ptToPx(cfg.fontSize ?? theme.textFontSize)}px`,
		"--vc-dt-text": text,
		"--vc-dt-border":
			cfg.borderColor ?? `color-mix(in srgb, ${text} 22%, transparent)`,
		"--vc-dt-stripe": cfg.striped
			? (cfg.stripeColor ?? `color-mix(in srgb, ${text} 4%, transparent)`)
			: "transparent",
		"--vc-dt-head-bg": cfg.headerBackground ?? "transparent",
		"--vc-dt-head-text": cfg.headerTextColor ?? text,
		"--vc-dt-head-weight": cfg.headerBold ? "600" : "400",
	} as CSSProperties
}

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
	captionText,
	fileName,
}: {
	cfg: DataTableConfig
	captionText: string
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
			overrides,
			fieldLevelOrders,
			formats,
			plotted,
		})
	}, [view, encodings, modeId, channelConfigs, cfg.columns, overrides, fieldLevelOrders, formats])
	if (!model) return null

	const total = model.rows.length
	const limit = cfg.maxRows ?? DATA_TABLE_SAFETY_ROWS
	const shown = showAll || total <= limit ? model.rows : model.rows.slice(0, limit)
	const numClass = `vc-data-table-num-${cfg.numberAlign}`

	return (
		<>
			{/* The scroll wrapper is a focusable, named region so keyboard users
			 *  can scroll a table wider than the page. */}
			<div
				className="vc-data-table-scroll"
				role="region"
				aria-label={captionText}
				// eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable region must be focusable (WCAG 2.1.1)
				tabIndex={0}
			>
				<table
					className="vc-data-table"
					aria-describedby={model.note ? noteId : undefined}
				>
					<caption>{captionText}</caption>
					<thead>
						<tr>
							{model.columns.map((c) => (
								<th
									key={c.name}
									scope="col"
									className={c.numeric ? numClass : undefined}
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
									<td key={col.name} className={col.numeric ? numClass : undefined}>
										{row.cells[ci]?.text}
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
			{model.note && (
				<p id={noteId} className="vc-data-table-note">
					{model.note}
				</p>
			)}
			{(shown.length < total || cfg.showDownload) && (
				<div className="vc-data-table-actions">
					{shown.length < total && (
						<button
							type="button"
							className="vc-data-table-button"
							onClick={() => setShowAll(true)}
						>
							Show all {total.toLocaleString()} rows
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
	const captionText = cfg.caption ?? defaultDataTableCaption(title, name)
	const style: CSSProperties = {
		...tableStyle(cfg, theme),
		...(background ? { backgroundColor: background } : {}),
	}
	const table = (
		<DataTable cfg={cfg} captionText={captionText} fileName={name || title || "chart"} />
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
