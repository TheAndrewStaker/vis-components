import { describe, expect, it } from "vitest"

import { DEFAULT_LENGTH_CONFIG, DEFAULT_SEGMENT_THICKNESS } from "./channelConfig"
import { resolveSegmentThickness, segmentStrokeLinecap } from "./segmentStroke"

describe("resolveSegmentThickness", () => {
	const row = { Group: "A", N: 1 }

	it("falls back to the built-in default when nothing is set", () => {
		expect(resolveSegmentThickness(undefined, row)).toBe(DEFAULT_SEGMENT_THICKNESS)
		expect(resolveSegmentThickness(DEFAULT_LENGTH_CONFIG, row)).toBe(
			DEFAULT_SEGMENT_THICKNESS
		)
	})

	it("uses the single thickness when no Vary-by field is set", () => {
		const cfg = {
			...DEFAULT_LENGTH_CONFIG,
			segmentThickness: 6,
			segmentThicknessByValue: { A: 1 },
		}
		expect(resolveSegmentThickness(cfg, row)).toBe(6)
	})

	it("uses the per-level override for the row's value", () => {
		const cfg = {
			...DEFAULT_LENGTH_CONFIG,
			segmentThickness: 6,
			segmentThicknessField: "Group",
			segmentThicknessByValue: { A: 1.5, B: 9 },
		}
		expect(resolveSegmentThickness(cfg, row)).toBe(1.5)
		expect(resolveSegmentThickness(cfg, { Group: "B" })).toBe(9)
	})

	it("keys numeric cells by their string form", () => {
		const cfg = {
			...DEFAULT_LENGTH_CONFIG,
			segmentThicknessField: "N",
			segmentThicknessByValue: { "1": 8 },
		}
		expect(resolveSegmentThickness(cfg, row)).toBe(8)
	})

	it("falls back to the single thickness for unlisted levels and missing cells", () => {
		const cfg = {
			...DEFAULT_LENGTH_CONFIG,
			segmentThickness: 4,
			segmentThicknessField: "Group",
			segmentThicknessByValue: { B: 9 },
		}
		expect(resolveSegmentThickness(cfg, row)).toBe(4)
		expect(resolveSegmentThickness(cfg, { Group: null })).toBe(4)
	})

	it("clamps a negative override to the floor", () => {
		const cfg = {
			...DEFAULT_LENGTH_CONFIG,
			segmentThicknessField: "Group",
			segmentThicknessByValue: { A: -2 },
		}
		expect(resolveSegmentThickness(cfg, row)).toBe(0)
	})
})

describe("segmentStrokeLinecap", () => {
	it("defaults to round and maps square to a flush butt cap", () => {
		expect(segmentStrokeLinecap(undefined)).toBe("round")
		expect(segmentStrokeLinecap({ ...DEFAULT_LENGTH_CONFIG, segmentLineCap: "round" })).toBe(
			"round"
		)
		expect(segmentStrokeLinecap({ ...DEFAULT_LENGTH_CONFIG, segmentLineCap: "square" })).toBe(
			"butt"
		)
	})
})
