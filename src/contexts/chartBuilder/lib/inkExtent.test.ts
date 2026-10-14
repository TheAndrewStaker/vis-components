import { afterEach, describe, expect, it } from "vitest"

import {
	inkSlack,
	MARGIN_TOLERANCE_PX,
	measureInkExtent,
	nextMarginCorrection,
	ZERO_SIDES,
} from "./inkExtent"

/** happy-dom has no layout engine: rects and layout sizes are stubbed. */
const stubRect = (
	el: Element,
	rect: { left: number; top: number; width: number; height: number },
) => {
	Object.defineProperty(el, "getBoundingClientRect", {
		value: () => ({
			...rect,
			right: rect.left + rect.width,
			bottom: rect.top + rect.height,
			x: rect.left,
			y: rect.top,
			toJSON: () => ({}),
		}),
		configurable: true,
	})
}
const stubLayoutSize = (el: HTMLElement, width: number, height: number) => {
	Object.defineProperty(el, "offsetWidth", { value: width, configurable: true })
	Object.defineProperty(el, "offsetHeight", { value: height, configurable: true })
}

/** Mount markup, size the box, and stub a rect per `[data-r="l,t,w,h"]`. */
const mountBox = (inner: string, box = { w: 400, h: 300, scale: 1 }) => {
	document.body.innerHTML = `<div id="box">${inner}</div>`
	const el = document.getElementById("box") as HTMLElement
	stubLayoutSize(el, box.w, box.h)
	stubRect(el, { left: 0, top: 0, width: box.w * box.scale, height: box.h * box.scale })
	for (const node of el.querySelectorAll("[data-r]")) {
		const [l, t, w, h] = (node.getAttribute("data-r") ?? "")
			.split(",")
			.map(Number)
		stubRect(node, {
			left: l * box.scale,
			top: t * box.scale,
			width: w * box.scale,
			height: h * box.scale,
		})
	}
	return el
}

afterEach(() => {
	document.body.innerHTML = ""
})

describe("measureInkExtent", () => {
	it("unions painted SVG leaves and skips transparent hit targets + defs", () => {
		const box = mountBox(`
			<svg width="400" height="300">
				<defs><rect data-r="0,0,400,300" /></defs>
				<text data-r="100,10,120,20" fill="#333">Title</text>
				<rect data-r="80,60,200,150" fill="steelblue" />
				<path data-r="0,0,400,300" class="vc-line-hit" fill="none" stroke="transparent" stroke-width="12" />
				<rect data-r="0,0,400,300" fill="none" />
			</svg>`)
		expect(measureInkExtent(box)).toEqual({
			left: 80,
			top: 10,
			right: 280,
			bottom: 210,
		})
	})

	it("ignores whitespace-only text (a blank title slot has a line box but no glyphs)", () => {
		const box = mountBox(`
			<svg width="400" height="300">
				<text data-r="-200,0,0,24" fill="#333"> </text>
				<rect data-r="80,60,200,150" fill="steelblue" />
			</svg>`)
		expect(measureInkExtent(box)).toEqual({
			left: 80,
			top: 60,
			right: 280,
			bottom: 210,
		})
	})

	it("grows a stroked shape by half its stroke width", () => {
		const box = mountBox(`
			<svg width="400" height="300">
				<line data-r="50,100,300,0" stroke="black" stroke-width="4" />
			</svg>`)
		expect(measureInkExtent(box)).toEqual({
			left: 48,
			top: 98,
			right: 352,
			bottom: 102,
		})
	})

	it("an unstroked line paints nothing (its default fill is irrelevant)", () => {
		const box = mountBox(`
			<svg width="400" height="300">
				<line data-r="50,100,300,0" />
				<circle data-r="200,150,10,10" />
			</svg>`)
		// Only the (default-black-filled) circle counts.
		expect(measureInkExtent(box)).toEqual({
			left: 200,
			top: 150,
			right: 210,
			bottom: 160,
		})
	})

	it("intersects a clipped group with its clip rect", () => {
		const box = mountBox(`
			<svg width="400" height="300" data-r="0,0,400,300">
				<clipPath id="c"><rect x="100" y="50" width="200" height="100" /></clipPath>
				<g clip-path="url(#c)">
					<path data-r="-500,-500,2000,2000" fill="orange" />
				</g>
			</svg>`)
		expect(measureInkExtent(box)).toEqual({
			left: 100,
			top: 50,
			right: 300,
			bottom: 150,
		})
	})

	it("clamps to the box and converts a CSS-transformed rect back to layout px", () => {
		// The editor shrinks a fixed canvas on phones with transform: scale(.5).
		const box = mountBox(
			`<svg width="400" height="300">
				<rect data-r="-20,40,100,400" fill="red" />
			</svg>`,
			{ w: 400, h: 300, scale: 0.5 },
		)
		expect(measureInkExtent(box)).toEqual({
			left: 0,
			top: 40,
			right: 80,
			bottom: 300,
		})
	})

	it("counts legend boxes and text, never the chart wrappers' background", () => {
		document.body.innerHTML = `<div id="box">
			<div id="wrap" style="background-color: rgb(255, 255, 0)">
				<div data-legend-root>
					<div id="legend-inner" style="border: 1px solid rgb(0, 0, 0)">
						<span id="label">Series A</span>
					</div>
				</div>
			</div>
		</div>`
		const box = document.getElementById("box") as HTMLElement
		stubLayoutSize(box, 400, 300)
		stubRect(box, { left: 0, top: 0, width: 400, height: 300 })
		stubRect(document.getElementById("wrap")!, {
			left: 0,
			top: 0,
			width: 400,
			height: 300,
		})
		stubRect(document.getElementById("legend-inner")!, {
			left: 300,
			top: 20,
			width: 80,
			height: 40,
		})
		// Text nodes measure through a Range; happy-dom's returns zeros, so
		// hand it the label's rect.
		const label = document.getElementById("label")!
		document.createRange = () =>
			({
				selectNodeContents: () => {},
				getBoundingClientRect: () => ({
					left: 310,
					top: 30,
					right: 370,
					bottom: 46,
					width: 60,
					height: 16,
				}),
			}) as unknown as Range
		expect(label.textContent).toBe("Series A")
		expect(measureInkExtent(box)).toEqual({
			left: 300,
			top: 20,
			right: 380,
			bottom: 60,
		})
	})

	it("returns null for an unsized box or a box with nothing painted", () => {
		const empty = mountBox(`<svg width="400" height="300"></svg>`)
		expect(measureInkExtent(empty)).toBeNull()
		const unsized = mountBox(`<svg><rect data-r="0,0,10,10" fill="red" /></svg>`, {
			w: 0,
			h: 0,
			scale: 1,
		})
		expect(measureInkExtent(unsized)).toBeNull()
	})
})

describe("inkSlack", () => {
	it("is the gap between each box edge and the ink", () => {
		expect(
			inkSlack({ left: 10, top: 5, right: 390, bottom: 280 }, 400, 300),
		).toEqual({ top: 5, right: 10, bottom: 20, left: 10 })
	})
})

describe("nextMarginCorrection", () => {
	const slack = { top: 11, right: 24, bottom: 7, left: 30 }

	it("takes the measured slack on set sides and 0 on auto sides", () => {
		expect(nextMarginCorrection({ top: 0, bottom: 20 }, slack, ZERO_SIDES)).toEqual({
			top: 11,
			right: 0,
			bottom: 7,
			left: 0,
		})
	})

	it("is settled (null) once every set side is within tolerance", () => {
		const current = { top: 11.2, right: 0, bottom: 7, left: 0 }
		expect(nextMarginCorrection({ top: 0, bottom: 20 }, slack, current)).toBeNull()
		const drifted = { ...current, bottom: 7 + MARGIN_TOLERANCE_PX + 0.1 }
		expect(nextMarginCorrection({ top: 0, bottom: 20 }, slack, drifted)).toEqual({
			top: 11,
			right: 0,
			bottom: 7,
			left: 0,
		})
	})

	it("with no side set, only clears a leftover correction", () => {
		expect(nextMarginCorrection({}, slack, ZERO_SIDES)).toBeNull()
		expect(nextMarginCorrection({}, slack, { ...ZERO_SIDES, left: 4 })).toEqual(
			ZERO_SIDES,
		)
	})
})
