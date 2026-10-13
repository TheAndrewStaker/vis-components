import { describe, expect, it } from "vitest"

import {
	composedLabelOnPanel,
	dataLabelsOnPanel,
	onFacetPanel,
} from "./facetScope"

describe("onFacetPanel", () => {
	it("null / undefined keys apply to every panel", () => {
		expect(onFacetPanel(null, "A")).toBe(true)
		expect(onFacetPanel(undefined, "a|x")).toBe(true)
	})

	it("an array applies only to the listed panel keys", () => {
		expect(onFacetPanel(["A", "C"], "A")).toBe(true)
		expect(onFacetPanel(["A", "C"], "B")).toBe(false)
		expect(onFacetPanel([], "A")).toBe(false)
	})

	it("always applies on the unfaceted single panel and outside any panel", () => {
		// A selection stored while faceted must not blank an unfaceted chart.
		expect(onFacetPanel(["A"], "__all__")).toBe(true)
		expect(onFacetPanel(["A"], null)).toBe(true)
		expect(onFacetPanel([], null)).toBe(true)
	})
})

describe("dataLabelsOnPanel", () => {
	it("reads the Data Labels config's facetKeys", () => {
		expect(dataLabelsOnPanel({}, "A")).toBe(true)
		expect(dataLabelsOnPanel({ facetKeys: null }, "A")).toBe(true)
		expect(dataLabelsOnPanel({ facetKeys: ["B"] }, "A")).toBe(false)
		expect(dataLabelsOnPanel({ facetKeys: ["B"] }, "B")).toBe(true)
	})
})

describe("composedLabelOnPanel", () => {
	it("uses the label's own entry when it has one", () => {
		const cfg = { facetKeys: ["A"], fieldFacetKeys: { g: ["B"] } }
		expect(composedLabelOnPanel(cfg, "g", "B")).toBe(true)
		expect(composedLabelOnPanel(cfg, "g", "A")).toBe(false)
	})

	it("falls back to the layer-wide keys without one", () => {
		const cfg = { facetKeys: ["A"], fieldFacetKeys: { g: ["B"] } }
		expect(composedLabelOnPanel(cfg, "y", "A")).toBe(true)
		expect(composedLabelOnPanel(cfg, "y", "B")).toBe(false)
		// The single-field label always reads the layer-wide keys.
		expect(composedLabelOnPanel(cfg, null, "A")).toBe(true)
		expect(composedLabelOnPanel(cfg, null, "B")).toBe(false)
	})

	it("an explicit null entry means every panel, overriding the layer's", () => {
		const cfg = { facetKeys: ["A"], fieldFacetKeys: { g: null } }
		expect(composedLabelOnPanel(cfg, "g", "B")).toBe(true)
		expect(composedLabelOnPanel(cfg, "g", "A")).toBe(true)
	})
})
