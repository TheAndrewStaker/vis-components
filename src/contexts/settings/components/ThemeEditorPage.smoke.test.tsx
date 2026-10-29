import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { installInMemoryLocalStorage } from "../../../testSupport/localStorageShim"
import { TestProvider, type TestStore } from "../../../testSupport/TestProvider"
import { SYSTEM_LIGHT_THEME } from "../../chartBuilder/lib/systemThemes"
import type { SavedTheme } from "../../chartBuilder/lib/types"
import { themesAtom } from "../../chartBuilder/store/atoms"

import { ThemeEditorPage } from "./ThemeEditorPage"

/** The route page's one job beyond rendering the editor: wiring its
 *  unsaved-changes guard into the router's history, and taking Done back
 *  to the gallery. The router is stubbed down to what the page touches. */

type Guard = () => boolean | Promise<boolean>
const navigate = vi.fn()
const unblock = vi.fn()
const block = vi.fn((_guard: Guard) => unblock)
// One stable history object: the page memoizes its registrar on it, the way
// it would on the router's real, stable history.
const history = { block }
vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => navigate,
	useParams: () => ({ themeId: "th-mine" }),
	useRouter: () => ({ history }),
	Link: ({
		to,
		className,
		children,
	}: {
		to: string
		className?: string
		children: React.ReactNode
	}) => (
		<a href={to} className={className}>
			{children}
		</a>
	),
}))

afterEach(cleanup)
beforeEach(() => {
	navigate.mockClear()
	block.mockClear()
	unblock.mockClear()
})

const MINE: SavedTheme = {
	...SYSTEM_LIGHT_THEME,
	id: "th-mine",
	name: "My theme",
	isSystem: false,
	managed: false,
}

const mount = () => {
	installInMemoryLocalStorage()
	let store: TestStore | null = null
	render(
		<TestProvider
			initializeState={(s) => {
				s.set(themesAtom, [SYSTEM_LIGHT_THEME, MINE])
				store = s
			}}
		>
			<ThemeEditorPage />
		</TestProvider>
	)
	return { store: store as unknown as TestStore }
}

const nameInput = () =>
	screen.getByLabelText("Theme name") as HTMLInputElement
const rename = (name: string) =>
	fireEvent.change(nameInput(), { target: { value: name } })
const libraryName = (store: TestStore) =>
	store.get(themesAtom).find((t) => t.id === "th-mine")?.name

describe("ThemeEditorPage", () => {
	it("registers the editor's guard with the router's history once there are edits", async () => {
		const { store } = mount()
		expect(block).not.toHaveBeenCalled()

		rename("Renamed")
		expect(block).toHaveBeenCalledTimes(1)
		const guard = block.mock.calls[0][0]

		// A navigation — a rail click, the "All themes" link — asks the guard,
		// and the dialog answers it.
		let attempt: boolean | Promise<boolean> = false
		act(() => {
			attempt = guard()
		})
		expect(screen.getByText("You have unsaved changes")).toBeTruthy()
		fireEvent.click(screen.getByText("Save and leave"))
		expect(await attempt).toBe(true)
		expect(libraryName(store)).toBe("Renamed")
		// Nothing left to guard.
		expect(unblock).toHaveBeenCalled()
	})

	it("takes Done back to the gallery with the draft saved", () => {
		const { store } = mount()
		rename("Renamed")
		fireEvent.click(screen.getByText("Done"))
		expect(libraryName(store)).toBe("Renamed")
		expect(navigate).toHaveBeenCalledWith({ to: "/settings/themes" })
	})
})
