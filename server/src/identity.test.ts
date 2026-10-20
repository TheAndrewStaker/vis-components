// @vitest-environment node
import { describe, expect, it } from "vitest"
import { requestUser, sanitizeUser, stampSaver } from "./identity.js"
import type { IncomingMessage } from "node:http"

const JANE = { id: "jane", name: "Jane Doe" }
const NANCY = { id: "nancy", name: "Nancy Organ" }
const req = {} as IncomingMessage

describe("sanitizeUser", () => {
	it("trims, falls back to the id for a blank name, and needs an id", () => {
		expect(sanitizeUser({ id: " jane ", name: " Jane Doe " })).toEqual(JANE)
		expect(sanitizeUser({ id: "jane", name: "  " })).toEqual({ id: "jane", name: "jane" })
		expect(sanitizeUser({ id: "", name: "Jane" })).toBeNull()
		expect(sanitizeUser(null)).toBeNull()
		expect(sanitizeUser("jane")).toBeNull()
	})

	it("caps runaway lengths", () => {
		const user = sanitizeUser({ id: "x".repeat(1000), name: "y".repeat(1000) })
		expect(user?.id.length).toBe(256)
		expect(user?.name.length).toBe(120)
	})
})

describe("requestUser", () => {
	it("is null without a hook, and when the hook throws", () => {
		expect(requestUser(undefined, req)).toBeNull()
		expect(
			requestUser(() => {
				throw new Error("down")
			}, req)
		).toBeNull()
		expect(requestUser(() => JANE, req)).toEqual(JANE)
	})
})

describe("stampSaver", () => {
	it("passes through a body that leaves updatedBy as stored", () => {
		expect(stampSaver({ id: "v", updatedBy: JANE }, JANE, NANCY)).toBeNull()
		expect(stampSaver({ id: "v" }, undefined, NANCY)).toBeNull()
	})

	it("credits a changed updatedBy to the requester", () => {
		expect(stampSaver({ id: "v", updatedBy: JANE }, NANCY, NANCY)).toEqual({
			id: "v",
			updatedBy: NANCY,
		})
		expect(stampSaver({ id: "v", updatedBy: JANE }, undefined, NANCY)).toEqual({
			id: "v",
			updatedBy: NANCY,
		})
	})

	it("an anonymous change keeps the stored saver, or none", () => {
		expect(stampSaver({ id: "v", updatedBy: NANCY }, JANE, null)).toEqual({
			id: "v",
			updatedBy: JANE,
		})
		expect(stampSaver({ id: "v", updatedBy: NANCY }, undefined, null)).toEqual({ id: "v" })
	})
})
