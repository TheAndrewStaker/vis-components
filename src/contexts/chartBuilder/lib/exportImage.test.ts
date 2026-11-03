import { describe, expect, it } from "vitest"
import {
	DEFAULT_PIXEL_RATIO,
	MAX_EXPORT_DIM,
	MIN_EXPORT_DIM,
	clampPixelRatio,
	resolveExportSize,
} from "./exportImage"

describe("resolveExportSize", () => {
	it("defaults to the dialog's 650×400 at its default resolution", () => {
		expect(resolveExportSize({})).toEqual({
			width: 650,
			height: 400,
			pixelRatio: DEFAULT_PIXEL_RATIO,
		})
	})

	it("takes a fixed canvas size, clamped to the dialog's bounds", () => {
		const canvasSize = { enabled: true, width: 543.4, height: 552.6 }
		expect(resolveExportSize({ canvasSize })).toMatchObject({
			width: 543,
			height: 553,
		})
		expect(
			resolveExportSize({
				canvasSize: { enabled: true, width: 10, height: 9000 },
			})
		).toMatchObject({ width: MIN_EXPORT_DIM, height: MAX_EXPORT_DIM })
	})

	it("ignores a canvas size that isn't enabled", () => {
		const canvasSize = { enabled: false, width: 900, height: 900 }
		expect(resolveExportSize({ canvasSize })).toMatchObject({
			width: 650,
			height: 400,
		})
	})

	it("lets explicit width / height / ratio win over the canvas size", () => {
		const canvasSize = { enabled: true, width: 900, height: 900 }
		expect(
			resolveExportSize({ canvasSize, width: 300, height: 200, ratio: 2 })
		).toEqual({ width: 300, height: 200, pixelRatio: 2 })
	})

	it("clamps explicit sizes and the ratio as the dialog does", () => {
		expect(resolveExportSize({ width: 1, height: 99_999 })).toMatchObject({
			width: MIN_EXPORT_DIM,
			height: MAX_EXPORT_DIM,
		})
		const big = resolveExportSize({ width: 4000, height: 4000, ratio: 4 })
		expect(big.pixelRatio).toBe(clampPixelRatio(4000, 4000, 4))
		expect(big.pixelRatio).toBeLessThan(4)
		expect(resolveExportSize({ ratio: 0.5 }).pixelRatio).toBe(1)
	})
})

describe("clampPixelRatio", () => {
	it("keeps a ratio the canvas limits allow", () => {
		expect(clampPixelRatio(650, 400, 4)).toBe(4)
	})

	it("snaps down to a PowerPoint-exact DPI past the limits", () => {
		// 4096 px edge: fit = 2 → 192 dpi, under every listed DPI → floor.
		expect(clampPixelRatio(4096, 100, 4) * 96).toBe(192)
		// 2600 px edge: fit ≈ 3.15 → 302 dpi → snaps to 300.
		expect(clampPixelRatio(2600, 100, 4) * 96).toBe(300)
	})
})
