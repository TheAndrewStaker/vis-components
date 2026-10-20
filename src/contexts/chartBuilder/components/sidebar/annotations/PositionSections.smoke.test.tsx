import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createStore, Provider } from "jotai"
import { afterEach, describe, expect, it, vi } from "vitest"

import { newRectangle, newTextAnnotation } from "../../../lib/annotationsConfig"
import { currentRenderedPanelInnerDimsAtom } from "../../../store/atoms"
import type { AxisInfo } from "./axisInfo"
import { EdgePositionSection, PointPositionSection } from "./sections"

/** Every annotation's Position subsection: ONE set of coordinate inputs
 *  whose unit comes from "Adjust by" — Values, Pixels, or Percent — and, for
 *  pixels / percent, a "From" corner (+x right and +y up from every corner).
 *  Switching unit or corner converts the stored numbers so the annotation
 *  stays where it is. */

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

describe("annotation Position — Adjust by + From", () => {
	it("offers Values / Pixels / Percent, then a corner, with a single set of inputs", () => {
		mount(
			<PointPositionSection
				coords={newTextAnnotation("t1")}
				onChange={() => {}}
				xAxis={AXIS}
				yAxis={AXIS}
				zOrder="front"
				onZOrderChange={() => {}}
			/>
		)
		// The layer toggle lives at the bottom of Position, not loose in the card.
		expect(screen.queryByRole("group", { name: "Layer order" })).toBeNull()
		expandPosition()
		expect(screen.getByRole("group", { name: "Layer order" })).toBeTruthy()
		const options = Array.from(
			screen.getByLabelText<HTMLSelectElement>("Adjust by").options
		).map((o) => o.value)
		expect(options).toEqual(["values", "pixels", "percent"])
		// New text annotations are percent from the bottom-left.
		expect(screen.getByLabelText<HTMLSelectElement>("Adjust by").value).toBe("percent")
		const from = screen.getByLabelText<HTMLSelectElement>("From")
		expect(from.value).toBe("bottomLeft")
		expect(Array.from(from.options).map((o) => o.value)).toEqual([
			"topLeft",
			"topRight",
			"bottomLeft",
			"bottomRight",
		])
		// No second adjuster.
		expect(screen.queryByText("Adjust position")).toBeNull()
	})

	it("hides the corner picker for Values", () => {
		mount(
			<PointPositionSection
				coords={{ ...newTextAnnotation("t1"), coordSystem: "values", x: 5, y: 5 }}
				onChange={() => {}}
				xAxis={AXIS}
				yAxis={AXIS}
				zOrder="front"
				onZOrderChange={() => {}}
			/>
		)
		expandPosition()
		expect(screen.queryByLabelText("From")).toBeNull()
	})

	it("switching to Pixels keeps the corner and converts the coords", () => {
		const onChange = vi.fn()
		mount(
			<PointPositionSection
				coords={{
					...newTextAnnotation("t1"),
					coordSystem: "percentTopLeft",
					x: -0.02,
					y: 0.12,
				}}
				onChange={onChange}
				xAxis={AXIS}
				yAxis={AXIS}
				zOrder="front"
				onZOrderChange={() => {}}
			/>
		)
		expandPosition()
		select("Adjust by", "pixels")
		// 400 × 200 plot: -2% → 8px left of the spine, 12% → 24px above the top.
		expect(onChange).toHaveBeenCalledWith({
			coordSystem: "pixels",
			x: -8,
			y: 24,
		})
	})

	it("switching percent → Pixels from the bottom-left converts from the plot's bottom-left", () => {
		const onChange = vi.fn()
		mount(
			<PointPositionSection
				coords={{ ...newTextAnnotation("t1"), x: -0.02, y: -0.07 }}
				onChange={onChange}
				xAxis={AXIS}
				yAxis={AXIS}
				zOrder="front"
				onZOrderChange={() => {}}
			/>
		)
		expandPosition()
		select("Adjust by", "pixels")
		// 400 × 200 plot: -2% → 8px left of the spine, -7% → 14px below the bottom.
		expect(onChange).toHaveBeenCalledWith({
			coordSystem: "pixelsBottomLeft",
			x: -8,
			y: -14,
		})
	})

	it("switching to a right-hand corner converts x from the plot's right edge", () => {
		const onChange = vi.fn()
		mount(
			<PointPositionSection
				coords={{
					...newTextAnnotation("t1"),
					coordSystem: "pixelsBottomLeft",
					x: 412,
					y: -14,
				}}
				onChange={onChange}
				xAxis={AXIS}
				yAxis={AXIS}
				zOrder="front"
				onZOrderChange={() => {}}
			/>
		)
		expandPosition()
		select("From", "bottomRight")
		// 400 × 200 plot: 412px from the left → 12px right of the right edge.
		expect(onChange).toHaveBeenCalledWith({
			coordSystem: "pixelsBottomRight",
			x: 12,
			y: -14,
		})
	})

	it("explains the bottom-left corner in the helper line", () => {
		mount(
			<PointPositionSection
				coords={{
					...newTextAnnotation("t1"),
					coordSystem: "pixelsBottomLeft",
					x: -8,
					y: -14,
				}}
				onChange={() => {}}
				xAxis={AXIS}
				yAxis={AXIS}
				zOrder="front"
				onZOrderChange={() => {}}
			/>
		)
		expandPosition()
		expect(screen.getByLabelText<HTMLInputElement>("y").value).toBe("-14")
		expect(screen.getByText(/bottom-left corner/)).toBeTruthy()
		expect(screen.queryByText(/top-left corner/)).toBeNull()
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
				zOrder="front"
				onZOrderChange={() => {}}
			/>
		)
		expandPosition()
		expect(screen.getByLabelText<HTMLInputElement>("x").value).toBe("-8")
		expect(screen.getByLabelText<HTMLInputElement>("y").value).toBe("24")
		fireEvent.change(screen.getByLabelText("y"), { target: { value: "14" } })
		expect(onChange).toHaveBeenCalledWith({ y: 14 })
	})

	it("switching back to Percent keeps the corner and converts the other way", () => {
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
				zOrder="front"
				onZOrderChange={() => {}}
			/>
		)
		expandPosition()
		select("Adjust by", "percent")
		const patch = onChange.mock.calls[0]![0]
		expect(patch.coordSystem).toBe("percentTopLeft")
		expect(patch.x).toBeCloseTo(-0.02)
		expect(patch.y).toBeCloseTo(0.12)
	})

	it("a percent corner measures from that corner, +x right / +y up", () => {
		const onChange = vi.fn()
		mount(
			<PointPositionSection
				coords={{ ...newTextAnnotation("t1"), x: 0.9, y: 0.8 }}
				onChange={onChange}
				xAxis={AXIS}
				yAxis={AXIS}
				zOrder="front"
				onZOrderChange={() => {}}
			/>
		)
		expandPosition()
		select("From", "topRight")
		// 90% / 80% from the bottom-left = 10% left of / 20% below the top-right.
		const patch = onChange.mock.calls[0]![0]
		expect(patch.coordSystem).toBe("percentTopRight")
		expect(patch.x).toBeCloseTo(-0.1)
		expect(patch.y).toBeCloseTo(-0.2)
	})

	it("gives the edge-coordinate kinds the same unit", () => {
		const onChange = vi.fn()
		mount(
			<EdgePositionSection
				coords={{ ...newRectangle("r1"), xMin: 0, xMax: 0.5, yMin: 1, yMax: 1.1 }}
				onChange={onChange}
				xAxis={AXIS}
				yAxis={AXIS}
				zOrder="front"
				onZOrderChange={() => {}}
			/>
		)
		expandPosition()
		select("Adjust by", "pixels")
		// Percent from the bottom-left → pixels from the bottom-left.
		expect(onChange).toHaveBeenCalledWith({
			coordSystem: "pixelsBottomLeft",
			xMin: 0,
			xMax: 200,
			yMin: 200,
			yMax: 220,
		})
	})
})

/** Local midnight on a calendar day — the instant the date box stores. */
const local = (y: number, m: number, d: number) => new Date(y, m, d).getTime()

/** A two-year date axis, Jan 1 2020 → Jan 1 2022. */
const DATE_AXIS: AxisInfo = {
	field: "when",
	type: "temporal",
	categories: null,
	dataMin: local(2020, 0, 1),
	dataMax: local(2022, 0, 1),
}

describe("annotation Position — Values unit on a date axis", () => {
	it("gives the date axis a date box and leaves the other axis a number input", () => {
		const onChange = vi.fn()
		mount(
			<EdgePositionSection
				coords={{
					...newRectangle("r1"),
					coordSystem: "values",
					xMin: local(2020, 5, 1),
					xMax: local(2021, 5, 1),
					yMin: 10,
					yMax: 20,
				}}
				onChange={onChange}
				xAxis={DATE_AXIS}
				yAxis={AXIS}
				zOrder="front"
				onZOrderChange={() => {}}
			/>
		)
		expandPosition()
		const left = screen.getByLabelText<HTMLInputElement>("left")
		const right = screen.getByLabelText<HTMLInputElement>("right")
		expect(left.value).toBe("2020-06-01")
		expect(right.value).toBe("2021-06-01")
		// Each date box has its own calendar button; the y axis keeps a
		// plain number input.
		expect(screen.getAllByRole("button", { name: "Pick a date" })).toHaveLength(2)
		expect(screen.getByLabelText<HTMLInputElement>("bottom").value).toBe("10")

		// A typed date stores epoch ms at local midnight — the unit the
		// renderer's time scale places directly.
		fireEvent.change(left, { target: { value: "2020-09-15" } })
		fireEvent.keyDown(left, { key: "Enter" })
		expect(onChange).toHaveBeenCalledWith({ xMin: local(2020, 8, 15) })

		// Blanking the box leaves the coordinate alone.
		fireEvent.change(right, { target: { value: "" } })
		fireEvent.blur(right)
		expect(onChange).toHaveBeenCalledTimes(1)
	})

	it("switching Percent → Values on a date axis lands on a date and shows it as one", () => {
		const onChange = vi.fn()
		const store = createStore()
		store.set(currentRenderedPanelInnerDimsAtom, { widthPx: 400, heightPx: 200 })
		const start = { ...newTextAnnotation("t1"), x: 0.5, y: 0.5 }
		const ui = (coords: typeof start) => (
			<Provider store={store}>
				<PointPositionSection
					coords={coords}
					onChange={onChange}
					xAxis={DATE_AXIS}
					yAxis={AXIS}
					zOrder="front"
					onZOrderChange={() => {}}
				/>
			</Provider>
		)
		const { rerender } = render(ui(start))
		expandPosition()
		select("Adjust by", "values")
		const patch = onChange.mock.calls[0]?.[0] as { coordSystem: string; x: number; y: number }
		expect(patch.coordSystem).toBe("values")
		// Halfway along the axis is noon on Dec 31 2020, as ms...
		expect(patch.x).toBeCloseTo((local(2020, 0, 1) + local(2022, 0, 1)) / 2, -4)
		expect(patch.y).toBe(50)
		// ...which the date box shows as the day it fell on.
		rerender(ui({ ...start, ...patch, coordSystem: "values" }))
		expect(screen.getByLabelText<HTMLInputElement>("x").value).toBe("2020-12-31")
		expect(screen.getByLabelText<HTMLInputElement>("y").value).toBe("50")
	})
})
