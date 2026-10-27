import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { stringifyJsonDangerous } from "../lib/json"
import { buildDataset } from "../testSupport/fixtures"
import { installInMemoryLocalStorage } from "../testSupport/localStorageShim"
import { TestProvider, type TestStore } from "../testSupport/TestProvider"
import type { Visual } from "../contexts/chartBuilder/lib/types"
import {
	currentDatasetIdAtom,
	currentVisualIdAtom,
	foldersAtom,
	loadedDatasetsAtom,
	visualsAtom,
} from "../contexts/chartBuilder/store/atoms"
import { Header } from "./Header"

// The header's only router touches are the brand/settings links, the route
// lookup, and navigate; stubbing beats standing up a RouterProvider.
let pathname = "/"
let search: Record<string, unknown> = {}
const navigate = vi.fn()
vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		to,
		...rest
	}: {
		children: React.ReactNode
		to: string
	} & React.HTMLAttributes<HTMLAnchorElement>) => (
		<a href={to} {...rest}>
			{children}
		</a>
	),
	useNavigate: () => navigate,
	useRouterState: ({
		select,
	}: {
		select: (s: {
			location: { pathname: string; search: Record<string, unknown> }
		}) => unknown
	}) => select({ location: { pathname, search } }),
}))

/** The "New visualization" header button is a split button: the main
 *  segment starts a clean-slate visualization, the arrow opens a menu of the
 *  alternatives — "New with this data set" and "New with a new data set"
 *  in the editor, and everywhere
 *  "Import from JSON…", the Settings → Sharing bundle import reachable
 *  without leaving the page. Each menu item asks for a destination folder
 *  first — when the library has folders; with none, the root is the only
 *  answer and nothing is asked. */

afterEach(() => {
	cleanup()
	navigate.mockReset()
	pathname = "/"
	search = {}
})

const FOLDERS = [
	{ id: "fl-work", name: "Work", parentId: null, createdAt: 1 },
	{ id: "fl-q3", name: "Q3", parentId: "fl-work", createdAt: 1 },
]

const vis = (id: string): Visual =>
	({
		id,
		name: `Visual ${id}`,
		folderId: null,
		datasetId: null,
		createdAtVersionId: null,
		thumbnail: null,
		createdAt: 1,
		updatedAt: 1,
	}) as unknown as Visual

const dataset = () =>
	buildDataset({
		id: "ds-1",
		name: "Q3 Sales",
		fields: [{ name: "region", inferredType: "categorical" }],
		rows: [{ region: "East" }],
	})

const bundleFile = (body: unknown): File =>
	new File([stringifyJsonDangerous(body as never)], "library-bundle.json", {
		type: "application/json",
	})

const mount = (initializeState?: (store: TestStore) => void) => {
	installInMemoryLocalStorage()
	let store: TestStore | null = null
	const view = render(
		<TestProvider
			initializeState={(s) => {
				s.set(visualsAtom, [])
				s.set(foldersAtom, [])
				initializeState?.(s)
				store = s
			}}
		>
			<Header />
		</TestProvider>
	)
	return { ...view, store: store as unknown as TestStore }
}

const openMenu = () => {
	fireEvent.click(screen.getByRole("button", { name: "More ways to start" }))
	return screen.getByRole("menu")
}

const pickFile = (container: HTMLElement, file: File) => {
	const input = container.querySelector<HTMLInputElement>('input[type="file"]')
	expect(input).not.toBeNull()
	fireEvent.change(input as HTMLInputElement, { target: { files: [file] } })
}

describe("Header → New visualization dropdown", () => {
	it("starts a clean-slate visualization from the main segment", () => {
		pathname = "/editor/dv-1"
		const { store } = mount((s) => {
			s.set(loadedDatasetsAtom, { "ds-1": dataset() })
			s.set(currentDatasetIdAtom, "ds-1")
		})
		fireEvent.click(screen.getByRole("button", { name: /New/ }))
		expect(screen.queryByRole("menu")).toBeNull()
		expect(navigate).toHaveBeenCalledWith({ to: "/editor/new" })
		expect(store.get(currentDatasetIdAtom)).toBeNull()
	})

	it("on the library page the arrow menu offers only the import entry", () => {
		mount()
		openMenu()
		const items = screen.getAllByRole("menuitem").map((el) => el.textContent)
		expect(items).toHaveLength(1)
		expect(items[0]).toContain("Import from JSON…")
		expect(navigate).not.toHaveBeenCalled()
	})

	it("in the editor with a data set bound the menu leads with keeping it", () => {
		pathname = "/editor/dv-1"
		mount((s) => {
			s.set(loadedDatasetsAtom, { "ds-1": dataset() })
			s.set(currentDatasetIdAtom, "ds-1")
		})
		openMenu()
		const items = screen.getAllByRole("menuitem").map((el) => el.textContent)
		expect(items).toHaveLength(3)
		expect(items[0]).toContain("New with this data set")
		expect(items[0]).toContain("Q3 Sales")
		expect(items[1]).toContain("New with a new data set")
		expect(items[2]).toContain("Import from JSON…")

		fireEvent.click(screen.getByText("New with this data set"))
		expect(navigate).toHaveBeenCalledWith({
			to: "/editor/new",
			search: { datasetId: "ds-1" },
		})
	})

	it("the menu's clean-slate entry matches the main segment", () => {
		pathname = "/editor/dv-1"
		const { store } = mount((s) => {
			s.set(loadedDatasetsAtom, { "ds-1": dataset() })
			s.set(currentDatasetIdAtom, "ds-1")
		})
		openMenu()
		fireEvent.click(screen.getByText("New with a new data set"))
		expect(screen.queryByRole("menu")).toBeNull()
		expect(navigate).toHaveBeenCalledWith({ to: "/editor/new" })
		expect(store.get(currentDatasetIdAtom)).toBeNull()
	})

	it("imports a picked bundle into the live library and reports it", async () => {
		pathname = "/editor/dv-1"
		const { container, store } = mount((s) => {
			s.set(visualsAtom, [vis("v-mine")])
		})
		openMenu()
		fireEvent.click(screen.getByText("Import from JSON…"))
		// The menu closes; the (hidden) file input is what the click opened.
		expect(screen.queryByRole("menu")).toBeNull()

		pickFile(
			container,
			bundleFile({
				exportedAt: "2026-10-05T00:00:00.000Z",
				visuals: [vis("v-theirs")],
				folders: [],
				datasets: {},
				themes: [],
				userDefaultThemeId: null,
			})
		)

		expect(await screen.findByText("Import complete")).toBeTruthy()
		expect(screen.getByText(/Imported 1 visualization/)).toBeTruthy()
		await waitFor(() => {
			expect(store.get(visualsAtom).map((v) => v.id)).toEqual([
				"v-mine",
				"v-theirs",
			])
		})

		// Away from the library the dialog offers to go look at the result.
		fireEvent.click(screen.getByText("Open library"))
		expect(navigate).toHaveBeenCalledWith({ to: "/" })
		expect(screen.queryByText("Import complete")).toBeNull()
	})

	describe("with folders in the library, every menu item asks where to put the result", () => {
		const mountEditorWithFolders = (seed?: (s: TestStore) => void) => {
			pathname = "/editor/dv-1"
			return mount((s) => {
				s.set(foldersAtom, FOLDERS)
				s.set(loadedDatasetsAtom, { "ds-1": dataset() })
				s.set(currentDatasetIdAtom, "ds-1")
				seed?.(s)
			})
		}

		it("the main segment still starts at the root without asking", () => {
			mountEditorWithFolders()
			fireEvent.click(screen.getByRole("button", { name: /New/ }))
			expect(screen.queryByText("Pick a destination folder.")).toBeNull()
			expect(navigate).toHaveBeenCalledWith({ to: "/editor/new" })
		})

		it("'New with this data set' carries the picked folder with the data set", () => {
			mountEditorWithFolders()
			openMenu()
			fireEvent.click(screen.getByText("New with this data set"))
			expect(screen.queryByRole("menu")).toBeNull()
			expect(navigate).not.toHaveBeenCalled()
			expect(screen.getByText("Pick a destination folder.")).toBeTruthy()

			fireEvent.click(screen.getByText("Q3"))
			fireEvent.click(screen.getByText("Start"))
			expect(navigate).toHaveBeenCalledWith({
				to: "/editor/new",
				search: { datasetId: "ds-1", folderId: "fl-q3" },
			})
			expect(screen.queryByText("Pick a destination folder.")).toBeNull()
		})

		it("'New with a new data set' starts on the open visual's folder and clears the data set", () => {
			const { store } = mountEditorWithFolders((s) => {
				s.set(visualsAtom, [{ ...vis("dv-1"), folderId: "fl-work" }])
				s.set(currentVisualIdAtom, "dv-1")
			})
			openMenu()
			fireEvent.click(screen.getByText("New with a new data set"))
			// Pre-selected: confirming straight away keeps the current folder.
			fireEvent.click(screen.getByText("Start"))
			expect(navigate).toHaveBeenCalledWith({
				to: "/editor/new",
				search: { folderId: "fl-work" },
			})
			expect(store.get(currentDatasetIdAtom)).toBeNull()
		})

		it("choosing the root sends a clean /editor/new", () => {
			mountEditorWithFolders()
			openMenu()
			fireEvent.click(screen.getByText("New with this data set"))
			fireEvent.click(screen.getByText("Root (no folder)"))
			fireEvent.click(screen.getByText("Start"))
			expect(navigate).toHaveBeenCalledWith({
				to: "/editor/new",
				search: { datasetId: "ds-1" },
			})
		})

		it("cancelling the picker starts nothing", () => {
			mountEditorWithFolders()
			openMenu()
			fireEvent.click(screen.getByText("New with this data set"))
			fireEvent.click(screen.getByText("Cancel"))
			expect(navigate).not.toHaveBeenCalled()
			expect(screen.queryByText("Pick a destination folder.")).toBeNull()
		})

		it("an import asks once the file is chosen and lands the visual in that folder", async () => {
			const { container, store } = mountEditorWithFolders((s) => {
				s.set(visualsAtom, [vis("v-mine")])
			})
			openMenu()
			fireEvent.click(screen.getByText("Import from JSON…"))
			pickFile(
				container,
				bundleFile({
					exportedAt: "2026-10-05T00:00:00.000Z",
					visuals: [vis("v-theirs")],
					folders: [],
					datasets: {},
					themes: [],
					userDefaultThemeId: null,
				})
			)
			// Nothing imported yet — the destination comes first.
			expect(screen.getByText("Import library-bundle.json")).toBeTruthy()
			expect(store.get(visualsAtom).map((v) => v.id)).toEqual(["v-mine"])

			fireEvent.click(screen.getByText("Q3"))
			fireEvent.click(screen.getByText("Import"))
			expect(await screen.findByText("Import complete")).toBeTruthy()
			await waitFor(() => {
				expect(
					store.get(visualsAtom).find((v) => v.id === "v-theirs")?.folderId
				).toBe("fl-q3")
			})
		})

		it("on the library page the picker starts on the folder being browsed", () => {
			search = { folder: "fl-q3" }
			const { container } = mount((s) => {
				s.set(foldersAtom, FOLDERS)
				s.set(visualsAtom, [vis("v-mine")])
			})
			openMenu()
			fireEvent.click(screen.getByText("Import from JSON…"))
			pickFile(
				container,
				bundleFile({
					exportedAt: "2026-10-05T00:00:00.000Z",
					visuals: [vis("v-theirs")],
					folders: [],
					datasets: {},
					themes: [],
					userDefaultThemeId: null,
				})
			)
			// The browsed folder is the highlighted row.
			const q3 = screen.getByText("Q3")
			expect(q3.className).toContain("vc-nav-active")
			expect(screen.getByText("Root (no folder)").className).not.toContain(
				"vc-nav-active"
			)
		})
	})

	it("refuses a malformed file, changes nothing, and has no library link on the library page", async () => {
		const { container, store } = mount((s) => {
			s.set(visualsAtom, [vis("v-mine")])
		})
		pickFile(
			container,
			new File(["this is not json"], "nope.json", { type: "application/json" })
		)

		expect(await screen.findByText("Import failed")).toBeTruthy()
		expect(screen.getByText(/Nothing was changed/)).toBeTruthy()
		expect(screen.queryByText("Open library")).toBeNull()
		expect(store.get(visualsAtom).map((v) => v.id)).toEqual(["v-mine"])

		fireEvent.click(screen.getByText("Got it"))
		expect(screen.queryByText("Import failed")).toBeNull()
	})
})
