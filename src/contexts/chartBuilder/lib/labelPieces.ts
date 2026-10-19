// Label PIECES — the variables inside one composed label, when its Color /
// Size / Text properties section is split per variable ("Split into
// individual variables", `DataLabelsConfig.pieceSplits`).
//
// The sidebar sections and the renderer iterate one STRING key per thing
// they style: a composed label's id, or — for a split section — one key
// per variable inside it (`pieceKey`). That key exists only in memory. On
// disk a piece's styling lives in `DataLabelsConfig.pieces[labelId][field]`,
// two keys for two user strings, never joined: a joined key needs a
// separator no name can contain, i.e. a control character, and saved
// content must not carry one. `labelEntry` / `withLabelEntry` are the only
// way the maps are read and written, so the in-memory key never reaches a
// saved map.

import type {
	ColorSlotConfig,
	DataLabelsConfig,
	LabelFontOverrides,
	LabelPieceStyle,
	TextColorRule,
} from "./channelConfig"

/** Separator between a label's id and a variable's name in an IN-MEMORY
 *  piece key. A unit separator can't occur in either, so the two halves
 *  always split back out cleanly. Never persisted — see `pieces`. */
const PIECE_SEP = "\u001f"

/** The in-memory key one variable's controls and render pieces use inside
 *  a composed label — distinct from the label's own key, so styling the
 *  `{Region}` piece of `{Revenue} ({Region})` leaves the standalone
 *  `{Region}` label alone. */
export const pieceKey = (labelId: string, field: string): string =>
	`${labelId}${PIECE_SEP}${field}`

/** A piece key split back into its label id and variable; `null` for a
 *  plain (whole-label) key. */
export const parsePieceKey = (
	key: string
): { labelId: string; field: string } | null => {
	const i = key.indexOf(PIECE_SEP)
	return i === -1
		? null
		: { labelId: key.slice(0, i), field: key.slice(i + PIECE_SEP.length) }
}

/** The per-label maps whose split sections also style per piece. */
export type LabelMapName =
	| "fieldColors"
	| "fieldColorRules"
	| "fieldSizes"
	| "fieldFonts"

type LabelEntryOf<M extends LabelMapName> = {
	fieldColors: ColorSlotConfig
	fieldColorRules: TextColorRule[]
	fieldSizes: number
	fieldFonts: LabelFontOverrides
}[M]

/** The `LabelPieceStyle` property each per-label map's piece entries live
 *  under. */
const PIECE_PROP: Record<LabelMapName, keyof LabelPieceStyle> = {
	fieldColors: "color",
	fieldColorRules: "colorRules",
	fieldSizes: "size",
	fieldFonts: "font",
}

type LabelMaps = Pick<DataLabelsConfig, LabelMapName | "pieces">

/** One key's entry in a per-label map: the label's own entry for a label
 *  key, the piece's `pieces[labelId][field]` property for a piece key.
 *  `null` (the single-field label) has no entry. */
export const labelEntry = <M extends LabelMapName>(
	cfg: Pick<LabelMaps, M | "pieces">,
	map: M,
	key: string | null
): LabelEntryOf<M> | undefined => {
	if (key === null) return undefined
	const piece = parsePieceKey(key)
	if (!piece) return (cfg[map] as Record<string, LabelEntryOf<M>> | undefined)?.[key]
	return cfg.pieces?.[piece.labelId]?.[piece.field]?.[PIECE_PROP[map]] as
		| LabelEntryOf<M>
		| undefined
}

/** Every entry of a per-label map, keyed the way the sidebar and renderer
 *  iterate: the label's own entries by label id, then each piece's entry
 *  by its `pieceKey`. */
export const labelEntries = <M extends LabelMapName>(
	cfg: Pick<LabelMaps, M | "pieces">,
	map: M
): Array<[string, LabelEntryOf<M>]> => {
	const out: Array<[string, LabelEntryOf<M>]> = []
	for (const [key, value] of Object.entries(
		(cfg[map] ?? {}) as Record<string, LabelEntryOf<M>>
	))
		out.push([key, value])
	for (const [labelId, byField] of Object.entries(cfg.pieces ?? {})) {
		for (const [field, style] of Object.entries(byField)) {
			const value = style[PIECE_PROP[map]] as LabelEntryOf<M> | undefined
			if (value !== undefined) out.push([pieceKey(labelId, field), value])
		}
	}
	return out
}

/** The patch that sets (or, with `undefined`, clears) one key's entry in a
 *  per-label map — the label's own map for a label key, `pieces` for a
 *  piece key. A piece left with no properties is dropped, and a label with
 *  no pieces left drops out of `pieces`, so an untouched visual saves no
 *  empty shells. */
export const withLabelEntry = <M extends LabelMapName>(
	cfg: Pick<LabelMaps, M | "pieces">,
	map: M,
	key: string,
	value: LabelEntryOf<M> | undefined
): Partial<LabelMaps> => {
	const piece = parsePieceKey(key)
	if (!piece) {
		const next = { ...((cfg[map] ?? {}) as Record<string, LabelEntryOf<M>>) }
		if (value === undefined) delete next[key]
		else next[key] = value
		return { [map]: next }
	}
	const prop = PIECE_PROP[map]
	const pieces = { ...(cfg.pieces ?? {}) }
	const byField = { ...(pieces[piece.labelId] ?? {}) }
	const style: LabelPieceStyle = { ...(byField[piece.field] ?? {}) }
	if (value === undefined) delete style[prop]
	else (style as Record<string, unknown>)[prop] = value
	if (Object.keys(style).length === 0) delete byField[piece.field]
	else byField[piece.field] = style
	if (Object.keys(byField).length === 0) delete pieces[piece.labelId]
	else pieces[piece.labelId] = byField
	return { pieces }
}

/** The maps `structureLabelPieces` sweeps, in the order their entries are
 *  moved. */
const LABEL_MAPS: readonly LabelMapName[] = [
	"fieldColors",
	"fieldColorRules",
	"fieldSizes",
	"fieldFonts",
]

/** A Data Labels config with every piece entry under `pieces`. Before the
 *  nested map existed, a split section stored its piece entries in the
 *  per-label maps under the in-memory key — a control character inside a
 *  saved setting name. Every such entry moves to `pieces[labelId][field]`;
 *  an entry already there wins over a stray legacy one. Idempotent, and
 *  the same reference when there is nothing to move, so a current config
 *  never re-saves. Tolerant of a sparse / partial config (a draft slice,
 *  a hand-edited export). */
export const structureLabelPieces = <T extends Partial<LabelMaps>>(cfg: T): T => {
	let next: T | null = null
	for (const map of LABEL_MAPS) {
		const entries = cfg[map]
		if (!entries || typeof entries !== "object") continue
		const legacy = Object.keys(entries)
			.map((key) => ({ key, piece: parsePieceKey(key) }))
			.filter(
				(e): e is { key: string; piece: { labelId: string; field: string } } =>
					e.piece !== null
			)
		if (legacy.length === 0) continue
		next ??= { ...cfg }
		const kept = { ...(entries as Record<string, unknown>) }
		for (const { key, piece } of legacy) {
			const value = kept[key]
			delete kept[key]
			const prop = PIECE_PROP[map]
			if (next.pieces?.[piece.labelId]?.[piece.field]?.[prop] !== undefined)
				continue
			const pieces = { ...(next.pieces ?? {}) }
			const byField = { ...(pieces[piece.labelId] ?? {}) }
			byField[piece.field] = { ...(byField[piece.field] ?? {}), [prop]: value }
			pieces[piece.labelId] = byField
			next.pieces = pieces
		}
		;(next as Record<string, unknown>)[map] = kept
	}
	return next ?? cfg
}
