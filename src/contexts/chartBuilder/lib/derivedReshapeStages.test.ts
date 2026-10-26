import { describe, expect, it } from "vitest"
import {
	applyDerivedVariablesBeforeReshape,
	splitDerivedVariablesAroundReshape,
} from "./derivedReshapeStages"
import { applyDerivedVariablesToView, type DerivedVariable } from "./derivedVariables"
import { applyDollarConversionToView } from "./dollarCells"
import { DEFAULT_RESHAPE_CONFIG, applyReshapeToView, type ReshapeConfig } from "./reshape"
import type { DatasetView, Field } from "./types"

const view = (
	fields: Field[],
	rows: Array<Record<string, string>>
): DatasetView => ({
	id: "ds-stages",
	name: "stages",
	filename: "stages.csv",
	fields,
	rows,
	createdAt: 0,
	versionId: "v1",
	versionIndex: 1,
	totalVersions: 1,
	isLatest: true,
	versionCreatedAt: 0,
})

const WIDE: Field[] = [
	{ name: "store", inferredType: "categorical" },
	{ name: "start", inferredType: "quantitative" },
	{ name: "end", inferredType: "quantitative" },
]
const ROWS = [
	{ store: "A", start: "5", end: "3" },
	{ store: "B", start: "1", end: "4" },
]

const trend: DerivedVariable = {
	id: "trend",
	name: "trend",
	kind: "rules",
	rules: {
		rules: [{ condition: "{start} > {end}", output: "decrease" }],
		fallback: "increase",
	},
}
const sign: DerivedVariable = {
	id: "sign",
	name: "sign",
	kind: "rules",
	rules: {
		rules: [{ condition: "{value} > 0", output: "positive" }],
		fallback: "negative",
	},
}
const reshape = (over: Partial<ReshapeConfig>): ReshapeConfig => ({
	...DEFAULT_RESHAPE_CONFIG,
	...over,
})

describe("splitDerivedVariablesAroundReshape", () => {
	it("lists wide-computable variables as candidates and keeps the rest long-only", () => {
		const stages = splitDerivedVariablesAroundReshape(
			WIDE,
			{ variables: [trend, sign] },
			reshape({})
		)
		// `sign` mentions {value}, which only exists after the melt.
		expect(stages.candidates.map((c) => c.name)).toEqual(["trend"])
		// Nothing is checked, so nothing runs wide; both still run after.
		expect([...stages.beforeIds]).toEqual([])
		expect([...stages.afterIds].sort()).toEqual(["sign", "trend"])
	})

	it("a variable the reshape checks runs before the melt and leaves the after stage", () => {
		const stages = splitDerivedVariablesAroundReshape(
			WIDE,
			{ variables: [trend, sign] },
			reshape({ idFields: ["store", "trend"], meltFields: ["start", "end"] })
		)
		expect([...stages.beforeIds]).toEqual(["trend"])
		expect([...stages.afterIds]).toEqual(["sign"])
	})

	it("a variable combined by a SECOND group runs before the melt too", () => {
		const stages = splitDerivedVariablesAroundReshape(
			WIDE,
			{ variables: [trend, sign] },
			reshape({
				idFields: ["store"],
				meltFields: ["start"],
				extraGroups: [{ meltFields: ["trend"], variableName: "k", valueName: "v" }],
			})
		)
		expect([...stages.beforeIds]).toEqual(["trend"])
		expect([...stages.afterIds]).toEqual(["sign"])
		// A variable mentioning the second group's minted pair is long-only.
		const usesV: DerivedVariable = {
			id: "usesV",
			name: "usesV",
			kind: "math",
			math: { formula: "{v} * 2" },
		}
		expect(
			splitDerivedVariablesAroundReshape(
				WIDE,
				{ variables: [usesV] },
				reshape({
					meltFields: ["start"],
					extraGroups: [{ meltFields: ["end"], variableName: "k", valueName: "v" }],
				})
			).candidates
		).toEqual([])
	})

	it("pulls a referenced earlier variable into the wide pass without removing it from the after pass", () => {
		const b: DerivedVariable = {
			id: "b",
			name: "b",
			kind: "math",
			math: { formula: "{start} + 1" },
		}
		const c: DerivedVariable = {
			id: "c",
			name: "c",
			kind: "math",
			math: { formula: "{b} * 2" },
		}
		const stages = splitDerivedVariablesAroundReshape(
			WIDE,
			{ variables: [b, c] },
			reshape({ idFields: ["store"], meltFields: ["c", "end"] })
		)
		// c is combined, so it needs b computed wide too…
		expect([...stages.beforeIds].sort()).toEqual(["b", "c"])
		// …but b isn't checked, so it still runs after the melt as before.
		expect([...stages.afterIds]).toEqual(["b"])
	})

	it("a variable leaning on a long-only variable is itself long-only", () => {
		const echo: DerivedVariable = {
			id: "echo",
			name: "echo",
			kind: "concat",
			concat: { template: "{sign}!" },
		}
		const stages = splitDerivedVariablesAroundReshape(
			WIDE,
			{ variables: [sign, echo] },
			reshape({})
		)
		expect(stages.candidates).toEqual([])
	})

	it("treats the melt's pair names as wide columns when the data already has them", () => {
		const fields: Field[] = [...WIDE, { name: "value", inferredType: "quantitative" }]
		const stages = splitDerivedVariablesAroundReshape(
			fields,
			{ variables: [sign] },
			reshape({})
		)
		expect(stages.candidates.map((c) => c.name)).toEqual(["sign"])
	})
})

describe("applyDerivedVariablesBeforeReshape", () => {
	it("passes the wide view through by identity when nothing runs wide", () => {
		const wide = view(WIDE, ROWS)
		expect(
			applyDerivedVariablesBeforeReshape(
				wide,
				{ variables: [trend] },
				new Set(),
				() => wide
			)
		).toBe(wide)
	})

	it("appends wide columns the melt can keep or combine, computed over the converted cells", () => {
		const wide = view(WIDE, [
			{ store: "A", start: "$5", end: "$3" },
			{ store: "B", start: "$1", end: "$4" },
		])
		const diff: DerivedVariable = {
			id: "diff",
			name: "diff",
			kind: "math",
			math: { formula: "{end} - {start}" },
		}
		const config = { variables: [trend, diff] }
		const pre = applyDerivedVariablesBeforeReshape(
			wide,
			config,
			new Set(["trend", "diff"]),
			() => applyDollarConversionToView(wide, {})
		)
		expect(pre?.fields.map((f) => f.name)).toEqual([
			"store",
			"start",
			"end",
			"trend",
			"diff",
		])
		// Original cells untouched (the long-table conversion still owns
		// them); the new columns read the converted numbers.
		expect(pre?.rows[0]).toEqual({
			store: "A",
			start: "$5",
			end: "$3",
			trend: "decrease",
			diff: "-2",
		})
		expect(pre?.fields[3]?.derived).toBe(true)

		// The full chain: derive wide → melt (keeping trend) → convert the
		// long cells → derive long.
		const long = applyDollarConversionToView(
			applyReshapeToView(
				pre,
				reshape({ idFields: ["store", "trend"], meltFields: ["start", "end"] })
			),
			{}
		)
		const final = applyDerivedVariablesToView(
			long,
			{ variables: [trend, sign] },
			new Set(["sign"])
		)
		expect(final?.fields.map((f) => f.name)).toEqual([
			"store",
			"trend",
			"category",
			"value",
			"sign",
		])
		expect(final?.rows[0]).toEqual({
			store: "A",
			trend: "decrease",
			category: "start",
			value: "5",
			sign: "positive",
		})
	})
})
