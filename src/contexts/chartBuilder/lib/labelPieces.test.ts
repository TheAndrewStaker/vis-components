import { describe, expect, it } from "vitest"

import type { DataLabelsConfig } from "./channelConfig"
import {
	labelEntries,
	labelEntry,
	parsePieceKey,
	pieceKey,
	structureLabelPieces,
	withLabelEntry,
} from "./labelPieces"

const cfg: Pick<
	DataLabelsConfig,
	"fieldColors" | "fieldColorRules" | "fieldSizes" | "fieldFonts" | "pieces"
> = {
	fieldSizes: { "lbl-1": 14 },
	fieldFonts: { "lbl-1": { fontFamily: "Georgia" } },
	fieldColors: { sales: { field: null, singleColor: "#000" } },
	pieces: {
		"lbl-1": {
			region: { font: { fontWeight: 700 }, size: 20 },
			sales: { colorRules: [{ condition: "< 0", color: "#f00" }] },
		},
	},
}

describe("pieceKey", () => {
	it("round-trips through parsePieceKey; a label key parses to null", () => {
		expect(parsePieceKey(pieceKey("lbl-1", "region"))).toEqual({
			labelId: "lbl-1",
			field: "region",
		})
		expect(parsePieceKey("lbl-1")).toBeNull()
	})
})

describe("labelEntry", () => {
	it("reads a label key from the per-label map and a piece key from pieces[label][field]", () => {
		expect(labelEntry(cfg, "fieldSizes", "lbl-1")).toBe(14)
		expect(labelEntry(cfg, "fieldSizes", pieceKey("lbl-1", "region"))).toBe(20)
		expect(labelEntry(cfg, "fieldFonts", pieceKey("lbl-1", "region"))).toEqual({
			fontWeight: 700,
		})
		expect(labelEntry(cfg, "fieldColorRules", pieceKey("lbl-1", "sales"))).toEqual([
			{ condition: "< 0", color: "#f00" },
		])
		// A piece with no entry for that section, an unknown piece, the
		// single-field label (null): nothing.
		expect(labelEntry(cfg, "fieldColors", pieceKey("lbl-1", "region"))).toBeUndefined()
		expect(labelEntry(cfg, "fieldSizes", pieceKey("lbl-9", "region"))).toBeUndefined()
		expect(labelEntry(cfg, "fieldSizes", null)).toBeUndefined()
	})

	it("lists label entries by id and piece entries by piece key", () => {
		expect(labelEntries(cfg, "fieldSizes")).toEqual([
			["lbl-1", 14],
			[pieceKey("lbl-1", "region"), 20],
		])
		expect(labelEntries(cfg, "fieldColors")).toEqual([
			["sales", { field: null, singleColor: "#000" }],
		])
	})
})

describe("withLabelEntry", () => {
	it("a label key writes the per-label map only", () => {
		expect(withLabelEntry(cfg, "fieldSizes", "lbl-2", 9)).toEqual({
			fieldSizes: { "lbl-1": 14, "lbl-2": 9 },
		})
		expect(withLabelEntry(cfg, "fieldSizes", "lbl-1", undefined)).toEqual({
			fieldSizes: {},
		})
	})

	it("a piece key writes pieces[label][field] only — never the per-label map", () => {
		const patch = withLabelEntry(cfg, "fieldColors", pieceKey("lbl-1", "region"), {
			field: null,
			singleColor: "#0f0",
		})
		expect(patch).toEqual({
			pieces: {
				"lbl-1": {
					region: {
						font: { fontWeight: 700 },
						size: 20,
						color: { field: null, singleColor: "#0f0" },
					},
					sales: { colorRules: [{ condition: "< 0", color: "#f00" }] },
				},
			},
		})
		expect(patch).not.toHaveProperty("fieldColors")
	})

	it("clearing drops an emptied piece and an emptied label", () => {
		const one = withLabelEntry(cfg, "fieldColorRules", pieceKey("lbl-1", "sales"), undefined)
		expect(one.pieces).toEqual({
			"lbl-1": { region: { font: { fontWeight: 700 }, size: 20 } },
		})
		const two = withLabelEntry(
			{ pieces: { "lbl-1": { region: { size: 20 } } } },
			"fieldSizes",
			pieceKey("lbl-1", "region"),
			undefined
		)
		expect(two).toEqual({ pieces: {} })
	})
})

describe("structureLabelPieces", () => {
	it("moves joined-key entries out of the per-label maps into pieces", () => {
		const legacy = {
			fieldSizes: { "lbl-1": 14, [pieceKey("lbl-1", "region")]: 20 },
			fieldFonts: { [pieceKey("lbl-1", "region")]: { fontWeight: 700 } },
			fieldColors: { [pieceKey("lbl-1", "sales")]: { field: null, singleColor: "#0f0" } },
			fieldColorRules: {
				[pieceKey("lbl-1", "sales")]: [{ condition: "< 0", color: "#f00" }],
			},
		}
		expect(structureLabelPieces(legacy)).toEqual({
			fieldSizes: { "lbl-1": 14 },
			fieldFonts: {},
			fieldColors: {},
			fieldColorRules: {},
			pieces: {
				"lbl-1": {
					region: { size: 20, font: { fontWeight: 700 } },
					sales: {
						color: { field: null, singleColor: "#0f0" },
						colorRules: [{ condition: "< 0", color: "#f00" }],
					},
				},
			},
		})
	})

	it("is idempotent and keeps the reference when there is nothing to move", () => {
		expect(structureLabelPieces(cfg)).toBe(cfg)
		const once = structureLabelPieces({
			fieldSizes: { [pieceKey("l", "a")]: 1 },
		})
		expect(structureLabelPieces(once)).toBe(once)
	})

	it("an entry already under pieces wins over a stray legacy one", () => {
		const out = structureLabelPieces({
			fieldSizes: { [pieceKey("l", "a")]: 1 },
			pieces: { l: { a: { size: 2 } } },
		})
		expect(out).toEqual({ fieldSizes: {}, pieces: { l: { a: { size: 2 } } } })
	})

	it("tolerates a sparse config and non-object maps", () => {
		expect(structureLabelPieces({})).toEqual({})
		expect(
			structureLabelPieces({ fieldSizes: "junk" as unknown as Record<string, number> })
		).toEqual({ fieldSizes: "junk" })
	})
})
