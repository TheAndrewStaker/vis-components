import { describe, expect, it } from "vitest"

import {
	fieldLabelPointsMode,
	populationOverrides,
	populationsAtTag,
	presentPopulations,
	resolveLabelSelection,
} from "./dataLabelsSelection"

const multi = (fields: string[]) => ({ multiField: true, fields })
const single = { multiField: false, fields: [] as string[] }

describe("resolveLabelSelection — single-field", () => {
	it("reads the populations off labelPoints", () => {
		expect(resolveLabelSelection({}, single).present).toEqual({
			all: true,
			first: false,
			last: false,
		})
		expect(resolveLabelSelection({ labelPoints: "last" }, single).present).toEqual(
			{ all: false, first: false, last: true }
		)
		const both = resolveLabelSelection({ labelPoints: "first-last" }, single)
		expect(both.present).toEqual({ all: false, first: true, last: true })
		expect(both.split).toBe(true)
	})
	it("legacy onlyLastLabel reads as last, unsplit", () => {
		const sel = resolveLabelSelection({ onlyLastLabel: true }, single)
		expect(sel.present).toEqual({ all: false, first: false, last: true })
		expect(sel.split).toBe(false)
	})
})

describe("resolveLabelSelection — multi-field (composed labels)", () => {
	it("defaults every label to the layer-wide mode", () => {
		const sel = resolveLabelSelection(
			{
				labelPoints: "first-last",
				composedLabels: [
					{ id: "value", template: "{value}" },
					{ id: "series", template: "{series}" },
				],
			},
			multi(["value", "series"])
		)
		expect(sel.labels).toEqual({
			all: [],
			first: ["value", "series"],
			last: ["value", "series"],
		})
		// Composed labels never split: each carries its own settings.
		expect(sel.split).toBe(false)
		expect(fieldLabelPointsMode({ labelPoints: "first-last" }, "value")).toBe(
			"first-last"
		)
	})
	it("each label's own mode puts it in its populations", () => {
		const sel = resolveLabelSelection(
			{
				fieldLabelPoints: { series: "last" },
				composedLabels: [
					{ id: "value", template: "{value}" },
					{ id: "series", template: "{series}" },
				],
			},
			multi(["value", "series"])
		)
		expect(sel.labels).toEqual({ all: ["value"], first: [], last: ["series"] })
		expect(sel.present).toEqual({ all: true, first: false, last: true })
		expect(presentPopulations(sel)).toEqual(["all", "last"])
	})
	it("seriesless reads every label as all", () => {
		const sel = resolveLabelSelection(
			{
				fieldLabelPoints: { series: "last" },
				labelPoints: "first",
				composedLabels: [
					{ id: "value", template: "{value}" },
					{ id: "series", template: "{series}" },
				],
			},
			multi(["value", "series"]),
			{ seriesless: true }
		)
		expect(sel.labels.all).toEqual(["value", "series"])
	})
	it("a visual saved before composed labels derives its labels (per-field 'Which labels' → one label per population)", () => {
		const sel = resolveLabelSelection(
			{ fieldLabelPoints: { series: "last" } },
			multi(["value", "series"])
		)
		expect(sel.labels).toEqual({
			all: ["arranged"],
			first: [],
			last: ["arranged-last"],
		})
	})
})

describe("populationsAtTag", () => {
	const sel = resolveLabelSelection(
		{ fieldLabelPoints: { series: "last" } },
		multi(["value", "series"])
	)
	it("interior anchors carry only the all-labels population", () => {
		expect(populationsAtTag(sel, undefined)).toEqual(["all"])
		expect(populationsAtTag(sel, "first")).toEqual(["all"])
	})
	it("a last anchor carries both all and last labels", () => {
		expect(populationsAtTag(sel, "last")).toEqual(["all", "last"])
	})
	it("a single-anchor series ('both') takes the last label, and the first only when it adds a field", () => {
		expect(populationsAtTag(sel, "both")).toEqual(["all", "last"])
		const firstLast = resolveLabelSelection({ labelPoints: "first-last" }, single)
		expect(populationsAtTag(firstLast, "both")).toEqual(["last"])
		const split = resolveLabelSelection(
			{ fieldLabelPoints: { value: "first", series: "last" } },
			multi(["value", "series"])
		)
		expect(populationsAtTag(split, "both")).toEqual(["last", "first"])
		const firstOnly = resolveLabelSelection({ labelPoints: "first" }, single)
		expect(populationsAtTag(firstOnly, "both")).toEqual(["first"])
	})
})

describe("populationOverrides — single-field series ends", () => {
	it("a lone population ignores its override block", () => {
		const sel = resolveLabelSelection({ labelPoints: "last" }, single)
		const cfg = { lastLabel: { xOffset: 8, alignment: "left" as const } }
		expect(populationOverrides(cfg, sel, "last")).toEqual({})
	})
	it("first and last together consult the override blocks for the series ends only", () => {
		const sel = resolveLabelSelection({ labelPoints: "first-last" }, single)
		const cfg = { lastLabel: { xOffset: 8, alignment: "left" as const } }
		expect(populationOverrides(cfg, sel, "last")).toEqual(cfg.lastLabel)
		expect(populationOverrides(cfg, sel, "first")).toEqual({})
		expect(populationOverrides(cfg, sel, "all")).toEqual({})
	})
})
