import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { TestProvider, type TestStore } from "../../../testSupport/TestProvider"
import type { EmbedInstance } from "../lib/types"
import {
	currentVisualIdAtom,
	embedInstancesAtom,
	publishedEditAckAtom,
	publishedEditSnoozeUntilAtom,
	republishOnSaveVisualsAtom,
} from "../store/atoms"
import { PublishedEditGate } from "./PublishedEditGate"

// The gate's "Go back" is the only router touch; stubbing beats standing up a
// RouterProvider for a dialog assertion.
const navigate = vi.fn()
vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => navigate,
}))

/** Opening a published visual has to say so before the user starts editing:
 *  the editor autosaves and a republish pushes whatever is here into content
 *  that's already embedded elsewhere. "Not published" covers both a
 *  never-published visual and a copied-snippet instance whose urls are dead
 *  under the publish contract — neither warrants a warning. */

const instance = (extra: Partial<EmbedInstance> = {}): EmbedInstance => ({
	id: "ei-1",
	visualId: "dv-1",
	versionId: null,
	createdAt: 1,
	lastExportedAt: 1,
	...extra,
})

const renderGate = (instances: EmbedInstance[]) => {
	const seed = (store: TestStore) => {
		store.set(currentVisualIdAtom, "dv-1")
		store.set(
			embedInstancesAtom,
			Object.fromEntries(instances.map((i) => [i.id, i]))
		)
	}
	return render(
		<TestProvider initializeState={seed}>
			<PublishedEditGate />
		</TestProvider>
	)
}

const published = instance({
	publishId: "pub-1",
	publishedAt: 2,
	publishedParts: ["full"],
	publishedUrls: { full: "https://example.test/embeds/pub-1/index.html" },
	publishedVersionId: null,
})

describe("published-visual edit gate", () => {
	afterEach(() => {
		navigate.mockReset()
		cleanup()
	})

	it("warns on a published visual and stays put on acknowledgement", () => {
		renderGate([published])

		const dialog = screen.getByRole("dialog")
		expect(dialog.textContent).toContain(
			"This visual is already embedded. Edits you make here will affect published content."
		)

		fireEvent.click(screen.getByText("Just once!"))
		expect(screen.queryByRole("dialog")).toBeNull()
		expect(navigate).not.toHaveBeenCalled()
	})

	it("adds the republish-on-save sentence only when this user set the visual to it", () => {
		const LIVE_SENTENCE =
			"You've set it to republish on every save, so your edits reach embedded pages and decks as you make them."
		renderGate([published])
		expect(screen.getByRole("dialog").textContent).not.toContain(LIVE_SENTENCE)
		cleanup()
		render(
			<TestProvider
				initializeState={(store) => {
					store.set(currentVisualIdAtom, "dv-1")
					store.set(embedInstancesAtom, { [published.id]: published })
					store.set(republishOnSaveVisualsAtom, { "dv-1": true })
				}}
			>
				<PublishedEditGate />
			</TestProvider>
		)
		expect(screen.getByRole("dialog").textContent).toContain(LIVE_SENTENCE)
	})

	it("sends the user back to the library on Go back", () => {
		renderGate([published])
		fireEvent.click(screen.getByText("Go back"))
		expect(navigate).toHaveBeenCalledWith({ to: "/" })
	})

	it("stays quiet for an instance that was never published", () => {
		renderGate([instance()])
		expect(screen.queryByRole("dialog")).toBeNull()
	})

	it("stays quiet once the visual is acknowledged (a publish from here)", () => {
		render(
			<TestProvider
				initializeState={(store) => {
					store.set(currentVisualIdAtom, "dv-1")
					store.set(embedInstancesAtom, { [published.id]: published })
					store.set(publishedEditAckAtom, "dv-1")
				}}
			>
				<PublishedEditGate />
			</TestProvider>
		)
		expect(screen.queryByRole("dialog")).toBeNull()
	})

	it("stays quiet for an hour after Remind me in an hour", () => {
		let store: TestStore | undefined
		render(
			<TestProvider
				initializeState={(s) => {
					store = s
					s.set(currentVisualIdAtom, "dv-1")
					s.set(embedInstancesAtom, { [published.id]: published })
				}}
			>
				<PublishedEditGate />
			</TestProvider>
		)
		const before = Date.now()
		fireEvent.click(screen.getByText("Remind me in an hour"))
		expect(screen.queryByRole("dialog")).toBeNull()
		expect(navigate).not.toHaveBeenCalled()
		const until = store!.get(publishedEditSnoozeUntilAtom)
		expect(until).toBeGreaterThanOrEqual(before + 60 * 60 * 1000)
		expect(until).toBeLessThanOrEqual(Date.now() + 60 * 60 * 1000)
	})

	it("stays quiet on a fresh entry while a snooze is running, and warns again once it lapses", () => {
		const gate = (until: number) =>
			render(
				<TestProvider
					initializeState={(s) => {
						s.set(currentVisualIdAtom, "dv-1")
						s.set(embedInstancesAtom, { [published.id]: published })
						s.set(publishedEditSnoozeUntilAtom, until)
					}}
				>
					<PublishedEditGate />
				</TestProvider>
			)
		gate(Date.now() + 10 * 60 * 1000)
		expect(screen.queryByRole("dialog")).toBeNull()
		cleanup()
		gate(Date.now() - 1)
		expect(screen.getByRole("dialog")).toBeTruthy()
	})
})
