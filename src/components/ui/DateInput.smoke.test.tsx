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

	it("with a date set, the Year and Month selects move it directly (same day, clamped)", () => {
		const onChange = vi.fn()
		render(<DateInput value={local(1948, 11, 31)} onChange={onChange} aria-label="min" />)
		fireEvent.click(screen.getByRole("button", { name: "Pick a date" }))
		fireEvent.change(screen.getByLabelText("Year"), { target: { value: "1949" } })
		expect(onChange).toHaveBeenLastCalledWith(local(1949, 11, 31))
		// Then Feb, in the year the picker now shows: Dec 31 clamps to Feb 28.
		fireEvent.change(screen.getByLabelText("Month"), { target: { value: "1" } })
		expect(onChange).toHaveBeenLastCalledWith(local(1949, 1, 28))
		// The picker stays open for a day click.
		expect(screen.getByRole("dialog")).toBeTruthy()
	})

	it("with the field blank, the picker opens on January and a Year choice sets Jan 1", () => {
		// The user-reported case: a blank bound, calendar icon, choose a
		// year — nothing was set until a day was clicked.
		const onChange = vi.fn()
		render(<DateInput value={null} onChange={onChange} aria-label="min" />)
		fireEvent.click(screen.getByRole("button", { name: "Pick a date" }))
		expect((screen.getByLabelText("Month") as HTMLSelectElement).value).toBe("0")
		fireEvent.change(screen.getByLabelText("Year"), { target: { value: "1949" } })
		expect(onChange).toHaveBeenLastCalledWith(local(1949, 0, 1))
		fireEvent.change(screen.getByLabelText("Month"), { target: { value: "6" } })
		expect(onChange).toHaveBeenLastCalledWith(local(1949, 6, 1))
		fireEvent.click(screen.getByRole("button", { name: "1949-07-15" }))
		expect(onChange).toHaveBeenLastCalledWith(local(1949, 6, 15))
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
