import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { TestProvider, type TestStore } from "../../../../testSupport/TestProvider"
import { DEFAULT_CAPTION_CONFIG, type CaptionConfig } from "../../lib/captionConfig"
import { currentCaptionConfigAtom } from "../../store/atoms"
import {
	CaptionOverlay,
	measureCaptionBox,
	positionCaptionBox,
} from "../viz/plotCanvas/captionLayout"
import { CaptionPanel } from "./CaptionPanel"

/** Caption panel layout: Text = Align + the shared FontEditor rows (Family ·
 *  Color · Size · Weight · Style), Box = Background · Opacity · Corner radius
 *  · Padding · Border…; the Style buttons write `italic` / `underline`, which
 *  the SVG overlay draws. */

let store: TestStore | null = null
const caption = () => store?.get(currentCaptionConfigAtom)

const mount = () =>
	render(
		<TestProvider
			initializeState={(s) => {
				store = s
				s.set(currentCaptionConfigAtom, {
					...DEFAULT_CAPTION_CONFIG,
					enabled: true,
					text: "Source: a survey",
				})
			}}
		>
			<CaptionPanel />
		</TestProvider>
	)

afterEach(() => {
	cleanup()
	store = null
})

describe("CaptionPanel", () => {
	it("Text holds Align + font rows; Padding lives in Box", () => {
		mount()
		fireEvent.click(screen.getByRole("button", { name: "Text" }))
		for (const label of ["Family", "Size", "Weight"]) {
			expect(screen.getByLabelText(label, { selector: "input, select" })).toBeTruthy()
		}
		// Color is a swatch button (it opens the picker popover), not a field.
		expect(
			screen.getByLabelText("Color", { selector: "button[data-color]" })
		).toBeTruthy()
		expect(screen.getByText("Align")).toBeTruthy()
		expect(screen.getByRole("button", { name: "Italic" })).toBeTruthy()
		expect(screen.queryByLabelText("Padding")).toBeNull()
		fireEvent.click(screen.getByRole("button", { name: "Box" }))
		expect(screen.getByLabelText("Padding")).toBeTruthy()
	})

	it("Italic / Underline write the caption's italic / underline", () => {
		mount()
		fireEvent.click(screen.getByRole("button", { name: "Text" }))
		fireEvent.click(screen.getByRole("button", { name: "Italic" }))
		expect(caption()?.italic).toBe(true)
		fireEvent.click(screen.getByRole("button", { name: "Underline" }))
		expect(caption()?.underline).toBe(true)
		expect(caption()?.italic).toBe(true)
	})
})

describe("CaptionOverlay", () => {
	const draw = (over: Partial<CaptionConfig>) => {
		const cfg = { ...DEFAULT_CAPTION_CONFIG, text: "Caption", ...over }
		const box = measureCaptionBox(cfg, 900, 600)
		if (!box) throw new Error("caption should measure")
		const layout = positionCaptionBox(cfg, box, 900, 600)
		const { container } = render(
			<svg>
				<CaptionOverlay caption={cfg} layout={layout} />
			</svg>
		)
		return container.querySelector("[data-caption] text")!
	}

	it("draws italic / underlined text when set", () => {
		const text = draw({ italic: true, underline: true })
		expect(text.getAttribute("font-style")).toBe("italic")
		expect(text.getAttribute("text-decoration")).toBe("underline")
	})

	it("draws upright, undecorated text when the fields are absent", () => {
		const text = draw({})
		expect(text.getAttribute("font-style")).toBeNull()
		expect(text.getAttribute("text-decoration")).toBeNull()
	})
})
