import { describe, expect, it } from "vitest"
import "./chartMode"
import { MODE_REGISTRY } from "./chartModes"
import { facetAxisMapping } from "./facetAxisMapping"

const byId = (id: string) => {
	const mode = MODE_REGISTRY.find((m) => m.id === id)
	if (!mode) throw new Error(`no mode ${id}`)
	return mode
}

describe("facetAxisMapping", () => {
	it("cartesian modes map to x/y with panel size shown", () => {
		const m = facetAxisMapping(byId("scatter"))
		expect(m.rowAxis).toBe("y")
		expect(m.colAxis).toBe("x")
		expect(m.showPanelSize).toBe(true)
	})

	it("bars, areas, tile and hexbin all map cartesian", () => {
		for (const id of ["bars-x", "bars-y", "areas-x", "areas-y", "tile", "hexbin"]) {
			const m = facetAxisMapping(byId(id))
			expect(m.rowAxis).toBe("y")
			expect(m.colAxis).toBe("x")
		}
	})

	it("radar maps to r/angle and hides panel size", () => {
		const m = facetAxisMapping(byId("radar"))
		expect(m.rowAxis).toBe("r")
		expect(m.colAxis).toBe("angle")
		expect(m.rowAxisLabel).toBe("R axis")
		expect(m.colAxisLabel).toBe("angle axis")
		expect(m.showPanelSize).toBe(false)
	})

	it("pie modes have null row axis (no R equivalent) and angle col axis", () => {
		for (const id of ["pies", "pies-x", "pies-y"]) {
			const m = facetAxisMapping(byId(id))
			expect(m.rowAxis).toBeNull()
			expect(m.colAxis).toBe("angle")
			expect(m.showPanelSize).toBe(false)
		}
	})

	it("axis-less modes (geo, structure layouts) have no axis to share or range, but keep panel size", () => {
		for (const id of [
			"geo-points",
			"geo-symbols",
			"geo-choropleth",
			"packed-circles",
			"treemap",
			"sunburst",
			"chord",
			"sankey",
		]) {
			const m = facetAxisMapping(byId(id))
			expect(m.rowAxis, id).toBeNull()
			expect(m.colAxis, id).toBeNull()
			expect(m.showPanelSize, id).toBe(true)
		}
	})
})
