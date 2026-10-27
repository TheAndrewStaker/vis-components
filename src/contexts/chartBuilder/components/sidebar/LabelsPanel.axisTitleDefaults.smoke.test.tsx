import { cleanup, fireEvent, render } from "@testing-library/react"
import { useAtomValue } from "jotai"
import { TestProvider, type TestStore } from "../../../../testSupport/TestProvider"
import { installInMemoryLocalStorage } from "../../../../testSupport/localStorageShim"
import { afterEach, describe, expect, it } from "vitest"
import { currentEncodingsAtom, currentLabelsAtom } from "../../store/atoms"
import { emptyEncodings } from "../../lib/types"

import { LabelsPanel } from "./LabelsPanel"

/** The axis-title boxes SHOW the mapped field name as their real value
 *  (not a placeholder) while no title is stored, so what the user reads is
 *  what the figure draws. Typing stores the text; clearing stores `""` (no
 *  title); "Reset to variable name" returns to the automatic field name. */
describe("LabelsPanel — axis-title boxes show the variable name as their value", () => {
	afterEach(cleanup)

	const initState = (snap: TestStore) => {
		const enc = emptyEncodings()
		enc.x = { field: "region" }
		enc.y = { field: "sales" }
		snap.set(currentEncodingsAtom, enc)
	}

	const AtomProbe = () => {
		const labels = useAtomValue(currentLabelsAtom)
		return (
			<div
				data-testid="probe"
				data-x-state={
					labels.xAxisTitle === undefined ? "unset" : `"${labels.xAxisTitle}"`
				}
			/>
		)
	}

	const button = (container: HTMLElement, text: string) =>
		[...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(b) => b.textContent?.trim() === text
		)
	const rowBox = (container: HTMLElement, label: string) => {
		const row = [...container.querySelectorAll("label")].find((l) =>
			l.textContent?.trim().startsWith(label)
		)
		expect(row, `row "${label}"`).toBeDefined()
		return row!.querySelector("textarea")!
	}
	const resetLink = (container: HTMLElement, label: string) =>
		container.querySelector<HTMLButtonElement>(
			`button[aria-label="Reset ${label} to variable name"]`
		)

	it("shows the field names, stores typed text, resets to the field name, and keeps an explicit clear", () => {
		installInMemoryLocalStorage()
		const { container } = render(
			<TestProvider initializeState={initState}>
				<LabelsPanel />
				<AtomProbe />
			</TestProvider>
		)
		const el = container as HTMLElement
		const probe = el.querySelector<HTMLElement>('[data-testid="probe"]')!
		fireEvent.click(button(el, "Axis titles")!)

		// Untouched: the box's VALUE is the field name, nothing is stored,
		// and there is nothing to reset.
		expect(rowBox(el, "X-axis title").value).toBe("region")
		expect(rowBox(el, "Y-axis title").value).toBe("sales")
		expect(probe.dataset.xState).toBe("unset")
		expect(resetLink(el, "X-axis title")).toBeNull()
		expect(resetLink(el, "Y-axis title")).toBeNull()

		// Typing stores the text and offers the reset.
		fireEvent.change(rowBox(el, "X-axis title"), {
			target: { value: "Sales region" },
		})
		expect(probe.dataset.xState).toBe('"Sales region"')
		expect(rowBox(el, "X-axis title").value).toBe("Sales region")
		expect(resetLink(el, "X-axis title")).not.toBeNull()
		expect(resetLink(el, "Y-axis title")).toBeNull()

		// Reset → back to the automatic field name, nothing stored.
		fireEvent.click(resetLink(el, "X-axis title")!)
		expect(probe.dataset.xState).toBe("unset")
		expect(rowBox(el, "X-axis title").value).toBe("region")
		expect(resetLink(el, "X-axis title")).toBeNull()

		// Clearing is an explicit "" (no title): the box stays empty rather
		// than snapping back, and the reset is still on offer.
		fireEvent.change(rowBox(el, "X-axis title"), { target: { value: "" } })
		expect(probe.dataset.xState).toBe('""')
		expect(rowBox(el, "X-axis title").value).toBe("")
		expect(resetLink(el, "X-axis title")).not.toBeNull()
	})
})
