// @vitest-environment node
import { describe, expect, it } from "vitest"
import { createPresenceTracker, PRESENCE_TTL_MS } from "./presence.js"

const JANE = { id: "jane", name: "Jane Doe" }
const NANCY = { id: "nancy", name: "Nancy Organ" }

describe("presence tracker", () => {
	it("forgets a tab that stops beating, after the TTL", () => {
		let t = 0
		const presence = createPresenceTracker(() => t)
		presence.beat("tab-1", JANE, "v1")
		t = PRESENCE_TTL_MS
		expect(presence.editorsOf("v1")).toEqual([JANE])
		t = PRESENCE_TTL_MS + 1
		expect(presence.editorsOf("v1")).toEqual([])
	})

	it("moves a tab with its latest heartbeat", () => {
		const presence = createPresenceTracker(() => 0)
		presence.beat("tab-1", JANE, "v1")
		presence.beat("tab-1", JANE, "v2")
		expect(presence.editorsOf("v1")).toEqual([])
		expect(presence.editorsOf("v2")).toEqual([JANE])
	})

	it("won't let another user take over or remove someone's tab", () => {
		const presence = createPresenceTracker(() => 0)
		presence.beat("tab-1", JANE, "v1")
		presence.beat("tab-1", NANCY, "v1")
		presence.leave("tab-1", NANCY)
		expect(presence.editorsOf("v1")).toEqual([JANE])
	})
})
