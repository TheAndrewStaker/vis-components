import { describe, expect, it } from "vitest"
import type { ChannelConfigs, HueConfig } from "./channelConfig"
import {
	colorLinkSource,
	linkColorConfigs,
	linkedCategoryColors,
	withLinkedColors,
} from "./linkedHueColors"
import type { Encodings } from "./types"

const CAT = ["#c1", "#c2", "#c3", "#c4"]
const TEXT = ["#t1", "#t2", "#t3", "#t4"]

const hue = (colors: Record<string, string>): HueConfig => ({
	kind: "categorical",
	colors,
	stackMode: "stack",
})

const encodings = (over: Partial<Encodings> = {}) =>
	({
		hue: { field: "region" },
		outlineHue: { field: null },
		connection: { field: null },
		...over,
	}) as Pick<Encodings, "hue" | "outlineHue" | "connection">

const configs = (colors: Record<string, string>, over: ChannelConfigs = {}) =>
	({ hue: hue(colors), categoricalPalette: CAT, ...over }) as ChannelConfigs

describe("linkedCategoryColors", () => {
	it("re-reads each palette pick at the same position in the target palette", () => {
		// Color uses the 2nd and 4th categorical colors, out of order.
		const link = colorLinkSource(
			encodings(),
			configs({ East: "#c2", West: "#C4" }),
			"categorical"
		)
		expect(linkedCategoryColors(link, "region", TEXT)).toEqual({
			East: "#t2",
			West: "#t4",
		})
	})

	it("leaves custom colors to their default position (no entry)", () => {
		const link = colorLinkSource(
			encodings(),
			configs({ East: "#123456", West: "#c3" }),
			"categorical"
		)
		expect(linkedCategoryColors(link, "region", TEXT)).toEqual({ West: "#t3" })
	})

	it("wraps when the target palette is shorter", () => {
		const link = colorLinkSource(encodings(), configs({ East: "#c4" }), "categorical")
		expect(linkedCategoryColors(link, "region", ["#a", "#b", "#c"])).toEqual({
			East: "#a",
		})
	})

	it("matches against the ordinal palette for ordinal fields", () => {
		const link = colorLinkSource(
			encodings(),
			configs({ Low: "#o3" }, { ordinalPalette: ["#o1", "#o2", "#o3"] }),
			"ordinal"
		)
		expect(linkedCategoryColors(link, "region", TEXT)).toEqual({ Low: "#t3" })
	})

	it("inherits nothing for another field, a gradient, or no picks", () => {
		const link = colorLinkSource(encodings(), configs({ East: "#c2" }), "categorical")
		expect(linkedCategoryColors(link, "other", TEXT)).toEqual({})
		expect(
			colorLinkSource(encodings(), configs({ East: "#c2" }), "quantitative")
		).toBeNull()
		expect(colorLinkSource(encodings(), configs({}), "categorical")).toBeNull()
	})
})

describe("withLinkedColors", () => {
	it("lays the secondary's own overrides over the inherited ones", () => {
		expect(
			withLinkedColors(hue({ East: "#mine" }), { East: "#t2", West: "#t4" })
		).toEqual(hue({ East: "#mine", West: "#t4" }))
	})

	it("passes through when there is nothing to inherit", () => {
		const own = hue({ East: "#mine" })
		expect(withLinkedColors(own, {})).toBe(own)
	})
})

describe("linkColorConfigs", () => {
	it("seeds same-field color slots, outline, and line-palette colors", () => {
		const out = linkColorConfigs(
			configs(
				{ East: "#c2" },
				{
					colorSlots: {
						line: { field: "region", palette: TEXT, singleColor: "#000" },
						rug: { field: "other", palette: TEXT, singleColor: "#000" },
					},
					outlineHue: hue({}),
					outlineCategoricalPalette: ["#o1", "#o2"],
					connection: {
						lineColors: { West: "#own" },
						linePalette: ["#l1", "#l2"],
					} as unknown as ChannelConfigs["connection"],
				}
			),
			encodings({ outlineHue: { field: "region" } }),
			"categorical"
		)
		expect(out.colorSlots?.line?.hue).toEqual(
			expect.objectContaining({ colors: { East: "#t2" } })
		)
		expect(out.colorSlots?.rug?.hue).toBeUndefined()
		expect(out.outlineHue).toEqual(hue({ East: "#o2" }))
		expect(out.connection?.lineColors).toEqual({ East: "#l2", West: "#own" })
	})

	it("returns the configs untouched when Color has no palette picks", () => {
		const c = configs({ East: "#custom" })
		expect(linkColorConfigs(c, encodings(), "categorical")).toBe(c)
	})
})
