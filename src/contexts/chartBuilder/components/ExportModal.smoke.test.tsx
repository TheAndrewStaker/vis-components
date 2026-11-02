import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { installInMemoryLocalStorage } from "../../../testSupport/localStorageShim"
import { TestProvider } from "../../../testSupport/TestProvider"
import { EMPTY_CHANNEL_CONFIGS } from "../lib/channelConfig"
import { SYSTEM_LIGHT_THEME } from "../lib/systemThemes"
import { labelsFromTheme } from "../lib/themeConfig"
import { emptyEncodings, type Visual } from "../lib/types"
import { currentVisualIdAtom, visualsAtom } from "../store/atoms"
import { ExportModal } from "./ExportModal"

/** The Export modal's header row: Download JSON and Save as template sit
 *  beside the two tabs (the dialog itself is SaveTemplateButton's test). */

const VISUAL: Visual = {
	id: "dv-1",
	name: "Sales",
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
}

beforeEach(() => {
	installInMemoryLocalStorage()
	// The Export image tab's preview iframe would fetch the embed route.
	;(
		window as unknown as {
			happyDOM: { settings: { disableIframePageLoading: boolean } }
		}
	).happyDOM.settings.disableIframePageLoading = true
})
afterEach(cleanup)

describe("Export modal header", () => {
	it("offers Save as template beside Download JSON", () => {
		render(
			<TestProvider
				initializeState={(store) => {
					store.set(visualsAtom, [VISUAL])
					store.set(currentVisualIdAtom, "dv-1")
				}}
			>
				<ExportModal open onClose={vi.fn()} visualId="dv-1" />
			</TestProvider>
		)
		expect(screen.getByRole("button", { name: "Download JSON" })).toBeTruthy()
		expect(screen.getByRole("button", { name: "Save as template" })).toBeTruthy()
	})
})
