import { describe, expect, it } from "vitest"
import {
	LEGACY_ARRANGED_ID,
	composedLabelTitle,
	defaultComposedLabels,
	effectiveComposedLabels,
	labelFacetKeysFor,
	labelKeysFor,
	labelScopeFor,
	normalizeComposedLabels,
	pieceKey,
	templateFields,
} from "./dataLabelsSelection"

/** Composed labels: the text boxes under Value → Compose labels ARE the
 *  labels, keyed by id in every per-label map; a visual saved before them
 *  derives its list from the legacy state. */

const fields = ["A", "B", "C"]

describe("composed labels — templates and titles", () => {
	it("reads the checked fields a template names, in order, once", () => {
		expect(templateFields("{B} ({A}) {A} {Z}", fields)).toEqual(["B", "A"])
	})

	it("titles a label by its variables, or by number while it names none", () => {
		expect(composedLabelTitle({ id: "A", template: "{A}" }, fields, 0)).toBe("A")
		expect(composedLabelTitle({ id: "x", template: "{A} ({B})" }, fields, 0)).toBe(
			"A + B"
		)
		expect(composedLabelTitle({ id: "y", template: "" }, fields, 1)).toBe("Label 2")
	})

	it("a fresh mapping starts with one label per variable, keyed by its name", () => {
		expect(defaultComposedLabels(["A", "B"])).toEqual([
			{ id: "A", template: "{A}" },
			{ id: "B", template: "{B}" },
		])
	})
})

describe("labelKeysFor — the sections", () => {
	it("one key per composed label, in list order, titled by its variables", () => {
		const k = labelKeysFor(
			{
				composedLabels: [
					{ id: "x", template: "{A} ({B})" },
					{ id: "C", template: "{C}" },
				],
			},
			{ multiField: true, fields }
		)
		expect(k.keys).toEqual(["x", "C"])
		expect(k.titles["x"]).toBe("A + B")
		expect(k.titles["C"]).toBe("C")
		// Each label also lists the variables inside it — what a split
		// section expands into — and names those piece keys by variable.
		expect(k.pieces).toEqual({ x: ["A", "B"], C: ["C"] })
		expect(k.titles[pieceKey("x", "B")]).toBe("B")
	})

	it("single-field: nothing per label", () => {
		expect(
			labelKeysFor(
				{ composedLabels: [{ id: "A", template: "{A}" }] },
				{ multiField: false, fields: [] }
			).keys
		).toEqual([])
	})

	it("an explicit empty list is no labels at all", () => {
		expect(labelKeysFor({ composedLabels: [] }, { multiField: true, fields }).keys).toEqual(
			[]
		)
	})
})

describe("normalizeComposedLabels — visuals saved before composed labels", () => {
	it("a stored list is left alone", () => {
		const cfg = { composedLabels: [{ id: "x", template: "{A}" }] }
		expect(normalizeComposedLabels(cfg, fields)).toBe(cfg)
	})

	it("variables separate → one label per field, keyed by its name (per-field entries keep keying)", () => {
		expect(effectiveComposedLabels({ combineVariables: false }, fields)).toEqual(
			defaultComposedLabels(fields)
		)
	})

	it("variables combined → the arranged label with the shared text", () => {
		expect(
			effectiveComposedLabels({ labelTemplate: "{A}: {B}" }, ["A", "B"])
		).toEqual([{ id: LEGACY_ARRANGED_ID.all, template: "{A}: {B}" }])
		// Empty shared text → every field joined, as the box pre-filled.
		expect(effectiveComposedLabels({}, ["A", "B"])).toEqual([
			{ id: LEGACY_ARRANGED_ID.all, template: "{A}, {B}" },
		])
	})

	it("legacy per-field 'Which labels' → one label per population, with the series end's overrides", () => {
		const norm = normalizeComposedLabels(
			{
				fieldLabelPoints: { series: "last" },
				lastLabel: { xOffset: 20, alignment: "left", labelTemplate: "— {series}" },
			},
			["value", "series"]
		)
		expect(norm.composedLabels).toEqual([
			{ id: "arranged", template: "{value}" },
			{ id: "arranged-last", template: "— {series}" },
		])
		expect(norm.fieldLabelPoints).toEqual({
			series: "last",
			arranged: "all",
			"arranged-last": "last",
		})
		expect(norm.fieldAlignments).toEqual({ "arranged-last": "left" })
		expect(norm.fieldOffsets).toEqual({ "arranged-last": { xOffset: 20 } })
	})

	it("legacy first-and-last inherits the shared text on both ends", () => {
		const labels = effectiveComposedLabels(
			{
				labelPoints: "first-last",
				labelTemplate: "{sales}",
				lastLabel: { labelTemplate: "{sales} {region}" },
			},
			["sales", "region"]
		)
		expect(labels).toEqual([
			{ id: "arranged-first", template: "{sales}" },
			{ id: "arranged-last", template: "{sales} {region}" },
		])
	})
})

describe("per-label Of each and Label all facets", () => {
	it("a label's own scope wins over the layer's; no entry inherits it", () => {
		const cfg = {
			labelPointsScope: "series" as const,
			fieldLabelPointsScope: { A: "stack" as const },
		}
		expect(labelScopeFor(cfg, "A")).toBe("stack")
		expect(labelScopeFor(cfg, "B")).toBe("series")
		// The single-field label always reads the layer-wide scope.
		expect(labelScopeFor(cfg, null)).toBe("series")
		// Nothing stored anywhere → "series".
		expect(labelScopeFor({}, "A")).toBe("series")
	})

	it("a label's own facet keys win, including an explicit 'every panel'", () => {
		const cfg = {
			facetKeys: ["P1"],
			fieldFacetKeys: { A: ["P2"], B: null },
		}
		expect(labelFacetKeysFor(cfg, "A")).toEqual(["P2"])
		// Explicit null = every panel, overriding the layer's list.
		expect(labelFacetKeysFor(cfg, "B")).toBeNull()
		// No entry → the layer's list.
		expect(labelFacetKeysFor(cfg, "C")).toEqual(["P1"])
		expect(labelFacetKeysFor(cfg, null)).toEqual(["P1"])
	})
})
