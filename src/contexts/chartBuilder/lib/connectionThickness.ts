/** Minimum line thickness in pixels — mirrors the `min` on the
 *  ConnectionOptionsPanel thickness input so a stored per-value override can't
 *  push a line below the same floor the single-value control enforces.
 *  0 is allowed and hides the line (thickness-is-the-switch). */
export const MIN_LINE_THICKNESS = 0

export type ConnectionThicknessArgs = {
	/** Key into `byValue` for this line/layer when no `field` is set — the
	 *  connection-field value for scatter lines and radar polygons, the hue
	 *  value in area mode (matching `resolveConnectionStroke`). `null` skips
	 *  the per-value lookup. */
	groupKey: string | null
	/** The single global thickness, and the fallback for any group without a
	 *  per-value override. */
	thickness: number
	/** Per-value thickness overrides (`connection.thicknessByValue`). Absent /
	 *  empty renders identically to a single global thickness. */
	byValue: Record<string, number> | undefined
	/** "Vary by" variable (`connection.thicknessField`). When set, the lookup
	 *  key is the stringified `row[field]` instead of `groupKey`, so thickness
	 *  can follow any variable that is constant within a line — not only the
	 *  one the lines are grouped by. */
	field?: string | null
	/** The line's representative row (its first row) for the `field` lookup —
	 *  the same convention `resolveConnectionStroke`'s `slotRow` uses. */
	row?: Record<string, unknown>
}

/** Stringified cell of `row[field]`, or null when the row has no usable value
 *  there (no row, missing / null / empty cell) so the lookup falls through to
 *  the single thickness. Matches the sidebar's level keys (`String(parsed)`)
 *  and `resolveSegmentThickness`'s convention. */
const rowKey = (
	row: Record<string, unknown> | undefined,
	field: string
): string | null => {
	const raw = row?.[field]
	if (raw === undefined || raw === null) return null
	const key = String(raw)
	return key === "" ? null : key
}

/** Single source of truth for a connection line / layer-edge / radar-polygon
 *  thickness. Precedence:
 *   1. `byValue[key]` — per-value override (clamped to the input floor), where
 *      `key` is the representative row's value for the Vary-by `field` when
 *      one is set, else `groupKey`.
 *   2. `thickness` — the single global value.
 *  An empty / absent `byValue` therefore behaves exactly like the pre-existing
 *  single-thickness code, which is what keeps the "Vary by" dropdown's
 *  "— none —" option byte-identical to before. */
export const resolveConnectionThickness = ({
	groupKey,
	thickness,
	byValue,
	field,
	row,
}: ConnectionThicknessArgs): number => {
	const key = field ? rowKey(row, field) : groupKey
	const override = key == null ? undefined : byValue?.[key]
	if (override === undefined) return thickness
	return Math.max(MIN_LINE_THICKNESS, override)
}
