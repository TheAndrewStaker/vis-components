import { describe, expect, it } from "vitest"

import {
	DEFAULT_TOOLTIP_CSS,
	buildDefaultTooltipCss,
	buildDefaultTooltipHtml,
} from "./tooltipDefaults"

describe("buildDefaultTooltipHtml", () => {
	it("returns a placeholder row when no fields are mapped (so the user sees a comment hinting next steps)", () => {
		const out = buildDefaultTooltipHtml([])
		expect(out).toContain("vc-tooltip-row")
		expect(out).toContain("<!--")
	})

	it("emits one row per field with {{fieldName}} placeholders", () => {
		const out = buildDefaultTooltipHtml(["state", "sales"])
		// Each row labels the field then interpolates its value.
		expect(out).toMatch(
			/<span class="vc-tooltip-name">state:<\/span>\s*<span class="vc-tooltip-value">\{\{state\}\}<\/span>/
		)
		expect(out).toMatch(
			/<span class="vc-tooltip-name">sales:<\/span>\s*<span class="vc-tooltip-value">\{\{sales\}\}<\/span>/
		)
	})

	it("produces valid placeholders that match the {{fieldName}} render syntax", () => {
		// renderTemplate (in HoverTooltip) only substitutes `{{name}}` tokens;
		// the template we hand the user must use that exact form, not e.g.
		// `${name}` or single-brace `{name}`. The regex below pins the
		// exact double-brace shape — `{{price}}` matches; `{price}` and
		// `${price}` do not.
		const out = buildDefaultTooltipHtml(["price"])
		expect(out).toContain("{{price}}")
		expect(out).toMatch(/\{\{price\}\}/)
		// Single-brace tokens (without the doubling) would mean the
		// renderer leaves them untouched at runtime — guard against that.
		expect(out).not.toMatch(/(?<!\{)\{price\}(?!\})/)
		expect(out).not.toContain("${price}")
	})
})

describe("DEFAULT_TOOLTIP_CSS", () => {
	it("contains the rules a user would expect to see when restyling the tooltip", () => {
		// Spot-check that the default actually carries content; an empty
		// constant would defeat the purpose of pre-populating.
		expect(DEFAULT_TOOLTIP_CSS).toContain("border")
		expect(DEFAULT_TOOLTIP_CSS).toContain("background")
		expect(DEFAULT_TOOLTIP_CSS).toContain("padding")
	})
})

describe("buildDefaultTooltipCss", () => {
	it("spells out the resolved box as it stands", () => {
		const css = buildDefaultTooltipCss({
			maxWidth: 320,
			cornerRadius: 0,
			outlineColor: "#ff0000",
			backgroundColor: "#111111",
			backgroundOpacity: 0.5,
			shadowSize: 8,
			shadowColor: "#0000ff",
			shadowOpacity: 0.25,
		})
		expect(css).toContain("max-width: 320px;")
		expect(css).toContain("border-radius: 0px;")
		expect(css).toContain("border: 1px solid #ff0000;")
		expect(css).toContain("background: rgb(17 17 17 / 0.5);")
		expect(css).toContain("box-shadow: 0 4px 8px 0 rgb(0 0 255 / 0.25);")
	})

	it("writes Auto colors as their light-UI values and no shadow as none", () => {
		const css = buildDefaultTooltipCss({
			maxWidth: 240,
			cornerRadius: 6,
			outlineColor: null,
			backgroundColor: null,
			backgroundOpacity: 1,
			shadowSize: 0,
			shadowColor: "#000000",
			shadowOpacity: 0.15,
		})
		expect(css).toContain("border: 1px solid #e7e5e4;")
		expect(css).toContain("background: #ffffff;")
		expect(css).toContain("box-shadow: none;")
	})

	it("seeds the built-in theme's box as the default", () => {
		expect(DEFAULT_TOOLTIP_CSS).toContain("max-width: 240px;")
		expect(DEFAULT_TOOLTIP_CSS).toContain("border-radius: 6px;")
		expect(DEFAULT_TOOLTIP_CSS).toContain(
			"box-shadow: 0 6px 12px 0 rgb(0 0 0 / 0.15);"
		)
	})
})
