/** Test fixture: a working copy's chain — an import, a reshape, a hand
 *  edit that ADDED a column, a derived variable over the melted table, and
 *  a derived variable that reads the hand-added column. A fresh import of
 *  the wide file must re-do the reshape and the first variable and leave
 *  the second out. Shared by the replay, store and dialog tests. */

import type { DerivedVariable } from "./derivedVariables"
import type { Dataset, DatasetVersion, Field } from "./types"


export const WIDE: Field[] = [
	{ name: "Year", inferredType: "categorical" },
	{ name: "Jan", inferredType: "quantitative" },
	{ name: "Feb", inferredType: "quantitative" },
]
export const LONG: Field[] = [
	{ name: "Year", inferredType: "categorical" },
	{ name: "month", inferredType: "categorical" },
	{ name: "sales", inferredType: "quantitative" },
]
export const NOTES: Field = { name: "Notes", inferredType: "categorical" }
export const DOUBLE: Field = { name: "Double", inferredType: "quantitative" }
export const TAGGED: Field = { name: "Tagged", inferredType: "categorical" }

export const REPLAY_FIXTURE_RESHAPE = {
	idFields: ["Year"],
	meltFields: ["Jan", "Feb"],
	variableName: "month",
	valueName: "sales",
}
export const double: DerivedVariable = {
	id: "dv-double",
	name: "Double",
	kind: "math",
	math: { formula: "{sales} * 2" },
}
export const tagged: DerivedVariable = {
	id: "dv-tagged",
	name: "Tagged",
	kind: "concat",
	concat: { template: "{Notes}!" },
}

export const WIDE_ROWS = [{ Year: "2024", Jan: "1", Feb: "2" }]
export const LONG_ROWS = [
	{ Year: "2024", month: "Jan", sales: "1" },
	{ Year: "2024", month: "Feb", sales: "2" },
]

export const chainVersions = (): DatasetVersion[] => [
	{ id: "v1", filename: "2024.csv", rows: WIDE_ROWS, createdAt: 1, fields: WIDE },
	{
		id: "v2",
		filename: "Reshaped data",
		rows: LONG_ROWS,
		createdAt: 2,
		editedFrom: "v1",
		transform: { reshape: REPLAY_FIXTURE_RESHAPE },
		fields: LONG,
	},
	{
		id: "v3",
		filename: "Edited data",
		rows: LONG_ROWS.map((r, i) => ({ ...r, Notes: i === 0 ? "a" : "b" })),
		createdAt: 3,
		editedFrom: "v2",
		fields: [...LONG, NOTES],
	},
	{
		id: "v4",
		filename: "Derived data",
		rows: LONG_ROWS.map((r, i) => ({
			...r,
			Notes: i === 0 ? "a" : "b",
			Double: String(Number(r.sales) * 2),
		})),
		createdAt: 4,
		editedFrom: "v3",
		transform: { added: [double] },
		fields: [...LONG, NOTES, DOUBLE],
	},
	{
		id: "v5",
		filename: "Derived data",
		rows: LONG_ROWS.map((r, i) => ({
			...r,
			Notes: i === 0 ? "a" : "b",
			Double: String(Number(r.sales) * 2),
			Tagged: i === 0 ? "a!" : "b!",
		})),
		createdAt: 5,
		editedFrom: "v4",
		transform: { added: [tagged] },
	},
]

export const chainDataset = (): Dataset => ({
	id: "ds-chain",
	name: "sales (reshaped)",
	fields: [...LONG, NOTES, DOUBLE, TAGGED],
	versions: chainVersions(),
	latestVersionId: "v5",
	createdAt: 1,
})

