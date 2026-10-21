import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
	TestProvider,
	type TestStore,
} from "../../../../testSupport/TestProvider"
import { installInMemoryLocalStorage } from "../../../../testSupport/localStorageShim"
import {
	currentAccessibilityConfigAtom,
	currentLabelsAtom,
	currentVisualNameAtom,
} from "../../store/atoms"

import { AccessibilityPanel } from "./AccessibilityPanel"

afterEach(cleanup)

const mount = (description: string | null = null) => {
	installInMemoryLocalStorage()
	const captured: { store?: TestStore } = {}
	const utils = render(
		<TestProvider
			initializeState={(s) => {
				captured.store = s
				s.set(currentVisualNameAtom, "My chart")
				s.set(currentLabelsAtom, {
					...s.get(currentLabelsAtom),
					title: "Sales by region",
					subtitle: "2024",
				})
				s.set(currentAccessibilityConfigAtom, { description })
			}}
		>
			<AccessibilityPanel />
		</TestProvider>
	)
	const box = () =>
		utils.getByLabelText("Description") as HTMLTextAreaElement
	return { ...utils, store: captured.store!, box }
}

describe("AccessibilityPanel", () => {
	it("shows the title-derived description as the box's value, with no reset", () => {
		const utils = mount()
		expect(utils.box().value).toBe("Sales by region. 2024.")
		expect(utils.queryByRole("button", { name: "Reset to title" })).toBeNull()
		expect(utils.getByText(/Read aloud by screen readers/)).toBeTruthy()
		expect(utils.getByText(/Accessibility check \(header button\)/)).toBeTruthy()
	})

	it("follows title edits live while not overridden", () => {
		const utils = mount()
		act(() =>
			utils.store.set(currentLabelsAtom, {
				...utils.store.get(currentLabelsAtom),
				title: "Revenue",
			})
		)
		expect(utils.box().value).toBe("Revenue. 2024.")
		expect(utils.store.get(currentAccessibilityConfigAtom).description).toBeNull()
	})

	it("stores an override on typing, marks it changed, and resets to null", () => {
		const utils = mount()
		fireEvent.change(utils.box(), { target: { value: "East leads." } })
		expect(utils.store.get(currentAccessibilityConfigAtom).description).toBe(
			"East leads."
		)
		const label = utils.getByText("Description")
		expect(label.className).toContain("font-semibold")
		// An override no longer follows the title.
		act(() =>
			utils.store.set(currentLabelsAtom, {
				...utils.store.get(currentLabelsAtom),
				title: "Revenue",
			})
		)
		expect(utils.box().value).toBe("East leads.")
		fireEvent.click(utils.getByRole("button", { name: "Reset to title" }))
		expect(utils.store.get(currentAccessibilityConfigAtom).description).toBeNull()
		expect(utils.box().value).toBe("Revenue. 2024.")
		expect(utils.queryByRole("button", { name: "Reset to title" })).toBeNull()
	})

	it("explains the visual-name fallback only when cleared to empty", () => {
		const utils = mount()
		expect(utils.queryByText(/hear the visual’s name/)).toBeNull()
		fireEvent.change(utils.box(), { target: { value: "" } })
		expect(utils.store.get(currentAccessibilityConfigAtom).description).toBe("")
		expect(utils.box().value).toBe("")
		expect(utils.getByText(/hear the visual’s name/)).toBeTruthy()
	})
})
