import { describe, expect, it } from "vitest"
import {
	DEFAULT_AXIS_CONFIG,
	DEFAULT_CHORD_AXIS_CONFIG,
	DEFAULT_DATA_LABELS_CONFIG,
} from "../channelConfig"
import { DEFAULT_LEGEND_CHANNEL_CONFIG } from "../labelsConfig"
import {
	emptyDataLabelsEncodings,
	emptyEncodings,
	type DataKind,
	type TemplateSourceField,
} from "../types"
import {
	applyFormatMemory,
	collectFormatMemory,
	formatSurfacesFor,
	mergeFormatMemory,
	type FormatConfigs,
} from "./formatSurfaces"

const src = (name: string, kind: DataKind): TemplateSourceField => ({
	name,
	type: kind === "date" ? "temporal" : kind === "category" ? "categorical" : "quantitative",
	kind,
})

const configs = (over: Partial<FormatConfigs> = {}): FormatConfigs => ({
	encodings: emptyEncodings(),
	dataLabelsEncodings: emptyDataLabelsEncodings(),
	channelConfigs: {},
	...over,
})

describe("formatSurfacesFor", () => {
	it("adds one labels:value:<i> surface per multi-field label field", () => {
		const dle = emptyDataLabelsEncodings()
		dle.value = { field: null, multiField: true, fields: ["a", "b"] }
		const keys = formatSurfacesFor(emptyEncodings(), dle).map((s) => s.key)
		expect(keys).toContain("labels:value:0")
		expect(keys).toContain("labels:value:1")
		expect(keys).not.toContain("labels:value:2")
		expect(keys).toEqual(
			expect.arrayContaining([
				"axis:x",
				"axis:y",
				"axis:r",
				"axis:angle",
				"axis:chord",
				"legend:hue",
				"legend:area",
				"labels:value",
			]),
		)
	})
})

describe("collectFormatMemory", () => {
	it("records non-Auto formats per kind and skips Auto (incl. Before/After text around an empty spec)", () => {
		const enc = emptyEncodings()
		enc.x = { field: "When" }
		enc.y = { field: "Sales" }
		enc.hue = { field: "Share" }
		const c = configs({
			encodings: enc,
			channelConfigs: {
				x: { ...DEFAULT_AXIS_CONFIG, customFormat: "%Y" },
				y: { ...DEFAULT_AXIS_CONFIG, customFormat: "{}%" },
			},
			legendConfig: {
				channels: { hue: { ...DEFAULT_LEGEND_CHANNEL_CONFIG, format: ".0%" } },
			},
		})
		const mem = collectFormatMemory(c, [
			src("When", "date"),
			src("Sales", "dollar"),
			src("Share", "percent"),
		])
		expect(mem).toEqual({
			"axis:x": { date: "%Y" },
			"legend:hue": { percent: ".0%" },
		})
	})

	it("uses the length field for an unmapped measure axis", () => {
		const enc = emptyEncodings()
		enc.x = { field: "Region" }
		enc.length = { field: "Sales" }
		const c = configs({
			encodings: enc,
			channelConfigs: { y: { ...DEFAULT_AXIS_CONFIG, customFormat: "$,.0f" } },
		})
		expect(
			collectFormatMemory(c, [src("Region", "category"), src("Sales", "dollar")]),
		).toEqual({ "axis:y": { dollar: "$,.0f" } })
	})

	it("records the chord axis (area field) and data-label value formats", () => {
		const enc = emptyEncodings()
		enc.area = { field: "Flow" }
		const dle = emptyDataLabelsEncodings()
		dle.value = { field: null, multiField: true, fields: ["Flow", "Pct"] }
		const c = configs({
			encodings: enc,
			dataLabelsEncodings: dle,
			channelConfigs: {
				connection: {
					chordAxis: { ...DEFAULT_CHORD_AXIS_CONFIG, customFormat: ",.0f" },
				} as FormatConfigs["channelConfigs"]["connection"],
			},
			dataLabelsConfig: { fieldFormats: { Pct: ".1%" } },
		})
		expect(
			collectFormatMemory(c, [src("Flow", "number"), src("Pct", "percent")]),
		).toEqual({
			"axis:chord": { number: ",.0f" },
			"labels:value:1": { percent: ".1%" },
		})
	})

	it("records single-field data labels under labels:value", () => {
		const dle = emptyDataLabelsEncodings()
		dle.value = { field: "Sales" }
		const c = configs({
			dataLabelsEncodings: dle,
			dataLabelsConfig: { fieldFormats: { Sales: "$.2s" } },
		})
		expect(collectFormatMemory(c, [src("Sales", "dollar")])).toEqual({
			"labels:value": { dollar: "$.2s" },
		})
	})

	it("skips fields whose kind is unknown", () => {
		const enc = emptyEncodings()
		enc.x = { field: "Ghost" }
		const c = configs({
			encodings: enc,
			channelConfigs: { x: { ...DEFAULT_AXIS_CONFIG, customFormat: ".2f" } },
		})
		expect(collectFormatMemory(c, [])).toEqual({})
	})
})

describe("applyFormatMemory", () => {
	const memory = {
		"axis:x": { date: "%b %Y" },
		"axis:y": { dollar: "$,.0f" },
		"legend:hue": { percent: ".0%" },
		"labels:value": { dollar: "$.2s" },
	}

	it("writes a hit and Auto on a miss, merging over defaults for absent slots", () => {
		const enc = emptyEncodings()
		enc.x = { field: "Num" } // number: no memory → Auto
		enc.y = { field: "Cost" } // dollar: hit
		enc.hue = { field: "Rate" } // percent: hit
		const dle = emptyDataLabelsEncodings()
		dle.value = { field: "Cost" }
		const c = configs({
			encodings: enc,
			dataLabelsEncodings: dle,
			channelConfigs: { x: { ...DEFAULT_AXIS_CONFIG, customFormat: "%Y" } },
		})
		const kinds = new Map<string, DataKind>([
			["Num", "number"],
			["Cost", "dollar"],
			["Rate", "percent"],
		])
		const out = applyFormatMemory(c, memory, kinds)
		expect(out.channelConfigs.x?.customFormat).toBe("")
		expect(out.channelConfigs.y).toEqual({
			...DEFAULT_AXIS_CONFIG,
			customFormat: "$,.0f",
		})
		expect(out.legendConfig?.channels?.hue).toEqual({
			...DEFAULT_LEGEND_CHANNEL_CONFIG,
			format: ".0%",
		})
		expect(out.dataLabelsConfig).toEqual({
			...DEFAULT_DATA_LABELS_CONFIG,
			fieldFormats: { Cost: "$.2s" },
		})
	})

	it("removes a data-label format on a miss", () => {
		const dle = emptyDataLabelsEncodings()
		dle.value = { field: "Cost" }
		const c = configs({
			dataLabelsEncodings: dle,
			dataLabelsConfig: { fieldFormats: { Cost: ".1f", Other: "x" } },
		})
		const out = applyFormatMemory(c, {}, new Map([["Cost", "number"]]))
		expect(out.dataLabelsConfig?.fieldFormats).toEqual({ Other: "x" })
	})

	it("is identity-preserving when nothing changes", () => {
		const enc = emptyEncodings()
		enc.x = { field: "When" }
		enc.y = { field: "Num" }
		const c = configs({
			encodings: enc,
			channelConfigs: { x: { ...DEFAULT_AXIS_CONFIG, customFormat: "%b %Y" } },
		})
		const out = applyFormatMemory(
			c,
			memory,
			new Map<string, DataKind>([
				["When", "date"],
				["Num", "number"],
			]),
		)
		expect(out).toBe(c)
	})
})

describe("mergeFormatMemory", () => {
	it("merges per key per kind, incoming wins", () => {
		expect(
			mergeFormatMemory(
				{ "axis:x": { date: "%Y", number: ",.0f" }, "axis:y": { dollar: "$" } },
				{ "axis:x": { date: "%b", percent: ".0%" }, "legend:hue": { number: ".1f" } },
			),
		).toEqual({
			"axis:x": { date: "%b", number: ",.0f", percent: ".0%" },
			"axis:y": { dollar: "$" },
			"legend:hue": { number: ".1f" },
		})
	})
})
