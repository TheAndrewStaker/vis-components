import { afterEach, describe, expect, it, vi } from "vitest"

import {
	MAX_THUMBNAIL_DIM,
	rasterTargetSize,
	thumbnailFromChartSvgText,
} from "./captureThumbnail"

/** The capture's size cap: 480px by default (library thumbnails), lifted by
 *  `maxDim` for the published-embed picture, never upscaling. happy-dom has
 *  no image decoder or 2D canvas, so the rasterize test stubs `Image` with
 *  fixed natural dimensions and records the canvas size the capture picks. */

describe("rasterTargetSize", () => {
	it("caps the longest edge at 480 by default", () => {
		expect(MAX_THUMBNAIL_DIM).toBe(480)
		expect(rasterTargetSize(960, 600)).toEqual({ w: 480, h: 300 })
	})

	it("a larger maxDim leaves a smaller source unscaled", () => {
		expect(rasterTargetSize(960, 600, 4096)).toEqual({ w: 960, h: 600 })
	})

	it("a larger maxDim still scales a bigger source down to fit", () => {
		expect(rasterTargetSize(8192, 4096, 4096)).toEqual({ w: 4096, h: 2048 })
	})
})

describe("thumbnailFromChartSvgText size option", () => {
	afterEach(() => {
		vi.unstubAllGlobals()
		vi.restoreAllMocks()
	})

	const stubRaster = (naturalWidth: number, naturalHeight: number) => {
		class FakeImage {
			naturalWidth = naturalWidth
			naturalHeight = naturalHeight
			onload: (() => void) | null = null
			onerror: (() => void) | null = null
			set src(_v: string) {
				void Promise.resolve().then(() => this.onload?.())
			}
		}
		vi.stubGlobal("Image", FakeImage)
		const sizes: Array<{ w: number; h: number }> = []
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
			drawImage: () => {},
		} as never)
		vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(
			function (this: HTMLCanvasElement) {
				sizes.push({ w: this.width, h: this.height })
				return "data:image/png;base64,AAAA"
			}
		)
		return sizes
	}

	const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="600"></svg>`

	it("defaults to the 480 cap", async () => {
		const sizes = stubRaster(960, 600)
		await expect(thumbnailFromChartSvgText(SVG)).resolves.toBe(
			"data:image/png;base64,AAAA"
		)
		expect(sizes).toEqual([{ w: 480, h: 300 }])
	})

	it("maxDim lifts the cap without upscaling", async () => {
		const sizes = stubRaster(960, 600)
		await thumbnailFromChartSvgText(SVG, { maxDim: 4096 })
		expect(sizes).toEqual([{ w: 960, h: 600 }])
	})
})
