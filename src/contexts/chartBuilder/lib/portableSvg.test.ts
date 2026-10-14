import { describe, expect, it } from "vitest"
import { flattenTextBaselines, nameWeightedFaces } from "./portableSvg"

const SVG_NS = "http://www.w3.org/2000/svg"

const wrap = (body: string): string =>
	`<svg xmlns="${SVG_NS}" width="100" height="100">${body}</svg>`

describe("nameWeightedFaces", () => {
	it("prepends the weight-named face for weights Office can't select", () => {
		const out = nameWeightedFaces(
			wrap(
				`<text font-family="'DM Sans', sans-serif" font-weight="500">a</text>` +
					`<text font-family="Inter" font-weight="300">b</text>` +
					`<tspan font-family="DM Sans" font-weight="600">c</tspan>`
			)
		)
		expect(out).toContain(`font-family="'DM Sans Medium', 'DM Sans', sans-serif"`)
		expect(out).toContain(`font-family="'Inter Light', Inter"`)
		expect(out).toContain(`font-family="'DM Sans SemiBold', DM Sans"`)
	})

	it("leaves Regular/Bold, unstyled, and already-named text alone", () => {
		const input = wrap(
			`<text font-family="DM Sans" font-weight="400">a</text>` +
				`<text font-family="DM Sans" font-weight="700">b</text>` +
				`<text font-weight="500">c</text>` +
				`<text font-family="'DM Sans Medium', DM Sans" font-weight="500">d</text>`
		)
		expect(nameWeightedFaces(input)).toBe(input)
	})

	it("returns unparseable input unchanged", () => {
		expect(nameWeightedFaces("not svg")).toBe("not svg")
	})
})

/** happy-dom has no SVG layout — stub the three measurements the flattener
 * reads. `bboxY` reports the alphabetic-baseline bbox when the inline
 * override is present, the shifted one otherwise. */
const stubText = (
	text: SVGTextElement,
	opts: { charYs: number[]; shift: number }
) => {
	const t = text as unknown as Record<string, unknown>
	t.getNumberOfChars = () => opts.charYs.length
	t.getStartPositionOfChar = (i: number) => ({ x: 0, y: opts.charYs[i] })
	t.getBBox = () => ({
		y:
			text.style.getPropertyValue("dominant-baseline") === "alphabetic"
				? 10
				: 10 + opts.shift,
	})
	for (const tspan of text.querySelectorAll("tspan")) {
		;(tspan as unknown as Record<string, unknown>).getNumberOfChars = () =>
			tspan.textContent?.length ?? 0
	}
}

const mount = (body: string): SVGSVGElement => {
	const host = document.createElement("div")
	host.innerHTML = wrap(body)
	document.body.append(host)
	return host.querySelector("svg")!
}

describe("flattenTextBaselines", () => {
	it("bakes a dominant-baseline shift into y and strips the attribute", () => {
		const svg = mount(`<text x="5" y="50" dominant-baseline="middle">Hi</text>`)
		const text = svg.querySelector("text")!
		stubText(text, { charYs: [50, 50], shift: 5.5 })
		// happy-dom doesn't map the presentation attribute to computed style.
		text.style.setProperty("dominant-baseline", "middle")
		const orig = globalThis.getComputedStyle
		globalThis.getComputedStyle = ((el: Element) =>
			({
				dominantBaseline: el === text ? "middle" : "auto",
			}) as CSSStyleDeclaration) as typeof getComputedStyle
		try {
			flattenTextBaselines(svg)
		} finally {
			globalThis.getComputedStyle = orig
		}
		expect(text.getAttribute("y")).toBe("55.5")
		expect(text.hasAttribute("dominant-baseline")).toBe(false)
	})

	it("resolves dy on line-starting tspans into absolute y", () => {
		const svg = mount(
			`<text x="5" y="50"><tspan x="5" dy="-0.6em">Ab</tspan><tspan x="5" dy="1.2em">Cd</tspan></text>`
		)
		const text = svg.querySelector("text")!
		stubText(text, { charYs: [40.4, 40.4, 59.6, 59.6], shift: 0 })
		flattenTextBaselines(svg)
		const [a, b] = svg.querySelectorAll("tspan")
		expect(a.getAttribute("y")).toBe("40.4")
		expect(b.getAttribute("y")).toBe("59.6")
		expect(a.hasAttribute("dy")).toBe(false)
		expect(b.hasAttribute("dy")).toBe(false)
	})

	it("skips alphabetic text with no dy", () => {
		const svg = mount(`<text x="5" y="50">Hi</text>`)
		const text = svg.querySelector("text")!
		stubText(text, { charYs: [99, 99], shift: 0 })
		flattenTextBaselines(svg)
		expect(text.getAttribute("y")).toBe("50")
	})
})
