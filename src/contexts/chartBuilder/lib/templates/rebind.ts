import { min } from "d3-array"
import { CHANNELS, channelAccepts } from "../channels"
import { typeCompatible } from "../datasetCompat"
import {
	remapFieldsInConfigs,
	renameFieldInConfigs,
	type FieldNameConfigs,
} from "../renameField"
import type {
	DataKind,
	DataLabelsEncodings,
	EncodingChannel,
	Encodings,
	Field,
	FieldType,
	TemplateMeta,
	TemplateSourceField,
} from "../types"
import { dataKindOf } from "./dataKind"
import { applyFormatMemory, type FormatConfigs } from "./formatSurfaces"

/** The slice of a template body / editor draft the rebind reads and returns:
 * everything the rename engine reaches plus the format-bearing configs. */
export type RebindConfigs = FieldNameConfigs & FormatConfigs

/** A template field no new field could take, with the encoding channels it
 * occupied (now emptied so the user sees what to fill). Empty `channels`
 * = it was only referenced outside the encodings. */
export type RebindUnmatched = { field: string; channels: EncodingChannel[] }

export type RebindResult<T> = {
	configs: T
	/** One entry per template field referenced anywhere in the configs:
	 * its new name, or null when nothing matched. */
	mapping: Record<string, string | null>
	unmatched: RebindUnmatched[]
}

/** Scratch name for the "is this field referenced?" probe. Never observable
 * in the result (the probe's output is discarded). */
const PROBE_NAME = "__rebind_probe__"

const DISCRETE: readonly FieldType[] = ["categorical", "ordinal"]
const isDiscrete = (t: FieldType): boolean => DISCRETE.includes(t)

/** The encoding channels bound to `name`. */
const encodingChannelsOf = (
	encodings: Encodings,
	name: string,
): EncodingChannel[] =>
	(Object.entries(encodings) as Array<[EncodingChannel, { field: string | null }]>)
		.filter(([, e]) => e.field === name)
		.map(([ch]) => ch)

/** Restrictiveness of a field's occupancy: the narrowest occupied channel's
 * accepted-type count; Infinity when it sits on no encoding channel. */
const restrictiveness = (channels: readonly EncodingChannel[]): number =>
	channels.length === 0
		? Number.POSITIVE_INFINITY
		: (min(channels, (ch) => CHANNELS[ch].accepts.length) as number)

type Source = {
	field: TemplateSourceField
	channels: EncodingChannel[]
	index: number
}

/** The type the new field will be READ as when it takes this source's place:
 * a categorical / ordinal template field keeps its type (anything reads as a
 * category); otherwise the new field's own inferred type. */
const readTypeFor = (src: TemplateSourceField, candidate: Field): FieldType =>
	isDiscrete(src.type) ? src.type : candidate.inferredType

/** Every occupied encoding channel accepts the candidate (as it will be read). */
const channelsAccept = (src: Source, candidate: Field): boolean => {
	const t = readTypeFor(src.field, candidate)
	return src.channels.every((ch) => channelAccepts(ch, t))
}

/** Name-match compatibility: `typeCompatible` (same type, or a categorical
 * template field on quantitative data), widened so a categorical / ordinal
 * template field takes any type — it is read back as the template's type
 * via an override, exactly like tier (d). */
const nameCompatible = (src: TemplateSourceField, candidate: Field): boolean =>
	typeCompatible({ name: src.name, inferredType: src.type }, candidate) ||
	isDiscrete(src.type)

/** One matching pass (tiers per decision 5). Exact names first for every
 * field, then former names (so an alias never steals a field whose
 * exact-name owner comes later), then a phase of same data kind → same
 * type, then a phase of any type readable as a categorical / ordinal
 * template type → any type every occupied channel accepts; each phase runs
 * over all remaining fields, most restrictive first. Ties go to `newFields`
 * order; each new field is used once; `forbidden` names are never taken
 * (except by the template field of that same name). */
const matchFields = (
	ordered: readonly Source[],
	newFields: readonly Field[],
	forbidden: ReadonlySet<string>,
): Map<string, Field> => {
	const assigned = new Map<string, Field>() // template name → new field
	const used = new Set<string>()
	const open = (src: Source, f: Field) =>
		!used.has(f.name) &&
		(f.name === src.field.name || !forbidden.has(f.name)) &&
		channelsAccept(src, f)
	const pass = (pick: (src: Source, f: Field) => boolean) => {
		for (const src of ordered) {
			if (assigned.has(src.field.name)) continue
			const hit = newFields.find((f) => open(src, f) && pick(src, f))
			if (hit) {
				assigned.set(src.field.name, hit)
				used.add(hit.name)
			}
		}
	}
	// (a) name, then former name — both with a compatible type.
	pass((src, f) => f.name === src.field.name && nameCompatible(src.field, f))
	pass((src, f) => {
		const aliases = src.field.sourceNames ?? []
		const theirs = f.sourceNames ?? []
		return (
			(aliases.includes(f.name) ||
				theirs.includes(src.field.name) ||
				theirs.some((n) => aliases.includes(n))) &&
			nameCompatible(src.field, f)
		)
	})
	// Tiers run as phases over ALL fields, each restrictive-first, so a
	// looser tier on one field never pre-empts a tighter tier on another
	// (a categorical hue reading a number as a category must not steal the
	// measure a later y would take by type). Within a phase, a field takes
	// the first of its tiers with a candidate.
	const phase = (tiers: Array<(src: Source, f: Field) => boolean>) => {
		for (const src of ordered) {
			if (assigned.has(src.field.name)) continue
			const pool = newFields.filter((f) => open(src, f))
			for (const tier of tiers) {
				const hit = pool.find((f) => tier(src, f))
				if (hit) {
					assigned.set(src.field.name, hit)
					used.add(hit.name)
					break
				}
			}
		}
	}
	// (b) same data kind, then (c) same type.
	phase([
		(src, f) => dataKindOf(f.inferredType, f.formatHint) === src.field.kind,
		(src, f) => f.inferredType === src.field.type,
	])
	// (d) any type read as the template's categorical / ordinal type, then
	// (e) any type every occupied channel accepts.
	phase([
		(src, f) => isDiscrete(src.field.type) && f.inferredType !== src.field.type,
		() => true,
	])
	return assigned
}

/**
 * Snap a template's configs onto a new data set's fields (APPLICATION.md
 * §2.5 "The snap"). Each referenced template field is matched to at most one
 * new field in three phases over all fields, each most restrictive channel
 * first: exact / former name; same data kind → same type; any type readable
 * as a categorical / ordinal template type (written as an override) → any
 * type every occupied channel accepts. The mapping is applied in one
 * simultaneous remap; unmatched fields leave their encoding slots empty;
 * type overrides survive only for categorical / ordinal reads that differ
 * from the inferred type; format memory is applied last.
 * Identity-preserving when nothing changes.
 */
export const rebindTemplate = <T extends RebindConfigs>(
	configs: T,
	sourceFields: readonly TemplateSourceField[],
	newFields: readonly Field[],
	formatMemory: TemplateMeta["formatMemory"],
): RebindResult<T> => {
	const sourceAsFields: Field[] = sourceFields.map((f) => ({
		name: f.name,
		inferredType: f.type,
		...(f.sourceNames ? { sourceNames: f.sourceNames } : {}),
	}))

	// 1. Occupancy — only fields the configs actually mention take part. The
	// rename engine itself is the reference test (identity-preserving).
	const sources: Source[] = sourceFields
		.map((field, index) => ({
			field,
			index,
			channels: encodingChannelsOf(configs.encodings, field.name),
		}))
		.filter(
			(s) =>
				renameFieldInConfigs(configs, sourceAsFields, s.field.name, PROBE_NAME) !==
				configs,
		)

	// 2. Most restrictive first; ties keep sourceFields order.
	const ordered = [...sources].sort(
		(a, b) =>
			restrictiveness(a.channels) - restrictiveness(b.channels) ||
			a.index - b.index,
	)

	// 3. Match. A target named like a template field that ends up UNMATCHED
	// would merge into that field's lingering references, so such names are
	// forbidden and the match re-run until none is hit (forbidden only grows,
	// so this terminates). Deciding after the fact, rather than reserving
	// every still-unmatched name up front, keeps swaps (A → B, B → A) open.
	const referenced = new Set(sources.map((s) => s.field.name))
	const forbidden = new Set<string>()
	let assigned = matchFields(ordered, newFields, forbidden)
	for (;;) {
		const clashes = [...assigned.entries()]
			.map(([, f]) => f.name)
			.filter((n) => referenced.has(n) && !assigned.has(n))
		if (clashes.length === 0) break
		for (const n of clashes) forbidden.add(n)
		assigned = matchFields(ordered, newFields, forbidden)
	}

	// 4. Apply.
	const mapping: Record<string, string | null> = {}
	const remap: Record<string, string> = {}
	const unmatched: RebindUnmatched[] = []
	for (const s of sources) {
		const hit = assigned.get(s.field.name)
		mapping[s.field.name] = hit ? hit.name : null
		if (hit) remap[s.field.name] = hit.name
		else unmatched.push({ field: s.field.name, channels: s.channels })
	}
	let out = remapFieldsInConfigs(configs, sourceAsFields, remap)
	out = clearUnmatchedSlots(
		out,
		new Set(unmatched.map((u) => u.field)),
	)

	// 5. Type overrides: only categorical / ordinal reads that differ from
	// the new field's inferred type survive; a matched categorical /
	// ordinal template field writes its own.
	const byName = new Map(newFields.map((f) => [f.name, f]))
	const overrides: Record<string, FieldType> = {}
	for (const [name, t] of Object.entries(out.fieldTypeOverrides)) {
		const f = byName.get(name)
		if (f && isDiscrete(t) && t !== f.inferredType) overrides[name] = t
	}
	for (const s of sources) {
		const f = assigned.get(s.field.name)
		if (f && isDiscrete(s.field.type) && s.field.type !== f.inferredType)
			overrides[f.name] = s.field.type
	}
	if (!sameRecord(overrides, out.fieldTypeOverrides))
		out = { ...out, fieldTypeOverrides: overrides }

	// 6. Format memory by each new field's (effective) data kind.
	const fieldKinds = new Map<string, DataKind>(
		newFields.map((f) => [
			f.name,
			dataKindOf(overrides[f.name] ?? f.inferredType, f.formatHint),
		]),
	)
	out = applyFormatMemory(out, formatMemory, fieldKinds)

	return { configs: out, mapping, unmatched }
}

const sameRecord = (
	a: Record<string, string>,
	b: Record<string, string>,
): boolean => {
	const ak = Object.keys(a)
	return ak.length === Object.keys(b).length && ak.every((k) => b[k] === a[k])
}

/** Empty every encoding and data-label slot still bound to an unmatched
 * template field (a multi-field label entry is removed). Other references
 * dangle harmlessly. Identity-preserving. */
const clearUnmatchedSlots = <T extends RebindConfigs>(
	configs: T,
	names: ReadonlySet<string>,
): T => {
	if (names.size === 0) return configs
	const hits = (field: string | null) => field !== null && names.has(field)

	let encodings = configs.encodings
	for (const [ch, e] of Object.entries(configs.encodings) as Array<
		[EncodingChannel, Encodings[EncodingChannel]]
	>) {
		if (!hits(e.field)) continue
		if (encodings === configs.encodings) encodings = { ...encodings }
		encodings[ch] = { ...e, field: null }
	}

	const dle = configs.dataLabelsEncodings
	let dataLabelsEncodings = dle
	if (dle) {
		const clear = <S extends { field: string | null }>(slot: S): S =>
			hits(slot.field) ? { ...slot, field: null } : slot
		const value = dle.value
		const fields = value.fields?.filter((f) => !names.has(f))
		const fieldsChanged =
			fields !== undefined && fields.length !== value.fields?.length
		const next: DataLabelsEncodings = {
			...dle,
			x: clear(dle.x),
			y: clear(dle.y),
			angle: clear(dle.angle),
			hue: clear(dle.hue),
			size: clear(dle.size),
			value: fieldsChanged ? { ...clear(value), fields } : clear(value),
			...(dle.geography ? { geography: clear(dle.geography) } : {}),
		}
		const changed =
			next.x !== dle.x ||
			next.y !== dle.y ||
			next.angle !== dle.angle ||
			next.hue !== dle.hue ||
			next.size !== dle.size ||
			next.value !== dle.value ||
			next.geography !== dle.geography
		if (changed) dataLabelsEncodings = next
	}

	return encodings === configs.encodings && dataLabelsEncodings === dle
		? configs
		: { ...configs, encodings, dataLabelsEncodings }
}
