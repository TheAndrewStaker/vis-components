import { describe, expect, it } from "vitest"
import type { Dataset, DatasetVersion, Field } from "./types"
import {
	fieldsOfVersion,
	normalizeVersionFields,
	renameFieldInVersions,
	sameFieldList,
	withNextFields,
} from "./versionFields"

const q = (name: string): Field => ({ name, inferredType: "quantitative" })
const c = (name: string): Field => ({ name, inferredType: "categorical" })

const version = (
	id: string,
	extra: Partial<DatasetVersion> = {}
): DatasetVersion => ({ id, filename: `${id}.csv`, rows: [], createdAt: 0, ...extra })

const dataset = (fields: Field[], versions: DatasetVersion[]): Dataset => ({
	id: "ds",
	name: "d",
	fields,
	versions,
	latestVersionId: versions.at(-1)?.id ?? "none",
	createdAt: 0,
})

describe("sameFieldList", () => {
	it("compares name, type and former names in order, ignoring view-time annotations", () => {
		expect(sameFieldList([q("a"), c("b")], [q("a"), c("b")])).toBe(true)
		expect(sameFieldList([q("a"), c("b")], [c("b"), q("a")])).toBe(false)
		expect(sameFieldList([q("a")], [c("a")])).toBe(false)
		expect(sameFieldList([q("a")], [{ ...q("a"), sourceNames: ["x"] }])).toBe(false)
		expect(sameFieldList([q("a")], [{ ...q("a"), derived: true, formatHint: "dollar" }])).toBe(
			true
		)
		expect(sameFieldList([q("a")], [q("a"), q("b")])).toBe(false)
	})
})

describe("withNextFields", () => {
	it("gives every version sharing the old list that list as its own, and the data set the new one", () => {
		const own = [q("x")]
		const d = dataset([q("a"), q("b")], [version("v1"), version("v2", { fields: own })])
		const next = withNextFields(d, [q("a"), c("cat"), q("val")])
		expect(next.fields.map((f) => f.name)).toEqual(["a", "cat", "val"])
		expect(next.versions[0]!.fields).toBe(d.fields)
		// A version with its own list keeps it.
		expect(next.versions[1]!.fields).toBe(own)
	})

	it("returns the data set as it is when the columns don't change", () => {
		const d = dataset([q("a")], [version("v1")])
		expect(withNextFields(d, [q("a")])).toBe(d)
		expect(fieldsOfVersion(d, "v1")).toBe(d.fields)
	})
})

describe("normalizeVersionFields", () => {
	it("promotes the latest version's own list to the data set's and drops lists equal to it", () => {
		const wide = [q("a"), q("b")]
		const d: Dataset = {
			...dataset([q("a"), c("cat"), q("val")], [
				version("v1", { fields: wide }),
				version("v2", { fields: wide }),
			]),
			latestVersionId: "v2",
		}
		const next = normalizeVersionFields(d)
		expect(next.fields).toBe(wide)
		expect(next.versions.every((v) => v.fields === undefined)).toBe(true)
	})

	it("keeps lists that still differ, and the same reference when nothing changes", () => {
		const d = dataset([q("a")], [version("v1", { fields: [q("a"), q("b")] }), version("v2")])
		expect(normalizeVersionFields(d)).toBe(d)
	})
})

describe("renameFieldInVersions", () => {
	it("renames inside a version's own list (remembering the old name) and its transform", () => {
		const versions: DatasetVersion[] = [
			version("v1", { fields: [q("a"), q("b")] }),
			version("v2", {
				transform: {
					added: [{ id: "x", name: "double", kind: "math", math: { formula: "{a} * 2" } }],
				},
			}),
			version("v3"),
		]
		const next = renameFieldInVersions(versions, "a", "alpha")
		expect(next[0]!.fields).toEqual([
			{ name: "alpha", inferredType: "quantitative", sourceNames: ["a"] },
			q("b"),
		])
		expect(next[1]!.transform?.added?.[0]?.math?.formula).toBe("{alpha} * 2")
		// Untouched versions keep their identity; an unrelated rename changes nothing.
		expect(next[2]).toBe(versions[2])
		expect(renameFieldInVersions(versions, "zzz", "y")).toBe(versions)
	})
})
