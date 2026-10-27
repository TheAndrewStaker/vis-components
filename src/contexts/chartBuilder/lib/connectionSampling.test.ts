import { describe, expect, it } from "vitest"

import type { ChannelConfigs, ConnectionConfig } from "./channelConfig"
import {
	formatPointIndices,
	parsePointIndices,
	sampleMarkersByConnection,
} from "./connectionSampling"

const configs = (connection: Partial<ConnectionConfig>): ChannelConfigs =>
	({ connection }) as ChannelConfigs

/** Two connection groups laid out so encounter order ≠ sort-key order. */
const items = [
	{ i: 0, sort: 30, row: { grp: "a" } },
	{ i: 1, sort: 10, row: { grp: "a" } },
	{ i: 2, sort: 20, row: { grp: "a" } },
	{ i: 3, sort: 2, row: { grp: "b" } },
	{ i: 4, sort: 1, row: { grp: "b" } },
	{ i: 5, sort: 5, row: {} }, // no connection value → ungrouped
]

const sample = (connection: Partial<ConnectionConfig>) =>
	sampleMarkersByConnection(items, "grp", configs(connection), (m) => m.sort)

describe("sampleMarkersByConnection", () => {
	it('returns null (no filtering) for "all"', () => {
		expect(sample({ pointSampling: "all" })).toBeNull()
	})

	it("returns null for an unrecognized / legacy-null sampling value", () => {
		expect(
			sample({ pointSampling: null as unknown as "all" })
		).toBeNull()
		expect(
			sample({ pointSampling: "bogus" as unknown as "all" })
		).toBeNull()
	})

	it('returns an empty set for "none" (lines draw, no markers)', () => {
		expect(sample({ pointSampling: "none" })).toEqual(new Set())
	})

	it("keeps the sort-key-first item per group plus every ungrouped item", () => {
		// Group a's lowest sort key is i=1 (not the first-encountered i=0);
		// group b's is i=4. The ungrouped i=5 always renders.
		expect(sample({ pointSampling: "first-only" })).toEqual(
			new Set([1, 4, 5])
		)
	})

	it("keeps first and last by sort key per group", () => {
		expect(sample({ pointSampling: "first-and-last" })).toEqual(
			new Set([0, 1, 3, 4, 5])
		)
	})

	it("'custom' keeps the listed 1-based positions per group in sort order", () => {
		// Position 2 → group a's second-by-sort item (i=2, sort 20); group
		// b's second (i=3, sort 2). Position 3 exists only in group a (i=0).
		expect(sample({ pointSampling: "custom", pointIndices: [2, 3] })).toEqual(
			new Set([0, 2, 3, 5])
		)
		// Empty / absent list → no markers in any group; ungrouped still draws.
		expect(sample({ pointSampling: "custom", pointIndices: [] })).toEqual(
			new Set([5])
		)
		expect(sample({ pointSampling: "custom" })).toEqual(new Set([5]))
	})
})

describe("parsePointIndices / formatPointIndices", () => {
	it("parses comma- and whitespace-separated positive integers, deduped, in typed order", () => {
		expect(parsePointIndices("1, 4, 7")).toEqual([1, 4, 7])
		expect(parsePointIndices("7 1;4,1")).toEqual([7, 1, 4])
		expect(parsePointIndices("")).toEqual([])
	})

	it("skips anything that isn't a positive integer (half-typed input keeps parsing)", () => {
		expect(parsePointIndices("1, 3,")).toEqual([1, 3])
		expect(parsePointIndices("0, -2, 2.5, abc, 9")).toEqual([9])
	})

	it("formats as a comma list the parser round-trips", () => {
		expect(formatPointIndices([1, 4, 7])).toBe("1, 4, 7")
		expect(parsePointIndices(formatPointIndices([3, 1]))).toEqual([3, 1])
		expect(formatPointIndices([])).toBe("")
	})
})
