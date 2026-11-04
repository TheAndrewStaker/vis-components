import { describe, expect, it } from "vitest"

import {
	canvasSizeToggled,
	canvasStartSize,
	DEFAULT_CANVAS_HEIGHT,
	DEFAULT_CANVAS_WIDTH,
} from "./canvasSizeEdits"

describe("canvasSizeToggled", () => {
	const THEME = { exportCanvasWidth: 800, exportCanvasHeight: 450 }

	it("a size the visual never had starts at the theme's", () => {
		expect(canvasSizeToggled(undefined, true, THEME)).toEqual({
			enabled: true,
			width: 800,
			height: 450,
			unit: undefined,
		})
	})

	it("keeps a size the visual had, over the theme's", () => {
		expect(
			canvasSizeToggled({ enabled: false, width: 300, unit: "in" }, true, THEME)
		).toEqual({ enabled: true, width: 300, height: 450, unit: "in" })
	})

	it("falls back to 1000 × 600 when neither the visual nor the theme has one", () => {
		const built = { width: DEFAULT_CANVAS_WIDTH, height: DEFAULT_CANVAS_HEIGHT }
		expect(canvasSizeToggled(null, true, {})).toMatchObject(built)
		expect(canvasSizeToggled(null, true, undefined)).toMatchObject(built)
		expect(canvasSizeToggled(null, true, { exportCanvasWidth: 640 })).toMatchObject({
			width: 640,
			height: DEFAULT_CANVAS_HEIGHT,
		})
	})

	it("canvasStartSize is the theme's size, else the built-in", () => {
		expect(canvasStartSize(THEME)).toEqual({ width: 800, height: 450 })
		expect(canvasStartSize(null)).toEqual({ width: 1000, height: 600 })
	})
})
