import { describe, expect, it } from "vitest"
import {
	DEFAULT_CAPTION_CONFIG,
	type CaptionConfig,
} from "../../../lib/captionConfig"
import {
	captionDrawnExtent,
	measureCaptionBox,
	positionCaptionBox,
} from "./captionLayout"

const CANVAS_W = 900
const CANVAS_H = 600

const caption = (over: Partial<CaptionConfig> = {}): CaptionConfig => ({
	...DEFAULT_CAPTION_CONFIG,
	enabled: true,
	text: "Source: West Health-Gallup Center on Healthcare in America.",
	align: "left",
	backgroundOpacity: 0,
	borderEnabled: false,
	...over,
})

const extentFor = (cfg: CaptionConfig) => {
	const box = measureCaptionBox(cfg, CANVAS_W, CANVAS_H)
	if (!box) throw new Error("caption should measure")
	const layout = positionCaptionBox(cfg, box, CANVAS_W, CANVAS_H)
	return { layout, extent: captionDrawnExtent(cfg, layout) }
}

describe("captionDrawnExtent", () => {
	it("an invisible auto-width box nudged a few px right stays inside the canvas", () => {
		// The auto-width box spans the canvas minus a gap on each side, so its
		// right edge DOES pass the canvas after a 15px nudge — but nothing
		// visible does: the short left-aligned text has plenty of room.
		const { layout, extent } = extentFor(caption({ offsetX: 15 }))
		expect(layout.left + layout.width).toBeGreaterThan(CANVAS_W)
		expect(extent.right).toBeLessThanOrEqual(CANVAS_W)
		expect(extent.bottom).toBeLessThanOrEqual(CANVAS_H)
	})

	it("an invisible box nudged a few px down stays inside the canvas", () => {
		const { layout, extent } = extentFor(caption({ offsetY: 10 }))
		expect(layout.top + layout.height).toBeGreaterThan(CANVAS_H)
		expect(extent.bottom).toBeLessThanOrEqual(CANVAS_H)
	})

	it("text nudged far enough DOES pass the canvas edge", () => {
		const { extent } = extentFor(caption({ offsetX: CANVAS_W }))
		expect(extent.right).toBeGreaterThan(CANVAS_W)
	})

	it("a visible border makes the whole box count", () => {
		const { layout, extent } = extentFor(
			caption({ offsetX: 15, borderEnabled: true, borderWidth: 1 })
		)
		expect(extent.right).toBe(layout.left + layout.width)
		expect(extent.right).toBeGreaterThan(CANVAS_W)
	})

	it("a visible background makes the whole box count", () => {
		const { layout, extent } = extentFor(
			caption({ offsetY: 10, backgroundOpacity: 1 })
		)
		expect(extent.bottom).toBe(layout.top + layout.height)
	})

	it("right-aligned text ends at its anchor; centered text spreads both ways", () => {
		const right = extentFor(caption({ align: "right" }))
		expect(right.extent.right).toBe(right.layout.textX)
		const center = extentFor(caption({ align: "center" }))
		expect(center.extent.right).toBeGreaterThan(center.layout.textX)
		expect(center.extent.right).toBeLessThan(center.layout.left + center.layout.width)
	})
})
