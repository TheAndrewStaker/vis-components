/** Baking a reshape and / or derived variables into stored rows.
 *
 *  A reshape or a derived variable is saved as a new data VERSION — rows in
 *  storage, like a hand edit — rather than applied live. This runs the same
 *  pipeline the view chain runs (derive → reshape → derive, with the
 *  percent / dollar cell conversions a Math formula needs made on a copy)
 *  and hands back the table a new version stores: every original cell kept
 *  exactly as imported, only the NEW columns written. Pure; the store
 *  decides where the result lands (`store/useMaterializeVersion.ts`). */

import {
	applyDerivedVariablesBeforeReshape,
	splitDerivedVariablesAroundReshape,
} from "./derivedReshapeStages"
import {
	effectiveDerivedName,
	type DerivedVariable,
	type DerivedVariablesConfig,
} from "./derivedVariables"
import { applyDollarConversionToView } from "./dollarCells"
import { applyPercentConversionToView } from "./percentCells"
import { applyReshapeToView, type ReshapeConfig } from "./reshape"
import type { DatasetView, Field, FieldType } from "./types"

export type Rows = Array<Record<string, string>>

/** Columns and rows as a version stores them. */
export type StoredTable = { fields: Field[]; rows: Rows }

/** The percent and dollar / comma cell conversions, in the order the view
 *  chain runs them: "14%" → "0.14", "$1,234.56" → "1234.56" in effectively-
 *  quantitative columns, tagging the field's format hint. */
export const applyCellConversions = (
	view: DatasetView | undefined,
	overrides: Record<string, FieldType>
): DatasetView | undefined =>
	applyDollarConversionToView(
		applyPercentConversionToView(view, overrides),
		overrides
	)

/** A view field as a data set stores it: the view-time annotations — format
 *  hint, display cells, the derived marker — stripped. */
export const storedField = (f: Field): Field => {
	const { formatHint: _hint, displayCells: _cells, derived: _derived, ...rest } = f
	return rest
}
export const storedFields = (fields: readonly Field[]): Field[] =>
	fields.map(storedField)

export type Baked = StoredTable & {
	/** The wide table the reshape saw (the source plus the derived variables
	 *  it uses): what the panel's "N rows × M columns →" counts. */
	wide: StoredTable
	/** Whether the reshape applied — it passes the table through while
	 *  half-configured (nothing to combine, a naming collision). */
	reshaped: boolean
	/** The derived variables that applied, each under the name its column
	 *  got (a blank name saves as its positional default), in evaluation
	 *  order. A variable that couldn't apply — a collision, a reference to a
	 *  missing column — is simply not here. */
	variables: DerivedVariable[]
}

const addedNames = (
	before: readonly Field[],
	after: readonly Field[]
): Set<string> => {
	const had = new Set(before.map((f) => f.name))
	return new Set(after.filter((f) => !had.has(f.name)).map((f) => f.name))
}

/** The table a new version stores after `reshape` and `derived` over the
 *  version shown (`raw`: the stored rows, renamed fields remapped). A
 *  variable the reshape uses runs on the wide table before the melt, every
 *  other one after it (see `derivedReshapeStages.ts`); both stages evaluate
 *  against the cell conversions but write only their new columns onto the
 *  unconverted rows, so "$1,234" stays "$1,234" in storage. */
export const bakeTransforms = (
	raw: DatasetView,
	overrides: Record<string, FieldType>,
	reshape: ReshapeConfig,
	derived: DerivedVariablesConfig
): Baked => {
	const stages = splitDerivedVariablesAroundReshape(raw.fields, derived, reshape)
	const wide =
		applyDerivedVariablesBeforeReshape(raw, derived, stages.beforeIds, () =>
			applyCellConversions(raw, overrides)
		) ?? raw
	const long = applyReshapeToView(wide, reshape) ?? wide
	const final =
		applyDerivedVariablesBeforeReshape(long, derived, stages.afterIds, () =>
			applyCellConversions(long, overrides)
		) ?? long
	const applied = new Set([
		...addedNames(raw.fields, wide.fields),
		...addedNames(long.fields, final.fields),
	])
	const variables = derived.variables.flatMap((v, i) => {
		const name = effectiveDerivedName(v, i)
		return applied.has(name) ? [v.name === name ? v : { ...v, name }] : []
	})
	return {
		fields: storedFields(final.fields),
		rows: final.rows,
		wide: { fields: storedFields(wide.fields), rows: wide.rows },
		reshaped: long !== wide,
		variables,
	}
}

/** `table` without the named column — a removed derived variable. The key
 *  leaves the rows too, so a later variable of the same name starts clean. */
export const dropColumn = (table: StoredTable, name: string): StoredTable => ({
	fields: table.fields.filter((f) => f.name !== name),
	rows: table.rows.map(({ [name]: _gone, ...rest }) => rest),
})

/** `fields` with the column `name` moved to `index` — the position a
 *  recomputed derived column keeps. Same reference when already there. */
export const moveField = (fields: Field[], name: string, index: number): Field[] => {
	const i = fields.findIndex((f) => f.name === name)
	const field = fields[i]
	if (!field || i === index) return fields
	const out = fields.filter((_, j) => j !== i)
	out.splice(Math.min(index, out.length), 0, field)
	return out
}
