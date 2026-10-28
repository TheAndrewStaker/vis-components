import { describe, expect, it } from "vitest"

import {
	PLOT_SVG_ID,
	UNMEASURED_ATTR,
	captureThumbnail,
	chartLayoutReady,
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

describe("serializeEmbedCapture: included data table", () => {
	it("redraws the table's text and paints a bottom-only border as an edge, not an outline", () => {
		document.body.innerHTML = `
			<div data-export-root>
				<svg id="${PLOT_SVG_ID}" width="400" height="300"></svg>
				<div data-data-table>
					<table><tbody><tr>
						<td style="border-bottom: 2px solid rgb(10, 20, 30)">East</td>
					</tr></tbody></table>
				</div>
			</div>`
		const root = document.querySelector<HTMLElement>("[data-export-root]")!
		stubRect(root, { left: 0, top: 0, width: 400, height: 340 })
		stubRect(root.querySelector(`#${PLOT_SVG_ID}`)!, {
			left: 0,
			top: 0,
			width: 400,
			height: 300,
		})
		const cell = root.querySelector("td")!
		stubRect(cell, { left: 16, top: 310, width: 80, height: 20 })
		const realCreateRange = document.createRange.bind(document)
		Object.defineProperty(document, "createRange", {
			value: () => {
				const range = realCreateRange()
				Object.defineProperty(range, "getBoundingClientRect", {
					value: () => new DOMRect(20, 312, 30, 16),
				})
				return range
			},
			configurable: true,
		})

		let out: string | null
		try {
			out = serializeEmbedCapture(document)
		} finally {
			Object.defineProperty(document, "createRange", {
				value: realCreateRange,
				configurable: true,
			})
		}
		expect(out).not.toBeNull()
		expect(out).toContain(">East</text>")
		// One 2px rule along the cell's bottom edge, no stroked outline.
		expect(out).toMatch(
			/<rect x="16" y="328" width="80" height="2" fill="rgb\(10, 20, 30\)"/
		)
		expect(out).not.toContain('stroke="rgb(10, 20, 30)"')
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

describe("chartLayoutReady", () => {
	const sized = { left: 0, top: 0, width: 400, height: 300 }

	it("accepts a sized plot SVG solved for a measured container", () => {
		document.body.innerHTML = `<svg id="${PLOT_SVG_ID}" width="400" height="300"></svg>`
		stubRect(document.querySelector(`#${PLOT_SVG_ID}`)!, sized)
		expect(chartLayoutReady(document)).toBe(true)
	})

	// The frame between PlotCanvas mounting and its ResizeObserver's first
	// report: the SVG has a real rect, but it was solved for a 0×0
	// container and shows full-size text in a collapsed canvas.
	it("refuses the unmeasured frame even though it has a size", () => {
		document.body.innerHTML = `<svg id="${PLOT_SVG_ID}" width="120" height="189" ${UNMEASURED_ATTR}=""></svg>`
		stubRect(document.querySelector(`#${PLOT_SVG_ID}`)!, sized)
		expect(chartLayoutReady(document)).toBe(false)
	})

	it("refuses a facet grid while any panel is unmeasured", () => {
		document.body.innerHTML = `
			<div data-facet-grid>
				<svg id="${PLOT_SVG_ID}" width="200" height="150"></svg>
				<svg id="${PLOT_SVG_ID}" width="200" height="150" ${UNMEASURED_ATTR}=""></svg>
			</div>`
		stubRect(document.querySelector("[data-facet-grid]")!, sized)
		for (const svg of document.querySelectorAll(`#${PLOT_SVG_ID}`)) {
			stubRect(svg, { left: 0, top: 0, width: 200, height: 150 })
		}
		expect(chartLayoutReady(document)).toBe(false)
	})
})

describe("captureThumbnail (autosave path)", () => {
	// Regression: the autosave captured the unmeasured frame and stored a
	// collapsed, giant-text preview with a current stamp. Null keeps the old
	// picture and stamp, so the library's refresh re-renders it offscreen.
	it("resolves null on the unmeasured frame instead of rasterizing it", async () => {
		document.body.innerHTML = `<svg id="${PLOT_SVG_ID}" width="120" height="189" ${UNMEASURED_ATTR}=""></svg>`
		stubRect(document.querySelector(`#${PLOT_SVG_ID}`)!, {
			left: 0,
			top: 0,
			width: 120,
			height: 189,
		})
		await expect(captureThumbnail()).resolves.toBeNull()
	})

	it("resolves null while the plot SVG has no layout rect", async () => {
		document.body.innerHTML = `<svg id="${PLOT_SVG_ID}" width="400" height="300"></svg>`
		await expect(captureThumbnail()).resolves.toBeNull()
	})
})
