import type { ComponentProps } from "react"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { installInMemoryLocalStorage } from "../../../testSupport/localStorageShim"
import { TestProvider, type TestStore } from "../../../testSupport/TestProvider"
import {
	SYSTEM_DARK_THEME,
	SYSTEM_LIGHT_THEME,
} from "../../chartBuilder/lib/systemThemes"
import type { SavedTheme } from "../../chartBuilder/lib/types"
import {
	themesAtom,
	unlockedThemeIdAtom,
	userDefaultThemeIdAtom,
} from "../../chartBuilder/store/atoms"

import { ThemesPage, type NavigationGuard } from "./ThemesPage"

/** Smoke coverage for the theme editor: a managed theme is locked until
 *  the administrator dialog is answered, the two bundled themes can't be
 *  deleted even once unlocked, a custom theme is unaffected by any of it —
 *  and every edit stays a draft until Done, with a dialog in the way of
 *  leaving otherwise. */

afterEach(cleanup)

const MINE: SavedTheme = {
	...SYSTEM_LIGHT_THEME,
	id: "th-mine",
	name: "My theme",
	isSystem: false,
	managed: false,
}

/** A user theme that was PROMOTED into Managed Themes — managed, but not
 *  one of the two read-only bundled themes. */
const SHARED: SavedTheme = {
	...SYSTEM_LIGHT_THEME,
	id: "th-shared",
	name: "Team theme",
	isSystem: false,
	managed: true,
}

const mount = (
	editingId: string,
	unlockedId: string | null = null,
	defaultThemeId = SYSTEM_LIGHT_THEME.id,
	props: Partial<
		Pick<ComponentProps<typeof ThemesPage>, "onDone" | "blockNavigation">
	> = {}
) => {
	installInMemoryLocalStorage()
	let store: TestStore | null = null
	const onDeleted = vi.fn()
	const view = render(
		<TestProvider
			initializeState={(s) => {
				s.set(themesAtom, [
					SYSTEM_LIGHT_THEME,
					SYSTEM_DARK_THEME,
					SHARED,
					MINE,
				])
				s.set(unlockedThemeIdAtom, unlockedId)
				s.set(userDefaultThemeIdAtom, defaultThemeId)
				store = s
			}}
		>
			<ThemesPage themeId={editingId} onDeleted={onDeleted} {...props} />
		</TestProvider>
	)
	return { ...view, store: store as unknown as TestStore, onDeleted }
}

const nameInput = () =>
	screen.getByLabelText("Theme name") as HTMLInputElement

const defaultToggle = () =>
	screen.queryByText(/Make this the default theme/i)

const rename = (name: string) =>
	fireEvent.change(nameInput(), { target: { value: name } })

/** The editor's groups start folded; a control is only in the DOM once its
 *  group is open. */
const openGroup = (title: string) =>
	fireEvent.click(screen.getByRole("button", { name: title }))

/** The library's copy — what Done writes and nothing else does. */
const libraryName = (store: TestStore, id = "th-mine") =>
	store.get(themesAtom).find((t) => t.id === id)?.name

/** Stands in for the route's guard registry (`ThemeEditorPage` wires the
 *  real one to the router's history): keeps the guard the editor registers
 *  so a test can play a navigation attempt into it. */
const guardRegistry = () => {
	const slot: { guard: NavigationGuard | null } = { guard: null }
	const blockNavigation = (guard: NavigationGuard) => {
		slot.guard = guard
		return () => {
			if (slot.guard === guard) slot.guard = null
		}
	}
	/** A navigation attempt, as the router would make it: the guard's
	 *  answer, `true` to let it through. */
	const ask = (guard: NavigationGuard | null): Promise<boolean> => {
		if (!guard) throw new Error("no navigation guard is registered")
		let answer: boolean | Promise<boolean> = false
		act(() => {
			answer = guard()
		})
		return Promise.resolve(answer)
	}
	return {
		blockNavigation,
		registered: () => slot.guard !== null,
		current: () => slot.guard,
		tryLeave: () => ask(slot.guard),
		ask,
	}
}

describe("ThemesPage managed themes", () => {
	it("locks a promoted managed theme until the dialog is answered", () => {
		const { store } = mount("th-shared")
		expect(nameInput().disabled).toBe(true)

		fireEvent.click(screen.getByText("unlock it to edit"))
		fireEvent.click(screen.getByText("Yes, proceed"))

		// Access is granted to THIS theme, not to managed themes at large.
		expect(store.get(unlockedThemeIdAtom)).toBe("th-shared")
		expect(nameInput().disabled).toBe(false)
	})

	it("keeps the theme locked on \"No, exit\"", () => {
		const { store } = mount("th-shared")
		fireEvent.click(screen.getByText("unlock it to edit"))
		fireEvent.click(screen.getByText("No, exit"))
		expect(store.get(unlockedThemeIdAtom)).toBeNull()
		expect(nameInput().disabled).toBe(true)
	})

	it("re-locks when a DIFFERENT managed theme was the one unlocked", () => {
		mount("th-shared", "system-dark")
		expect(nameInput().disabled).toBe(true)
	})

	it("keeps system themes read-only — no unlock is on offer", () => {
		mount("system-light")
		expect(nameInput().disabled).toBe(true)
		expect(screen.queryByText("unlock it to edit")).toBeNull()
		expect(screen.getByText(/System themes are read-only/i)).toBeTruthy()
	})

	it("keeps a system theme read-only even if it holds the unlock", () => {
		// Clicking a system theme still puts up the warning (it's managed),
		// so it can end up as the unlocked id — that must not make it
		// editable.
		mount("system-light", "system-light")
		expect(nameInput().disabled).toBe(true)
	})

	it("never offers to delete a bundled theme", () => {
		mount("system-light", "system-light")
		expect(screen.queryByText("Delete this theme")).toBeNull()
	})

	it("leaves a custom theme editable with no dialog and no badge", () => {
		mount("th-mine")
		expect(nameInput().disabled).toBe(false)
		expect(screen.queryByText("Managed")).toBeNull()
		expect(screen.getByText("Delete this theme")).toBeTruthy()
	})

	it("deletes a custom theme and hands the route back to the gallery", () => {
		const { store, onDeleted } = mount("th-mine")
		fireEvent.click(screen.getByText("Delete this theme"))
		fireEvent.click(screen.getByText("Delete theme"))
		expect(store.get(themesAtom).some((t) => t.id === "th-mine")).toBe(false)
		expect(onDeleted).toHaveBeenCalledTimes(1)
	})

	it("offers Done on every theme, locked or not, and it returns to the gallery", () => {
		const onDone = vi.fn()
		installInMemoryLocalStorage()
		render(
			<TestProvider
				initializeState={(s) => {
					s.set(themesAtom, [SYSTEM_LIGHT_THEME, MINE])
				}}
			>
				<ThemesPage themeId="system-light" onDone={onDone} />
			</TestProvider>
		)
		// A read-only theme has no Delete, but the way out is still there.
		expect(screen.queryByText("Delete this theme")).toBeNull()
		fireEvent.click(screen.getByText("Done"))
		expect(onDone).toHaveBeenCalledTimes(1)
	})

	it("shows both live previews, drawn from the theme being edited", () => {
		mount("th-mine")
		expect(screen.getByRole("img", { name: "Preview of the My theme theme" })).toBeTruthy()
		expect(
			screen.getByRole("img", {
				name: "Sampler of the My theme theme",
			})
		).toBeTruthy()
	})

	it("redraws the previews as the theme is edited — from the draft, before any save", () => {
		const { store } = mount("th-mine")
		rename("Renamed")
		openGroup("Mark")
		fireEvent.change(screen.getByLabelText("Fill color hex"), {
			target: { value: "#123456" },
		})
		const detail = screen.getByRole("img", {
			name: "Sampler of the Renamed theme",
		})
		const dots = Array.from(detail.querySelectorAll("circle")).filter(
			(c) => c.getAttribute("fill") === "#123456"
		)
		expect(dots.length).toBeGreaterThan(0)
		// The previews follow the draft; the library hasn't moved.
		expect(libraryName(store)).toBe("My theme")
	})

	it("shows a not-found notice for an id that isn't in the library", () => {
		mount("th-gone")
		expect(screen.getByText("Theme not found")).toBeTruthy()
		expect(screen.queryByLabelText("Theme name")).toBeNull()
	})
})

describe("ThemesPage default theme", () => {
	it("never offers the default toggle on a custom theme", () => {
		mount("th-mine")
		expect(defaultToggle()).toBeNull()
	})

	it("offers it on a promoted managed theme, disabled until unlocked", () => {
		mount("th-shared")
		expect(defaultToggle()).toBeTruthy()
		expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(
			true
		)

		cleanup()
		mount("th-shared", "th-shared")
		expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(
			false
		)
	})

	it("still lets a read-only system theme be made the default", () => {
		// Which theme new visualizations START from isn't an edit to the
		// theme, and system-light is the app's own fallback default.
		const { store } = mount("system-dark")
		expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(
			false
		)
		fireEvent.click(screen.getByRole("checkbox"))
		fireEvent.click(screen.getByText("Make default"))
		expect(store.get(userDefaultThemeIdAtom)).toBe("system-dark")
	})

	it("claims the slot from a promoted managed theme once unlocked", () => {
		const { store } = mount("th-shared", "th-shared")
		fireEvent.click(screen.getByRole("checkbox"))
		// Another theme holds it, so the steal is confirmed first.
		fireEvent.click(screen.getByText("Make default"))
		expect(store.get(userDefaultThemeIdAtom)).toBe("th-shared")
	})

	it("flags a custom theme that already HOLDS the default slot", () => {
		// The pre-rule state: a custom theme was made the default before
		// managed themes existed. It keeps the slot, but says so.
		mount("th-mine", null, "th-mine")
		expect(defaultToggle()).toBeNull()
		expect(
			screen.getByText(/currently the default theme for new visualizations/i)
		).toBeTruthy()
	})
})

describe("ThemesPage drafts", () => {
	it("keeps edits out of the library until Done, which saves and leaves", () => {
		const onDone = vi.fn()
		const { store } = mount("th-mine", null, SYSTEM_LIGHT_THEME.id, { onDone })
		expect(screen.queryByText("Unsaved changes")).toBeNull()

		rename("Renamed")
		expect(nameInput().value).toBe("Renamed")
		expect(libraryName(store)).toBe("My theme")
		expect(screen.getByText("Unsaved changes")).toBeTruthy()

		fireEvent.click(screen.getByText("Done"))
		expect(libraryName(store)).toBe("Renamed")
		expect(onDone).toHaveBeenCalledTimes(1)
	})

	it("saves values and name together, and keeps the entry's identity", () => {
		const onDone = vi.fn()
		const { store } = mount("th-mine", null, SYSTEM_LIGHT_THEME.id, { onDone })
		rename("Renamed")
		openGroup("Mark")
		fireEvent.change(screen.getByLabelText("Fill color hex"), {
			target: { value: "#123456" },
		})
		// A folder move from the rail while the editor is open changes the
		// stored entry's identity; the save must carry it, not undo it.
		act(() => {
			store.set(
				themesAtom,
				store
					.get(themesAtom)
					.map((t) => (t.id === "th-mine" ? { ...t, managed: true } : t))
			)
		})
		fireEvent.click(screen.getByText("Done"))
		const saved = store.get(themesAtom).find((t) => t.id === "th-mine")
		expect(saved?.name).toBe("Renamed")
		expect(saved?.defaultFill).toBe("#123456")
		expect(saved?.managed).toBe(true)
	})

	it("holds a navigation guard only while there are unsaved changes", () => {
		const guards = guardRegistry()
		mount("th-mine", null, SYSTEM_LIGHT_THEME.id, {
			blockNavigation: guards.blockNavigation,
		})
		expect(guards.registered()).toBe(false)
		rename("Renamed")
		expect(guards.registered()).toBe(true)
		// An edit undone by hand is as good as never made.
		rename("My theme")
		expect(guards.registered()).toBe(false)
		expect(screen.queryByText("Unsaved changes")).toBeNull()
	})

	it("asks before leaving — Keep editing stays, with the draft intact", async () => {
		const guards = guardRegistry()
		const { store } = mount("th-mine", null, SYSTEM_LIGHT_THEME.id, {
			blockNavigation: guards.blockNavigation,
		})
		rename("Renamed")
		const attempt = guards.tryLeave()
		expect(screen.getByText("You have unsaved changes")).toBeTruthy()
		fireEvent.click(screen.getByText("Keep editing"))
		expect(await attempt).toBe(false)
		expect(screen.queryByText("You have unsaved changes")).toBeNull()
		expect(nameInput().value).toBe("Renamed")
		expect(libraryName(store)).toBe("My theme")
		// Still guarded: the next attempt asks again.
		expect(guards.registered()).toBe(true)
	})

	it("Leave without saving lets the navigation through and saves nothing", async () => {
		const guards = guardRegistry()
		const { store } = mount("th-mine", null, SYSTEM_LIGHT_THEME.id, {
			blockNavigation: guards.blockNavigation,
		})
		rename("Renamed")
		const attempt = guards.tryLeave()
		fireEvent.click(screen.getByText("Leave without saving"))
		expect(await attempt).toBe(true)
		expect(libraryName(store)).toBe("My theme")
	})

	it("Save and leave writes the draft, then lets the navigation through", async () => {
		const guards = guardRegistry()
		const { store } = mount("th-mine", null, SYSTEM_LIGHT_THEME.id, {
			blockNavigation: guards.blockNavigation,
		})
		rename("Renamed")
		const attempt = guards.tryLeave()
		fireEvent.click(screen.getByText("Save and leave"))
		expect(await attempt).toBe(true)
		expect(libraryName(store)).toBe("Renamed")
		expect(screen.queryByText("Unsaved changes")).toBeNull()
	})

	it("lets the exit after Done or a delete straight through, before any re-render", async () => {
		// The route navigates inside the same event as the save or delete,
		// while the guard registered by the previous render is still in
		// place — so it's that guard, asked right then, that must say yes.
		const guards = guardRegistry()
		const onDone = vi.fn()
		const { store, onDeleted } = mount("th-mine", null, SYSTEM_LIGHT_THEME.id, {
			blockNavigation: guards.blockNavigation,
			onDone,
		})
		rename("Renamed")
		const guard = guards.current()
		fireEvent.click(screen.getByText("Done"))
		expect(await guards.ask(guard)).toBe(true)
		expect(libraryName(store)).toBe("Renamed")

		rename("Renamed again")
		const guardBeforeDelete = guards.current()
		fireEvent.click(screen.getByText("Delete this theme"))
		fireEvent.click(screen.getByText("Delete theme"))
		expect(onDeleted).toHaveBeenCalledTimes(1)
		expect(await guards.ask(guardBeforeDelete)).toBe(true)
	})

	it("keeps an unlocked managed theme editable when the unlock moves on", () => {
		// The rail hands the unlock to the next managed theme BEFORE
		// navigating; when the leave dialog then stops that navigation, the
		// theme still on screen must not lock up under the user's edits.
		const { store } = mount("th-shared", "th-shared")
		rename("Team theme, edited")
		act(() => store.set(unlockedThemeIdAtom, "system-dark"))
		expect(nameInput().disabled).toBe(false)
		expect(nameInput().value).toBe("Team theme, edited")
	})
})
