import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { LIGHT_THEME_BASE } from "../../../chartBuilder/lib/systemThemes"
import type { Theme } from "../../../chartBuilder/lib/types"
import { TestProvider } from "../../../../testSupport/TestProvider"

import { TextSection } from "./TextSection"
import type { ThemeSetter } from "./types"

afterEach(cleanup)

const THEME: Theme = LIGHT_THEME_BASE

const mount = (theme: Theme = THEME) => {
	const set = vi.fn() as unknown as ThemeSetter
	render(
		<TestProvider>
			<TextSection theme={theme} set={set} isReadOnly={false} />
		</TestProvider>
	)
	// The section group starts collapsed; open it like the user would.
	fireEvent.click(screen.getByRole("button", { name: /^Text/, expanded: false }))
	return set as unknown as ReturnType<typeof vi.fn>
}

/** The rows of one titled Section (its heading's sibling block). */
const section = (title: string) => {
	const heading = screen.getByRole("heading", { name: title })
	const parent = heading.parentElement
	if (!parent) throw new Error(`no section ${title}`)
	return within(parent)
}

const pressed = (el: HTMLElement) => el.getAttribute("aria-pressed") === "true"

describe("TextSection — legend text style", () => {
	it("unset follows the Axis text italic / underline", () => {
		mount({ ...THEME, textFontItalic: true, textFontUnderline: false })
		const legend = section("Legend text")
		// Two Style rows here (titles, labels); the labels' row is the last.
		const italics = legend.getAllByRole("button", { name: "Italic" })
		const underlines = legend.getAllByRole("button", { name: "Underline" })
		expect(pressed(italics[italics.length - 1]!)).toBe(true)
		expect(pressed(underlines[underlines.length - 1]!)).toBe(false)
	})

	it("writes legendTextFontItalic / legendTextFontUnderline", () => {
		const set = mount()
		const legend = section("Legend text")
		const italics = legend.getAllByRole("button", { name: "Italic" })
		const underlines = legend.getAllByRole("button", { name: "Underline" })
		fireEvent.click(italics[italics.length - 1]!)
		expect(set).toHaveBeenCalledWith("legendTextFontItalic", true)
		fireEvent.click(underlines[underlines.length - 1]!)
		expect(set).toHaveBeenCalledWith("legendTextFontUnderline", true)
	})
})

describe("TextSection — caption style + box", () => {
	it("caption Style writes captionItalic / captionUnderline", () => {
		const set = mount()
		const caption = section("Caption")
		fireEvent.click(caption.getByRole("button", { name: "Italic" }))
		expect(set).toHaveBeenCalledWith("captionItalic", true)
		fireEvent.click(caption.getByRole("button", { name: "Underline" }))
		expect(set).toHaveBeenCalledWith("captionUnderline", true)
	})

	it("shows the built-in box while the theme sets none, border rows hidden", () => {
		mount()
		const box = section("Caption box")
		expect((box.getByLabelText("Padding") as HTMLInputElement).value).toBe("8")
		expect((box.getByLabelText("Background opacity") as HTMLInputElement).value).toBe("0")
		expect((box.getByLabelText("Corner radius") as HTMLInputElement).value).toBe("6")
		expect((box.getByLabelText("Border") as HTMLInputElement).checked).toBe(false)
		expect(box.queryByLabelText("Border thickness")).toBeNull()
	})

	it("each box control writes its key", () => {
		const set = mount({ ...THEME, captionBorderEnabled: true })
		const box = section("Caption box")
		fireEvent.change(box.getByLabelText("Padding"), { target: { value: "12" } })
		expect(set).toHaveBeenCalledWith("captionPadding", 12)
		fireEvent.change(box.getByLabelText("Background color hex"), {
			target: { value: "#eeeeee" },
		})
		expect(set).toHaveBeenCalledWith("captionBackgroundColor", "#EEEEEE")
		fireEvent.change(box.getByLabelText("Background opacity"), {
			target: { value: "0.5" },
		})
		expect(set).toHaveBeenCalledWith("captionBackgroundOpacity", 0.5)
		fireEvent.change(box.getByLabelText("Corner radius"), { target: { value: "0" } })
		expect(set).toHaveBeenCalledWith("captionBorderRadius", 0)
		fireEvent.click(box.getByLabelText("Border"))
		expect(set).toHaveBeenCalledWith("captionBorderEnabled", false)
		fireEvent.change(box.getByLabelText("Border color hex"), {
			target: { value: "#123456" },
		})
		expect(set).toHaveBeenCalledWith("captionBorderColor", "#123456")
		fireEvent.change(box.getByLabelText("Border thickness"), {
			target: { value: "2" },
		})
		expect(set).toHaveBeenCalledWith("captionBorderWidth", 2)
	})
})
