import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createStore, Provider } from "jotai"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
	DEFAULT_BOX_ANNOTATION_STYLE,
	newCircle,
	type CircleAnnotation,
} from "../../../lib/annotationsConfig"
import { currentRenderedPanelInnerDimsAtom } from "../../../store/atoms"
import type { AxisInfo } from "./axisInfo"
import { CircleEditor } from "./CircleEditor"

/** A circle's Values-mode radius counts in the radius axis's data units —
 *  except when that axis has none (categorical / string-ordinal /
 *  temporal). Then a px / % toggle beside the radius box says what the
 *  number means, and switching it converts the number so the circle keeps
 *  its on-screen size. */

const QUANT: AxisInfo = {
	field: "val",
	type: "quantitative",
	categories: null,
	dataMin: 0,
	dataMax: 100,
}
const CAT: AxisInfo = {
	field: "group",
	type: "categorical",
	categories: ["a", "b", "c"],
	dataMin: null,
	dataMax: null,
}

/** A rendered 400 × 200 plot, so unit conversions have an extent. */
const mount = (ui: React.ReactElement) => {
	const store = createStore()
	store.set(currentRenderedPanelInnerDimsAtom, { widthPx: 400, heightPx: 200 })
	return render(<Provider store={store}>{ui}</Provider>)
}

const renderEditor = (
	circle: CircleAnnotation,
	xAxis: AxisInfo,
	yAxis: AxisInfo,
	onChange: (patch: Partial<CircleAnnotation>) => void = () => {}
) =>
	mount(
		<CircleEditor
			circle={circle}
			defaults={DEFAULT_BOX_ANNOTATION_STYLE}
			onChange={onChange}
			onRemove={() => {}}
			open
			onToggle={() => {}}
			xAxis={xAxis}
			yAxis={yAxis}
			fallbackName="Circle 1"
		/>
	)

/** Subsections start collapsed; open the one under test. */
const expandPosition = () =>
	fireEvent.click(screen.getByRole("button", { name: /position/i }))

const unitGroup = () => screen.queryByRole("group", { name: "Radius unit" })

/** A circle in Values mode on two categorical axes, 20% of the x extent. */
const bothCategorical: CircleAnnotation = {
	...newCircle("c1"),
	coordSystem: "values",
	centerX: "b",
	centerY: "b",
	radius: 0.2,
	radiusAxis: "x",
}

afterEach(cleanup)

describe("CircleEditor — radius unit when the radius axis has no data units", () => {
	it("offers px / % beside the radius box, defaulting to % of the extent", () => {
		renderEditor(bothCategorical, CAT, CAT)
		expandPosition()
		expect(unitGroup()).toBeTruthy()
		expect(
			screen.getByRole("button", { name: "%" }).getAttribute("aria-pressed")
		).toBe("true")
		// The stored fraction shows as a whole-number percent, like Percent mode.
		expect(screen.getByLabelText<HTMLInputElement>("radius (x)").value).toBe(
			"20"
		)
	})

	it("converts the stored radius when the unit toggles, so the circle keeps its size", () => {
		const onChange = vi.fn()
		renderEditor(bothCategorical, CAT, CAT, onChange)
		expandPosition()
		fireEvent.click(screen.getByRole("button", { name: "px" }))
		// 20% of the 400px-wide x extent.
		expect(onChange).toHaveBeenCalledWith({ radiusUnit: "px", radius: 80 })
	})

	it("shows and stores a px radius verbatim", () => {
		const onChange = vi.fn()
		renderEditor(
			{ ...bothCategorical, radiusUnit: "px", radius: 80 },
			CAT,
			CAT,
			onChange
		)
		expandPosition()
		const box = screen.getByLabelText<HTMLInputElement>("radius (x)")
		expect(box.value).toBe("80")
		fireEvent.change(box, { target: { value: "40" } })
		expect(onChange).toHaveBeenCalledWith({ radius: 40 })
	})

	it("stores a % radius as a fraction", () => {
		const onChange = vi.fn()
		renderEditor(bothCategorical, CAT, CAT, onChange)
		expandPosition()
		fireEvent.change(screen.getByLabelText("radius (x)"), {
			target: { value: "40" },
		})
		expect(onChange).toHaveBeenCalledWith({ radius: 0.4 })
	})

	it("follows the chosen radius axis on a mixed chart", () => {
		// x quantitative, y categorical. Radius on x counts in data units →
		// no toggle; radius on y has no units → toggle.
		const mixed: CircleAnnotation = { ...bothCategorical, centerX: 50 }
		renderEditor(mixed, QUANT, CAT)
		expandPosition()
		expect(unitGroup()).toBeNull()
		cleanup()
		renderEditor({ ...mixed, radiusAxis: "y" }, QUANT, CAT)
		expandPosition()
		expect(unitGroup()).toBeTruthy()
	})

	it("stays out of Percent and Pixels modes, which already fix the unit", () => {
		renderEditor({ ...bothCategorical, coordSystem: "percent" }, CAT, CAT)
		expandPosition()
		expect(unitGroup()).toBeNull()
		cleanup()
		renderEditor({ ...bothCategorical, coordSystem: "pixels" }, CAT, CAT)
		expandPosition()
		expect(unitGroup()).toBeNull()
	})
})
