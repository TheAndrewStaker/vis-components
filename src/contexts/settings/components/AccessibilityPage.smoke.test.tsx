import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { installInMemoryLocalStorage } from "../../../testSupport/localStorageShim"
import { TestProvider, type TestStore } from "../../../testSupport/TestProvider"
import { contrastAlgorithmAtom } from "../../chartBuilder/store/atoms"

import { AccessibilityPage } from "./AccessibilityPage"

/** Smoke coverage for Settings → Accessibility: the contrast-model radio
 *  defaults to APCA, a switch lands in the live atom AND in device-local
 *  storage, and a stored choice is read back on mount. */

afterEach(cleanup)

const KEY = "vis-components:contrastAlgorithm"

const radio = (name: RegExp): HTMLInputElement =>
	screen.getByRole("radio", { name }) as HTMLInputElement

const mount = () => {
	const storage = installInMemoryLocalStorage()
	let store: TestStore | null = null
	render(
		<TestProvider
			initializeState={(s) => {
				store = s
			}}
		>
			<AccessibilityPage />
		</TestProvider>
	)
	return { storage, store: store as unknown as TestStore }
}

describe("Settings → Accessibility", () => {
	it("defaults the contrast model to APCA", () => {
		mount()
		expect(radio(/^APCA/).checked).toBe(true)
		expect(radio(/^WCAG 2/).checked).toBe(false)
		expect(screen.getByText(/two levels are Lc 60/)).toBeTruthy()
	})

	it("persists a switch to WCAG 2 for this browser", () => {
		const { storage, store } = mount()
		fireEvent.click(radio(/^WCAG 2/))
		expect(radio(/^WCAG 2/).checked).toBe(true)
		expect(store.get(contrastAlgorithmAtom)).toBe("wcag2")
		expect(storage.get(KEY)).toBe('"wcag2"')
		expect(screen.getByText(/two levels are AA/)).toBeTruthy()
	})

	it("reads a stored choice back, and ignores an unknown one", () => {
		const storage = installInMemoryLocalStorage()
		storage.set(KEY, '"wcag2"')
		const { unmount } = render(
			<TestProvider>
				<AccessibilityPage />
			</TestProvider>
		)
		expect(radio(/^WCAG 2/).checked).toBe(true)
		unmount()
		storage.set(KEY, '"bogus"')
		render(
			<TestProvider>
				<AccessibilityPage />
			</TestProvider>
		)
		expect(radio(/^APCA/).checked).toBe(true)
	})
})
