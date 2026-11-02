import { describe, expect, it } from "vitest"
import type { Field } from "../types"
import { dataKindOf, sourceFieldsFrom } from "./dataKind"

describe("dataKindOf", () => {
	it("splits quantitative by format hint and maps the other types", () => {
		expect(dataKindOf("quantitative", "dollar")).toBe("dollar")
		expect(dataKindOf("quantitative", "percent")).toBe("percent")
		expect(dataKindOf("quantitative")).toBe("number")
		expect(dataKindOf("temporal")).toBe("date")
		expect(dataKindOf("categorical")).toBe("category")
		expect(dataKindOf("ordinal")).toBe("ordinal")
	})

	it("ignores a format hint on a non-quantitative type", () => {
		expect(dataKindOf("categorical", "dollar")).toBe("category")
	})
})

describe("sourceFieldsFrom", () => {
	const fields: Field[] = [
		{ name: "Sales", inferredType: "quantitative", formatHint: "dollar" },
		{ name: "Year", inferredType: "quantitative" },
		{ name: "When", inferredType: "temporal", sourceNames: ["Date"] },
		{ name: "Region", inferredType: "categorical" },
	]

	it("records effective type (override wins), kind, and former names", () => {
		expect(sourceFieldsFrom(fields, { Year: "categorical" })).toEqual([
			{ name: "Sales", type: "quantitative", kind: "dollar" },
			{ name: "Year", type: "categorical", kind: "category" },
			{ name: "When", type: "temporal", kind: "date", sourceNames: ["Date"] },
			{ name: "Region", type: "categorical", kind: "category" },
		])
	})

	it("falls back to categorical without an inferred type", () => {
		const bare = [{ name: "X" } as unknown as Field]
		expect(sourceFieldsFrom(bare, {})[0]).toMatchObject({
			type: "categorical",
			kind: "category",
		})
	})
})
