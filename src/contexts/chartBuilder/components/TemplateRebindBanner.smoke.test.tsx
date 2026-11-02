import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ExtractAtomValue } from "jotai"
import { afterEach, describe, expect, it } from "vitest"

import { TestProvider } from "../../../testSupport/TestProvider"
import { templateRebindNoticeAtom } from "../store/atoms"
import { TemplateRebindBanner } from "./TemplateRebindBanner"

/** The post-snap banner: hidden with no notice, the describeRebind line
 *  with one, and Dismiss clears it. */

afterEach(cleanup)

const renderBanner = (notice: ExtractAtomValue<typeof templateRebindNoticeAtom>) =>
	render(
		<TestProvider initializeState={(store) => store.set(templateRebindNoticeAtom, notice)}>
			<TemplateRebindBanner />
		</TestProvider>
	)

describe("TemplateRebindBanner", () => {
	it("renders nothing without a notice", () => {
		const { container } = renderBanner(null)
		expect(container.textContent).toBe("")
	})

	it("shows the mapping and dismisses", () => {
		renderBanner({
			mapping: { Date: "Period", Spend: null },
			unmatched: [{ field: "Spend", channels: ["y"] }],
		})
		const text = screen.getByRole("status").textContent ?? ""
		expect(text).toContain("Template applied: Date → Period")
		expect(text).toContain("no match — pick a field")
		fireEvent.click(screen.getByRole("button", { name: "Dismiss" }))
		expect(screen.queryByRole("status")).toBeNull()
	})
})
