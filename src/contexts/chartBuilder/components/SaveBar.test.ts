import { describe, expect, it } from "vitest"
import { saveIndicatorText } from "./SaveBar"

const NOW = new Date(2026, 9, 20, 15, 0).getTime()
const at = (h: number, m: number, day = 20, year = 2026) =>
	new Date(year, 9, day, h, m).getTime()
const time = (ts: number) =>
	new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })

describe("saveIndicatorText", () => {
	const nancy = { id: "n", name: "Nancy Organ" }

	it("names the saver by first name, with the time for a save today", () => {
		const ts = at(9, 25)
		expect(saveIndicatorText(false, { updatedAt: ts, updatedBy: nancy }, NOW)).toBe(
			`Saved by Nancy at ${time(ts)}`
		)
	})

	it("says the day, not the time, for an older save", () => {
		const ts = at(9, 25, 14)
		const day = new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" })
		expect(saveIndicatorText(false, { updatedAt: ts, updatedBy: nancy }, NOW)).toBe(
			`Saved by Nancy on ${day}`
		)
	})

	it("keeps the anonymous form when nobody is named", () => {
		const ts = at(9, 25)
		expect(saveIndicatorText(false, { updatedAt: ts }, NOW)).toBe(`Saved · ${time(ts)}`)
	})

	it("shows Saving… mid-save and nothing for an unsaved draft", () => {
		expect(saveIndicatorText(true, undefined, NOW)).toBe("Saving…")
		expect(saveIndicatorText(false, undefined, NOW)).toBeNull()
	})
})
