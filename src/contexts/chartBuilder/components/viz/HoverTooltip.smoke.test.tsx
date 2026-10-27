import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
	TestProvider,
	type TestStore,
} from "../../../../testSupport/TestProvider"
import { installInMemoryLocalStorage } from "../../../../testSupport/localStorageShim"
import {
	DEFAULT_AXIS_CONFIG,
	EMPTY_CHANNEL_CONFIGS,
} from "../../lib/channelConfig"
import { emptyEncodings } from "../../lib/types"
import { LIGHT_THEME_BASE } from "../../lib/systemThemes"
import type { Theme } from "../../lib/types"
import {
	currentChannelConfigsAtom,
	currentEncodingsAtom,
	currentTooltipConfigAtom,
	themeAtom,
} from "../../store/atoms"

import { HoverTooltip } from "./HoverTooltip"

/** The tooltip has no Format controls of its own — each variable prints
 *  with the format the user assigned to it elsewhere (axis first). */

const initState =
	(tooltip?: Record<string, unknown>, theme?: Partial<Theme>) =>
	(snap: TestStore) => {
		// `currentThemeIdAtom` defaults null, so `useCurrentTheme` falls back
		// to the legacy `themeAtom` — override it to test theme defaults.
		if (theme) snap.set(themeAtom, { ...LIGHT_THEME_BASE, ...theme })
		snap.set(currentEncodingsAtom, {
			...emptyEncodings(),
			x: { field: "Region" },
			y: { field: "Sales" },
		})
		snap.set(currentChannelConfigsAtom, {
			...EMPTY_CHANNEL_CONFIGS,
			y: { ...DEFAULT_AXIS_CONFIG, customFormat: "$,.0f" },
		})
		snap.set(currentTooltipConfigAtom, {
			enabled: true,
			visibleFields: [],
			customCss: "",
			customHtml: "",
			useCustomHtml: false,
			...tooltip,
		})
	}

const LONG =
	"A very long category name that used to be cut off with an ellipsis because the row refused to wrap"

const mount = (tooltip?: Record<string, unknown>, theme?: Partial<Theme>) => {
	installInMemoryLocalStorage()
	render(
		<TestProvider initializeState={initState(tooltip, theme)}>
			<HoverTooltip
				state={{
					clientX: 100,
					clientY: 100,
					fields: [
						{ name: "Region", value: "West" },
						{ name: "Sales", value: 1234.5 },
						{ name: "Note", value: LONG },
					],
				}}
			/>
		</TestProvider>
	)
	return document.body.querySelector(".vc-tooltip") as HTMLElement
}

afterEach(cleanup)

describe("HoverTooltip value formats", () => {
	it("prints a value with the format its variable carries on the axis", () => {
		const tip = mount()
		expect(tip.textContent).toContain("$1,235")
		expect(tip.textContent).not.toContain("1234.5")
	})

	it("leaves a variable with no format anywhere alone", () => {
		expect(mount().textContent).toContain("West")
	})

	it("formats the values a custom HTML template interpolates", () => {
		const tip = mount({
			useCustomHtml: true,
			customHtml: "<b>{{Region}}</b> {{Sales}}",
		})
		expect(tip.textContent).toContain("West $1,235")
	})
})

describe("HoverTooltip box", () => {
	it("wraps a long value instead of truncating it to an ellipsis", () => {
		const tip = mount()
		expect(tip.textContent).toContain(LONG)
		expect(tip.querySelector(".truncate")).toBeNull()
		expect(tip.querySelector(".whitespace-nowrap")).toBeNull()
		// The max width is what the value wraps against.
		expect(tip.style.getPropertyValue("--vc-tooltip-max-width")).toBe("240px")
	})

	it("hands the visual's box settings to the stylesheet as custom properties", () => {
		const tip = mount({
			tooltipMaxWidth: 320,
			tooltipCornerRadius: 0,
			tooltipOutlineColor: "#ff0000",
			tooltipBackgroundColor: "#111111",
			tooltipBackgroundOpacity: 0.5,
			tooltipShadowSize: 20,
			tooltipShadowColor: "#0000ff",
			tooltipShadowOpacity: 0.4,
		})
		const v = (name: string) => tip.style.getPropertyValue(name)
		expect(v("--vc-tooltip-max-width")).toBe("320px")
		expect(v("--vc-tooltip-radius")).toBe("0px")
		expect(v("--vc-tooltip-outline")).toBe("#ff0000")
		expect(v("--vc-tooltip-fill")).toBe("#111111")
		expect(v("--vc-tooltip-opacity")).toBe("0.5")
		expect(v("--vc-tooltip-shadow")).toBe("20px")
		expect(v("--vc-tooltip-shadow-color")).toBe("#0000ff")
		expect(v("--vc-tooltip-shadow-opacity")).toBe("0.4")
		// A dark fill flips the text to white so it stays readable.
		expect(tip.style.color.replaceAll(" ", "")).toMatch(/#ffffff|rgb\(255,255,255\)/i)
	})

	it("leaves Auto colors to the stylesheet's light / dark fallbacks", () => {
		const tip = mount()
		expect(tip.style.getPropertyValue("--vc-tooltip-outline")).toBe("")
		expect(tip.style.getPropertyValue("--vc-tooltip-fill")).toBe("")
		expect(tip.style.color).toBe("")
		expect(tip.style.getPropertyValue("--vc-tooltip-shadow")).toBe("12px")
	})

	it("an untouched visual takes the theme's tooltip box", () => {
		const tip = mount(undefined, {
			tooltipMaxWidth: 400,
			tooltipCornerRadius: 2,
			tooltipBackgroundColor: "#222222",
			tooltipShadowSize: 0,
		})
		const v = (name: string) => tip.style.getPropertyValue(name)
		expect(v("--vc-tooltip-max-width")).toBe("400px")
		expect(v("--vc-tooltip-radius")).toBe("2px")
		expect(v("--vc-tooltip-fill")).toBe("#222222")
		expect(v("--vc-tooltip-shadow")).toBe("0px")
	})

	it("a visual's own entry wins over the theme, and its explicit Auto beats a theme color", () => {
		const tip = mount(
			{ tooltipMaxWidth: 300, tooltipBackgroundColor: null },
			{ tooltipMaxWidth: 400, tooltipBackgroundColor: "#222222" }
		)
		expect(tip.style.getPropertyValue("--vc-tooltip-max-width")).toBe("300px")
		expect(tip.style.getPropertyValue("--vc-tooltip-fill")).toBe("")
	})
})
