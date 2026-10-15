import { describe, expect, it } from "vitest"

import {
	MIN_LINE_THICKNESS,
	resolveConnectionThickness,
} from "./connectionThickness"

describe("resolveConnectionThickness", () => {
	const base = { groupKey: "A", thickness: 2, byValue: undefined }

	it("returns the single thickness when there is no override map", () => {
		expect(resolveConnectionThickness(base)).toBe(2)
	})

	it("returns the single thickness for an empty override map", () => {
		expect(resolveConnectionThickness({ ...base, byValue: {} })).toBe(2)
	})

	it("uses the per-value override when present", () => {
		expect(
			resolveConnectionThickness({ ...base, byValue: { A: 6, B: 1 } })
		).toBe(6)
	})

	it("falls back to the single thickness for a group with no entry", () => {
		expect(
			resolveConnectionThickness({ ...base, groupKey: "C", byValue: { A: 6 } })
		).toBe(2)
	})

	it("ignores overrides when the group key is null", () => {
		expect(
			resolveConnectionThickness({ ...base, groupKey: null, byValue: { A: 6 } })
		).toBe(2)
	})

	it("clamps a stored override below the minimum to the floor", () => {
		expect(
			resolveConnectionThickness({ ...base, byValue: { A: -1 } })
		).toBe(MIN_LINE_THICKNESS)
	})

	it("lets a zero override hide the line", () => {
		expect(resolveConnectionThickness({ ...base, byValue: { A: 0 } })).toBe(0)
	})

	describe("vary by a field (not the connection value)", () => {
		// A line's representative row: connection value "A" (the group key),
		// plus a categorical field that is constant within the line.
		const row = { region: "A", segment: "retail" }

		it("keys the lookup by the row's value for the field instead of the group key", () => {
			expect(
				resolveConnectionThickness({
					...base,
					byValue: { retail: 5, A: 1 },
					field: "segment",
					row,
				})
			).toBe(5)
		})

		it("ignores a group-key entry once a field is set", () => {
			expect(
				resolveConnectionThickness({ ...base, byValue: { A: 6 }, field: "segment", row })
			).toBe(2)
		})

		it("falls back to the single thickness when the row has no value for the field", () => {
			expect(
				resolveConnectionThickness({
					...base,
					byValue: { retail: 5 },
					field: "missing",
					row,
				})
			).toBe(2)
			expect(
				resolveConnectionThickness({
					...base,
					byValue: { retail: 5 },
					field: "segment",
					row: undefined,
				})
			).toBe(2)
		})

		it("a null field keeps the legacy group-key lookup", () => {
			expect(
				resolveConnectionThickness({ ...base, byValue: { A: 6 }, field: null, row })
			).toBe(6)
		})

		it("stringifies the cell so numeric keys match the sidebar's level rows", () => {
			expect(
				resolveConnectionThickness({
					...base,
					byValue: { "3": 4 },
					field: "n",
					row: { n: 3 },
				})
			).toBe(4)
		})

		it("clamps a field-keyed override below the floor", () => {
			expect(
				resolveConnectionThickness({
					...base,
					byValue: { retail: -2 },
					field: "segment",
					row,
				})
			).toBe(MIN_LINE_THICKNESS)
		})
	})
})
