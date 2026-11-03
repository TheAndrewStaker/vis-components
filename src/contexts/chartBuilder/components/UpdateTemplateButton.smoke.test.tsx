import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { installInMemoryLocalStorage } from "../../../testSupport/localStorageShim"
import { TestProvider, type TestStore } from "../../../testSupport/TestProvider"
import { EMPTY_CHANNEL_CONFIGS } from "../lib/channelConfig"
import { SYSTEM_LIGHT_THEME } from "../lib/systemThemes"
import type { TemplateDiff } from "../lib/templates/templateDiff"
import { labelsFromTheme } from "../lib/themeConfig"
import { emptyEncodings, type Visual } from "../lib/types"
import {
	currentDatasetIdAtom,
	currentTemplateIdAtom,
	currentVisualIdAtom,
	visualsAtom,
} from "../store/atoms"
import { UpdateTemplateButton } from "./UpdateTemplateButton"

/** Header → "Update template": present only for a live template with data
 *  attached; the dialog lists the changed sections with every box on, a
 *  push sends the chosen sections, and an unchanged visual says so. */

const saveTemplate = vi.fn<(args: unknown) => Promise<string>>()
vi.mock("../store/useSaveTemplate", () => ({
	useSaveTemplate: () => saveTemplate,
}))

const report = {
	diff: { mapping: {}, sections: [] } as TemplateDiff,
	changedSinceStart: false,
}
vi.mock("../store/useTemplateDiff", () => ({
	useTemplateDiff: () => () => report,
}))

const row = (id: string, over: Partial<Visual> = {}): Visual => ({
	id,
	name: id,
	folderId: null,
	datasetId: null,
	createdAtVersionId: null,
	fieldTypeOverrides: {},
	encodings: emptyEncodings(),
	channelConfigs: EMPTY_CHANNEL_CONFIGS,
	labelsConfig: labelsFromTheme(SYSTEM_LIGHT_THEME),
	thumbnail: null,
	createdAt: 1,
	updatedAt: 1,
	...over,
})

const VISUAL = row("dv-1", { name: "Sales", datasetId: "ds-1" })
const TEMPLATE = row("tpl-1", {
	name: "Quarterly",
	template: { sourceFields: [], formatMemory: {} },
})

const renderButton = (
	visuals: Visual[],
	templateId: string | null = "tpl-1",
	datasetId: string | null = "ds-1"
) =>
	render(
		<TestProvider
			initializeState={(store: TestStore) => {
				store.set(visualsAtom, visuals)
				store.set(currentVisualIdAtom, "dv-1")
				store.set(currentDatasetIdAtom, datasetId)
				store.set(currentTemplateIdAtom, templateId)
			}}
		>
			<UpdateTemplateButton />
		</TestProvider>
	)

const twoSections = (): TemplateDiff => ({
	mapping: {},
	sections: [
		{
			id: "yAxis",
			label: "Y axis",
			changes: ["tick count"],
			formats: ["Learns the percent format for the Y axis (.0%)"],
		},
		{ id: "legend", label: "Legend", changes: ["position"], formats: [] },
	],
})

beforeEach(() => {
	installInMemoryLocalStorage()
	saveTemplate.mockReset()
	saveTemplate.mockResolvedValue("tpl-1")
	report.diff = { mapping: {}, sections: [] }
	report.changedSinceStart = false
})
afterEach(cleanup)

describe("Update template (header)", () => {
	it("renders only for a live template", () => {
		renderButton([VISUAL])
		expect(screen.queryByRole("button", { name: "Update template" })).toBeNull()
		cleanup()
		renderButton([VISUAL, { ...TEMPLATE, deletedAt: 5 }])
		expect(screen.queryByRole("button", { name: "Update template" })).toBeNull()
		cleanup()
		renderButton([VISUAL, TEMPLATE])
		expect(screen.getByRole("button", { name: "Update template" })).toBeTruthy()
	})

	it("lists the changed sections, all selected, and pushes the chosen ones", async () => {
		report.diff = twoSections()
		renderButton([VISUAL, TEMPLATE])
		fireEvent.click(screen.getByRole("button", { name: "Update template" }))
		const dialog = screen.getByRole("dialog")
		expect(dialog.textContent).toContain('Update template "Quarterly"')
		expect(dialog.textContent).toContain(
			"Learns the percent format for the Y axis (.0%)"
		)
		const yAxis = screen.getByRole("checkbox", { name: "Y axis" }) as HTMLInputElement
		const legend = screen.getByRole("checkbox", { name: "Legend" }) as HTMLInputElement
		expect(yAxis.checked).toBe(true)
		expect(legend.checked).toBe(true)

		fireEvent.click(legend)
		fireEvent.click(screen.getAllByRole("button", { name: "Update template" })[1])
		await waitFor(() => expect(saveTemplate).toHaveBeenCalledTimes(1))
		const args = saveTemplate.mock.calls[0][0] as {
			kind: string
			templateId: string
			sections: Set<string>
		}
		expect(args.kind).toBe("update")
		expect(args.templateId).toBe("tpl-1")
		expect([...args.sections]).toEqual(["yAxis"])
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
		expect(screen.getByRole("status").textContent).toBe("Template updated")
	})

	it("disables the push with nothing selected", () => {
		report.diff = twoSections()
		renderButton([VISUAL, TEMPLATE])
		fireEvent.click(screen.getByRole("button", { name: "Update template" }))
		fireEvent.click(screen.getByRole("checkbox", { name: "Y axis" }))
		fireEvent.click(screen.getByRole("checkbox", { name: "Legend" }))
		const push = screen.getAllByRole("button", { name: "Update template" })[1]
		expect((push as HTMLButtonElement).disabled).toBe(true)
	})

	it("says so when the visual matches the template", () => {
		renderButton([VISUAL, TEMPLATE])
		fireEvent.click(screen.getByRole("button", { name: "Update template" }))
		expect(screen.getByRole("dialog").textContent).toContain(
			"matches the template"
		)
		expect(screen.getAllByRole("button", { name: "Update template" })).toHaveLength(1)
		fireEvent.click(screen.getByRole("button", { name: "Close" }))
		expect(screen.queryByRole("dialog")).toBeNull()
	})

	it("notes a template someone else moved on, and shows a failed push", async () => {
		report.diff = twoSections()
		report.changedSinceStart = true
		saveTemplate.mockRejectedValue(new Error("That template no longer exists."))
		renderButton([VISUAL, TEMPLATE])
		fireEvent.click(screen.getByRole("button", { name: "Update template" }))
		expect(screen.getByRole("note").textContent).toContain("someone else")
		fireEvent.click(screen.getAllByRole("button", { name: "Update template" })[1])
		await waitFor(() =>
			expect(screen.getByRole("alert").textContent).toBe(
				"That template no longer exists."
			)
		)
		expect(screen.getByRole("dialog")).toBeTruthy()
	})
})
