import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createStore, Provider } from "jotai"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
	DEFAULT_RECTANGLE_TEXT,
	DEFAULT_TEXT_ANNOTATION_STYLE,
	newTextAnnotation,
} from "../../../lib/annotationsConfig"
import type { AxisInfo } from "./axisInfo"
import { TextAnnotationEditor } from "./TextAnnotationEditor"

/** The text annotation editor's layout: the header shows the name as plain
 *  text with a pencil (an open input box there was read as the annotation's
 *  content), the text box sits at the top of the body OUTSIDE any collapsible
 *  subsection, and "Text formatting" comes before Position. */

const AXIS: AxisInfo = {
	field: "val",
	type: "quantitative",
	categories: null,
	dataMin: 0,
	dataMax: 100,
}

const { text: _ignored, ...textDefaults } = DEFAULT_RECTANGLE_TEXT
const DEFAULTS = { ...textDefaults, ...DEFAULT_TEXT_ANNOTATION_STYLE }

const mount = (onChange = vi.fn(), name = "Text 1") => {
	render(
		<Provider store={createStore()}>
			<TextAnnotationEditor
				anno={{ ...newTextAnnotation("t1"), name }}
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
		for (const title of ["Text formatting", "Position", "Fill", "Border"]) {
			expect(
				screen.getByRole("button", { name: title }).getAttribute("aria-expanded")
			).toBe("false")
		}
		// …yet the text box is already there, and it edits `text`, not `name`.
		const box = screen.getByPlaceholderText("Text drawn on the chart…")
		fireEvent.change(box, { target: { value: "Q3" } })
		expect(onChange).toHaveBeenCalledWith({ text: "Q3" })
	})

	it("orders Text formatting before Position, with no second text box inside", () => {
		mount()
		const headers = screen
			.getAllByRole("button", { expanded: false })
			.map((b) => b.textContent?.trim())
		expect(headers.indexOf("Text formatting")).toBeLessThan(
			headers.indexOf("Position")
		)
		fireEvent.click(screen.getByRole("button", { name: "Text formatting" }))
		expect(screen.getAllByPlaceholderText("Text drawn on the chart…")).toHaveLength(1)
		expect(screen.getByLabelText("Font")).toBeTruthy()
	})
})
