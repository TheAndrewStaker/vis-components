import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { SYSTEM_LIGHT_THEME, themeOf } from "../../../chartBuilder/lib/systemThemes"
import type { Theme } from "../../../chartBuilder/lib/types"

import { ExportingSection } from "./ExportingSection"
import type { ThemeSetter } from "./types"

afterEach(cleanup)

const THEME: Theme = themeOf(SYSTEM_LIGHT_THEME)

const mount = (theme: Theme = THEME) => {
	const set = vi.fn() as unknown as ThemeSetter
	render(<ExportingSection theme={theme} set={set} isReadOnly={false} />)
	// The section group starts collapsed; open it like the user would.
	fireEvent.click(screen.getByRole("button", { name: /Exporting/, expanded: false }))
	return set as unknown as ReturnType<typeof vi.fn>
}

describe("ExportingSection — canvas margin defaults", () => {
	it("starts blank (auto) on a fresh theme and stores a typed side in px", () => {
		const set = mount()
		const top = screen.getByLabelText("Top") as HTMLInputElement
		expect(top.value).toBe("")
		expect(top.placeholder).toBe("auto")
		fireEvent.change(top, { target: { value: "24" } })
		expect(set).toHaveBeenCalledWith("exportCanvasMargins", { top: 24 })
	})

	it("clearing a side drops it from the sparse record, and the last one drops the field", () => {
		const set = mount({ ...THEME, exportCanvasMargins: { top: 24, left: 0 } })
		fireEvent.change(screen.getByLabelText("Top"), { target: { value: "" } })
		expect(set).toHaveBeenCalledWith("exportCanvasMargins", { left: 0 })
		cleanup()
		const only = mount({ ...THEME, exportCanvasMargins: { left: 0 } })
		fireEvent.change(screen.getByLabelText("Left"), { target: { value: "" } })
		expect(only).toHaveBeenCalledWith("exportCanvasMargins", undefined)
	})

	it("switches units and converts inches to px on input (1 in = 96 px)", () => {
		const set = mount()
		fireEvent.change(screen.getByLabelText("Units"), { target: { value: "in" } })
		expect(set).toHaveBeenCalledWith("exportMarginUnit", "in")
		cleanup()
		const inches = mount({
			...THEME,
			exportMarginUnit: "in",
			exportCanvasMargins: { bottom: 48 },
		})
		expect((screen.getByLabelText("Bottom") as HTMLInputElement).value).toBe("0.5")
		fireEvent.change(screen.getByLabelText("Right"), { target: { value: "1" } })
		expect(inches).toHaveBeenCalledWith("exportCanvasMargins", {
			bottom: 48,
			right: 96,
		})
	})
})
