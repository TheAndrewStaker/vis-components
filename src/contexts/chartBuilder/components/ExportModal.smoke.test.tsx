import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { installInMemoryLocalStorage } from "../../../testSupport/localStorageShim"
import { TestProvider } from "../../../testSupport/TestProvider"
import { EMPTY_CHANNEL_CONFIGS } from "../lib/channelConfig"
import { SYSTEM_LIGHT_THEME } from "../lib/systemThemes"
import { labelsFromTheme } from "../lib/themeConfig"
import { type EmbedInstance, emptyEncodings, type Visual } from "../lib/types"
import {
	currentVisualIdAtom,
	embedInstancesAtom,
	visualsAtom,
} from "../store/atoms"
import { ExportModal } from "./ExportModal"

/** The Export modal's header row: Download JSON and Save as template sit
 *  beside the two tabs (the dialog itself is SaveTemplateButton's test) —
 *  and which tab an open lands on. */

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

const PUBLISHED: EmbedInstance = {
	id: "ei-1",
	visualId: "dv-1",
	versionId: null,
	createdAt: 1,
	lastExportedAt: 1,
	publishId: "pub-1",
	publishedAt: 2,
	publishedParts: ["full"],
	publishedUrls: { full: "https://example.test/embeds/pub-1/index.html" },
	publishedVersionId: null,
}

const renderModal = (open: boolean, instances: EmbedInstance[] = []) =>
	render(
		<TestProvider
			initializeState={(store) => {
				store.set(visualsAtom, [VISUAL])
				store.set(currentVisualIdAtom, "dv-1")
				store.set(
					embedInstancesAtom,
					Object.fromEntries(instances.map((i) => [i.id, i]))
				)
			}}
		>
			<ExportModal open={open} onClose={vi.fn()} visualId="dv-1" />
		</TestProvider>
	)

describe("Export modal header", () => {
	it("offers Save as template beside Download JSON", () => {
		renderModal(true)
		expect(screen.getByRole("button", { name: "Download JSON" })).toBeTruthy()
		expect(screen.getByRole("button", { name: "Save as template" })).toBeTruthy()
	})
})

/** Browser-local sessions (this test env) render the Embed pane as a
 *  "requires the self-host server" notice, so that text is the Embed pane's
 *  fingerprint here. */
const EMBED_PANE_TEXT = /Publishing embeds requires the self-host server/

describe("Export modal opening tab", () => {
	it("opens on Export image for an unpublished visual", () => {
		renderModal(true)
		expect(screen.queryByText(EMBED_PANE_TEXT)).toBeNull()
	})

	it("opens on Embed when the visual is already published", () => {
		renderModal(true, [PUBLISHED])
		expect(screen.getByText(EMBED_PANE_TEXT)).toBeTruthy()
	})
})
