import { describe, expect, it } from "vitest"
import { DEFAULT_AXIS_CONFIG, DEFAULT_SHAPE_CONFIG } from "../channelConfig"
import { SYSTEM_LIGHT_THEME } from "../systemThemes"
import { labelsFromTheme } from "../themeConfig"
import {
	emptyDataLabelsEncodings,
	emptyEncodings,
	type EncodingChannel,
	type FieldType,
	type TemplateSourceField,
} from "../types"
import type { TemplateBody } from "./buildTemplateBody"
import { dataKindOf } from "./dataKind"
import {
	applyTemplateUpdate,
	diffTemplate,
	matchTemplateFields,
	type TemplateSide,
} from "./templateDiff"
import { ALL_TEMPLATE_SECTIONS } from "./templateSections"

const src = (
	name: string,
	type: FieldType,
	formatHint?: "dollar" | "percent",
	sourceNames?: string[],
): TemplateSourceField => ({
	name,
	type,
	kind: dataKindOf(type, formatHint),
	...(sourceNames ? { sourceNames } : {}),
})

const body = (
	bound: Partial<Record<EncodingChannel, string>>,
	over: Partial<TemplateBody> = {},
): TemplateBody => {
	const encodings = emptyEncodings()
	for (const [ch, f] of Object.entries(bound))
		encodings[ch as EncodingChannel] = { field: f }
	return {
		datasetId: null,
		createdAtVersionId: null,
		fieldTypeOverrides: {},
		encodings,
		dataLabelsEncodings: emptyDataLabelsEncodings(),
		channelConfigs: {},
		labelsConfig: labelsFromTheme(SYSTEM_LIGHT_THEME),
		...over,
	}
}

const side = (
	b: TemplateBody,
	sourceFields: TemplateSourceField[],
	formatMemory: TemplateSide["meta"]["formatMemory"] = {},
): TemplateSide => ({ body: b, meta: { sourceFields, formatMemory } })

/** A dollar-y template on Date / Spend / Payer. */
const TEMPLATE = side(
	body(
		{ x: "Date", y: "Spend", hue: "Payer" },
		{
			channelConfigs: {
				x: { ...DEFAULT_AXIS_CONFIG, customFormat: "%Y" },
				y: { ...DEFAULT_AXIS_CONFIG, customFormat: "$,.0f", tickCount: 4 },
				hue: {
					kind: "categorical",
					colors: { Medicare: "#111111", Other: "#222222" },
					stackMode: "stack",
				},
			},
		},
	),
	[src("Date", "temporal"), src("Spend", "quantitative", "dollar"), src("Payer", "categorical")],
	{ "axis:x": { date: "%Y" }, "axis:y": { dollar: "$,.0f" } },
)

/** The same design snapped onto Period / Rate / Segment, with percents on
 * y, a different tick count and one more category colored. */
const VISUAL = side(
	body(
		{ x: "Period", y: "Rate", hue: "Segment" },
		{
			channelConfigs: {
				x: { ...DEFAULT_AXIS_CONFIG, customFormat: "%Y" },
				y: { ...DEFAULT_AXIS_CONFIG, customFormat: ".0%", tickCount: 8 },
				hue: {
					kind: "categorical",
					colors: { Medicare: "#111111", Commercial: "#333333" },
					stackMode: "stack",
				},
			},
		},
	),
	[src("Period", "temporal"), src("Rate", "quantitative", "percent"), src("Segment", "categorical")],
	{ "axis:x": { date: "%Y" }, "axis:y": { percent: ".0%" } },
)

describe("matchTemplateFields", () => {
	it("pairs by name, then former name, then the same slot", () => {
		const tpl = side(body({ x: "Date", y: "Spend", hue: "Payer" }), [
			src("Date", "temporal"),
			src("Spend", "quantitative", "dollar"),
			src("Payer", "categorical"),
		])
		const vis = side(body({ x: "Period", y: "Spend", hue: "Segment" }), [
			src("Period", "temporal", undefined, ["Date"]),
			src("Spend", "quantitative"),
			src("Segment", "categorical"),
		])
		expect(matchTemplateFields(tpl, vis)).toEqual({
			Date: "Period",
			Spend: "Spend",
			Payer: "Segment",
		})
	})

	it("never pairs one visual field twice, and leaves an emptied slot unmatched", () => {
		const tpl = side(body({ x: "A", y: "B" }), [
			src("A", "quantitative"),
			src("B", "quantitative"),
		])
		const vis = side(body({ x: "C", y: null as unknown as string }), [
			src("C", "quantitative"),
		])
		expect(matchTemplateFields(tpl, vis)).toEqual({ A: "C" })
	})
})

describe("diffTemplate", () => {
	const diff = diffTemplate(TEMPLATE, VISUAL)
	const byId = Object.fromEntries(diff.sections.map((s) => [s.id, s]))

	it("does not count the snap's renames or per-kind format strings as changes", () => {
		expect(byId.encodings).toBeUndefined()
		expect(byId.xAxis).toBeUndefined()
		expect(byId.yAxis?.changes).toEqual(["tick count"])
	})

	it("reports a format the template has yet to learn, by surface and kind", () => {
		expect(byId.yAxis?.formats).toEqual([
			"Learns the percent format for the Y axis (.0%)",
		])
	})

	it("reports per-value map additions and removals under their section", () => {
		expect(byId.color?.changes.sort()).toEqual([
			"color › colors › commercial",
			"color › colors › other",
		])
	})

	it("is empty when the visual matches the template", () => {
		expect(diffTemplate(TEMPLATE, TEMPLATE).sections).toEqual([])
	})

	it("says 'Changes' for a known kind with a different string", () => {
		const vis = side(VISUAL.body, VISUAL.meta.sourceFields, {
			"axis:x": { date: "%b %Y" },
		})
		const d = diffTemplate(TEMPLATE, vis)
		expect(d.sections.find((s) => s.id === "xAxis")?.formats).toEqual([
			"Changes the date format for the X axis (%b %Y)",
		])
	})
})

describe("applyTemplateUpdate", () => {
	it("with every section pushes the whole design and merges all formats", () => {
		const out = applyTemplateUpdate(TEMPLATE, VISUAL, ALL_TEMPLATE_SECTIONS)
		expect(out.body.encodings.y.field).toBe("Rate")
		expect(out.body.channelConfigs.y?.tickCount).toBe(8)
		expect(out.meta.formatMemory).toEqual({
			"axis:x": { date: "%Y" },
			"axis:y": { dollar: "$,.0f", percent: ".0%" },
		})
		expect(out.meta.sourceFields).toEqual(VISUAL.meta.sourceFields)
	})

	it("unions per-value maps so the template keeps colors the visual's data lacked", () => {
		const out = applyTemplateUpdate(TEMPLATE, VISUAL, new Set(["color"]))
		expect(out.body.channelConfigs.hue).toEqual({
			kind: "categorical",
			colors: { Medicare: "#111111", Other: "#222222", Commercial: "#333333" },
			stackMode: "stack",
		})
	})

	it("leaves unchosen sections and their format memory alone, renamed into the visual's fields", () => {
		const out = applyTemplateUpdate(TEMPLATE, VISUAL, new Set(["color"]))
		expect(out.body.channelConfigs.y?.tickCount).toBe(4)
		expect(out.body.encodings).toEqual(VISUAL.body.encodings)
		expect(out.meta.formatMemory).toEqual(TEMPLATE.meta.formatMemory)
	})

	it("keeps a template field a kept section still references in the source fields", () => {
		const tpl = side(
			body({ x: "Date", y: "Spend", shape: "Kind" }, {
				channelConfigs: { shape: DEFAULT_SHAPE_CONFIG },
			}),
			[src("Date", "temporal"), src("Spend", "quantitative"), src("Kind", "categorical")],
		)
		const vis = side(body({ x: "Period", y: "Rate" }), [
			src("Period", "temporal"),
			src("Rate", "quantitative"),
		])
		// Encodings not chosen: the template's shape slot (Kind) stays.
		const out = applyTemplateUpdate(tpl, vis, new Set(["yAxis"]))
		expect(out.body.encodings.shape.field).toBe("Kind")
		expect(out.meta.sourceFields.map((f) => f.name)).toEqual(["Period", "Rate", "Kind"])
		// Encodings chosen: nothing mentions Kind any more, so it goes.
		const all = applyTemplateUpdate(tpl, vis, ALL_TEMPLATE_SECTIONS)
		expect(all.body.encodings.shape.field).toBeNull()
		expect(all.meta.sourceFields.map((f) => f.name)).toEqual(["Period", "Rate"])
	})
})
