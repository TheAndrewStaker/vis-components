import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { installInMemoryLocalStorage } from "../../../testSupport/localStorageShim"
import { TestProvider, type TestStore } from "../../../testSupport/TestProvider"
import { EMPTY_CHANNEL_CONFIGS } from "../lib/channelConfig"
import { SYSTEM_LIGHT_THEME } from "../lib/systemThemes"
import { labelsFromTheme } from "../lib/themeConfig"
import { emptyEncodings, type Visual } from "../lib/types"
import { currentTemplateIdAtom, currentVisualIdAtom, visualsAtom } from "../store/atoms"
import { SaveTemplateButton } from "./SaveTemplateButton"

/** Export modal → "Save as template": the dialog, its name guard, the
 *  "Update template" action (only for a live template) and the hook args. */

const saveTemplate = vi.fn<(args: unknown) => Promise<string>>()
vi.mock("../store/useSaveTemplate", () => ({
	useSaveTemplate: () => saveTemplate,
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

const VISUAL = row("dv-1", { name: "Sales" })
const TEMPLATE = row("tpl-1", {
	name: "Quarterly",
	template: { sourceFields: [], formatMemory: {} },
})

const renderButton = (visuals: Visual[], templateId: string | null = null) =>
	render(
		<TestProvider
			initializeState={(store: TestStore) => {
				store.set(visualsAtom, visuals)
				store.set(currentVisualIdAtom, "dv-1")
				store.set(currentTemplateIdAtom, templateId)
			}}
		>
			<SaveTemplateButton visualId="dv-1" />
		</TestProvider>
	)

beforeEach(() => {
	installInMemoryLocalStorage()
	saveTemplate.mockReset()
	saveTemplate.mockResolvedValue("tpl-new")
})
afterEach(cleanup)

describe("Save as template", () => {
	it("opens the dialog prefilled from the visual's name", () => {
		renderButton([VISUAL])
		fireEvent.click(screen.getByRole("button", { name: "Save as template" }))
		expect(screen.getByRole("dialog")).toBeTruthy()
		expect((screen.getByLabelText("Template name") as HTMLInputElement).value).toBe(
			"Sales template"
		)
		expect(screen.queryByRole("button", { name: /Update template/ })).toBeNull()
	})

	it("saves a new template with the name and folder, then confirms", async () => {
		renderButton([VISUAL])
		fireEvent.click(screen.getByRole("button", { name: "Save as template" }))
		fireEvent.change(screen.getByLabelText("Template name"), {
			target: { value: "  My template " },
		})
		fireEvent.click(screen.getByRole("button", { name: "Save template" }))
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
		expect(saveTemplate).toHaveBeenCalledWith({
			kind: "new",
			name: "My template",
			folderId: null,
		})
		expect(screen.getByRole("status").textContent).toBe("Saved as template")
	})

	it("blocks a name another visual already has", () => {
		renderButton([VISUAL])
		fireEvent.click(screen.getByRole("button", { name: "Save as template" }))
		fireEvent.change(screen.getByLabelText("Template name"), {
			target: { value: "sales" },
		})
		const save = screen.getByRole("button", { name: "Save template" })
		expect((save as HTMLButtonElement).disabled).toBe(true)
	})

	it("offers Update template only while the template is live", async () => {
		renderButton([VISUAL, TEMPLATE], "tpl-1")
		fireEvent.click(screen.getByRole("button", { name: "Save as template" }))
		fireEvent.click(screen.getByRole("button", { name: 'Update template "Quarterly"' }))
		await waitFor(() =>
			expect(saveTemplate).toHaveBeenCalledWith({ kind: "update", templateId: "tpl-1" })
		)
		await waitFor(() =>
			expect(screen.getByRole("status").textContent).toBe("Template updated")
		)
		cleanup()

		renderButton([VISUAL, { ...TEMPLATE, deletedAt: 5 }], "tpl-1")
		fireEvent.click(screen.getByRole("button", { name: "Save as template" }))
		expect(screen.queryByRole("button", { name: /Update template/ })).toBeNull()
	})

	it("shows a failed save in the dialog and keeps it open", async () => {
		saveTemplate.mockRejectedValue(new Error("That template no longer exists."))
		renderButton([VISUAL, TEMPLATE], "tpl-1")
		fireEvent.click(screen.getByRole("button", { name: "Save as template" }))
		fireEvent.click(screen.getByRole("button", { name: 'Update template "Quarterly"' }))
		await waitFor(() =>
			expect(screen.getByRole("alert").textContent).toBe(
				"That template no longer exists."
			)
		)
		expect(screen.getByRole("dialog")).toBeTruthy()
	})
})
