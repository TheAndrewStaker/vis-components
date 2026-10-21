// ---------------------------------------------------------------------------
// Data table config
// ---------------------------------------------------------------------------
//
// An optional HTML <table> rendered UNDER the chart — the non-visual
// alternative to the figure for screen-reader users, and a way for sighted
// embed viewers to read exact values. It lives outside the layout solver and
// outside the fixed canvas size, and it is never part of an image export
// (those serialize the chart SVG). See APPLICATION.md "Data table".
//
// Every styling field is nullable: `null` = inherit from the current theme
// (its base text family / size / color), so a re-theme restyles the table
// without any config write. Font sizes are POINTS, like every other font
// size in the app (`lib/fontUnit.ts`).

/** "below" renders the table always; "button" renders a View data / Hide
 *  data toggle button under the chart that reveals it. */
export type DataTablePlacement = "below" | "button"

/** "encoded" = only the fields mapped to an encoding (x, y, the remaining
 *  channels, facets last); "all" = every column of the view. */
export type DataTableColumns = "encoded" | "all"

/** Number-column alignment. Picked with the shared AlignmentControl (the
 *  app's one text-alignment picker), so center is offered too. */
export type DataTableNumberAlign = "right" | "left" | "center"

export type DataTableConfig = {
	enabled: boolean
	placement: DataTablePlacement
	/** `<caption>` text. Null = "Data for <visual title or name>". */
	caption: string | null
	columns: DataTableColumns
	/** Rows shown before a "Show all N rows" button. Null = every row. */
	maxRows: number | null
	/** A "Download CSV" link under the table. */
	showDownload: boolean

	/** Null = the theme's base text family. */
	fontFamily: string | null
	/** POINTS. Null = the theme's base text size. */
	fontSize: number | null
	/** Null = the theme's base text color. */
	textColor: string | null
	/** Null = no fill (the header reads from its rule + weight alone). */
	headerBackground: string | null
	/** Null = the table's text color. */
	headerTextColor: string | null
	headerBold: boolean
	/** Null = a soft tint of the text color. */
	borderColor: string | null
	striped: boolean
	/** Null = a 4% tint of the text color. */
	stripeColor: string | null
	numberAlign: DataTableNumberAlign
}

export const DEFAULT_DATA_TABLE_CONFIG: DataTableConfig = {
	enabled: false,
	placement: "below",
	caption: null,
	columns: "encoded",
	maxRows: null,
	showDownload: true,
	fontFamily: null,
	fontSize: null,
	textColor: null,
	headerBackground: null,
	headerTextColor: null,
	headerBold: true,
	borderColor: null,
	striped: true,
	stripeColor: null,
	numberAlign: "right",
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === "object" && v !== null && !Array.isArray(v)

const str = (v: unknown): string | null =>
	typeof v === "string" && v.trim() !== "" ? v : null

const bool = (v: unknown, fallback: boolean): boolean =>
	typeof v === "boolean" ? v : fallback

const positive = (v: unknown): number | null =>
	typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null

/** Normalize whatever a saved visual / draft slice carries into a full
 *  config. Tolerant of an absent field (visuals saved before the table
 *  existed), a partial object, and wrong-typed values — each falls back to
 *  its default — so no storage version bump is needed. Idempotent. */
export const migrateDataTableConfig = (raw: unknown): DataTableConfig => {
	if (!isRecord(raw)) return { ...DEFAULT_DATA_TABLE_CONFIG }
	const d = DEFAULT_DATA_TABLE_CONFIG
	const maxRows = positive(raw.maxRows)
	return {
		enabled: bool(raw.enabled, d.enabled),
		placement: raw.placement === "button" ? "button" : "below",
		// The caption keeps the user's text verbatim (spaces and all); only
		// an empty string reads as "use the default".
		caption:
			typeof raw.caption === "string" && raw.caption !== "" ? raw.caption : null,
		columns: raw.columns === "all" ? "all" : "encoded",
		maxRows: maxRows === null ? null : Math.round(maxRows),
		showDownload: bool(raw.showDownload, d.showDownload),
		fontFamily: str(raw.fontFamily),
		fontSize: positive(raw.fontSize),
		textColor: str(raw.textColor),
		headerBackground: str(raw.headerBackground),
		headerTextColor: str(raw.headerTextColor),
		headerBold: bool(raw.headerBold, d.headerBold),
		borderColor: str(raw.borderColor),
		striped: bool(raw.striped, d.striped),
		stripeColor: str(raw.stripeColor),
		numberAlign:
			raw.numberAlign === "left" || raw.numberAlign === "center"
				? raw.numberAlign
				: "right",
	}
}

/** The caption the table prints when the user hasn't written one. */
export const defaultDataTableCaption = (
	title: string | null | undefined,
	visualName: string | null | undefined
): string => {
	const t = (title ?? "").trim()
	if (t) return `Data for ${t}`
	const n = (visualName ?? "").trim()
	return n ? `Data for ${n}` : "Data for this chart"
}
