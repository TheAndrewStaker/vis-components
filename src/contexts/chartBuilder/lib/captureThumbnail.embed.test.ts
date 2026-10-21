import { describe, expect, it } from "vitest"

import {
	PLOT_SVG_ID,
	serializeChartSvg,
	serializeEmbedCapture,
} from "./captureThumbnail"

/** Give an element a concrete layout rect — happy-dom has no layout engine,
 * so `getBoundingClientRect` returns zeros unless stubbed. */
const stubRect = (
	el: Element,
	rect: { left: number; top: number; width: number; height: number }
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

describe("serializeEmbedCapture", () => {
	it("emits each facet label exactly once (regression: labels were re-injected on top of the cloned SVG's own <text>)", () => {
		// Facet labels live INSIDE the chart SVG as <g data-facet-label><text>
		// (PlotCanvas). The exporter clones that SVG wholesale, so recreating
		// the labels from a [data-facet-label] query duplicated every one.
		document.body.innerHTML = `
			<div data-export-root>
				<svg id="${PLOT_SVG_ID}" width="400" height="300">
					<g data-facet-label><text x="10" y="10">Group A</text></g>
					<g data-facet-label><text x="10" y="120">Group B</text></g>
				</svg>
			</div>`
		const root = document.querySelector<HTMLElement>("[data-export-root]")!
		stubRect(root, { left: 0, top: 0, width: 400, height: 300 })
		stubRect(root.querySelector(`#${PLOT_SVG_ID}`)!, {
			left: 0,
			top: 0,
			width: 400,
			height: 300,
		})

		const out = serializeEmbedCapture(document)
		expect(out).not.toBeNull()
		expect((out!.match(/Group A/g) ?? []).length).toBe(1)
		expect((out!.match(/Group B/g) ?? []).length).toBe(1)
	})
})

describe("exported accessible name", () => {
	const live = `
		<svg id="${PLOT_SVG_ID}" width="400" height="300" role="img"
			aria-labelledby="vc-chart-desc-r1" data-a11y-title="Sales">
			<desc id="vc-chart-desc-r1">East outsold West.</desc>
			<text x="10" y="10">Sales</text>
		</svg>`
	const parse = (out: string | null) => {
		expect(out).not.toBeNull()
		// Re-parse the serialized markup (happy-dom's DOMParser has no SVG
		// document support; the HTML parser keeps SVG in its namespace).
		const host = document.createElement("div")
		host.innerHTML = out!
		return host.firstElementChild!
	}

	it("serializeChartSvg: the root carries title, desc and role", () => {
		document.body.innerHTML = `<div>${live}</div>`
		const root = parse(serializeChartSvg(document))
		expect(root.getAttribute("role")).toBe("img")
		const [first, second] = [...root.children]
		expect(first?.localName).toBe("title")
		expect(first?.textContent).toBe("Sales")
		expect(second?.localName).toBe("desc")
		expect(second?.textContent).toBe("East outsold West.")
		expect(root.getAttribute("aria-labelledby")).toBe(first?.id)
		expect(root.getAttribute("aria-describedby")).toBe(second?.id)
		expect(root.hasAttribute("data-a11y-title")).toBe(false)
		expect(root.querySelectorAll("desc")).toHaveLength(1)
	})

	it("serializeEmbedCapture: the name moves from the nested plot to the root", () => {
		document.body.innerHTML = `<div data-export-root>${live}</div>`
		const host = document.querySelector<HTMLElement>("[data-export-root]")!
		const rect = { left: 0, top: 0, width: 400, height: 300 }
		stubRect(host, rect)
		stubRect(host.querySelector(`#${PLOT_SVG_ID}`)!, rect)
		const root = parse(serializeEmbedCapture(document))
		expect(root.getAttribute("role")).toBe("img")
		expect(root.firstElementChild?.localName).toBe("title")
		expect(root.querySelectorAll("title")).toHaveLength(1)
		expect(root.querySelectorAll("desc")).toHaveLength(1)
		const nested = root.querySelector("svg")!
		expect(nested.hasAttribute("role")).toBe(false)
		expect(nested.hasAttribute("aria-labelledby")).toBe(false)
	})
})
