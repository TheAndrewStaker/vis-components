import { afterEach, describe, expect, it } from "vitest"
import { measureScrollbarWidth, resetScrollbarWidthForTests } from "./scrollbarWidth"

describe("measureScrollbarWidth", () => {
	afterEach(() => resetScrollbarWidthForTests())

	it("reports no gutter where nothing is laid out (jsdom) and leaves no probe behind", () => {
		const before = document.body.childElementCount
		expect(measureScrollbarWidth()).toBe(0)
		expect(document.body.childElementCount).toBe(before)
	})

	it("measures once and caches", () => {
		const first = measureScrollbarWidth()
		const before = document.body.childElementCount
		expect(measureScrollbarWidth()).toBe(first)
		// No second probe was appended for the cached read.
		expect(document.body.childElementCount).toBe(before)
	})
})
