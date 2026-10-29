import { describe, expect, it } from "vitest"

import { hexToHsv, hexToRgb, hsvToHex, rgbToHex, sameHex } from "./colorMath"

describe("colorMath", () => {
	it("parses 3-, 6- and 8-digit hex and ignores alpha", () => {
		expect(hexToRgb("#abc")).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc })
		expect(hexToRgb("ABCDEF")).toEqual({ r: 0xab, g: 0xcd, b: 0xef })
		expect(hexToRgb("#ABCDEF80")).toEqual({ r: 0xab, g: 0xcd, b: 0xef })
		expect(hexToRgb("#abcd")).toBeNull()
		expect(hexToRgb("red")).toBeNull()
	})

	it("emits 6-digit uppercase hex, clamped and rounded", () => {
		expect(rgbToHex(255, 0, 0)).toBe("#FF0000")
		expect(rgbToHex(0.4, 300, -2)).toBe("#00FF00")
	})

	it("round-trips the primaries and greys through HSV", () => {
		for (const hex of ["#FF0000", "#00FF00", "#0000FF", "#FFFFFF", "#000000", "#808080", "#123456"]) {
			expect(hsvToHex(hexToHsv(hex)!)).toBe(hex)
		}
	})

	it("maps the hue strip's landmarks", () => {
		expect(hexToHsv("#FF0000")).toEqual({ h: 0, s: 100, v: 100 })
		expect(hexToHsv("#00FF00")!.h).toBe(120)
		expect(hexToHsv("#0000FF")!.h).toBe(240)
		expect(hsvToHex({ h: 360, s: 100, v: 100 })).toBe("#FF0000")
		expect(hsvToHex({ h: 60, s: 100, v: 100 })).toBe("#FFFF00")
	})

	it("greys have no saturation; black has no value", () => {
		expect(hexToHsv("#FFFFFF")).toEqual({ h: 0, s: 0, v: 100 })
		expect(hexToHsv("#000000")).toEqual({ h: 0, s: 0, v: 0 })
	})

	it("sameHex compares colors, not spellings", () => {
		expect(sameHex("#abc", "#AABBCC")).toBe(true)
		expect(sameHex("#AABBCCFF", "#aabbcc")).toBe(true)
		expect(sameHex("#AABBCC", "#AABBCD")).toBe(false)
		expect(sameHex("nope", "#AABBCC")).toBe(false)
	})
})
