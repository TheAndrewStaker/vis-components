import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createStore, Provider } from "jotai"
import { afterEach, describe, expect, it, vi } from "vitest"

import { newRectangle, newTextAnnotation } from "../../../lib/annotationsConfig"
import { currentRenderedPanelInnerDimsAtom } from "../../../store/atoms"
import type { AxisInfo } from "./axisInfo"
import { EdgePositionSection, PointPositionSection } from "./sections"

/** Every annotation's Position subsection: ONE set of coordinate inputs
 *  whose unit comes from "Adjust by" — Percent, Values, or Pixels (from the
 *  plot's top-left corner, +y up). Switching unit converts the stored
 *  numbers so the annotation stays where it is. */

const AXIS: AxisInfo = {
	field: "val",
	type: "quantitative",
	categories: null,
	dataMin: 0,
	dataMax: 100,
}

/** A rendered 400 × 200 plot, so unit conversions have an extent. */
const mount = (ui: React.ReactElement) => {
	const store = createStore()
	store.set(currentRenderedPanelInnerDimsAtom, { widthPx: 400, heightPx: 200 })
	return render(<Provider store={store}>{ui}</Provider>)
}

/** Subsections start collapsed; open the one under test. */
const expandPosition = () =>
	fireEvent.click(screen.getByRole("button", { name: /position/i }))

const select = (label: string, value: string) =>
	fireEvent.change(screen.getByLabelText(label), { target: { value } })

afterEach(cleanup)

describe("annotation Position — Pixels unit", () => {
	it("offers Pixels in Adjust by and keeps a single set of inputs", () => {
		mount(
			<PointPositionSection
				coords={newTextAnnotation("t1")}
				onChange={() => {}}
				xAxis={AXIS}
				yAxis={AXIS}
			/>
		)
		expandPosition()
		const options = Array.from(
			screen.getByLabelText<HTMLSelectElement>("Adjust by").options
		).map((o) => o.value)
		expect(options).toEqual(["percent", "values", "pixels"])
		// No second adjuster, no corner picker.
		expect(screen.queryByText("Adjust position")).toBeNull()
		expect(screen.queryByLabelText("Measured from")).toBeNull()
	})

	it("switching to Pixels converts the coords from the plot's top-left", () => {
		const onChange = vi.fn()
		mount(
			<PointPositionSection
				coords={{ ...newTextAnnotation("t1"), x: -0.02, y: 1.12 }}
				onChange={onChange}
				xAxis={AXIS}
				yAxis={AXIS}
			/>
		)
		expandPosition()
		select("Adjust by", "pixels")
		// 400 × 200 plot: -2% → 8px left of the spine, 112% → 24px above the top.
		expect(onChange).toHaveBeenCalledWith({
			coordSystem: "pixels",
			x: -8,
			y: 24,
		})
	})

	it("shows px inputs that write as typed — +y is up by definition", () => {
		const onChange = vi.fn()
		mount(
			<PointPositionSection
				coords={{
					...newTextAnnotation("t1"),
					coordSystem: "pixels",
					x: -8,
					y: 24,
				}}
				onChange={onChange}
				xAxis={AXIS}
				yAxis={AXIS}
			/>
		)
		expandPosition()
		expect(screen.getByLabelText<HTMLInputElement>("x").value).toBe("-8")
		expect(screen.getByLabelText<HTMLInputElement>("y").value).toBe("24")
		fireEvent.change(screen.getByLabelText("y"), { target: { value: "14" } })
		expect(onChange).toHaveBeenCalledWith({ y: 14 })
	})

	it("switching back to Percent converts the other way", () => {
		const onChange = vi.fn()
		mount(
			<PointPositionSection
				coords={{
					...newTextAnnotation("t1"),
					coordSystem: "pixels",
					x: -8,
					y: 24,
				}}
				onChange={onChange}
				xAxis={AXIS}
				yAxis={AXIS}
			/>
		)
		expandPosition()
		select("Adjust by", "percent")
		const patch = onChange.mock.calls[0]![0]
		expect(patch.coordSystem).toBe("percent")
		expect(patch.x).toBeCloseTo(-0.02)
		expect(patch.y).toBeCloseTo(1.12)
	})

	it("gives the edge-coordinate kinds the same unit", () => {
		const onChange = vi.fn()
		mount(
			<EdgePositionSection
				coords={{ ...newRectangle("r1"), xMin: 0, xMax: 0.5, yMin: 1, yMax: 1.1 }}
				onChange={onChange}
				xAxis={AXIS}
				yAxis={AXIS}
			/>
		)
		expandPosition()
		select("Adjust by", "pixels")
		expect(onChange).toHaveBeenCalledWith({
			coordSystem: "pixels",
			xMin: 0,
			xMax: 200,
			yMin: 0,
			yMax: 20,
		})
	})
})
