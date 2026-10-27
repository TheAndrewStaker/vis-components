import { renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import type { ReactNode } from "react"
import { EMPTY_CHANNEL_CONFIGS } from "../lib/channelConfig"
import type { DerivedVariable } from "../lib/derivedVariables"
import { DEFAULT_RESHAPE_CONFIG } from "../lib/reshape"
import { SYSTEM_LIGHT_THEME } from "../lib/systemThemes"
import { fieldsOfVersion } from "../lib/versionFields"
import { labelsFromTheme } from "../lib/themeConfig"
import {
	emptyEncodings,
	type Dataset,
	type Field,
	type Visual,
} from "../lib/types"
import { buildDataset } from "../../../testSupport/fixtures"
import { installInMemoryLocalStorage } from "../../../testSupport/localStorageShim"
import { TestProvider, type TestStore } from "../../../testSupport/TestProvider"

import {
	currentDatasetIdAtom,
	currentDerivedVariablesAtom,
	currentEncodingsAtom,
	currentReshapeConfigAtom,
	loadedDatasetsAtom,
	previewVersionIdAtom,
	visualsAtom,
} from "./atoms"
import {
	currentDatasetViewAtom,
	materializedDerivedAtom,
} from "./useCurrentDatasetView"
import {
	useApplyReshape,
	useRemoveDerivedVariable,
	useSaveDerivedVariable,
} from "./useMaterializeVersion"

/** Reshapes and derived variables as data versions, at the store level:
 *  what a fork copies, what an append keeps, how a recomputed column stays
 *  in place and a renamed one carries the encodings, and how an older
 *  visual's live config is folded in. The panel and popup smoke tests cover
 *  the UI paths. */

beforeEach(() => {
	installInMemoryLocalStorage()
})

const ID = "ds-materialize"

const FIELDS: Field[] = [
	{ name: "city", inferredType: "categorical" },
	{ name: "sales", inferredType: "quantitative" },
	{ name: "units", inferredType: "quantitative" },
]

const ROWS = [
	{ city: "Lima", sales: "10", units: "2" },
	{ city: "Quito", sales: "20", units: "4" },
]

const imported = (): Dataset =>
	buildDataset({ id: ID, name: "sales", fields: FIELDS, rows: ROWS })

const perUnit: DerivedVariable = {
	id: "dv-per",
	name: "per unit",
	kind: "math",
	math: { formula: "{sales} / {units}" },
}

/** A working copy whose v2 added `per unit` as a data version. */
const withDerived = (): Dataset =>
	buildDataset({
		id: ID,
		name: "sales (edited)",
		fields: [...FIELDS, { name: "per unit", inferredType: "quantitative" }],
		versions: [
			{ id: "v1", filename: "sales.csv", rows: ROWS, createdAt: 0, fields: FIELDS },
			{
				id: "v2",
				filename: "Derived data",
				rows: ROWS.map((r) => ({ ...r, "per unit": "5" })),
				createdAt: 1,
				editedFrom: "v1",
				transform: { added: [perUnit] },
			},
		],
	})

const visual = (id: string, over: Partial<Visual> = {}): Visual => ({
	id,
	name: id,
	folderId: null,
	datasetId: null,
	createdAtVersionId: null,
	fieldTypeOverrides: {},
	encodings: emptyEncodings(),
	channelConfigs: EMPTY_CHANNEL_CONFIGS,
	labelsConfig: labelsFromTheme(SYSTEM_LIGHT_THEME),
	thumbnail: null,
	createdAt: 1,
	updatedAt: 1,
	...over,
})

const setup = (dataset: Dataset, init?: (s: TestStore) => void) => {
	let store: TestStore | null = null
	const wrapper = ({ children }: { children: ReactNode }) => (
		<TestProvider
			initializeState={(s) => {
				store = s
				s.set(loadedDatasetsAtom, { [dataset.id]: dataset })
				s.set(currentDatasetIdAtom, dataset.id)
				s.set(previewVersionIdAtom, null)
				init?.(s)
			}}
		>
			{children}
		</TestProvider>
	)
	const { result } = renderHook(
		() => ({
			reshape: useApplyReshape(),
			save: useSaveDerivedVariable(),
			remove: useRemoveDerivedVariable(),
		}),
		{ wrapper }
	)
	return { ...result.current, store: store! }
}

const forkedId = (store: TestStore) => {
	const id = store.get(currentDatasetIdAtom)
	if (!id || id === ID) throw new Error("expected the editor to move to a forked data set")
	return id
}

describe("useApplyReshape", () => {
	it("forks imported data: the wide copy keeps its columns, the long table is v2 with the reshape recorded", async () => {
		const { reshape, store } = setup(imported())
		const result = await reshape(
			{
				kind: "melt",
				config: {
					idFields: ["city"],
					meltFields: ["sales", "units"],
					variableName: "m",
					valueName: "v",
				},
			},
			"sales (reshaped)"
		)
		expect(result).toMatchObject({ ok: true, mode: "fork" })
		const forked = store.get(loadedDatasetsAtom)[forkedId(store)]!
		expect(forked.fields.map((f) => f.name)).toEqual(["city", "m", "v"])
		const [wide, long] = forked.versions
		expect(wide!.fields).toEqual(FIELDS)
		expect(wide!.rows).toBe(ROWS)
		expect(long).toMatchObject({ filename: "Reshaped data", editedFrom: wide!.id })
		expect(long!.transform?.reshape?.meltFields).toEqual(["sales", "units"])
		expect(long!.rows).toHaveLength(4)
		// The view draws the long table.
		expect(store.get(currentDatasetViewAtom)?.fields.map((f) => f.name)).toEqual([
			"city",
			"m",
			"v",
		])
		expect(store.get(loadedDatasetsAtom)[ID]).toEqual(imported())
	})

	it("refuses a draft that doesn't reshape", async () => {
		const { reshape, store } = setup(imported())
		expect(await reshape({ kind: "melt", config: DEFAULT_RESHAPE_CONFIG }, "x")).toEqual({
			ok: false,
			error: "Check at least one Combine column.",
		})
		expect(
			await reshape(
				{ kind: "pivot", config: { idFields: [], keyFields: [], valueFields: [] } },
				"x"
			)
		).toEqual({
			ok: false,
			error: "Check a column to split out and a column to fill with.",
		})
		expect(store.get(currentDatasetIdAtom)).toBe(ID)
	})
})

describe("useSaveDerivedVariable", () => {
	it("adds a column as a new version of a working copy and marks it derived in the view", async () => {
		const { save, store } = setup(withDerived())
		const double: DerivedVariable = {
			id: "dv-double",
			name: "double",
			kind: "math",
			math: { formula: "{sales} * 2" },
		}
		const result = await save(double, null, "sales (edited)")
		expect(result).toEqual({ ok: true, mode: "append", datasetId: ID })
		const ds = store.get(loadedDatasetsAtom)[ID]!
		expect(ds.versions).toHaveLength(3)
		const v3 = ds.versions[2]!
		expect(v3).toMatchObject({ filename: "Derived data", editedFrom: "v2" })
		expect(v3.transform).toEqual({ added: [double] })
		expect(v3.rows[1]).toEqual({ city: "Quito", sales: "20", units: "4", "per unit": "5", double: "40" })
		expect(ds.fields.map((f) => f.name)).toEqual(["city", "sales", "units", "per unit", "double"])
		// Earlier versions keep the columns they had.
		expect(ds.versions[1]!.fields?.map((f) => f.name)).toEqual([
			"city",
			"sales",
			"units",
			"per unit",
		])
		const view = store.get(currentDatasetViewAtom)!
		expect(view.fields.filter((f) => f.derived).map((f) => f.name)).toEqual([
			"per unit",
			"double",
		])
		expect([...store.get(materializedDerivedAtom).keys()]).toEqual(["per unit", "double"])
	})

	it("recomputes a stored column in place, and a changed name is a rename the encodings follow", async () => {
		const { save, store } = setup(withDerived(), (s) => {
			s.set(currentEncodingsAtom, { ...emptyEncodings(), y: { field: "per unit" } })
			s.set(visualsAtom, [
				visual("sibling", {
					datasetId: ID,
					encodings: { ...emptyEncodings(), x: { field: "per unit" } },
				}),
			])
		})
		const edited: DerivedVariable = {
			...perUnit,
			name: "rate",
			math: { formula: "{sales} / {units} * 10" },
		}
		const result = await save(
			edited,
			{ kind: "materialized", variable: perUnit },
			"sales (edited)"
		)
		expect(result).toMatchObject({ ok: true, mode: "append" })
		const ds = store.get(loadedDatasetsAtom)[ID]!
		const v3 = ds.versions[2]!
		expect(v3.transform).toEqual({ recomputed: [edited] })
		expect(v3.rows[0]).toEqual({ city: "Lima", sales: "10", units: "2", rate: "50" })
		// Same position, the old name remembered.
		expect(ds.fields.map((f) => f.name)).toEqual(["city", "sales", "units", "rate"])
		expect(ds.fields[3]).toEqual({
			name: "rate",
			inferredType: "quantitative",
			sourceNames: ["per unit"],
		})
		// The older version's columns — once renamed, the same as the data
		// set's, so it shares the list again — its stored definition, the
		// editor and the sibling visual all follow the rename.
		expect(ds.versions[1]!.fields).toBeUndefined()
		expect(fieldsOfVersion(ds, "v2")[3]?.name).toBe("rate")
		expect(ds.versions[0]!.fields).toEqual(FIELDS)
		expect(ds.versions[1]!.transform?.added?.[0]?.name).toBe("rate")
		expect(store.get(currentEncodingsAtom).y.field).toBe("rate")
		expect(store.get(visualsAtom)[0]!.encodings.x.field).toBe("rate")
		expect(store.get(materializedDerivedAtom).get("rate")?.math?.formula).toBe(
			"{sales} / {units} * 10"
		)
	})

	it("folds an older visual's live reshape and variables into the version it saves", async () => {
		const live: DerivedVariable = {
			id: "dv-live",
			name: "total",
			kind: "math",
			math: { formula: "{sales} + {units}" },
		}
		const { save, store } = setup(imported(), (s) => {
			s.set(currentReshapeConfigAtom, {
				idFields: ["city", "total"],
				meltFields: ["sales", "units"],
				variableName: "measure",
				valueName: "value",
			})
			s.set(currentDerivedVariablesAtom, { variables: [live] })
		})
		const big: DerivedVariable = {
			id: "dv-big",
			name: "big",
			kind: "rules",
			rules: { rules: [{ condition: "{value} > 5", output: "yes" }], fallback: "no" },
		}
		expect((await save(big, null, "sales (edited)")).ok).toBe(true)
		const forked = store.get(loadedDatasetsAtom)[forkedId(store)]!
		const v2 = forked.versions[1]!
		expect(v2.transform?.reshape?.variableName).toBe("measure")
		expect(v2.transform?.added?.map((v) => v.name)).toEqual(["total", "big"])
		expect(forked.fields.map((f) => f.name)).toEqual(["city", "total", "measure", "value", "big"])
		expect(v2.rows[0]).toEqual({ city: "Lima", total: "12", measure: "sales", value: "10", big: "yes" })
		// Everything live now lives in the data.
		expect(store.get(currentReshapeConfigAtom)).toEqual(DEFAULT_RESHAPE_CONFIG)
		expect(store.get(currentDerivedVariablesAtom).variables).toEqual([])
	})

	it("refuses a variable that can't be computed, leaving everything as it was", async () => {
		const { save, store } = setup(imported())
		const broken: DerivedVariable = {
			id: "dv-x",
			name: "x",
			kind: "math",
			math: { formula: "{nope} + 1" },
		}
		expect(await save(broken, null, "sales (edited)")).toEqual({
			ok: false,
			error: "This variable can't be computed from the data.",
		})
		expect(store.get(currentDatasetIdAtom)).toBe(ID)
	})
})

describe("useRemoveDerivedVariable", () => {
	it("drops a stored column in a new version", async () => {
		const { remove, store } = setup(withDerived())
		const result = await remove({ kind: "materialized", variable: perUnit }, "sales (edited)")
		expect(result).toMatchObject({ ok: true, mode: "append" })
		const ds = store.get(loadedDatasetsAtom)[ID]!
		const v3 = ds.versions[2]!
		expect(v3.transform).toEqual({ removed: ["per unit"] })
		expect(v3.rows[0]).toEqual({ city: "Lima", sales: "10", units: "2" })
		expect(ds.fields.map((f) => f.name)).toEqual(["city", "sales", "units"])
		expect(ds.versions[1]!.fields?.map((f) => f.name)).toContain("per unit")
		expect(store.get(materializedDerivedAtom).size).toBe(0)
	})

	it("only edits the config for a live variable", async () => {
		const live: DerivedVariable = { ...perUnit, id: "dv-live" }
		const { remove, store } = setup(imported(), (s) =>
			s.set(currentDerivedVariablesAtom, { variables: [live] })
		)
		expect(await remove({ kind: "legacy", variable: live }, "sales")).toEqual({
			ok: true,
			mode: "config",
		})
		expect(store.get(currentDerivedVariablesAtom).variables).toEqual([])
		expect(store.get(loadedDatasetsAtom)[ID]!.versions).toHaveLength(1)
	})
})
