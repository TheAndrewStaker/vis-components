import { act, cleanup, renderHook } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { buildDataset } from "../../../testSupport/fixtures"
import { installInMemoryLocalStorage } from "../../../testSupport/localStorageShim"
import { TestProvider, type TestStore } from "../../../testSupport/TestProvider"
import type { Dataset, Visual } from "../lib/types"

import {
	currentDatasetIdAtom,
	currentEncodingsAtom,
	currentFieldOverridesAtom,
	currentLabelsAtom,
	currentTemplateIdAtom,
	currentVisualIdAtom,
	currentVisualNameAtom,
	loadedDatasetsAtom,
	previewVersionIdAtom,
	templatePendingAtom,
	templateRebindNoticeAtom,
	visualsAtom,
} from "./atoms"
import { bindDatasetToDraft } from "./bindDatasetToDraft"
import { usePublishEmbed } from "./publishEmbed"
import {
	useApplyTemplate,
	useLoadVisual,
	useResetVisual,
	useSaveVisual,
} from "./saveVisual"
import { useCreateNewDataset } from "./useCreateNewDataset"
import { useSaveTemplate } from "./useSaveTemplate"

/** Templates at the store level: saving one from the open draft, starting
 *  a new draft from it, the snap when data is attached, and the guards
 *  (load refuses template rows, publish refuses templates). */

beforeEach(() => {
	installInMemoryLocalStorage()
})

afterEach(cleanup)

const SOURCE: Dataset = buildDataset({
	id: "ds-src",
	fields: [
		{ name: "Sales", inferredType: "quantitative" },
		{ name: "Region", inferredType: "categorical" },
	],
	rows: [
		{ Sales: "10", Region: "East" },
		{ Sales: "20", Region: "West" },
	],
})

const FRESH: Dataset = buildDataset({
	id: "ds-fresh",
	fields: [
		{ name: "Area", inferredType: "categorical" },
		{ name: "Revenue", inferredType: "quantitative" },
	],
	rows: [
		{ Area: "North", Revenue: "5" },
		{ Area: "South", Revenue: "7" },
	],
})

const mount = () => {
	const captured: { store?: TestStore } = {}
	const { result } = renderHook(
		() => ({
			reset: useResetVisual(),
			save: useSaveVisual(),
			load: useLoadVisual(),
			apply: useApplyTemplate(),
			saveTemplate: useSaveTemplate(),
			publish: usePublishEmbed(),
			createDataset: useCreateNewDataset(),
		}),
		{
			wrapper: ({ children }: { children: ReactNode }) => (
				<TestProvider
					initializeState={(s) => {
						captured.store = s
					}}
				>
					{children}
				</TestProvider>
			),
		}
	)
	return { hooks: result, store: captured.store! }
}

/** A saved visual on SOURCE with Sales on x and Region on hue. */
const seedVisual = async ({ hooks, store }: ReturnType<typeof mount>) => {
	await act(async () => {
		await hooks.current.reset()
	})
	act(() => {
		store.set(loadedDatasetsAtom, { [SOURCE.id]: SOURCE })
		store.set(currentDatasetIdAtom, SOURCE.id)
		store.set(currentVisualNameAtom, "Quarterly sales")
		store.set(currentEncodingsAtom, (e) => ({
			...e,
			x: { field: "Sales" },
			hue: { field: "Region" },
		}))
	})
	let id = ""
	await act(async () => {
		id = await hooks.current.save()
	})
	return id
}

const saveNewTemplate = async (
	{ hooks }: ReturnType<typeof mount>,
	name = "  Sales template  ",
	folderId: string | null = null
) => {
	let id = ""
	await act(async () => {
		id = await hooks.current.saveTemplate({ kind: "new", name, folderId })
	})
	return id
}

const row = (store: TestStore, id: string): Visual | undefined =>
	store.get(visualsAtom).find((v) => v.id === id)

describe("useSaveTemplate", () => {
	it("prepends a data-less template row and links the open visual to it", async () => {
		const m = mount()
		const visualId = await seedVisual(m)
		const templateId = await saveNewTemplate(m, "  Sales template  ", "fl-gone")

		const visuals = m.store.get(visualsAtom)
		expect(visuals[0]?.id).toBe(templateId)
		const tpl = row(m.store, templateId)!
		expect(tpl.name).toBe("Sales template")
		// A folder that doesn't exist falls back to the root.
		expect(tpl.folderId).toBeNull()
		expect(tpl.datasetId).toBeNull()
		expect(tpl.template?.sourceFields.map((f) => f.name)).toEqual(
			expect.arrayContaining(["Sales", "Region"])
		)
		expect(tpl.encodings.x.field).toBe("Sales")
		// Custom text is a placeholder on the template.
		expect(tpl.labelsConfig?.title).toBe("Title")
		// The open visual now remembers the template; its own row is untouched.
		expect(m.store.get(currentTemplateIdAtom)).toBe(templateId)
		expect(m.store.get(currentVisualIdAtom)).toBe(visualId)
		expect(row(m.store, visualId)?.template).toBeUndefined()
	})

	it("updates the template in place, keeping its identity", async () => {
		const m = mount()
		await seedVisual(m)
		const templateId = await saveNewTemplate(m)
		const before = row(m.store, templateId)!

		act(() => {
			m.store.set(currentEncodingsAtom, (e) => ({ ...e, hue: { field: null } }))
		})
		let returned = ""
		await act(async () => {
			returned = await m.hooks.current.saveTemplate({
				kind: "update",
				templateId,
			})
		})
		expect(returned).toBe(templateId)
		const templates = m.store.get(visualsAtom).filter((v) => v.template)
		expect(templates).toHaveLength(1)
		const after = row(m.store, templateId)!
		expect(after.name).toBe(before.name)
		expect(after.createdAt).toBe(before.createdAt)
		expect(after.encodings.hue.field).toBeNull()
	})

	it("refuses to update a row that isn't a template", async () => {
		const m = mount()
		const visualId = await seedVisual(m)
		await expect(
			m.hooks.current.saveTemplate({ kind: "update", templateId: visualId })
		).rejects.toThrow(/no longer exists/)
	})

	it("saves the template link with the visual", async () => {
		const m = mount()
		const visualId = await seedVisual(m)
		const templateId = await saveNewTemplate(m)
		await act(async () => {
			await m.hooks.current.save()
		})
		expect(row(m.store, visualId)?.templateId).toBe(templateId)
	})
})

describe("guards", () => {
	it("useLoadVisual refuses a template row like a trashed one", async () => {
		const m = mount()
		await seedVisual(m)
		const templateId = await saveNewTemplate(m)
		let ok = true
		await act(async () => {
			ok = await m.hooks.current.load(templateId)
		})
		expect(ok).toBe(false)
	})

	it("publishing a template is refused", async () => {
		const m = mount()
		await seedVisual(m)
		const templateId = await saveNewTemplate(m)
		await expect(
			m.hooks.current.publish({ visualId: templateId, versionId: null, split: false })
		).rejects.toThrow("Templates can't be published")
	})

	it("loading a different visual clears the snap banner; reloading the same id keeps it", async () => {
		const m = mount()
		const visualId = await seedVisual(m)
		const notice = { mapping: { Sales: "Revenue" }, unmatched: [] }
		act(() => m.store.set(templateRebindNoticeAtom, notice))
		await act(async () => {
			await m.hooks.current.load(visualId)
		})
		expect(m.store.get(templateRebindNoticeAtom)).toBe(notice)
		act(() => m.store.set(currentVisualIdAtom, "vs-other"))
		await act(async () => {
			await m.hooks.current.load(visualId)
		})
		expect(m.store.get(templateRebindNoticeAtom)).toBeNull()
	})
})

describe("applyTemplateToDraft + bindDatasetToDraft", () => {
	const startFromTemplate = async () => {
		const m = mount()
		await seedVisual(m)
		const templateId = await saveNewTemplate(m)
		await act(async () => {
			await m.hooks.current.reset()
		})
		let applied = false
		act(() => {
			applied = m.hooks.current.apply(templateId)
		})
		expect(applied).toBe(true)
		return { ...m, templateId }
	}

	it("starts a pending, unsaved, data-less draft from the template", async () => {
		const { store, templateId } = await startFromTemplate()
		expect(store.get(currentVisualIdAtom)).toBeNull()
		expect(store.get(currentDatasetIdAtom)).toBeNull()
		expect(store.get(currentTemplateIdAtom)).toBe(templateId)
		expect(store.get(currentEncodingsAtom).x.field).toBe("Sales")
		expect(store.get(currentLabelsAtom).title).toBe("Title")
		expect(store.get(templatePendingAtom)).toBe(true)
	})

	it("useApplyTemplate refuses an id that isn't a template", async () => {
		const m = mount()
		const visualId = await seedVisual(m)
		let applied = true
		act(() => {
			applied = m.hooks.current.apply(visualId)
		})
		expect(applied).toBe(false)
	})

	it("pending: snaps the encodings onto the new fields and sets the notice", async () => {
		const { store } = await startFromTemplate()
		store.set(previewVersionIdAtom, "v-stale")
		act(() => bindDatasetToDraft(store.get, store.set, FRESH.id, FRESH))
		const enc = store.get(currentEncodingsAtom)
		expect(enc.x.field).toBe("Revenue")
		expect(enc.hue.field).toBe("Area")
		expect(store.get(currentDatasetIdAtom)).toBe(FRESH.id)
		expect(store.get(previewVersionIdAtom)).toBeNull()
		expect(store.get(templateRebindNoticeAtom)).toMatchObject({
			mapping: { Sales: "Revenue", Region: "Area" },
			unmatched: [],
		})
		expect(store.get(templatePendingAtom)).toBe(false)
	})

	it("not pending: wipes the data-bound draft state", async () => {
		const m = mount()
		await seedVisual(m)
		act(() => m.store.set(currentFieldOverridesAtom, { Sales: "categorical" }))
		act(() => bindDatasetToDraft(m.store.get, m.store.set, FRESH.id, FRESH))
		expect(m.store.get(currentEncodingsAtom).x.field).toBeNull()
		expect(m.store.get(currentFieldOverridesAtom)).toEqual({})
		expect(m.store.get(currentDatasetIdAtom)).toBe(FRESH.id)
		expect(m.store.get(templateRebindNoticeAtom)).toBeNull()
	})

	it("template deleted meanwhile: falls back to the wipe", async () => {
		const { store, templateId } = await startFromTemplate()
		await act(async () => {
			await store.set(visualsAtom, (prev) => prev.filter((v) => v.id !== templateId))
		})
		expect(store.get(templatePendingAtom)).toBe(false)
		act(() => bindDatasetToDraft(store.get, store.set, FRESH.id, FRESH))
		expect(store.get(currentEncodingsAtom).x.field).toBeNull()
		expect(store.get(templateRebindNoticeAtom)).toBeNull()
		expect(store.get(currentDatasetIdAtom)).toBe(FRESH.id)
	})

	it("pending but no body: wipes rather than snapping blind", async () => {
		const { store } = await startFromTemplate()
		act(() => bindDatasetToDraft(store.get, store.set, FRESH.id, null))
		expect(store.get(currentEncodingsAtom).x.field).toBeNull()
		expect(store.get(currentDatasetIdAtom)).toBe(FRESH.id)
	})

	it("an upload into a pending draft snaps through useCreateNewDataset", async () => {
		const { store, hooks } = await startFromTemplate()
		let id = ""
		await act(async () => {
			id = await hooks.current.createDataset(
				{ filename: "fresh.csv", fields: FRESH.fields, rows: FRESH.versions[0]!.rows },
				"fresh"
			)
		})
		expect(store.get(currentDatasetIdAtom)).toBe(id)
		expect(store.get(currentEncodingsAtom).x.field).toBe("Revenue")
		expect(store.get(templateRebindNoticeAtom)).not.toBeNull()
	})

	it("reset clears the template link and the banner", async () => {
		const { store, hooks } = await startFromTemplate()
		act(() => bindDatasetToDraft(store.get, store.set, FRESH.id, FRESH))
		await act(async () => {
			await hooks.current.reset()
		})
		expect(store.get(currentTemplateIdAtom)).toBeNull()
		expect(store.get(templateRebindNoticeAtom)).toBeNull()
	})
})
