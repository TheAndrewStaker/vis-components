import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { installInMemoryLocalStorage } from "../../../testSupport/localStorageShim"
import { TestProvider } from "../../../testSupport/TestProvider"
import { localStorageAdapter } from "../lib/storage/adapter"
import { setStorageAdapter } from "../lib/storage/registry"
import { EMPTY_CHANNEL_CONFIGS } from "../lib/channelConfig"
import { SYSTEM_LIGHT_THEME } from "../lib/systemThemes"
import { labelsFromTheme } from "../lib/themeConfig"
import { type EmbedInstance, emptyEncodings, type Visual } from "../lib/types"
import {
	currentVisualIdAtom,
	embedInstancesAtom,
	republishOnSaveVisualsAtom,
	visualsAtom,
} from "../store/atoms"
import { SaveBar } from "./SaveBar"

/** The header's one-click Republish: present only for a PUBLISHED visual in
 *  SERVER mode (a browser-local session has nowhere to publish to), and a
 *  click sends the open visual through the shared republish. */

// The action group and version chip have their own tests and their own
// router / dataset needs; the header's republish slot is what's under test.
vi.mock("./EditorActions", () => ({ EditorActions: () => null }))
vi.mock("./VersionBadge", () => ({ VersionBadge: () => null }))
const republish = vi.fn(async () => 1)
vi.mock("../store/republishVisual", async (importOriginal) => ({
	...(await importOriginal<typeof import("../store/republishVisual")>()),
	useRepublishVisual: () => republish,
}))

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

const renderBar = (instances: EmbedInstance[], flagged: string[] = []) =>
	render(
		<TestProvider
			initializeState={(store) => {
				store.set(visualsAtom, [VISUAL])
				store.set(currentVisualIdAtom, "dv-1")
				store.set(
					embedInstancesAtom,
					Object.fromEntries(instances.map((i) => [i.id, i]))
				)
				store.set(
					republishOnSaveVisualsAtom,
					Object.fromEntries(flagged.map((id) => [id, true as const]))
				)
			}}
		>
			<SaveBar />
		</TestProvider>
	)

beforeEach(() => {
	installInMemoryLocalStorage()
	republish.mockClear()
})
afterEach(() => {
	cleanup()
	setStorageAdapter(localStorageAdapter)
})

describe("SaveBar Republish", () => {
	it("shows Republish for a published visual in server mode and republishes on click", () => {
		setStorageAdapter({ ...localStorageAdapter, capabilities: { remoteLoad: true } })
		renderBar([PUBLISHED])
		const button = screen.getByRole("button", { name: "Republish" })
		fireEvent.click(button)
		expect(republish).toHaveBeenCalledTimes(1)
		expect(republish).toHaveBeenCalledWith("dv-1", { includeZctaTopology: false })
	})

	it("wears the Republishes-on-save chip only when this user flagged the visual", () => {
		setStorageAdapter({ ...localStorageAdapter, capabilities: { remoteLoad: true } })
		renderBar([PUBLISHED])
		expect(screen.queryByText("Republishes on save")).toBeNull()
		cleanup()
		renderBar([PUBLISHED], ["dv-1"])
		expect(screen.getByText("Republishes on save")).toBeTruthy()
		expect(screen.getByRole("button", { name: "Republish" })).toBeTruthy()
	})

	it("stays hidden in a browser-local session, even for a published visual", () => {
		renderBar([PUBLISHED])
		expect(screen.queryByRole("button", { name: "Republish" })).toBeNull()
	})

	it("stays hidden in server mode when nothing is published", () => {
		setStorageAdapter({ ...localStorageAdapter, capabilities: { remoteLoad: true } })
		renderBar([{ ...PUBLISHED, publishId: undefined, publishedUrls: undefined }])
		expect(screen.queryByRole("button", { name: "Republish" })).toBeNull()
	})
})
