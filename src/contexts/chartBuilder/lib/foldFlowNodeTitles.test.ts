import { describe, expect, it } from "vitest"

import { foldFlowNodeTitles } from "./foldFlowNodeTitles"

const flowVisual = (
	layout: string,
	labelsConfig: Record<string, unknown>,
	dataLabelsConfig?: Record<string, unknown>
) => ({
	id: "v1",
	channelConfigs: { connection: { hierarchyLayout: layout } },
	labelsConfig,
	...(dataLabelsConfig ? { dataLabelsConfig } : {}),
})

describe("foldFlowNodeTitles", () => {
	it("moves Node-titles styling into Data Labels and drops the entries", () => {
		const v = flowVisual(
			"sankey",
			{
				fontOverrides: {
					nodeTitle: {
						family: "Georgia",
						size: 14,
						weight: 700,
						italic: true,
						color: "#ff0000",
					},
					chartTitle: { size: 20 },
				},
				titleAlignments: { nodeTitle: "right" },
				titleOffsets: { nodeTitle: { x: 4, y: -2, distance: 9 } },
			},
			{ fontFamily: "system-ui", fontSize: 11, decimals: 1 }
		)
		const out = foldFlowNodeTitles(v)
		expect(out.dataLabelsConfig).toEqual({
			fontFamily: "Georgia",
			fontSize: 14,
			fontWeight: 700,
			italic: true,
			color: "#ff0000",
			alignment: "right",
			xOffset: 4,
			yOffset: -2,
			decimals: 1,
		})
		expect(out.labelsConfig).toEqual({
			fontOverrides: { chartTitle: { size: 20 } },
			titleAlignments: {},
			titleOffsets: {},
		})
	})

	it("builds a sparse Data Labels config when the visual has none", () => {
		const out = foldFlowNodeTitles(
			flowVisual("chord", { fontOverrides: { nodeTitle: { size: 9 } } })
		)
		expect(out.dataLabelsConfig).toEqual({ fontSize: 9 })
	})

	it("is idempotent and returns the same reference when there's nothing to move", () => {
		const v = flowVisual("chord", {
			fontOverrides: { nodeTitle: { color: "#000" } },
		})
		const once = foldFlowNodeTitles(v)
		expect(foldFlowNodeTitles(once)).toBe(once)
		const plain = flowVisual("chord", { fontOverrides: {} })
		expect(foldFlowNodeTitles(plain)).toBe(plain)
	})

	it("leaves non-flow visuals alone (the entry was inert there)", () => {
		const v = flowVisual("pack", {
			fontOverrides: { nodeTitle: { color: "#000" } },
		})
		expect(foldFlowNodeTitles(v)).toBe(v)
		const bare = { id: "v2", labelsConfig: { fontOverrides: {} } }
		expect(foldFlowNodeTitles(bare)).toBe(bare)
	})

	it("tolerates non-record input", () => {
		expect(foldFlowNodeTitles(null)).toBe(null)
		expect(foldFlowNodeTitles("x")).toBe("x")
	})
})
