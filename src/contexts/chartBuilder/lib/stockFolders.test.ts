import { describe, expect, it } from "vitest"

import publicSeed from "../../../seed/examples.json"
import { PUBLIC_SEED_FOLDER_IDS } from "./stockFolders"

describe("PUBLIC_SEED_FOLDER_IDS", () => {
	it("names exactly the folders the public seed ships", () => {
		const seeded = ((publicSeed as { folders?: Array<{ id: string }> }).folders ?? []).map((f) => f.id)
		expect([...PUBLIC_SEED_FOLDER_IDS].sort()).toEqual([...seeded].sort())
	})
})
