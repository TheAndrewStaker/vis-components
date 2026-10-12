import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

afterEach(cleanup)

import { DateInput } from "./DateInput"

const local = (y: number, m: number, d: number) => new Date(y, m, d).getTime()

describe("DateInput", () => {
	it("shows the stored value as YYYY-MM-DD and commits typed dates at local midnight", () => {
		const onChange = vi.fn()
		render(<DateInput value={local(1949, 0, 1)} onChange={onChange} aria-label="min" />)
		const box = screen.getByLabelText("min") as HTMLInputElement
		expect(box.value).toBe("1949-01-01")
		fireEvent.change(box, { target: { value: "2019-01-01" } })
		fireEvent.keyDown(box, { key: "Enter" })
		expect(onChange).toHaveBeenCalledWith(local(2019, 0, 1))
	})

	it("blank commits null; junk reverts to the stored value", () => {
		const onChange = vi.fn()
		render(<DateInput value={local(1949, 0, 1)} onChange={onChange} aria-label="min" />)
		const box = screen.getByLabelText("min") as HTMLInputElement
		fireEvent.change(box, { target: { value: "" } })
		fireEvent.blur(box)
		expect(onChange).toHaveBeenCalledWith(null)
		fireEvent.change(box, { target: { value: "nonsense" } })
		fireEvent.blur(box)
		expect(box.value).toBe("1949-01-01")
		expect(onChange).toHaveBeenCalledTimes(1)
	})

	it("picker: separate Month and Year selects, one click on a day commits and closes", () => {
		const onChange = vi.fn()
		render(<DateInput value={local(1949, 0, 1)} onChange={onChange} aria-label="max" />)
		fireEvent.click(screen.getByRole("button", { name: "Pick a date" }))
		const dialog = screen.getByRole("dialog", { name: "Choose a date" })
		expect(dialog).toBeTruthy()
		fireEvent.change(screen.getByLabelText("Year"), { target: { value: "2019" } })
		fireEvent.change(screen.getByLabelText("Month"), { target: { value: "1" } })
		fireEvent.click(screen.getByRole("button", { name: "2019-02-14" }))
		expect(onChange).toHaveBeenCalledWith(local(2019, 1, 14))
		expect(screen.queryByRole("dialog")).toBeNull()
	})

	it("year options are one entry per year, not Month + Year pairs", () => {
		render(<DateInput value={null} onChange={() => {}} aria-label="max" />)
		fireEvent.click(screen.getByRole("button", { name: "Pick a date" }))
		const year = screen.getByLabelText("Year") as HTMLSelectElement
		const month = screen.getByLabelText("Month") as HTMLSelectElement
		expect(month.options.length).toBe(12)
		expect([...year.options].map((o) => o.value)).toContain("1947")
		expect([...year.options].every((o) => /^\d{4}$/.test(o.value))).toBe(true)
	})

	it("Escape closes the picker", () => {
		render(<DateInput value={null} onChange={() => {}} aria-label="max" />)
		fireEvent.click(screen.getByRole("button", { name: "Pick a date" }))
		fireEvent.keyDown(screen.getByLabelText("Year"), { key: "Escape" })
		expect(screen.queryByRole("dialog")).toBeNull()
	})
})
