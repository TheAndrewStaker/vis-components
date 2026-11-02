import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { installInMemoryLocalStorage } from "../../../testSupport/localStorageShim"
import { TestProvider } from "../../../testSupport/TestProvider"
import { EMPTY_CHANNEL_CONFIGS } from "../lib/channelConfig"
import { SYSTEM_LIGHT_THEME } from "../lib/systemThemes"
import { labelsFromTheme } from "../lib/themeConfig"
import { emptyEncodings, type Visual } from "../lib/types"
import {
	currentDatasetIdAtom,
	currentTemplateIdAtom,
	currentVisualIdAtom,
	visualsAtom,
} from "../store/atoms"
import { EditorActions } from "./EditorActions"

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }))

/** A template-pending draft (template id, no visual, no data set) can't be
 *  saved: Save is disabled and says why. */

const TEMPLATE: Visual = {
	id: "tpl-1",
	name: "Quarterly",
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
	template: { sourceFields: [], formatMemory: {} },
}

const renderActions = (datasetId: string | null) =>
	render(
		<TestProvider
			initializeState={(store) => {
				store.set(visualsAtom, [TEMPLATE])
				store.set(currentVisualIdAtom, null)
				store.set(currentTemplateIdAtom, "tpl-1")
				store.set(currentDatasetIdAtom, datasetId)
			}}
		>
			<EditorActions />
		</TestProvider>
	)

beforeEach(installInMemoryLocalStorage)
afterEach(cleanup)

describe("EditorActions Save while a template is pending", () => {
	it("disables Save until a data set is attached", () => {
		renderActions(null)
		const save = screen.getByRole("button", { name: "Save visualization" })
		expect((save as HTMLButtonElement).disabled).toBe(true)
		expect(save.getAttribute("title")).toBe("Attach a data set first")
	})

	it("enables Save once a data set is bound", () => {
		renderActions("ds-1")
		const save = screen.getByRole("button", { name: "Save visualization" })
		expect((save as HTMLButtonElement).disabled).toBe(false)
		expect(save.getAttribute("title")).toBeNull()
	})
})
