import {
	applyDerivedVariablesToView,
	buildDerivedCompute,
	derivedVariableIssues,
	effectiveDerivedName,
	referencedFields,
	type DerivedVariablesConfig,
} from "./derivedVariables"
import { allPivotFields, type PivotConfig } from "./pivot"
import { allMeltFields, mintedNames, type ReshapeConfig } from "./reshape"
import type { DatasetView, Field } from "./types"

/** Where each derived variable runs relative to the wide→long reshape.
 *
 * Derived variables normally run LAST (after the melt), so they can use the
 * columns the melt creates. But a variable made on the wide table is often
 * exactly what the user wants to reshape — "trend" from {start} and {end},
 * then combine start/end into category/value. There is no toggle for this:
 * a variable the reshape USES (checked as an ID or Combine column) runs on
 * the wide table before the melt; every other variable runs after it, as
 * before. The maximum flow is derive → reshape → derive, and the tray's "+"
 * always works on the table as shown (long once a reshape is on).
 *
 * `candidates` are the variables the Reshape panel may list: those that can
 * be computed from the wide columns at all. A variable mentioning a column
 * that exists only after the melt — the category/value pair, or an earlier
 * variable that itself can't run wide — is left out (it can't run before
 * the columns it needs exist), as is one that wouldn't apply anyway (name
 * collision, parse error, unknown Math variable).
 *
 * `beforeIds` is the closure of the reshape-used candidates over the
 * earlier candidates they reference: if C = {B} * 2 is combined and B is
 * itself derived, B computes before the melt too so C can. B only SURVIVES
 * the melt if it's also checked (the melt drops unlisted columns), and an
 * unchecked B still runs after the melt as it always did — so a variable
 * can sit in both sets. `afterIds` is everything the reshape doesn't use.
 *
 * A long→wide `pivot` is the same shape of step (its ID, split-out and
 * value columns are what it uses); the two never apply in one version, but
 * both are passed so the split sees whichever one the caller runs. */
export type DerivedReshapeStages = {
	candidates: Array<{ id: string; name: string }>
	beforeIds: ReadonlySet<string>
	afterIds: ReadonlySet<string>
}

const EMPTY_STAGES: DerivedReshapeStages = {
	candidates: [],
	beforeIds: new Set(),
	afterIds: new Set(),
}

/** The names a variable may NOT mention and still run wide: the melt's own
 * pairs — every group's (unless a wide column already carries the name —
 * then it's just a column). Earlier non-candidate derived names are added
 * as the walk goes. */
export const postMeltOnlyNames = (
	wideNames: ReadonlySet<string>,
	reshape: ReshapeConfig
): Set<string> =>
	new Set(mintedNames(reshape).filter((n) => !wideNames.has(n)))

export const splitDerivedVariablesAroundReshape = (
	wideFields: ReadonlyArray<Field>,
	derived: DerivedVariablesConfig,
	reshape: ReshapeConfig,
	pivot?: PivotConfig
): DerivedReshapeStages => {
	if (derived.variables.length === 0) return EMPTY_STAGES

	const wideNames = new Set(wideFields.map((f) => f.name))
	const postMeltOnly = postMeltOnlyNames(wideNames, reshape)
	// Walk in list order so each candidate sees the wide columns plus the
	// candidates before it — the same visibility the wide pass will have.
	const available = new Set(wideNames)
	const candidates: Array<{ id: string; name: string; refs: string[] }> = []
	derived.variables.forEach((variable, index) => {
		const name = effectiveDerivedName(variable, index)
		const refs = referencedFields(variable)
		const eligible =
			!refs.some((r) => postMeltOnly.has(r)) &&
			derivedVariableIssues(variable, index, available).length === 0 &&
			buildDerivedCompute(variable, available) !== null
		if (!eligible) {
			// A later variable leaning on this one can't run wide either.
			if (!wideNames.has(name)) postMeltOnly.add(name)
			return
		}
		candidates.push({ id: variable.id, name, refs })
		available.add(name)
	})

	const used = new Set([
		...reshape.idFields,
		...allMeltFields(reshape),
		...(pivot ? allPivotFields(pivot) : []),
	])
	const usedIds = new Set(
		candidates.filter((c) => used.has(c.name)).map((c) => c.id)
	)
	// Closure backwards: a used variable pulls in the earlier candidates it
	// references, which pull in theirs.
	const needed = new Set(candidates.filter((c) => used.has(c.name)).map((c) => c.name))
	const beforeIds = new Set<string>()
	for (let i = candidates.length - 1; i >= 0; i--) {
		const c = candidates[i]
		if (!needed.has(c.name)) continue
		beforeIds.add(c.id)
		for (const r of c.refs) needed.add(r)
	}
	const afterIds = new Set(
		derived.variables.filter((v) => !usedIds.has(v.id)).map((v) => v.id)
	)
	return {
		candidates: candidates.map(({ id, name }) => ({ id, name })),
		beforeIds,
		afterIds,
	}
}

/** Evaluate the before-melt variables over the wide view and append the
 * results as wide columns. Pass-through (same object) when there's nothing
 * to run, so the reshape stage's identity check still works.
 *
 * The variables are evaluated against `convert(view)` — the wide table with
 * the percent/dollar cell conversions applied — so Math over a "$1,234" or
 * "14%" column reads numbers, exactly as it does after the melt. Only the
 * NEW columns are written back onto the unconverted wide rows: every
 * original cell goes through the melt untouched, and the conversions run
 * on the long table afterwards as they always have (that pass is also
 * what tags the melted value column's format hint). `convert` is lazy so
 * visuals with no before-melt variable never pay for a wide conversion. */
export const applyDerivedVariablesBeforeReshape = (
	view: DatasetView | undefined,
	derived: DerivedVariablesConfig,
	beforeIds: ReadonlySet<string>,
	convert: () => DatasetView | undefined
): DatasetView | undefined => {
	if (!view || beforeIds.size === 0) return view
	const converted = convert() ?? view
	const computed = applyDerivedVariablesToView(converted, derived, beforeIds)
	if (!computed || computed === converted) return view
	const wideNames = new Set(view.fields.map((f) => f.name))
	const added = computed.fields.filter((f) => !wideNames.has(f.name))
	if (added.length === 0) return view
	const rows = view.rows.map((row, i) => {
		const out: Record<string, string> = { ...row }
		const src = computed.rows[i]
		for (const f of added) out[f.name] = src?.[f.name] ?? ""
		return out
	})
	return { ...view, fields: [...view.fields, ...added], rows }
}
