import { describe, expect, it } from "vitest"

import { SYSTEM_LIGHT_THEME, themeOf } from "./systemThemes"
import { resolveCanvasMargins } from "./themeConfig"

const THEME = themeOf(SYSTEM_LIGHT_THEME)

describe("resolveCanvasMargins", () => {
	it("is empty (all auto) when neither the theme nor the visual sets a side", () => {
		expect(resolveCanvasMargins(THEME, undefined)).toEqual({})
	})

	it("inherits the theme's Exporting defaults for sides the visual leaves blank", () => {
		const theme = { ...THEME, exportCanvasMargins: { top: 24, bottom: 0 } }
		expect(resolveCanvasMargins(theme, undefined)).toEqual({ top: 24, bottom: 0 })
		expect(resolveCanvasMargins(theme, { top: 8, left: 12 })).toEqual({
			top: 8,
			bottom: 0,
			left: 12,
		})
	})

	it("a visual's 0 beats a theme default (0 is a value, not blank)", () => {
		const theme = { ...THEME, exportCanvasMargins: { right: 30 } }
		expect(resolveCanvasMargins(theme, { right: 0 })).toEqual({ right: 0 })
	})
})
