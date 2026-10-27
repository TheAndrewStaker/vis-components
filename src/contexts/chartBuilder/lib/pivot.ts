import { inferFieldType } from "./inferFieldType"
import type { DatasetView, Field } from "./types"

/** Long→wide reshape ("pivot") of a dataset view — the inverse of the melt
 * in `reshape.ts`. Like the melt it is saved as a new data VERSION
 * (`materializeTransforms.ts`) with the config recorded on that version's
 * `transform.pivot`, so a fresh long file can be spread the same way; there
 * is no live, per-visual pivot. There is no on/off boolean either: the
 * pivot applies exactly when some group has a split-out column and a value
 * column checked (see `pivotApplies`).
 *
 * The rows that share the same ID cells collapse into ONE output row. A
 * pivot has one or more GROUPS, the mirror of the melt's: each group's
 * split-out column(s) name new columns from their values, filled from the
 * group's value column(s), and every group's new columns sit side by side
 * on the same ID rows (`day`/`sales` and `region`/`cost` → `monday,
 * tuesday, north, south` — what a paired-group melt comes back out of).
 * Within a group: with one value column the new columns are named by the
 * split-out values alone (`2023`, `2024`); with several the value column's
 * name leads (`sales 2023`, `cost 2023`). Two or more split-out columns in
 * one group name a column by their values together (`2023 Q1`). The first
 * group is the config's own `keyFields` / `valueFields`; the rest sit in
 * `extraGroups`, optional and additive, as in `ReshapeConfig`. Columns in
 * no list are left out. */
export type PivotGroup = {
	/** The column(s) whose VALUES name this group's new columns. */
	keyFields: string[]
	/** The column(s) whose CELLS fill them. */
	valueFields: string[]
}

export type PivotConfig = PivotGroup & {
	/** Columns kept as-is; rows with the same ID cells become one row. */
	idFields: string[]
	/** Further groups, each spreading its own pair beside the first's. */
	extraGroups?: PivotGroup[]
}

export const DEFAULT_PIVOT_CONFIG: PivotConfig = {
	idFields: [],
	keyFields: [],
	valueFields: [],
}

/** Every group of the config, the first one first. */
export const pivotGroups = (config: PivotConfig): PivotGroup[] => [
	{ keyFields: config.keyFields, valueFields: config.valueFields },
	...(config.extraGroups ?? []),
]

/** Every column the config lists anywhere (membership, not presence). */
export const allPivotFields = (config: PivotConfig): string[] => [
	...config.idFields,
	...pivotGroups(config).flatMap((g) => [...g.keyFields, ...g.valueFields]),
]

/** What a blank split-out cell names its column — a column can't be
 * called "". */
export const BLANK_KEY_LABEL = "(blank)"

/** How many rows feed a minted column's type inference (see the matching
 * bound in reshape.ts; the inference reads the first 50 non-empty values
 * anyway). */
const TYPE_SAMPLE_ROWS = 2000

/** One group as the pivot sees it: its present columns in dataset order.
 * `index` is the group's position in the config. */
export type PresentPivotGroup = {
	index: number
	keyFields: Field[]
	valueFields: Field[]
}

/** The config's lists as the pivot sees them: present columns in dataset
 * column order, each column in ONE list — an ID check beats any group, an
 * earlier group beats a later one, and within a group split-out beats
 * value, for a column a stale config lists twice (the panel never does).
 * Only the groups with a present split-out column AND a present value
 * column are returned — a group missing either spreads nothing. */
export type PresentPivot = {
	idFields: Field[]
	groups: PresentPivotGroup[]
}

export const presentPivotFields = (
	fields: Field[],
	config: PivotConfig
): PresentPivot => {
	const claimed = new Set<string>()
	const take = (names: string[]): Field[] => {
		const own = fields.filter((f) => names.includes(f.name) && !claimed.has(f.name))
		for (const f of own) claimed.add(f.name)
		return own
	}
	const idFields = take(config.idFields)
	const groups = pivotGroups(config).flatMap((g, index): PresentPivotGroup[] => {
		const keyFields = take(g.keyFields)
		const valueFields = take(g.valueFields)
		return keyFields.length > 0 && valueFields.length > 0
			? [{ index, keyFields, valueFields }]
			: []
	})
	return { idFields, groups }
}

/** True when the config spreads something: some group has a present
 * split-out column and a present value column. Decided by the COLUMNS
 * alone, so a replay over a fresh file can plan without rows; the panel
 * also checks `pivotIssues` over the rows before enabling Apply. */
export const pivotApplies = (fields: Field[], config: PivotConfig): boolean =>
	presentPivotFields(fields, config).groups.length > 0

/** The name a row's split-out cells give their column: the values joined
 * with a space, a blank cell shown as `(blank)`. */
const keyLabel = (row: Record<string, string>, keyFields: Field[]): string =>
	keyFields.map((f) => (row[f.name] ?? "").trim() || BLANK_KEY_LABEL).join(" ")

/** The column a value column's cell lands in for a given split-out label:
 * the label alone when the group has one value column, `<value> <label>`
 * with several. */
const mintedName = (
	label: string,
	valueField: Field,
	multipleValues: boolean
): string => (multipleValues ? `${valueField.name} ${label}` : label)

/** A group's split-out labels in the order they first appear in the rows
 * — the order its new columns take. */
const keyLabels = (
	rows: Array<Record<string, string>>,
	keyFields: Field[]
): string[] => {
	const seen = new Set<string>()
	const out: string[] = []
	for (const row of rows) {
		const label = keyLabel(row, keyFields)
		if (seen.has(label)) continue
		seen.add(label)
		out.push(label)
	}
	return out
}

/** The columns one group would mint over these rows, in output order:
 * every split-out label (first appearance) × every value column, label
 * first (`sales 2023, cost 2023, sales 2024, …`). */
export const groupMintedNames = (
	rows: Array<Record<string, string>>,
	group: PresentPivotGroup
): string[] => {
	const multiple = group.valueFields.length > 1
	return keyLabels(rows, group.keyFields).flatMap((label) =>
		group.valueFields.map((v) => mintedName(label, v, multiple))
	)
}

/** The columns the pivot would mint over these rows, every group's in
 * group order. Empty when the pivot doesn't apply. Not deduped — a name
 * two groups both make is an issue (`pivotIssues`). */
export const pivotMintedNames = (
	fields: Field[],
	rows: Array<Record<string, string>>,
	config: PivotConfig
): string[] =>
	presentPivotFields(fields, config).groups.flatMap((g) => groupMintedNames(rows, g))

/** Split-out labels that two DIFFERENT combinations of split-out cells
 * both produce — only possible when several split-out columns join to the
 * same text ("a b" + "c" and "a" + "b c"). Those rows would share a column. */
const ambiguousLabels = (
	rows: Array<Record<string, string>>,
	keyFields: Field[]
): string[] => {
	if (keyFields.length < 2) return []
	// In-memory only — never persisted.
	const tuplesByLabel = new Map<string, Set<string>>()
	for (const row of rows) {
		const tuple = keyFields.map((f) => row[f.name] ?? "").join("\u0000")
		const label = keyLabel(row, keyFields)
		const tuples = tuplesByLabel.get(label) ?? new Set<string>()
		tuples.add(tuple)
		tuplesByLabel.set(label, tuples)
	}
	return [...tuplesByLabel]
		.filter(([, tuples]) => tuples.size > 1)
		.map(([label]) => label)
}

/** Naming problems that stop the pivot from applying, shown as panel
 * warnings — a minted column that takes a kept ID column's name, one that
 * two groups both make, or one that two different split-out combinations
 * of a group both make. Needs the rows: the names come from the data. */
export const pivotIssues = (
	fields: Field[],
	rows: Array<Record<string, string>>,
	config: PivotConfig
): string[] => {
	const issues: string[] = []
	const { idFields, groups } = presentPivotFields(fields, config)
	const kept = new Set(idFields.map((f) => f.name))
	const seen = new Set<string>()
	for (const g of groups)
		for (const name of new Set(groupMintedNames(rows, g))) {
			if (kept.has(name))
				issues.push(`"${name}" is already the name of an ID column.`)
			else if (seen.has(name)) issues.push(`"${name}" is made by two groups.`)
			seen.add(name)
		}
	for (const g of groups) {
		const multiple = g.valueFields.length > 1
		for (const label of ambiguousLabels(rows, g.keyFields))
			for (const v of g.valueFields)
				issues.push(
					`Two different split-out combinations both make "${mintedName(label, v, multiple)}".`
				)
	}
	return [...new Set(issues)]
}

export type PivotedData = {
	fields: Field[]
	rows: Array<Record<string, string>>
	/** Per CONFIG group index: input rows that shared an earlier row's ID
	 * cells AND that group's split-out label — the last of each such set
	 * wins, and the panel says how many lost. 0 for a group that spreads
	 * nothing. */
	overwritten: number[]
}

/** Spread long rows into wide: one output row per distinct combination of
 * ID cells (first-appearance order, ID cells from the first such row), one
 * column per group × split-out label × value column, filled from the
 * matching input rows — blank where no row has that combination. A minted
 * name that collides with a kept ID column is left out, and one two groups
 * both make is shared (the later group's cell wins) — the panel blocks
 * both cases through `pivotIssues`. Callers gate on `pivotApplies` first. */
export const pivotDataset = (
	fields: Field[],
	rows: Array<Record<string, string>>,
	config: PivotConfig
): PivotedData => {
	const { idFields, groups } = presentPivotFields(fields, config)
	const kept = new Set(idFields.map((f) => f.name))
	const minted = [
		...new Set(groups.flatMap((g) => groupMintedNames(rows, g)).filter((n) => !kept.has(n))),
	]
	const mintedSet = new Set(minted)

	// In-memory grouping keys only — never persisted (see CLAUDE.md on
	// structured saved keys).
	const groupKey = (row: Record<string, string>): string =>
		idFields.map((f) => row[f.name] ?? "").join("\u0000")
	const outByKey = new Map<string, Record<string, string>>()
	// Per group: the ID + split-out slots a row has already filled.
	const slots = groups.map((group) => ({ group, filled: new Set<string>() }))
	const overwritten = pivotGroups(config).map(() => 0)
	for (const row of rows) {
		const key = groupKey(row)
		let out = outByKey.get(key)
		if (!out) {
			out = {}
			for (const f of idFields) out[f.name] = row[f.name] ?? ""
			for (const name of minted) out[name] = ""
			outByKey.set(key, out)
		}
		for (const { group: g, filled } of slots) {
			const label = keyLabel(row, g.keyFields)
			const slot = `${key}\u0000${label}`
			if (filled.has(slot)) overwritten[g.index] = (overwritten[g.index] ?? 0) + 1
			filled.add(slot)
			const multiple = g.valueFields.length > 1
			for (const v of g.valueFields) {
				const name = mintedName(label, v, multiple)
				if (mintedSet.has(name)) out[name] = row[v.name] ?? ""
			}
		}
	}
	const outRows = [...outByKey.values()]
	const sample = outRows.slice(0, TYPE_SAMPLE_ROWS)
	const outFields: Field[] = [
		...idFields,
		...minted.map(
			(name): Field => ({
				name,
				inferredType: inferFieldType(sample.map((r) => r[name] ?? "")),
			})
		),
	]
	return { fields: outFields, rows: outRows, overwritten }
}

/** Apply the pivot to a resolved DatasetView. Pass-through (same object)
 * when the pivot doesn't apply. */
export const applyPivotToView = (
	view: DatasetView | undefined,
	config: PivotConfig | undefined
): DatasetView | undefined => {
	if (!view || !config || !pivotApplies(view.fields, config)) return view
	const { fields, rows } = pivotDataset(view.fields, view.rows, config)
	return { ...view, fields, rows }
}
