/** The Zafiro commands: each one defined once, as a name, its input and
 *  output schemas, and what it does. Chart logic is the editor's own lib
 *  (`chartSpec.ts`, `datasetFromRows.ts`); reads and writes go through the
 *  server's existing routes (mcp/src/api.ts). The CLI (main.ts) and anything
 *  that imports this module call the same `run`, so every surface built on
 *  it refuses the same way. */

import { createHash } from "node:crypto"
import { z } from "zod/v4"

import { SETTING_CATALOG } from "../../src/contexts/chartBuilder/lib/applySettings"
import { CHANNELS, conflictsFor } from "../../src/contexts/chartBuilder/lib/channels"
import {
	chartSpecVocabulary,
	composeVisual,
	editVisual,
	SPEC_KEYS,
	type ChartSpec,
	type ChartSpecEdit,
	type SpecProblem,
} from "../../src/contexts/chartBuilder/lib/chartSpec"
import { datasetsEqual } from "../../src/contexts/chartBuilder/lib/datasetDedupe"
import { datasetFromRows } from "../../src/contexts/chartBuilder/lib/datasetFromRows"
import { didYouMean } from "../../src/contexts/chartBuilder/lib/didYouMean"
import { QUICK_START_CHART_TYPES } from "../../src/contexts/chartBuilder/lib/quickStartVariations"
import { settingsReadRows } from "../../src/contexts/chartBuilder/lib/settingEffects"
import { settingKeysOf } from "../../src/contexts/chartBuilder/lib/settingKeys"
import { PUBLIC_SEED_FOLDER_IDS } from "../../src/contexts/chartBuilder/lib/stockFolders"
import { themeOf } from "../../src/contexts/chartBuilder/lib/systemThemes"
import type { DatasetMeta, FieldType, SavedTheme, Visual } from "../../src/contexts/chartBuilder/lib/types"
import type { Api } from "../../mcp/src/api"
import { AGENT_GUIDE } from "../../mcp/src/guide"

export type ErrorCode =
	| "usage"
	| "invalid"
	| "not_found"
	| "stale"
	| "conflict"
	| "nothing_to_undo"
	| "version"
	| "failed"

/** A refusal: a stable code, a message, and the spec problems when there
 *  are any. */
export class CommandError extends Error {
	constructor(
		readonly code: ErrorCode,
		message: string,
		readonly problems?: SpecProblem[]
	) {
		super(message)
	}
}

/** What an edit replaced, and the revision it wrote: undoing it puts
 *  `previous` back only while the chart is still at `wrote`. */
export type UndoEntry = { previous: Visual; wrote: string }

/** Where a caller's undo entries live between calls: memory for one
 *  process (memoryUndo), a file per caller for the CLI (main.ts's
 *  fileUndo), or whatever store a server that imports this passes. */
export type UndoStore = {
	push(caller: string, id: string, entry: UndoEntry): Promise<void>
	pop(caller: string, id: string): Promise<UndoEntry | undefined>
}

export type Deps = { api: Api; undo: UndoStore }

export type Command<I, O> = {
	name: string
	summary: string
	input: z.ZodType<I>
	output: z.ZodType<O>
	run(input: I, deps: Deps): Promise<O>
}

/** A command with its types erased, as COMMANDS holds it; `run` validates
 *  the input before calling it. */
export type AnyCommand = Omit<Command<unknown, unknown>, "run"> & { run(input: never, deps: Deps): Promise<unknown> }

const command = <I, O>(c: Command<I, O>) => c

export const UNDO_DEPTH = 20

/** The collections a chart write reads from and writes to. */
const CHART_COLLECTIONS = ["visuals", "datasets", "themes"] as const

/** Keys a save without a change rewrites; a revision leaves them out. */
const SAVE_ONLY = new Set(["thumbnail", "thumbnailAt", "updatedAt", "updatedBy"])

const STOCK_FOLDER =
	"the stock Examples folder is read-only; create the chart in another folder (or null), or duplicate the example in the editor first"

/** A chart's revision: a hash of its content with keys sorted, leaving out
 *  what a save without a change rewrites (SAVE_ONLY), so the editor
 *  regenerating a thumbnail does not make an edit or an undo stale. */
export const revisionOf = (visual: object): string => {
	const sorted = (v: unknown): unknown =>
		Array.isArray(v)
			? v.map(sorted)
			: v && typeof v === "object"
				? Object.fromEntries(
						Object.keys(v)
							.sort()
							.map((k) => [k, sorted((v as Record<string, unknown>)[k])])
					)
				: v
	const content = Object.fromEntries(Object.entries(visual).filter(([k]) => !SAVE_ONLY.has(k)))
	return createHash("sha256").update(JSON.stringify(sorted(content))).digest("hex")
}

/** A data set's fields at its latest version, with their effective types. */
const fieldsOf = (meta: DatasetMeta): Array<{ name: string; type: FieldType }> => {
	const latest = meta.versions.find((v) => v.id === meta.latestVersionId)
	return (latest?.fields ?? meta.fields).map((f) => ({ name: f.name, type: f.inferredType }))
}

/** A theme name with case, spaces and punctuation taken out. */
const nameKey = (name: string) => name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "")

const isStockFolder = (id: unknown) => typeof id === "string" && PUBLIC_SEED_FOLDER_IDS.includes(id)

/** The server's default-theme row, else the first system theme. */
const defaultTheme = async (api: Api, themes?: SavedTheme[]): Promise<SavedTheme> => {
	const [all, defaultId] = await Promise.all([themes ?? api.themes(), api.defaultThemeId()])
	return all.find((t) => t.id === defaultId) ?? all[0]
}

/** The theme a spec names (id, else a unique name match), else the
 *  default. A name that matches nothing is refused with the themes listed. */
const resolveTheme = async (api: Api, wanted: string | undefined): Promise<SavedTheme> => {
	const themes = await api.themes()
	if (wanted === undefined) return defaultTheme(api, themes)
	const byName = themes.filter((t) => nameKey(t.name) === nameKey(wanted))
	const hit = themes.find((t) => t.id === wanted) ?? (byName.length === 1 ? byName[0] : undefined)
	if (hit) return hit
	throw new CommandError("invalid", "unknown theme", [
		{
			path: "themeId",
			message: `no theme "${wanted}"; themes are ${themes.map((t) => `"${t.name}" (${t.id})`).join(", ")}`,
		},
	])
}

/** A visual's stored theme; one that is gone renders under the default, so
 *  work against that too. */
const themeOfVisual = (api: Api, visual: Visual) =>
	resolveTheme(api, visual.themeId ?? undefined).catch(() => defaultTheme(api))

/** The latest version's rows, only for a settings patch that reads them. */
const rowsFor = async (api: Api, meta: DatasetMeta | undefined, settings: unknown) => {
	if (!meta || !settingsReadRows(settings)) return undefined
	const body = await api.dataset(meta.id)
	return body.versions.find((v) => v.id === meta.latestVersionId)?.rows
}

const datasetMeta = async (api: Api, datasetId: string | null | undefined) =>
	datasetId ? (await api.datasetIndex())[datasetId] : undefined

/** The stored chart, or not_found. */
const stored = async (api: Api, id: string): Promise<Visual> => {
	const visual = await api.visual(id)
	if (!visual) throw new CommandError("not_found", `no chart with id "${id}"`)
	return visual
}

/** Quick-start chart types no spec family seeds, and the encodings and
 *  settings that make each one: a spec reaches every stored setting, so
 *  none of these is editor-only. */
const SETTINGS_FAMILIES: Record<string, { encodings: string; settings: Record<string, unknown> }> = {
	map: {
		encodings: "connection: the region column (a state or county name or code); hue: the value to shade by, or area for symbols",
		settings: { mapConfig: { coordSystem: "geographic", geographyLevel: "states" } },
	},
	sankey: {
		encodings: "connection: the source column; area: the flow value",
		settings: { channelConfigs: { connection: { hierarchyLayout: "sankey", flowTargetField: "<the target column>" } } },
	},
	chord: {
		encodings: "connection: the source column; area: the flow value",
		settings: { channelConfigs: { connection: { hierarchyLayout: "chord", flowTargetField: "<the target column>" } } },
	},
}

const Mode = z.enum(["save", "preview"]).default("save").describe("preview composes and checks without writing.")
const AnyObject = z.record(z.string(), z.unknown())
const Field = z.object({ name: z.string(), type: z.string() })
const Written = z.object({
	id: z.string(),
	visual: AnyObject,
	revision: z.string(),
	warnings: z.array(z.string()),
	written: z.boolean(),
})
const Undo = z.strictObject({
	previous: AnyObject.describe("The chart as it was before the edit."),
	wrote: z.string().describe("The revision the edit wrote."),
})

/** Spec keys pass through to the lib, whose problems name an unknown key
 *  with a did-you-mean; every other input object is strict. */
const Spec = z
	.object(Object.fromEntries(Object.entries(SPEC_KEYS).map(([k, doc]) => [k, z.unknown().describe(doc)])))
	.partial()
	.passthrough()

const chartCreate = command({
	name: "chart create",
	summary: "Compose a chart from an encodings-first spec and save it (or only check it).",
	input: z.strictObject({ spec: Spec.describe("The chart spec; see vocabulary's specKeys."), mode: Mode }),
	output: Written,
	async run({ spec, mode }, { api }) {
		await api.assertCurrent(CHART_COLLECTIONS)
		const s = spec as ChartSpec
		const [meta, theme, folders] = await Promise.all([
			datasetMeta(api, typeof s.datasetId === "string" ? s.datasetId : null),
			resolveTheme(api, s.themeId),
			api.folders(),
		])
		const pre: SpecProblem[] = []
		if (!meta) pre.push({ path: "datasetId", message: `no data set with id "${String(s.datasetId)}"` })
		if (isStockFolder(s.folderId)) pre.push({ path: "folderId", message: STOCK_FOLDER })
		if (pre.length > 0 || !meta) throw new CommandError("invalid", "the chart wasn't created", pre)
		const { visual, problems, warnings } = composeVisual(
			{ ...s, themeId: theme.id },
			{
				fields: fieldsOf(meta),
				theme: themeOf(theme),
				folderIds: new Set(folders.map((f) => f.id)),
				latestVersionId: meta.latestVersionId,
				rows: await rowsFor(api, meta, s.settings),
			}
		)
		if (problems.length > 0) throw new CommandError("invalid", "the chart wasn't created", problems)
		if (mode === "save") await api.putVisual(visual)
		return { id: visual.id, visual, revision: revisionOf(visual), warnings, written: mode === "save" }
	},
})

const chartGet = command({
	name: "chart get",
	summary: "One chart as stored, with its revision.",
	input: z.strictObject({ id: z.string().describe("The chart id.") }),
	output: z.object({ visual: AnyObject, revision: z.string() }),
	async run({ id }, { api }) {
		const visual = await stored(api, id)
		return { visual, revision: revisionOf(visual) }
	},
})

const chartEdit = command({
	name: "chart edit",
	summary:
		"Change only the keys a patch names; refused when the chart is no longer at expectedRevision, or changed while the edit ran.",
	input: z.strictObject({
		id: z.string().describe("The chart id."),
		patch: Spec.describe("The spec keys to change; null unmaps a channel or clears a bound. folderId moves it."),
		expectedRevision: z
			.string()
			.optional()
			.describe("The revision the caller read; a different stored revision is refused (stale)."),
		mode: Mode,
		caller: z.string().optional().describe("Keeps this edit on the caller's undo stack."),
	}),
	output: Written.extend({ previousRevision: z.string(), undo: Undo }),
	async run({ id, patch, expectedRevision, mode, caller }, { api, undo }) {
		await api.assertCurrent(CHART_COLLECTIONS)
		const current = await stored(api, id)
		const before = revisionOf(current)
		if (expectedRevision !== undefined && expectedRevision !== before)
			throw new CommandError("stale", "the chart changed since it was read; read it again")
		// The lib counts any deletedAt as the trash; a stored null means not trashed.
		const { deletedAt, ...untrashed } = current
		if (deletedAt) throw new CommandError("conflict", "this chart is in the trash; restore it in the editor before editing")
		const base = (deletedAt === null ? untrashed : current) as Visual
		if (isStockFolder(base.folderId))
			throw new CommandError("invalid", "the chart wasn't changed", [{ path: "", message: STOCK_FOLDER }])
		const { folderId, ...rest } = patch as ChartSpecEdit & { folderId?: string | null }
		if (isStockFolder(folderId))
			throw new CommandError("invalid", "the chart wasn't changed", [{ path: "folderId", message: STOCK_FOLDER }])
		if (typeof folderId === "string" && !(await api.folders()).some((f) => f.id === folderId))
			throw new CommandError("invalid", "the chart wasn't changed", [
				{ path: "folderId", message: `no folder with id "${folderId}"` },
			])
		const meta = await datasetMeta(api, base.datasetId)
		// A new theme must exist; it is stored by id even when named.
		const wanted = typeof rest.themeId === "string" ? await resolveTheme(api, rest.themeId) : undefined
		const theme = wanted ?? (await themeOfVisual(api, base))
		const edited = editVisual(base, wanted ? { ...rest, themeId: theme.id } : rest, {
			fields: meta ? fieldsOf(meta) : [],
			theme: themeOf(theme),
			latestVersionId: meta?.latestVersionId ?? null,
			rows: await rowsFor(api, meta, rest.settings),
			// Later than what's stored, even on a clock behind the editor's.
			now: Math.max(Date.now(), (base.updatedAt ?? 0) + 1),
		})
		if (edited.problems.length > 0) throw new CommandError("invalid", "the chart wasn't changed", edited.problems)
		const visual = folderId === undefined ? edited.visual : { ...edited.visual, folderId }
		const revision = revisionOf(visual)
		const entry: UndoEntry = { previous: current, wrote: revision }
		if (mode === "save") {
			// The server's PUT is last-write-wins, so this narrows the window
			// for a concurrent save to the one request; it cannot close it.
			if (revisionOf(await stored(api, id)) !== before)
				throw new CommandError("stale", "the chart changed while the edit ran; read it again")
			await api.putVisual(visual)
			if (caller) await undo.push(caller, id, entry)
		}
		return {
			id,
			visual,
			revision,
			previousRevision: before,
			warnings: edited.warnings,
			written: mode === "save",
			undo: entry,
		}
	},
})

const chartUndo = command({
	name: "chart undo",
	summary:
		"Put back the chart an edit replaced, from the edit's `undo` or the caller's stack; refused once the chart changed after that edit.",
	input: z.strictObject({
		id: z.string().describe("The chart id."),
		undo: Undo.optional().describe("The `undo` an edit returned."),
		caller: z.string().optional().describe("Pops the caller's last edit of this chart when `undo` is absent."),
	}),
	output: z.object({ id: z.string(), visual: AnyObject, revision: z.string(), written: z.boolean() }),
	async run({ id, undo: given, caller }, { api, undo }) {
		const entry = (given as UndoEntry | undefined) ?? (caller ? await undo.pop(caller, id) : undefined)
		if (!entry || entry.previous.id !== id) throw new CommandError("nothing_to_undo", `nothing to undo for "${id}"`)
		// A popped entry goes back on the stack when the undo is refused.
		const keep = async () => {
			if (!given && caller) await undo.push(caller, id, entry)
		}
		try {
			await api.assertCurrent(["visuals"])
			const current = await stored(api, id)
			if (revisionOf(current) !== entry.wrote)
				throw new CommandError("stale", "the chart changed after that edit; undoing it would erase the newer change")
			if (isStockFolder(current.folderId) || isStockFolder(entry.previous.folderId))
				throw new CommandError("invalid", "the chart wasn't changed", [{ path: "", message: STOCK_FOLDER }])
			const restored = { ...entry.previous, updatedAt: Math.max(Date.now(), (current.updatedAt ?? 0) + 1) }
			await api.putVisual(restored)
			return { id, visual: restored, revision: revisionOf(restored), written: true }
		} catch (error) {
			await keep()
			throw error
		}
	},
})

const datasetCreate = command({
	name: "dataset create",
	summary:
		"Store rows as a new data set; identical data under the same name is reused, a different one by that name is refused.",
	input: z.strictObject({
		name: z.string().describe("The data set's name."),
		rows: z.array(AnyObject).describe("Rows as flat objects: column to text, number, boolean or null."),
		types: z
			.record(z.string(), z.enum(["quantitative", "categorical", "temporal", "ordinal"]))
			.optional()
			.describe("Column to type, overriding inference."),
	}),
	output: z.object({
		id: z.string(),
		name: z.string(),
		rowCount: z.number(),
		fields: z.array(Field),
		reused: z.boolean(),
	}),
	async run(input, { api }) {
		await api.assertCurrent(["datasets"])
		const index = await api.datasetIndex()
		const { dataset, problems, duplicateOf } = datasetFromRows(input, { existing: Object.values(index) })
		if (problems.length > 0) throw new CommandError("invalid", "the rows can't be stored as a data set", problems)
		// The hash is a PROBABLE match; reuse only once the stored body
		// proves equal, as the editor's upload does.
		if (duplicateOf && index[duplicateOf]) {
			const body = await api.dataset(duplicateOf).catch(() => undefined)
			if (body && datasetsEqual(body, dataset)) {
				const meta = index[duplicateOf]
				return {
					id: meta.id,
					name: meta.name,
					rowCount: dataset.versions[0]?.rows.length ?? 0,
					fields: fieldsOf(meta),
					reused: true,
				}
			}
		}
		if (Object.values(index).some((d) => d.name.trim().toLowerCase() === dataset.name.toLowerCase()))
			throw new CommandError("conflict", `a data set named "${dataset.name}" already exists`)
		await api.putDataset(dataset)
		return {
			id: dataset.id,
			name: dataset.name,
			rowCount: dataset.versions[0]?.rows.length ?? 0,
			fields: dataset.fields.map((f) => ({ name: f.name, type: f.inferredType })),
			reused: false,
		}
	},
})

const datasetFields = command({
	name: "dataset fields",
	summary: "One data set's fields with their effective types, its versions with row counts, and its latest version.",
	input: z.strictObject({ id: z.string().describe("The data set id.") }),
	output: z.object({
		id: z.string(),
		name: z.string(),
		fields: z.array(Field),
		latestVersionId: z.string().nullable(),
		versions: z.array(z.object({ id: z.string(), filename: z.string().nullable(), rows: z.number().nullable() })),
	}),
	async run({ id }, { api }) {
		const meta = await datasetMeta(api, id)
		if (!meta) throw new CommandError("not_found", `no data set with id "${id}"`)
		return {
			id,
			name: meta.name,
			fields: fieldsOf(meta),
			latestVersionId: meta.latestVersionId ?? null,
			versions: meta.versions.map((v) => ({ id: v.id, filename: v.filename ?? null, rows: v.rowCount ?? null })),
		}
	},
})

const settingsList = command({
	name: "settings list",
	summary:
		"The stored settings a patch can set (path, kinds, values, doc), filtered; with a chart, its stored values, the keys its `*` paths take and its theme's palettes.",
	input: z.strictObject({
		slice: z.string().optional().describe("One slice, such as channelConfigs."),
		query: z.string().optional().describe("Case-insensitive text matched against path and doc."),
		chartId: z.string().optional().describe("A chart whose stored values, keys and palettes to include."),
	}),
	output: z.object({
		total: z.number(),
		rows: z.array(AnyObject),
		stored: AnyObject.optional(),
		keys: z.unknown().optional(),
		palettes: z.unknown().optional(),
	}),
	async run({ slice, query, chartId }, { api }) {
		const { slices, paths } = SETTING_CATALOG
		if (slice !== undefined && !slices.includes(slice))
			throw new CommandError("invalid", `no settings slice "${slice}"${didYouMean(slice, slices)}; slices are ${slices.join(", ")}`)
		const q = query?.trim().toLowerCase() ?? ""
		const rows = Object.entries(paths)
			.filter(
				([path, entry]) =>
					(slice === undefined || path === slice || path.startsWith(`${slice}.`)) &&
					(q === "" || `${path} ${entry.doc ?? ""}`.toLowerCase().includes(q))
			)
			.map(([path, entry]) => ({ path, ...entry }))
		if (chartId === undefined) return { total: rows.length, rows }
		// With a chart: its stored slices, the keys its `*` paths take, and
		// its theme's palettes.
		const visual = await stored(api, chartId)
		const meta = await datasetMeta(api, visual.datasetId)
		const body = meta ? await api.dataset(meta.id).catch(() => null) : null
		const dataRows = body?.versions.find((v) => v.id === meta?.latestVersionId)?.rows ?? []
		const theme = themeOf(await themeOfVisual(api, visual))
		const list = (pals: SavedTheme["categoricalPalettes"]) => pals.map((p) => ({ id: p.id, name: p.name, colors: p.colors }))
		return {
			total: rows.length,
			rows,
			stored: Object.fromEntries(
				slices.flatMap((s) => {
					const value = (visual as Record<string, unknown>)[s]
					return value === undefined ? [] : [[s, value]]
				})
			),
			keys: settingKeysOf(visual, meta ? fieldsOf(meta) : [], dataRows),
			palettes: {
				categorical: list(theme.categoricalPalettes),
				ordinal: list(theme.ordinalPalettes),
				text: theme.defaultTextPaletteId,
			},
		}
	},
})

const vocabulary = command({
	name: "vocabulary",
	summary:
		"What a spec can say: spec keys, channels (accepts, label, conflicts), families and variations, settings slices, themes and folders.",
	input: z.strictObject({}),
	output: z.object({
		specKeys: z.record(z.string(), z.string()),
		channels: z.array(AnyObject),
		families: z.array(AnyObject),
		editorOnlyFamilies: z.array(z.string()),
		settingsFamilies: z.array(AnyObject),
		settingsSlices: z.array(z.string()),
		themes: z.array(AnyObject),
		folders: z.array(AnyObject),
	}),
	async run(_input, { api }) {
		const [folders, themes] = await Promise.all([api.folders(), api.themes()])
		const fallback = (await defaultTheme(api, themes)).id
		const v = chartSpecVocabulary()
		const families: string[] = v.families.map((f) => f.name)
		const unseeded = QUICK_START_CHART_TYPES.filter((f) => !families.includes(f))
		return {
			specKeys: v.specKeys,
			channels: v.channels.map((c) => ({ ...c, label: CHANNELS[c.name]?.label, conflictsWith: conflictsFor(c.name) })),
			families: v.families,
			editorOnlyFamilies: unseeded.filter((f) => !(f in SETTINGS_FAMILIES)),
			settingsFamilies: unseeded.filter((f) => f in SETTINGS_FAMILIES).map((f) => ({ chart: f, ...SETTINGS_FAMILIES[f] })),
			settingsSlices: [...SETTING_CATALOG.slices],
			themes: themes.map((t) => ({ id: t.id, name: t.name, default: t.id === fallback })),
			folders: folders.map((f) => ({ id: f.id, name: f.name, parentId: f.parentId })),
		}
	},
})

const guide = command({
	name: "guide",
	summary:
		"The agent guide for making charts in Zafiro (mcp/guide/agent-guide.md): the primary comparison, encodings by data type, what each set of encodings draws, titles, colors and the refusals to make.",
	input: z.strictObject({}),
	output: z.object({ markdown: z.string() }),
	async run() {
		return { markdown: AGENT_GUIDE }
	},
})

export const COMMANDS = [
	chartCreate,
	chartEdit,
	chartGet,
	chartUndo,
	datasetCreate,
	datasetFields,
	guide,
	settingsList,
	vocabulary,
] as AnyCommand[]

/** Bumped when a command or an input is renamed or removed; adding one is
 *  not breaking. */
export const MANIFEST_VERSION = 1

/** Every command's name, summary and JSON Schemas (the input side for
 *  inputs), for generators. */
export const manifest = () => ({
	manifestVersion: MANIFEST_VERSION,
	commands: COMMANDS.map((c) => ({
		name: c.name,
		summary: c.summary,
		inputSchema: z.toJSONSchema(c.input, { io: "input", unrepresentable: "any" }),
		outputSchema: z.toJSONSchema(c.output, { unrepresentable: "any" }),
	})),
})

/** An input that doesn't match the schema, one problem per issue; an
 *  unknown key is named, never dropped. */
const inputProblems = (issues: z.core.$ZodIssue[]): SpecProblem[] =>
	issues.flatMap((issue) =>
		issue.code === "unrecognized_keys"
			? issue.keys.map((key) => ({ path: [...issue.path, key].join("."), message: `unknown input "${key}"` }))
			: [{ path: issue.path.join("."), message: issue.message }]
	)

/** One command by name, or a usage refusal listing them. */
export const findCommand = (name: string): AnyCommand => {
	const c = COMMANDS.find((x) => x.name === name)
	const names = COMMANDS.map((x) => x.name)
	if (!c) throw new CommandError("usage", `no command "${name}"${didYouMean(name, names)}; commands are ${names.join(", ")}`)
	return c
}

/** One command by name, its input validated; every failure is a
 *  CommandError. */
export const run = async (name: string, input: unknown, deps: Deps): Promise<unknown> => {
	const c = findCommand(name)
	const parsed = c.input.safeParse(input ?? {})
	if (!parsed.success)
		throw new CommandError("usage", `the input doesn't match "${name}"`, inputProblems(parsed.error.issues))
	try {
		return await c.run(parsed.data as never, deps)
	} catch (error) {
		if (error instanceof CommandError) throw error
		const message = error instanceof Error ? error.message : String(error)
		// api.assertCurrent: the stored content is at another version than this build's.
		if (/content is at version/.test(message)) throw new CommandError("version", message)
		throw new CommandError("failed", message)
	}
}

/** Undo entries in memory, per caller and chart, UNDO_DEPTH deep. */
export const memoryUndo = (): UndoStore => {
	const stacks = new Map<string, UndoEntry[]>()
	const key = (caller: string, id: string) => `${caller}\n${id}`
	return {
		async push(caller, id, entry) {
			const stack = [...(stacks.get(key(caller, id)) ?? []), entry]
			stacks.set(key(caller, id), stack.slice(-UNDO_DEPTH))
		},
		async pop(caller, id) {
			return stacks.get(key(caller, id))?.pop()
		},
	}
}
