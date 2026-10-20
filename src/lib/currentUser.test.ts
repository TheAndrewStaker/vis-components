import { describe, expect, it } from "vitest"
import { firstName, initials, parseAppUser } from "./currentUser"

describe("display names", () => {
	it("takes the first name for 'Saved by …'", () => {
		expect(firstName("Nancy Organ")).toBe("Nancy")
		expect(firstName("Cher")).toBe("Cher")
		expect(firstName("jane.doe@example.com")).toBe("Jane")
	})

	it("makes first+last initials", () => {
		expect(initials("Jane Doe")).toBe("JD")
		expect(initials("Nancy Organ")).toBe("NO")
		expect(initials("Mary Ann van Dyke")).toBe("MD")
		expect(initials("Cher")).toBe("C")
		expect(initials("jane.doe@example.com")).toBe("JD")
		expect(initials("  ")).toBe("?")
	})
})

describe("parseAppUser", () => {
	it("needs a string id and falls back to it for the name", () => {
		expect(parseAppUser({ id: "j", name: "Jane" })).toEqual({ id: "j", name: "Jane" })
		expect(parseAppUser({ id: "j" })).toEqual({ id: "j", name: "j" })
		expect(parseAppUser({ name: "Jane" })).toBeNull()
		expect(parseAppUser("Jane")).toBeNull()
	})
})
