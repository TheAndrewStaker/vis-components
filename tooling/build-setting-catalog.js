// Regenerates src/contexts/chartBuilder/lib/settingCatalog.json: every
// setting a chart spec's `settings` patch can name, read from the `Visual`
// type in lib/types.ts with the TypeScript compiler API. Run via
// `pnpm settings:catalog` after changing a saved config type; the JSON is
// committed, and settingCatalog.test.ts fails while it is stale.
//
// Paths are dot form. An entry of a map keyed by data (a level, a field, a
// panel) is a `*` segment (`channelConfigs.hue.colors.*`); a list's element
// members sit under `[]` (`annotationsConfig.texts[].text`). Each entry has
// `kinds` (string / number / boolean / null / list / object; absent = any),
// `values` for a union of string literals, `items` for a list's element,
// `doc` (the JSDoc, trimmed), and the `color` / `format` flags. types.ts has
// no color or format alias (both are plain `string`), so the flags come from
// the name. A type that contains itself is walked once per path.
//
// Output is deterministic (sorted keys), so reruns produce no diff.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const typesFile = path.join(repoRoot, 'src/contexts/chartBuilder/lib/types.ts')
const outFile = path.join(repoRoot, 'src/contexts/chartBuilder/lib/settingCatalog.json')

/** Keys of `Visual` a settings patch never writes, with why. */
export const NOT_SETTINGS = {
	id: "the chart's identity",
	name: "the spec's `name`",
	folderId: "the spec's `folderId`; moving is the library's",
	datasetId: 'a chart keeps its data set',
	createdAtVersionId: 'stamped by the first save',
	thumbnail: "the library's preview, captured by the editor",
	thumbnailAt: 'stamped with the preview',
	createdAt: 'stamped by a save',
	updatedAt: 'stamped by a save',
	updatedBy: 'stamped by the server',
	deletedAt: 'the Trash',
	template: 'makes the row a template; Save as template writes it',
	templateId: 'set when a chart starts from a template',
	themeId: "the spec's `themeId`, which re-themes like the Theme picker",
	encodings: "the spec's `encodings`",
	fieldTypeOverrides: "the spec's `fieldTypes`",
	reshapeConfig: 'changes the fields every other setting names',
	derivedVariablesConfig: 'changes the fields every other setting names',
}

const MAX_DOC = 300
const COLOR_NAME = /(^|[a-z])(colou?rs?|fill|palette)$/i
const FORMAT_NAME = /(^f|F)ormat$/

const tidy = (doc) => {
	const flat = doc.replace(/\s+/g, ' ').trim()
	if (flat.length <= MAX_DOC) return flat
	const cut = flat.slice(0, MAX_DOC)
	const end = cut.lastIndexOf('. ')
	return end > 80 ? cut.slice(0, end + 1) : `${cut.trimEnd()}…`
}

const sortedObject = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))

/** `{ slices, paths }`, built from the current types.ts. */
export const buildSettingCatalog = () => {
	const program = ts.createProgram([typesFile], {
		strict: true,
		skipLibCheck: true,
		noEmit: true,
		target: ts.ScriptTarget.ES2022,
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		jsx: ts.JsxEmit.ReactJSX,
		resolveJsonModule: true,
	})
	const checker = program.getTypeChecker()
	const decl = program
		.getSourceFile(typesFile)
		.statements.find((s) => ts.isTypeAliasDeclaration(s) && s.name.text === 'Visual')
	if (!decl) throw new Error('no `Visual` type in lib/types.ts')
	const visual = checker.getTypeAtLocation(decl.name)
	const keys = checker.getPropertiesOfType(visual).map((p) => p.name)
	for (const k of Object.keys(NOT_SETTINGS)) {
		if (!keys.includes(k)) throw new Error(`NOT_SETTINGS names "${k}", which Visual doesn't have`)
	}
	const slices = keys.filter((k) => !Object.hasOwn(NOT_SETTINGS, k)).sort()

	const parts = (t) => (t.isUnion() ? t.types : [t])
	const elementOf = (t) => (checker.isArrayType(t) ? checker.getTypeArguments(t)[0] : undefined)
	const isObject = (t) =>
		Boolean(t.flags & (ts.TypeFlags.Object | ts.TypeFlags.Intersection)) &&
		!elementOf(t) &&
		t.getCallSignatures().length === 0

	/** `{ kinds, values?, items? }` for a type; no `kinds` = anything goes. */
	const describe = (type, depth = 0) => {
		const kinds = new Set()
		const values = new Set()
		let items
		for (const p of parts(type)) {
			const f = p.flags
			if (f & (ts.TypeFlags.Undefined | ts.TypeFlags.Void)) continue
			if (f & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return {}
			if (f & ts.TypeFlags.Null) kinds.add('null')
			else if (f & ts.TypeFlags.StringLiteral) values.add(p.value)
			else if (f & ts.TypeFlags.StringLike) kinds.add('string')
			else if (f & ts.TypeFlags.NumberLike) kinds.add('number')
			else if (f & ts.TypeFlags.BooleanLike) kinds.add('boolean')
			else if (elementOf(p)) {
				kinds.add('list')
				if (depth < 4) items = describe(elementOf(p), depth + 1)
			} else if (isObject(p)) kinds.add('object')
			else return {}
		}
		const out = {}
		if (values.size > 0 && !kinds.has('string')) out.values = [...values].sort()
		if (values.size > 0) kinds.add('string')
		if (kinds.size > 0) out.kinds = [...kinds].sort()
		if (items) out.items = items
		return out
	}

	const paths = {}
	/** A path several types declare (a union of config shapes) merges. */
	const record = (at, type, doc) => {
		const next = { ...describe(type), ...(doc?.trim() ? { doc: tidy(doc) } : {}) }
		const prev = paths[at]
		if (!prev) {
			paths[at] = next
			return
		}
		const kinds = prev.kinds && next.kinds ? [...new Set([...prev.kinds, ...next.kinds])].sort() : undefined
		const plain = (e) => e.kinds?.includes('string') && !e.values
		const values =
			kinds?.includes('string') && !plain(prev) && !plain(next)
				? [...new Set([...(prev.values ?? []), ...(next.values ?? [])])].sort()
				: undefined
		const items = prev.items ?? next.items
		const merged = prev.doc ?? next.doc
		paths[at] = { ...(kinds && { kinds }), ...(values && { values }), ...(items && { items }), ...(merged && { doc: merged }) }
	}

	/** Everything below `at`: object members, a map's `*`, a list's `[]`. */
	const walk = (type, at, open) => {
		for (const p of parts(type)) {
			const element = elementOf(p)
			if (element) walk(element, `${at}[]`, open)
			if (!isObject(p) || open.has(p)) continue
			const inner = new Set(open).add(p)
			for (const prop of checker.getPropertiesOfType(p)) {
				const propType = checker.getTypeOfSymbol(prop)
				record(`${at}.${prop.name}`, propType, ts.displayPartsToString(prop.getDocumentationComment(checker)))
				walk(propType, `${at}.${prop.name}`, inner)
			}
			const entry = p.getStringIndexType()
			if (entry) {
				record(`${at}.*`, entry)
				walk(entry, `${at}.*`, inner)
			}
		}
	}
	for (const slice of slices) {
		const prop = visual.getProperty(slice)
		const type = checker.getTypeOfSymbolAtLocation(prop, decl)
		record(slice, type, ts.displayPartsToString(prop.getDocumentationComment(checker)))
		walk(type, slice, new Set())
	}

	for (const [at, entry] of Object.entries(paths)) {
		const name = at.split('.').flatMap((s) => (s === '*' ? [] : [s.replace(/\[\]$/, '')])).pop()
		const stringy = entry.kinds?.includes('string') || entry.items?.kinds?.includes('string')
		if (stringy && !entry.values && COLOR_NAME.test(name)) entry.color = true
		const formatted = name === 'customFormat' || FORMAT_NAME.test(name) || /(^|\.)fieldFormats\.\*/.test(at)
		if (entry.kinds?.includes('string') && !entry.values && formatted) entry.format = true
		paths[at] = sortedObject(entry)
	}
	return { slices, paths: sortedObject(paths) }
}

/** The file's text: tab-indented, newline-terminated. */
export const settingCatalogText = () => `${JSON.stringify(buildSettingCatalog(), null, '\t')}\n`

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	fs.writeFileSync(outFile, settingCatalogText())
	process.stdout.write(`wrote ${path.relative(repoRoot, outFile)}\n`)
}
