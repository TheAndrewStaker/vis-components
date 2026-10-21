import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { afterEach, describe, expect, it } from "vitest"

import { Modal } from "./Modal"

afterEach(() => {
	cleanup()
	delete document.documentElement.dataset.vcModality
})

const nextFrame = () =>
	new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))

const Harness = ({ title }: { title?: string }) => {
	const [open, setOpen] = useState(false)
	return (
		<>
			<button type="button" onClick={() => setOpen(true)}>
				Open
			</button>
			<Modal
				open={open}
				onClose={() => setOpen(false)}
				title={title}
				aria-label={title ? undefined : "Unnamed dialog"}
			>
				<button type="button">First</button>
				<button type="button" onClick={() => setOpen(false)}>
					Last
				</button>
			</Modal>
		</>
	)
}

describe("Modal accessibility", () => {
	it("is named by its title", () => {
		render(<Harness title="Export this visualization" />)
		fireEvent.click(screen.getByText("Open"))
		expect(
			screen.getByRole("dialog", { name: "Export this visualization" })
		).toBeTruthy()
	})

	it("takes an aria-label when there's no title", () => {
		render(<Harness />)
		fireEvent.click(screen.getByText("Open"))
		expect(screen.getByRole("dialog", { name: "Unnamed dialog" })).toBeTruthy()
	})

	it("focuses the panel for a pointer user, the first control for a keyboard user", async () => {
		render(<Harness title="T" />)
		fireEvent.click(screen.getByText("Open"))
		await nextFrame()
		expect(document.activeElement).toBe(screen.getByRole("dialog"))
		fireEvent.click(screen.getByText("Last"))

		document.documentElement.dataset.vcModality = "keyboard"
		fireEvent.click(screen.getByText("Open"))
		await nextFrame()
		expect(document.activeElement).toBe(screen.getByText("First"))
	})

	it("traps Tab inside the panel and restores focus on close", async () => {
		render(<Harness title="T" />)
		const opener = screen.getByText("Open")
		opener.focus()
		fireEvent.click(opener)
		await nextFrame()
		const last = screen.getByText("Last")
		last.focus()
		fireEvent.keyDown(last, { key: "Tab" })
		expect(document.activeElement).toBe(screen.getByText("First"))
		fireEvent.keyDown(screen.getByText("First"), { key: "Tab", shiftKey: true })
		expect(document.activeElement).toBe(last)
		fireEvent.click(last)
		expect(document.activeElement).toBe(opener)
	})
})
