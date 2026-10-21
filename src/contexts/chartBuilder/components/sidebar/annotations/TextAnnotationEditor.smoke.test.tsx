import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createStore, Provider } from "jotai"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
	DEFAULT_RECTANGLE_TEXT,
	DEFAULT_TEXT_ANNOTATION_STYLE,
	newTextAnnotation,
	type TextAnnotation,
} from "../../../lib/annotationsConfig"
import type { AxisInfo } from "./axisInfo"
import { TextAnnotationEditor } from "./TextAnnotationEditor"

/** The text annotation editor's layout: the header shows the name as plain
 *  text with a pencil (an open input box there was read as the annotation's
 *  content), the text box sits at the top of the body OUTSIDE any collapsible
 *  subsection, and "Text" comes before Position. */

const AXIS: AxisInfo = {
	field: "val",
	type: "quantitative",
	categories: null,
	dataMin: 0,
	dataMax: 100,
}

const { text: _ignored, ...textDefaults } = DEFAULT_RECTANGLE_TEXT
const DEFAULTS = { ...textDefaults, ...DEFAULT_TEXT_ANNOTATION_STYLE }

const mount = (
	onChange = vi.fn(),
	name = "Text 1",
	over: Partial<TextAnnotation> = {}
) => {
	render(
		<Provider store={createStore()}>
			<TextAnnotationEditor
				anno={{ ...newTextAnnotation("t1"), name, ...over }}
				defaults={DEFAULTS}
				onChange={onChange}
				onRemove={() => {}}
				open
				onToggle={() => {}}
				xAxis={AXIS}
				yAxis={AXIS}
				fallbackName="Text 1"
			/>
		</Provider>
	)
	return onChange
}

afterEach(cleanup)

describe("TextAnnotationEditor layout", () => {
	it("shows the name as text and renames via the pencil", () => {
		const onChange = mount()
		// No open input box in the header until a rename starts.
		expect(screen.queryByLabelText("New name for Text 1")).toBeNull()
		expect(screen.getByText("Text 1")).toBeTruthy()
		fireEvent.click(screen.getByRole("button", { name: "Rename Text 1" }))
		const box = screen.getByLabelText<HTMLInputElement>("New name for Text 1")
		expect(box.value).toBe("Text 1")
		fireEvent.change(box, { target: { value: "Peak" } })
		fireEvent.keyDown(box, { key: "Enter" })
		expect(onChange).toHaveBeenCalledWith({ name: "Peak" })
	})

	it("double-clicking the name opens the rename box; Escape cancels", () => {
		const onChange = mount()
		fireEvent.doubleClick(screen.getByText("Text 1"))
		const box = screen.getByLabelText<HTMLInputElement>("New name for Text 1")
		fireEvent.change(box, { target: { value: "nope" } })
		fireEvent.keyDown(box, { key: "Escape" })
		expect(onChange).not.toHaveBeenCalled()
		expect(screen.queryByLabelText("New name for Text 1")).toBeNull()
	})

	it("falls back to the numbered default when the stored name is blank", () => {
		mount(vi.fn(), "")
		expect(screen.getByText("Text 1")).toBeTruthy()
	})

	it("shows the text box without opening any subsection", () => {
		const onChange = mount()
		// Every subsection starts collapsed…
		for (const title of ["Text", "Position", "Box"]) {
			expect(
				screen.getByRole("button", { name: title }).getAttribute("aria-expanded")
			).toBe("false")
		}
		// …yet the text box is already there, and it edits `text`, not `name`.
		const box = screen.getByPlaceholderText("Text drawn on the chart…")
		fireEvent.change(box, { target: { value: "Q3" } })
		expect(onChange).toHaveBeenCalledWith({ text: "Q3" })
	})

	it("orders Text before Position, with no second text box inside", () => {
		mount()
		const headers = screen
			.getAllByRole("button", { expanded: false })
			.map((b) => b.textContent?.trim())
		expect(headers.indexOf("Text")).toBeLessThan(
			headers.indexOf("Position")
		)
		fireEvent.click(screen.getByRole("button", { name: "Text" }))
		expect(screen.getAllByPlaceholderText("Text drawn on the chart…")).toHaveLength(1)
		expect(screen.getByLabelText("Family")).toBeTruthy()
	})

	it("Text holds Align, then the shared font rows, with no Padding", () => {
		mount()
		fireEvent.click(screen.getByRole("button", { name: "Text" }))
		for (const label of ["Family", "Color", "Size", "Weight"]) {
			expect(screen.getByLabelText(label)).toBeTruthy()
		}
		expect(screen.getByText("Align")).toBeTruthy()
		expect(screen.queryByLabelText("Padding")).toBeNull()
	})

	it("Style buttons write textItalic / textUnderline", () => {
		const onChange = mount()
		fireEvent.click(screen.getByRole("button", { name: "Text" }))
		fireEvent.click(screen.getByRole("button", { name: "Italic" }))
		expect(onChange).toHaveBeenLastCalledWith(
			expect.objectContaining({ textItalic: true, textUnderline: undefined })
		)
	})

	it("Box merges fill + border; the Border toggle hides the border rows when off", () => {
		const onChange = mount(vi.fn(), "Text 1", { borderOpacity: 0 })
		fireEvent.click(screen.getByRole("button", { name: "Box" }))
		for (const label of ["Background", "Opacity", "Corner radius", "Padding"]) {
			expect(screen.getByLabelText(label)).toBeTruthy()
		}
		const toggle = screen.getByLabelText<HTMLInputElement>("Border")
		expect(toggle.checked).toBe(false)
		expect(screen.queryByLabelText("Border color")).toBeNull()
		expect(screen.queryByLabelText("Border thickness")).toBeNull()
		// Turning it on restores a thickness and makes the stroke visible.
		fireEvent.click(toggle)
		expect(onChange).toHaveBeenLastCalledWith({
			borderThickness: DEFAULT_TEXT_ANNOTATION_STYLE.borderThickness,
			borderOpacity: 1,
		})
	})

	it("Border toggle off stores thickness 0; on shows the border rows", () => {
		const onChange = mount(vi.fn(), "Text 1", {
			borderOpacity: 1,
			borderThickness: 2.5,
		})
		fireEvent.click(screen.getByRole("button", { name: "Box" }))
		expect(screen.getByLabelText("Border color")).toBeTruthy()
		expect(screen.getByLabelText<HTMLInputElement>("Border thickness").value).toBe(
			"2.5"
		)
		fireEvent.click(screen.getByLabelText("Border"))
		expect(onChange).toHaveBeenLastCalledWith({ borderThickness: 0 })
	})
})
