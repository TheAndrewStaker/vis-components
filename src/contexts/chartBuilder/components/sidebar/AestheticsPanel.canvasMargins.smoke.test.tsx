import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { installInMemoryLocalStorage } from "../../../../testSupport/localStorageShim"
import { TestProvider, type TestStore } from "../../../../testSupport/TestProvider"
import { withCanvasMargin, type CanvasSizeConfig } from "../../lib/channelConfig"
import { SYSTEM_LIGHT_THEME } from "../../lib/systemThemes"
import type { SavedTheme } from "../../lib/types"
import {
	currentChannelConfigsAtom,
	currentRenderedCanvasSlackAtom,
	currentThemeIdAtom,
	themesAtom,
} from "../../store/atoms"

import { AestheticsPanel } from "./AestheticsPanel"

/** Aesthetics → Canvas size → Margins: the four per-side inputs appear only
 *  with a fixed canvas, store px through the canvas unit, show the theme's
 *  Exporting default (else the measured auto white space) as their
 *  placeholder, and clearing a side drops it from the sparse record. */

afterEach(cleanup)

type Slack = { top: number; right: number; bottom: number; left: number }

const mount = (
	canvasSize: CanvasSizeConfig | undefined,
	slack: Slack | null = null,
	theme: SavedTheme = SYSTEM_LIGHT_THEME
) => {
	installInMemoryLocalStorage()
	let snapshot: TestStore | undefined
	const init = (snap: TestStore) => {
		snapshot = snap
		snap.set(themesAtom, [theme])
		snap.set(currentThemeIdAtom, theme.id)
		snap.set(currentChannelConfigsAtom, {
			...snap.get(currentChannelConfigsAtom),
			canvasSize: canvasSize as CanvasSizeConfig,
		})
		snap.set(currentRenderedCanvasSlackAtom, slack)
	}
	const utils = render(
		<TestProvider initializeState={init}>
			<AestheticsPanel />
		</TestProvider>
	)
	// Subsections start collapsed; open "Canvas size" so its inputs render.
	fireEvent.click(utils.getByText("Canvas size"))
	return {
		...utils,
		margins: () => snapshot!.get(currentChannelConfigsAtom).canvasSize?.margins,
	}
}

const FIXED: CanvasSizeConfig = { enabled: true, width: 1000, height: 600 }
const SLACK: Slack = { top: 11, right: 24, bottom: 7, left: 30 }

describe("AestheticsPanel — canvas margins", () => {
	it("hides the margin inputs until a canvas size is set", () => {
		const { container } = mount(undefined)
		expect(container.querySelector("[data-canvas-margins]")).toBeNull()
	})

	it("shows Top / Right / Bottom / Left with the measured slack as placeholder", () => {
		const { container, getByLabelText } = mount(FIXED, SLACK)
		expect(container.querySelector("[data-canvas-margins]")).not.toBeNull()
		expect((getByLabelText("Top") as HTMLInputElement).placeholder).toBe("11")
		expect((getByLabelText("Right") as HTMLInputElement).placeholder).toBe("24")
		expect((getByLabelText("Bottom") as HTMLInputElement).placeholder).toBe("7")
		expect((getByLabelText("Left") as HTMLInputElement).placeholder).toBe("30")
	})

	it("falls back to an 'auto' placeholder before anything was measured", () => {
		const { getByLabelText } = mount(FIXED)
		expect((getByLabelText("Top") as HTMLInputElement).placeholder).toBe("auto")
	})

	it("stores a typed margin in px and clears it back to auto", () => {
		const { getByLabelText, margins } = mount(FIXED)
		const top = getByLabelText("Top") as HTMLInputElement
		fireEvent.change(top, { target: { value: "20" } })
		expect(margins()).toEqual({ top: 20 })
		fireEvent.change(getByLabelText("Bottom"), { target: { value: "0" } })
		expect(margins()).toEqual({ top: 20, bottom: 0 })
		fireEvent.change(top, { target: { value: "" } })
		expect(margins()).toEqual({ bottom: 0 })
		fireEvent.change(getByLabelText("Bottom"), { target: { value: "" } })
		expect(margins()).toBeUndefined()
	})

	it("converts through the canvas unit (1 in → 96 px) and displays back in it", () => {
		const { getByLabelText, margins } = mount({
			...FIXED,
			unit: "in",
			margins: { left: 48 },
		})
		const left = getByLabelText("Left") as HTMLInputElement
		expect(left.value).toBe("0.5")
		fireEvent.change(getByLabelText("Right"), { target: { value: "1" } })
		expect(margins()).toEqual({ left: 48, right: 96 })
	})

	it("a blank side shows the theme's Exporting default over the measured slack", () => {
		const themed: SavedTheme = {
			...SYSTEM_LIGHT_THEME,
			exportCanvasMargins: { top: 24, bottom: 0 },
		}
		const { getByLabelText } = mount(
			{ ...FIXED, unit: "in", margins: { left: 96 } },
			SLACK,
			themed
		)
		// Theme-backed sides show the theme value in the CANVAS unit; sides the
		// theme leaves blank fall back to the measured slack; a side the visual
		// sets shows its own value.
		expect((getByLabelText("Top") as HTMLInputElement).placeholder).toBe("0.25")
		expect((getByLabelText("Bottom") as HTMLInputElement).placeholder).toBe("0")
		expect((getByLabelText("Right") as HTMLInputElement).placeholder).toBe("0.25")
		expect((getByLabelText("Left") as HTMLInputElement).value).toBe("1")
	})

	it("withCanvasMargin keeps the record sparse", () => {
		expect(withCanvasMargin(undefined, "top", 5)).toEqual({ top: 5 })
		expect(withCanvasMargin({ top: 5 }, "top", null)).toBeUndefined()
		expect(withCanvasMargin({ top: 5, left: 0 }, "top", null)).toEqual({ left: 0 })
	})
})
