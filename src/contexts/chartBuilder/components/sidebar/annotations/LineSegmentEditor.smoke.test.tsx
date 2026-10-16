import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createStore, Provider } from "jotai"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
	DEFAULT_LINE_ANNOTATION_STYLE,
	newLineSegment,
	type LineSegmentAnnotation,
} from "../../../lib/annotationsConfig"
import type { AxisInfo } from "./axisInfo"
import { LineSegmentEditor } from "./LineSegmentEditor"

/** The line editor's "Line properties" subsection: the stroke controls,
 *  then the line's ends — a Round / Square cap choice and an "Add arrowhead"
 *  checkbox that reveals the head's style chips and scale. */

const AXIS: AxisInfo = {
	field: "val",
	type: "quantitative",
	categories: null,
	dataMin: 0,
	dataMax: 100,
}

const mount = (
	patch: Partial<LineSegmentAnnotation> = {},
	onChange = vi.fn()
) => {
	render(
		<Provider store={createStore()}>
			<LineSegmentEditor
				line={{ ...newLineSegment("l1"), name: "Line 1", ...patch }}
				defaults={DEFAULT_LINE_ANNOTATION_STYLE}
				onChange={onChange}
				onRemove={() => {}}
				open
				onToggle={() => {}}
				xAxis={AXIS}
				yAxis={AXIS}
				fallbackName="Line 1"
			/>
		</Provider>
	)
	fireEvent.click(screen.getByRole("button", { name: /line properties/i }))
	return onChange
}

afterEach(cleanup)

describe("LineSegmentEditor — Line properties", () => {
	it("titles the stroke subsection 'Line properties'", () => {
		mount()
		expect(
			screen.getByRole("button", { name: /line properties/i })
		).toBeTruthy()
		expect(screen.queryByRole("button", { name: /^line$/i })).toBeNull()
	})

	it("offers a Round / Square line cap, Square (flush) by default", () => {
		const onChange = mount()
		const round = screen.getByRole<HTMLInputElement>("radio", { name: "Round" })
		const square = screen.getByRole<HTMLInputElement>("radio", { name: "Square" })
		expect(square.checked).toBe(true)
		expect(round.checked).toBe(false)
		fireEvent.click(round)
		expect(onChange).toHaveBeenCalledWith({ lineCap: "round" })
	})

	it("starts without an arrowhead and hides the head controls until it's on", () => {
		const onChange = mount()
		const toggle = screen.getByLabelText<HTMLInputElement>("Add arrowhead")
		expect(toggle.checked).toBe(false)
		expect(screen.queryByRole("button", { name: /arrowhead$/i })).toBeNull()
		expect(screen.queryByLabelText("Scale")).toBeNull()
		fireEvent.click(toggle)
		expect(onChange).toHaveBeenCalledWith({ arrowhead: true })
	})

	it("with the arrowhead on, picks a style from the chips and scales the head", () => {
		const onChange = mount({ arrowhead: true })
		expect(screen.getByLabelText<HTMLInputElement>("Add arrowhead").checked).toBe(
			true
		)
		const chips = screen.getAllByRole("button", { name: /arrowhead$/i })
		expect(chips.map((c) => c.getAttribute("aria-label"))).toEqual([
			"Triangle arrowhead",
			"Stealth arrowhead",
			"Open arrowhead",
			"Diamond arrowhead",
			"Circle arrowhead",
		])
		expect(
			screen.getByRole("button", { name: "Triangle arrowhead" }).getAttribute("aria-pressed")
		).toBe("true")
		fireEvent.click(screen.getByRole("button", { name: "Open arrowhead" }))
		expect(onChange).toHaveBeenCalledWith({ arrowheadStyle: "open" })

		const scale = screen.getByLabelText<HTMLInputElement>("Scale")
		expect(scale.value).toBe("1")
		fireEvent.change(scale, { target: { value: "2" } })
		expect(onChange).toHaveBeenCalledWith({ arrowheadScale: 2 })
	})

	it("marks the stored style as pressed and offers a reset once the scale leaves 1", () => {
		const onChange = mount({
			arrowhead: true,
			arrowheadStyle: "diamond",
			arrowheadScale: 1.5,
		})
		expect(
			screen.getByRole("button", { name: "Diamond arrowhead" }).getAttribute("aria-pressed")
		).toBe("true")
		expect(
			screen.getByRole("button", { name: "Triangle arrowhead" }).getAttribute("aria-pressed")
		).toBe("false")
		const resets = screen.getAllByRole("button", { name: "reset" })
		fireEvent.click(resets[resets.length - 1]!)
		expect(onChange).toHaveBeenCalledWith({ arrowheadScale: 1 })
	})
})
