import { act, cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
	markStaleBuild,
	resetStaleBuildForTests,
} from "../contexts/chartBuilder/lib/storage/staleBuild"
import { StaleBuildBanner } from "./StaleBuildBanner"

afterEach(() => {
	cleanup()
	resetStaleBuildForTests()
})

describe("StaleBuildBanner", () => {
	it("stays out of the way until the server refuses a write, then asks for a reload", () => {
		const { queryByRole, getByRole } = render(<StaleBuildBanner />)
		expect(queryByRole("alert")).toBeNull()
		act(() => markStaleBuild())
		expect(getByRole("alert").textContent).toMatch(/newer version .* deployed/i)
		expect(getByRole("button", { name: "Reload" })).toBeTruthy()
	})
})
