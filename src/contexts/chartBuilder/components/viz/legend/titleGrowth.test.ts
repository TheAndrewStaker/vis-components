import { afterEach, describe, expect, it } from "vitest"
import { liftLegendBox, measureLegendTitleGrowth } from "./titleGrowth"

/** A rendered `[data-legend-title]` block with a stubbed layout height. */
const titleEl = (height: number, lineHeight: string, fontSize = "16px") => {
	const el = document.createElement("div")
	el.setAttribute("data-legend-title", "")
	el.style.lineHeight = lineHeight
	el.style.fontSize = fontSize
	el.getBoundingClientRect = () =>
		({
			x: 0,
			y: 0,
			top: 0,
			left: 0,
			right: 100,
			bottom: height,
			width: 100,
			height,
			toJSON: () => ({}),
		}) as DOMRect
	return el
}

const mount = (...titles: HTMLElement[]) => {
	const root = document.createElement("div")
	root.append(...titles)
	document.body.append(root)
	return root
}

describe("measureLegendTitleGrowth", () => {
	afterEach(() => {
		document.body.innerHTML = ""
	})

	it("is 0 when every title is one line", () => {
		const root = mount(titleEl(24, "24px"), titleEl(24, "24px"))
		expect(measureLegendTitleGrowth(root)).toBe(0)
	})

	it("sums each title's height past one line box", () => {
		const root = mount(titleEl(48, "24px"), titleEl(24, "24px"), titleEl(60, "20px"))
		expect(measureLegendTitleGrowth(root)).toBe(24 + 40)
	})

	it("falls back to 1.2 × font size when line-height is normal", () => {
		// Two 19.2px lines → 19.2 extra, rounded.
		const root = mount(titleEl(38.4, "normal", "16px"))
		expect(measureLegendTitleGrowth(root)).toBe(19)
	})

	it("ignores titles that have no layout yet (empty rects)", () => {
		const root = mount(titleEl(0, "24px"))
		expect(measureLegendTitleGrowth(root)).toBe(0)
	})
})

describe("liftLegendBox", () => {
	it("gives a right / left legend its top padding back, never below 0", () => {
		expect(liftLegendBox({ paddingTop: 60 }, "right", 24)).toEqual({
			paddingTop: 36,
		})
		expect(liftLegendBox({ paddingTop: 60 }, "left", 100)).toEqual({
			paddingTop: 0,
		})
	})

	it("leaves top, bottom and inside legends and zero growth alone", () => {
		const style = { marginTop: 8 }
		expect(liftLegendBox(style, "top", 24)).toBe(style)
		expect(liftLegendBox(style, "bottom", 24)).toBe(style)
		const inside = { top: "10px" }
		expect(liftLegendBox(inside, "inside", 24)).toBe(inside)
		const right = { paddingTop: 60 }
		expect(liftLegendBox(right, "right", 0)).toBe(right)
		expect(liftLegendBox(undefined, "right", 24)).toBeUndefined()
	})
})
