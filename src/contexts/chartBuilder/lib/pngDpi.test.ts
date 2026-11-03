import { describe, expect, it } from "vitest"

import { readPngDpi, stampPngDpi } from "./pngDpi"

// A 1×1 PNG with no pHYs chunk (signature, IHDR, IDAT, IEND).
const tiny = (): Uint8Array =>
	Uint8Array.from([
		0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
		0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06,
		0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44,
		0x41, 0x54, 0x78, 0x9c, 0x63, 0x60, 0x00, 0x02, 0x00, 0x00, 0x05, 0x00, 0x01,
		0xe2, 0x26, 0x05, 0x9b, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
		0x42, 0x60, 0x82,
	])

describe("stampPngDpi / readPngDpi", () => {
	it("a fresh PNG has no physical size", () => {
		expect(readPngDpi(tiny())).toBeNull()
	})

	it("stamps 192 dpi right after IHDR and reads it back", () => {
		const out = stampPngDpi(tiny(), 192)
		expect(out.length).toBe(tiny().length + 21)
		// chunk type at the insertion point: 8 (sig) + 25 (IHDR) + 4 (length)
		expect(String.fromCharCode(...out.subarray(37, 41))).toBe("pHYs")
		expect(readPngDpi(out)).toBeCloseTo(192, 0)
		// the rest of the file is intact
		expect(out.subarray(out.length - 12)).toEqual(tiny().subarray(tiny().length - 12))
	})

	it("replaces an existing stamp instead of adding a second one", () => {
		const twice = stampPngDpi(stampPngDpi(tiny(), 96), 288)
		expect(twice.length).toBe(tiny().length + 21)
		expect(readPngDpi(twice)).toBeCloseTo(288, 0)
	})

	it("leaves a non-PNG alone", () => {
		const junk = Uint8Array.from([1, 2, 3])
		expect(stampPngDpi(junk, 96)).toBe(junk)
		expect(readPngDpi(junk)).toBeNull()
	})
})
