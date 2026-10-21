import { describe, expect, it } from "vitest"

import {
	autoChartDescription,
	chartAccessibleTitle,
	migrateAccessibilityConfig,
	resolveChartDescription,
} from "./accessibilityConfig"

describe("migrateAccessibilityConfig", () => {
	it("reads absent / malformed input as the automatic default", () => {
		for (const raw of [undefined, null, 3, "x", [], {}, { description: 4 }])
			expect(migrateAccessibilityConfig(raw)).toEqual({ description: null })
	})

	it("keeps an override verbatim, including an empty one, and is idempotent", () => {
		const a = migrateAccessibilityConfig({ description: "  Sales rose.  " })
		expect(a).toEqual({ description: "  Sales rose.  " })
		expect(migrateAccessibilityConfig(a)).toEqual(a)
		expect(migrateAccessibilityConfig({ description: "" })).toEqual({
			description: "",
		})
	})
})

describe("autoChartDescription", () => {
	it("joins title and subtitle as sentences with one space", () => {
		expect(
			autoChartDescription({ title: "Sales by region", subtitle: "2024, in USD" })
		).toBe("Sales by region. 2024, in USD.")
	})

	it("doesn't double-terminate a sentence", () => {
		expect(
			autoChartDescription({ title: "Did sales rise?", subtitle: "Yes!" })
		).toBe("Did sales rise? Yes!")
		expect(autoChartDescription({ title: "Done.", subtitle: "" })).toBe("Done.")
	})

	it("skips empty parts and collapses whitespace", () => {
		expect(autoChartDescription({ title: "  ", subtitle: "Only\n  this" })).toBe(
			"Only this."
		)
		expect(autoChartDescription({ title: "", subtitle: "" })).toBe("")
	})
})

describe("resolveChartDescription", () => {
	const texts = { title: "Sales", subtitle: "By region", visualName: "My chart" }

	it("follows the title and subtitle while no override is stored", () => {
		expect(resolveChartDescription({ description: null }, texts)).toBe(
			"Sales. By region."
		)
		expect(resolveChartDescription(undefined, texts)).toBe("Sales. By region.")
	})

	it("uses the override, trimmed", () => {
		expect(
			resolveChartDescription({ description: "  East leads.  " }, texts)
		).toBe("East leads.")
	})

	it("falls back to the visual name when the result is empty", () => {
		expect(resolveChartDescription({ description: "" }, texts)).toBe("My chart")
		expect(resolveChartDescription({ description: "   " }, texts)).toBe("My chart")
		expect(
			resolveChartDescription(
				{ description: null },
				{ title: "", subtitle: "", visualName: " Untitled " }
			)
		).toBe("Untitled")
		expect(
			resolveChartDescription({ description: null }, { title: "", subtitle: "" })
		).toBe("")
	})
})

describe("chartAccessibleTitle", () => {
	it("is the title, else the visual name", () => {
		expect(chartAccessibleTitle({ title: "Sales", visualName: "V" })).toBe("Sales")
		expect(chartAccessibleTitle({ title: " ", visualName: "V" })).toBe("V")
	})
})
