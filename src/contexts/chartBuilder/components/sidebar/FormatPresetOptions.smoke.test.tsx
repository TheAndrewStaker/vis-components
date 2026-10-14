import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { COUNTRY_NAME_FORMAT } from "../../lib/geo/countryNames"
import { LITERAL_FORMAT } from "../../lib/formatTick"
import {
	FORMAT_PRESET_AUTO,
	FORMAT_PRESET_CUSTOM,
	formatPresetSelection,
	formatPresetValueFor,
} from "../../lib/formatPresets"
import { FormatPresetOptions } from "./FormatPresetOptions"

/** One preset list feeds every format dropdown (axis ticks, chord ring axis,
 *  data labels, legend). These pin the entries that had drifted between the
 *  per-panel copies before they were unified. */

afterEach(cleanup)

const optionValues = (countryNames?: boolean, selected?: string) => {
	const { container } = render(
		<select>
			<FormatPresetOptions countryNames={countryNames} selected={selected} />
		</select>
	)
	return Array.from(container.querySelectorAll("option")).map((o) => ({
		value: o.getAttribute("value"),
		text: o.textContent ?? "",
	}))
}

describe("FormatPresetOptions", () => {
	it("offers Whole numbers, Literal, and the full numeric + temporal set", () => {
		const opts = optionValues()
		const values = opts.map((o) => o.value)
		expect(values).toContain(",.0f")
		expect(opts.find((o) => o.value === ",.0f")?.text).toMatch(/Whole numbers/)
		expect(values).toContain(LITERAL_FORMAT)
		expect(values).toContain(`${LITERAL_FORMAT}%`)
		expect(values).toContain(FORMAT_PRESET_AUTO)
		for (const v of [",", ".2f", ".0%", ".1%"]) {
			expect(values).toContain(v)
		}
		for (const v of ["$,.0f", "$,.2f", "$,.1~fK", "$,.1~fM", "$,.1~fB"]) {
			expect(values).toContain(v)
		}
		for (const v of [".2e", ".3s", ",.1~fM", ",.1~fB"]) {
			expect(values).toContain(v)
		}
		for (const v of ["%Y-%m-%d", "%b %Y", "%Y", "%b %d", "%H:%M"]) {
			expect(values).toContain(v)
		}
	})

	it("groups the dollar presets under Currency, between Numeric and Temporal", () => {
		const { container } = render(
			<select>
				<FormatPresetOptions />
			</select>
		)
		const groups = Array.from(container.querySelectorAll("optgroup")).map((g) =>
			g.getAttribute("label")
		)
		expect(groups).toEqual(["Numeric", "Currency", "Scientific", "Temporal"])
		const currency = container.querySelector('optgroup[label="Currency"]')!
		const texts = Array.from(currency.querySelectorAll("option")).map(
			(o) => o.textContent
		)
		expect(texts).toEqual([
			"Whole dollars ($1,234)",
			"Dollars and cents ($1,234.56)",
			"Thousands ($12.5K)",
			"Millions ($1.2M)",
			"Billions ($1.2B)",
		])
		const scientific = container.querySelector('optgroup[label="Scientific"]')!
		expect(
			Array.from(scientific.querySelectorAll("option")).map((o) => o.textContent)
		).toEqual([
			"Scientific notation (1.23e+4)",
			"SI prefix (1.23k)",
			"Millions (1.2M)",
			"Billions (1.2B)",
		])
	})

	it("adds the Geography group only when countryNames is set", () => {
		expect(optionValues().map((o) => o.value)).not.toContain(COUNTRY_NAME_FORMAT)
		expect(optionValues(true).map((o) => o.value)).toContain(COUNTRY_NAME_FORMAT)
	})

	it("carries the display-only Custom entry only when it is the selection", () => {
		expect(optionValues().map((o) => o.value)).not.toContain(FORMAT_PRESET_CUSTOM)
		expect(
			optionValues(false, FORMAT_PRESET_CUSTOM).map((o) => o.value)
		).toContain(FORMAT_PRESET_CUSTOM)
	})
})

describe("formatPresetSelection", () => {
	it("maps Auto to the empty spec, Custom to a no-op, and presets verbatim", () => {
		expect(formatPresetSelection(FORMAT_PRESET_AUTO)).toBe("")
		expect(formatPresetSelection("")).toBeNull()
		expect(formatPresetSelection(FORMAT_PRESET_CUSTOM)).toBeNull()
		expect(formatPresetSelection(",.0f")).toBe(",.0f")
		expect(formatPresetSelection(LITERAL_FORMAT)).toBe(LITERAL_FORMAT)
	})
})

describe("formatPresetValueFor", () => {
	it("shows the preset the stored spec came from", () => {
		expect(formatPresetValueFor("")).toBe(FORMAT_PRESET_AUTO)
		expect(formatPresetValueFor(",.0f")).toBe(",.0f")
		expect(formatPresetValueFor(`${LITERAL_FORMAT}%`)).toBe(`${LITERAL_FORMAT}%`)
		expect(formatPresetValueFor("%b %Y")).toBe("%b %Y")
		expect(formatPresetValueFor("$,.1~fM")).toBe("$,.1~fM")
	})

	it("keeps showing the preset when the box adds text around the value", () => {
		expect(formatPresetValueFor(",.0f kg")).toBe(",.0f")
		expect(formatPresetValueFor(`€${LITERAL_FORMAT}`)).toBe(LITERAL_FORMAT)
		expect(formatPresetValueFor(`${LITERAL_FORMAT} units`)).toBe(LITERAL_FORMAT)
		// Auto labels with text wrapped around them stay on Auto.
		expect(formatPresetValueFor("{}%")).toBe(FORMAT_PRESET_AUTO)
	})

	it("reads hand-written specs — and presets this chart doesn't offer — as Custom", () => {
		expect(formatPresetValueFor(".4f")).toBe(FORMAT_PRESET_CUSTOM)
		expect(formatPresetValueFor(COUNTRY_NAME_FORMAT)).toBe(FORMAT_PRESET_CUSTOM)
		expect(formatPresetValueFor(COUNTRY_NAME_FORMAT, true)).toBe(
			COUNTRY_NAME_FORMAT
		)
	})
})
