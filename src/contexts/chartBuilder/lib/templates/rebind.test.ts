import { describe, expect, it } from "vitest"
import { DEFAULT_AXIS_CONFIG, DEFAULT_DATA_LABELS_CONFIG } from "../channelConfig"
import {
	DEFAULT_LEGEND_CHANNEL_CONFIG,
	DEFAULT_LEGEND_CONFIG,
	DEFAULT_TOOLTIP_CONFIG,
} from "../labelsConfig"
import {
	emptyDataLabelsEncodings,
	emptyEncodings,
	type EncodingChannel,
	type Field,
	type FieldType,
	type TemplateSourceField,
} from "../types"
import { dataKindOf } from "./dataKind"
import { rebindTemplate, type RebindConfigs } from "./rebind"

const src = (
	name: string,
	type: FieldType,
	formatHint?: Field["formatHint"],
	sourceNames?: string[],
): TemplateSourceField => ({
	name,
	type,
	kind: dataKindOf(type, formatHint),
	...(sourceNames ? { sourceNames } : {}),
})

const fld = (
	name: string,
	inferredType: FieldType,
	formatHint?: Field["formatHint"],
	sourceNames?: string[],
): Field => ({
	name,
	inferredType,
	...(formatHint ? { formatHint } : {}),
	...(sourceNames ? { sourceNames } : {}),
})

const configs = (
	bound: Partial<Record<EncodingChannel, string>>,
	over: Partial<RebindConfigs> = {},
): RebindConfigs => {
	const encodings = emptyEncodings()
	for (const [ch, f] of Object.entries(bound))
		encodings[ch as EncodingChannel] = { field: f }
	return {
		encodings,
		dataLabelsEncodings: emptyDataLabelsEncodings(),
		fieldTypeOverrides: {},
		channelConfigs: {},
		...over,
	}
}

const run = (
	c: RebindConfigs,
	sources: TemplateSourceField[],
	fields: Field[],
	memory = {},
) => rebindTemplate(c, sources, fields, memory)

describe("rebindTemplate — matching tiers", () => {
	it("a name match beats a kind match", () => {
		const r = run(
			configs({ y: "Spend" }),
			[src("Spend", "quantitative", "dollar")],
			[fld("Cost", "quantitative", "dollar"), fld("Spend", "quantitative")],
		)
		expect(r.mapping).toEqual({ Spend: "Spend" })
		expect(r.configs.encodings.y.field).toBe("Spend")
	})

	it("matches a former name (sourceNames) on either side", () => {
		const a = run(
			configs({ x: "Date" }),
			[src("Date", "temporal")],
			[fld("Other", "temporal"), fld("Period", "temporal", undefined, ["Date"])],
		)
		expect(a.mapping).toEqual({ Date: "Period" })
		const b = run(
			configs({ x: "Period" }),
			[src("Period", "temporal", undefined, ["Date"])],
			[fld("Other", "temporal"), fld("Date", "temporal")],
		)
		expect(b.mapping).toEqual({ Period: "Date" })
		expect(b.configs.encodings.x.field).toBe("Date")
	})

	it("a kind match (dollar) beats a plain type match", () => {
		const r = run(
			configs({ y: "Spend" }),
			[src("Spend", "quantitative", "dollar")],
			[fld("Count", "quantitative"), fld("Rate", "quantitative", "dollar")],
		)
		expect(r.mapping).toEqual({ Spend: "Rate" })
	})

	it("falls back to a same-type match across kinds", () => {
		const r = run(
			configs({ y: "Spend" }),
			[src("Spend", "quantitative", "dollar")],
			[fld("Region", "categorical"), fld("Pct", "quantitative", "percent")],
		)
		expect(r.mapping).toEqual({ Spend: "Pct" })
	})

	it("reads any type as a category and writes the override", () => {
		const r = run(
			configs({ hue: "Year" }, { fieldTypeOverrides: { Year: "categorical" } }),
			[src("Year", "categorical")],
			[fld("Period", "temporal")],
		)
		expect(r.mapping).toEqual({ Year: "Period" })
		expect(r.configs.encodings.hue.field).toBe("Period")
		expect(r.configs.fieldTypeOverrides).toEqual({ Period: "categorical" })
	})

	it("takes any type the occupied channels accept as a last resort", () => {
		const r = run(
			configs({ x: "Date" }),
			[src("Date", "temporal")],
			[fld("Amount", "quantitative")],
		)
		expect(r.mapping).toEqual({ Date: "Amount" })
		expect(r.configs.encodings.x.field).toBe("Amount")
		expect(r.configs.fieldTypeOverrides).toEqual({})
	})

	it("a facet can't take the measure from x on quantitative-only data", () => {
		// Facet is processed first but only reaches a number in phase 3; x
		// takes it by type in phase 2.
		const r = run(
			configs({ x: "Amount", facet: "Region" }),
			[src("Amount", "quantitative"), src("Region", "categorical")],
			[fld("Value", "quantitative")],
		)
		expect(r.mapping).toEqual({ Amount: "Value", Region: null })
		expect(r.unmatched).toEqual([{ field: "Region", channels: ["facet"] }])
		expect(r.configs.encodings.facet.field).toBeNull()
	})

	it("kind / type matches for every field come before any category read or any-accepted match", () => {
		const r = run(
			configs({ x: "Date", y: "Spend", facet: "Region", hue: "Group" }),
			[
				src("Date", "temporal"),
				src("Spend", "quantitative", "dollar"),
				src("Region", "categorical"),
				src("Group", "categorical"),
			],
			[
				fld("Period", "quantitative"),
				fld("Rate", "quantitative", "percent"),
				fld("Region", "categorical"),
			],
		)
		// y takes the first quantitative (data-set order) by type in phase 2;
		// x then takes the other by any-accepted in phase 3, ahead of hue
		// (template order breaks the restrictiveness tie), leaving hue empty.
		expect(r.mapping).toEqual({
			Date: "Rate",
			Spend: "Period",
			Region: "Region",
			Group: null,
		})
		expect(r.unmatched).toEqual([{ field: "Group", channels: ["hue"] }])
		expect(r.configs.encodings.hue.field).toBeNull()
		expect(r.configs.fieldTypeOverrides).toEqual({})
	})

	it("refuses a type no occupied channel accepts", () => {
		const r = run(
			configs({ area: "Size" }),
			[src("Size", "quantitative")],
			[fld("Name", "categorical")],
		)
		expect(r.mapping).toEqual({ Size: null })
		expect(r.unmatched).toEqual([{ field: "Size", channels: ["area"] }])
	})
})

describe("rebindTemplate — assignment", () => {
	it("swaps A ↔ B cleanly", () => {
		const r = run(
			configs({ x: "A", y: "B" }, {
				dataLabelsConfig: {
					...DEFAULT_DATA_LABELS_CONFIG,
					fieldFormats: { A: "fa", B: "fb" },
				},
			}),
			[src("A", "temporal"), src("B", "quantitative")],
			// Same names, swapped types: neither name match is compatible.
			[fld("B", "temporal"), fld("A", "quantitative")],
		)
		expect(r.mapping).toEqual({ A: "B", B: "A" })
		expect(r.configs.encodings.x.field).toBe("B")
		expect(r.configs.encodings.y.field).toBe("A")
		expect(r.configs.dataLabelsConfig?.fieldFormats).toEqual({ B: "fa", A: "fb" })
	})

	it("uses each new field at most once", () => {
		const r = run(
			configs({ x: "P", y: "Q" }),
			[src("P", "quantitative"), src("Q", "quantitative")],
			[fld("N", "quantitative")],
		)
		expect(r.mapping).toEqual({ P: "N", Q: null })
		expect(r.unmatched).toEqual([{ field: "Q", channels: ["y"] }])
	})

	it("reserves a new field for the template field that matches it by name", () => {
		// Shape (restrictive) would take "B" by type, but "B" belongs to the
		// later template field of that name.
		const r = run(
			configs({ shape: "S", hue: "B" }),
			[src("B", "categorical"), src("S", "categorical")],
			[fld("B", "categorical"), fld("T", "categorical")],
		)
		expect(r.mapping).toEqual({ B: "B", S: "T" })
	})

	it("never remaps onto the name of a template field left unmatched", () => {
		// "B" (template, quantitative on area) can't take new "B"
		// (categorical); S must not land on "B" either, or the two merge.
		const r = run(
			configs({ shape: "S", area: "B" }),
			[src("S", "categorical"), src("B", "quantitative")],
			[fld("B", "categorical")],
		)
		expect(r.mapping).toEqual({ S: null, B: null })
		expect(r.configs.encodings.shape.field).toBeNull()
		expect(r.configs.encodings.area.field).toBeNull()
	})

	it("orders by the most restrictive channel, then template order", () => {
		const r = run(
			configs({ x: "Cat1", facet: "Cat2" }),
			[src("Cat1", "categorical"), src("Cat2", "categorical")],
			[fld("Only", "categorical")],
		)
		expect(r.mapping).toEqual({ Cat1: null, Cat2: "Only" })
	})

	it("matches fields referenced only outside the encodings, and omits unreferenced ones", () => {
		const r = run(
			configs({ x: "X" }, {
				tooltipConfig: { ...DEFAULT_TOOLTIP_CONFIG, visibleFields: ["Note"] },
			}),
			[src("X", "quantitative"), src("Note", "categorical"), src("Unused", "categorical")],
			[fld("X", "quantitative"), fld("Label", "categorical")],
		)
		expect(r.mapping).toEqual({ X: "X", Note: "Label" })
		expect(r.configs.tooltipConfig?.visibleFields).toEqual(["Label"])
	})
})

describe("rebindTemplate — unmatched cleanup and overrides", () => {
	it("empties encoding and data-label slots, removes the multi-field entry, leaves per-field maps dangling", () => {
		const dle = emptyDataLabelsEncodings()
		dle.hue = { field: "Gone" }
		dle.value = { field: null, multiField: true, fields: ["Keep", "Gone"] }
		const r = run(
			configs({ shape: "Gone", y: "Keep" }, {
				dataLabelsEncodings: dle,
				dataLabelsConfig: {
					...DEFAULT_DATA_LABELS_CONFIG,
					fieldFormats: { Gone: ".1f" },
				},
			}),
			[src("Keep", "quantitative"), src("Gone", "categorical")],
			[fld("Keep", "quantitative")],
		)
		expect(r.unmatched).toEqual([{ field: "Gone", channels: ["shape"] }])
		expect(r.configs.encodings.shape.field).toBeNull()
		expect(r.configs.dataLabelsEncodings?.hue.field).toBeNull()
		expect(r.configs.dataLabelsEncodings?.value.fields).toEqual(["Keep"])
		expect(r.configs.dataLabelsConfig?.fieldFormats).toEqual({ Gone: ".1f" })
	})

	it("an unmatched field only in a data-label slot reports no channels", () => {
		const dle = emptyDataLabelsEncodings()
		dle.value = { field: "Gone" }
		const r = run(
			configs({}, { dataLabelsEncodings: dle }),
			[src("Gone", "quantitative")],
			[fld("Name", "categorical")],
		)
		// Data-label slots accept every type, so it still finds a match.
		expect(r.mapping).toEqual({ Gone: "Name" })
		expect(r.configs.dataLabelsEncodings?.value.field).toBe("Name")
	})

	it("keeps only categorical / ordinal overrides that differ from the inferred type", () => {
		const r = run(
			configs({ x: "N", hue: "Y", shape: "C" }, {
				fieldTypeOverrides: {
					N: "quantitative",
					Y: "categorical",
					C: "categorical",
					Stale: "ordinal",
				},
			}),
			[src("N", "quantitative"), src("Y", "categorical"), src("C", "categorical")],
			[fld("N", "quantitative"), fld("Y", "quantitative"), fld("C", "categorical")],
		)
		expect(r.mapping).toEqual({ N: "N", Y: "Y", C: "C" })
		expect(r.configs.fieldTypeOverrides).toEqual({ Y: "categorical" })
	})
})

describe("rebindTemplate — format memory", () => {
	it("applies hits by the new field's kind and Auto on misses", () => {
		const r = run(
			configs({ x: "Date", y: "Spend", hue: "Share" }, {
				channelConfigs: {
					x: { ...DEFAULT_AXIS_CONFIG, customFormat: "%b %Y" },
					y: { ...DEFAULT_AXIS_CONFIG, customFormat: "$,.0f" },
				},
			}),
			[src("Date", "temporal"), src("Spend", "quantitative", "dollar"), src("Share", "quantitative", "percent")],
			[fld("Period", "temporal"), fld("Cost", "quantitative", "dollar"), fld("Rate", "quantitative", "percent")],
			{
				"axis:x": { number: ",.0f" },
				"axis:y": { dollar: "$,.0f" },
				"legend:hue": { percent: ".0%" },
			},
		)
		expect(r.mapping).toEqual({ Date: "Period", Spend: "Cost", Share: "Rate" })
		expect(r.configs.channelConfigs.x?.customFormat).toBe("")
		expect(r.configs.channelConfigs.y?.customFormat).toBe("$,.0f")
		expect(r.configs.legendConfig?.channels?.hue).toEqual({
			...DEFAULT_LEGEND_CHANNEL_CONFIG,
			format: ".0%",
		})
		expect(r.configs.legendConfig?.position).toBe(DEFAULT_LEGEND_CONFIG.position)
	})

	it("uses the override type for kind (a number read as a category)", () => {
		const r = run(
			configs({ hue: "Year" }),
			[src("Year", "categorical")],
			[fld("Yr", "quantitative")],
			{ "legend:hue": { number: ",.0f", category: "CAT" } },
		)
		// A categorical hue isn't a number: the "number" format must not apply.
		expect(r.configs.legendConfig?.channels?.hue?.format).toBe("CAT")
	})
})

describe("rebindTemplate — identity", () => {
	it("returns the same configs when every field is present by name with the same type and no formats", () => {
		const dle = emptyDataLabelsEncodings()
		dle.value = { field: "B" }
		const c = configs({ x: "A", y: "B", hue: "C" }, {
			dataLabelsEncodings: dle,
			fieldTypeOverrides: { C: "categorical" },
		})
		const r = run(
			c,
			[src("A", "temporal"), src("B", "quantitative"), src("C", "categorical")],
			[fld("A", "temporal"), fld("B", "quantitative"), fld("C", "quantitative")],
		)
		expect(r.mapping).toEqual({ A: "A", B: "B", C: "C" })
		expect(r.unmatched).toEqual([])
		expect(r.configs).toBe(c)
	})
})
