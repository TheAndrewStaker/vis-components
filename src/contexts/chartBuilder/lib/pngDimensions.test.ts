import { describe, expect, it } from "vitest"

import { pngDataUrlDimensions } from "./pngDimensions"

/** A PNG data URL whose header declares `width`×`height` — only the header
 *  is real; the image data after it is irrelevant to the reader. */
const pngUrl = (width: number, height: number, tail = "padding"): string => {
	const bytes = Buffer.alloc(24 + tail.length)
	Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0)
	bytes.writeUInt32BE(13, 8)
	bytes.write("IHDR", 12, "ascii")
	bytes.writeUInt32BE(width, 16)
	bytes.writeUInt32BE(height, 20)
	bytes.write(tail, 24, "ascii")
	return `data:image/png;base64,${bytes.toString("base64")}`
}

describe("pngDataUrlDimensions", () => {
	it("reads width and height from the IHDR header", () => {
		expect(pngDataUrlDimensions(pngUrl(480, 348))).toEqual({
			width: 480,
			height: 348,
		})
		expect(pngDataUrlDimensions(pngUrl(120, 189))).toEqual({
			width: 120,
			height: 189,
		})
	})

	it("handles sizes past 2^31 as unsigned", () => {
		expect(pngDataUrlDimensions(pngUrl(0x80000001, 1))).toEqual({
			width: 0x80000001,
			height: 1,
		})
	})

	it("is null for anything that isn't a readable base64 PNG", () => {
		expect(pngDataUrlDimensions("data:image/png;base64,x")).toBeNull()
		expect(pngDataUrlDimensions("data:image/jpeg;base64,/9j/4AAQ")).toBeNull()
		expect(pngDataUrlDimensions("https://example.test/t.png")).toBeNull()
		// Right prefix, wrong signature.
		const notPng = `data:image/png;base64,${Buffer.alloc(40, 1).toString("base64")}`
		expect(pngDataUrlDimensions(notPng)).toBeNull()
		// A zero dimension is not a picture.
		expect(pngDataUrlDimensions(pngUrl(0, 10))).toBeNull()
	})
})
