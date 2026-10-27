import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { SYSTEM_LIGHT_THEME, themeOf } from "../../../chartBuilder/lib/systemThemes"
import type { Theme } from "../../../chartBuilder/lib/types"

import { TooltipsSection } from "./TooltipsSection"
import type { ThemeSetter } from "./types"

afterEach(cleanup)

const THEME: Theme = themeOf(SYSTEM_LIGHT_THEME)

const mount = (theme: Theme = THEME) => {
	const set = vi.fn() as unknown as ThemeSetter
	render(<TooltipsSection theme={theme} set={set} isReadOnly={false} />)
	// The section group starts collapsed; open it like the user would.
	fireEvent.click(screen.getByRole("button", { name: /Tooltips/, expanded: false }))
	return set as unknown as ReturnType<typeof vi.fn>
}

describe("TooltipsSection — tooltip box defaults", () => {
	it("writes max width, corner radius, opacity, and shadow size", () => {
		const set = mount()
		fireEvent.change(screen.getByLabelText("Max width"), { target: { value: "300" } })
		expect(set).toHaveBeenCalledWith("tooltipMaxWidth", 300)
		fireEvent.change(screen.getByLabelText("Corner radius"), { target: { value: "0" } })
		expect(set).toHaveBeenCalledWith("tooltipCornerRadius", 0)
		fireEvent.change(screen.getByLabelText("Background opacity"), {
			target: { value: "0.8" },
		})
		expect(set).toHaveBeenCalledWith("tooltipBackgroundOpacity", 0.8)
		fireEvent.change(screen.getByLabelText("Shadow size"), { target: { value: "20" } })
		expect(set).toHaveBeenCalledWith("tooltipShadowSize", 20)
	})

	it("outline and background colors: Automatic hides the picker, Custom seeds one", () => {
		const set = mount()
		expect(screen.queryByLabelText("Color")).toBeNull()
		const customs = screen.getAllByLabelText("Custom color")
		expect(customs).toHaveLength(2)
		fireEvent.click(customs[0]!)
		expect(set).toHaveBeenCalledWith("tooltipOutlineColor", "#e7e5e4")
		fireEvent.click(customs[1]!)
		expect(set).toHaveBeenCalledWith("tooltipBackgroundColor", "#ffffff")

		cleanup()
		const custom = mount({ ...THEME, tooltipBackgroundColor: "#123456" })
		expect(screen.getByLabelText("Color")).toBeTruthy()
		fireEvent.click(screen.getByLabelText(/Automatic \(white/))
		expect(custom).toHaveBeenCalledWith("tooltipBackgroundColor", null)
	})

	it("hides the shadow color and opacity while the shadow size is 0", () => {
		mount()
		expect(screen.getByLabelText("Shadow color")).toBeTruthy()
		expect(screen.getByLabelText("Shadow opacity")).toBeTruthy()
		cleanup()
		mount({ ...THEME, tooltipShadowSize: 0 })
		expect(screen.queryByLabelText("Shadow color")).toBeNull()
		expect(screen.queryByLabelText("Shadow opacity")).toBeNull()
	})
})
