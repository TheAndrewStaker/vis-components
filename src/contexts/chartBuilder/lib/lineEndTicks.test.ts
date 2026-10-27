import { describe, expect, it } from "vitest"
import {
	autoLineEndTickLength,
	connectionStrokeLinecap,
	lineEndTicks,
	resolveLineEndTickLength,
} from "./lineEndTicks"

describe("connectionStrokeLinecap", () => {
	it("maps round → round and both flush caps → butt", () => {
		expect(connectionStrokeLinecap("round")).toBe("round")
		expect(connectionStrokeLinecap(undefined)).toBe("round")
		expect(connectionStrokeLinecap("square")).toBe("butt")
		expect(connectionStrokeLinecap("tick")).toBe("butt")
	})
})

describe("tick length", () => {
	it("auto length scales with thickness but never drops below the floor", () => {
		expect(autoLineEndTickLength(1)).toBe(8)
		expect(autoLineEndTickLength(2)).toBe(8)
		expect(autoLineEndTickLength(3)).toBe(12)
	})
	it("a typed length wins over auto; null / absent read as auto", () => {
		expect(resolveLineEndTickLength({ lineCapTickLength: 20 }, 2)).toBe(20)
		expect(resolveLineEndTickLength({ lineCapTickLength: null }, 3)).toBe(12)
		expect(resolveLineEndTickLength(undefined, 3)).toBe(12)
		expect(resolveLineEndTickLength({ lineCapTickLength: -4 }, 3)).toBe(0)
	})
})

/** Endpoint order within a tick is arbitrary (it's a symmetric mark), so
 *  compare ticks by their sorted endpoint pairs. */
const norm = (t: { x1: number; y1: number; x2: number; y2: number }) =>
	[
		[t.x1, t.y1],
		[t.x2, t.y2],
	].sort((a, b) => a[0] - b[0] || a[1] - b[1])

describe("lineEndTicks", () => {
	it("draws a horizontal tick at both ends of a vertical range line", () => {
		const ticks = lineEndTicks(
			[
				{ x: 10, y: 0 },
				{ x: 10, y: 50 },
			],
			8
		)
		expect(ticks.map(norm)).toEqual([
			[
				[6, 0],
				[14, 0],
			],
			[
				[6, 50],
				[14, 50],
			],
		])
	})
	it("ticks follow the END segment's direction on a bent polyline", () => {
		const ticks = lineEndTicks(
			[
				{ x: 0, y: 0 },
				{ x: 10, y: 0 },
				{ x: 10, y: 10 },
			],
			4
		)
		// First segment runs along x → vertical tick; last runs along y →
		// horizontal tick.
		expect(norm(ticks[0])).toEqual([
			[0, -2],
			[0, 2],
		])
		expect(norm(ticks[1])).toEqual([
			[8, 10],
			[12, 10],
		])
	})
	it("skips coincident neighbors to find a direction, and gives up on a degenerate line", () => {
		const ticks = lineEndTicks(
			[
				{ x: 0, y: 0 },
				{ x: 0, y: 0 },
				{ x: 6, y: 0 },
			],
			2
		)
		expect(ticks).toHaveLength(2)
		expect(norm(ticks[0])).toEqual([
			[0, -1],
			[0, 1],
		])
		expect(
			lineEndTicks(
				[
					{ x: 3, y: 3 },
					{ x: 3, y: 3 },
				],
				2
			)
		).toEqual([])
		expect(lineEndTicks([{ x: 0, y: 0 }], 2)).toEqual([])
		expect(
			lineEndTicks(
				[
					{ x: 0, y: 0 },
					{ x: 1, y: 0 },
				],
				0
			)
		).toEqual([])
	})
})
