import { describe, expect, it } from "vitest"

import type { AestheticScales } from "../store/useAestheticScales"
import {
	DEFAULT_CONNECTION_CONFIG,
	EMPTY_CHANNEL_CONFIGS,
	type ChannelConfigs,
} from "./channelConfig"
import {
	comboMarksFields,
	comboPointFillResolver,
	dataLabelLayerFor,
	overlayMeasureExtent,
} from "./comboOverlay"
import { makeHueScale } from "./scales"
import { emptyEncodings, type Encodings } from "./types"

const ENC: Encodings = {
	...emptyEncodings(),
	x: { field: "month" },
	y: { field: "revenue" },
	length: { field: "units" },
	connection: { field: "series" },
}

const ROWS = [
	{ month: "Jan", units: "10", revenue: "50", series: "a" },
	{ month: "Jan", units: "8", revenue: "30", series: "b" },
]

const scales = (
	colorSlots: AestheticScales["colorSlots"] = {}
): AestheticScales => ({ colorSlots }) as unknown as AestheticScales

describe("overlayMeasureExtent", () => {
	it("spans the finite values of the column, null when there are none", () => {
		expect(overlayMeasureExtent(ROWS, "revenue")).toEqual({ min: 30, max: 50 })
		expect(overlayMeasureExtent(ROWS, "series")).toBeNull()
	})
})

describe("comboPointFillResolver", () => {
	it("unconfigured, a point takes its line's color — the theme connection color by default", () => {
		const fill = comboPointFillResolver({
			rows: ROWS,
			encodings: ENC,
			channelConfigs: EMPTY_CHANNEL_CONFIGS,
			aestheticScales: scales(),
			connectionColor: "#123456",
		})
		expect(fill(ROWS[0])).toBe("#123456")
	})

	it("follows the Line slot's per-value colors for the row's Connection value", () => {
		const configs: ChannelConfigs = {
			...EMPTY_CHANNEL_CONFIGS,
			colorSlots: {
				line: {
					field: "series",
					singleColor: "#000000",
					hue: {
						kind: "categorical",
						colors: { a: "#aa0000", b: "#00bb00" },
						stackMode: "stack",
					},
				},
			},
		}
		const lineScale = makeHueScale(
			ROWS.map((r) => r.series),
			"categorical",
			configs.colorSlots!.line!.hue
		)
		const fill = comboPointFillResolver({
			rows: ROWS,
			encodings: ENC,
			channelConfigs: configs,
			aestheticScales: scales({
				line: { scale: lineScale, field: { name: "series", type: "categorical" } },
			}),
			connectionColor: "#123456",
		})
		expect(fill(ROWS[0])).toBe("#aa0000")
		expect(fill(ROWS[1])).toBe("#00bb00")
	})

	it("follows the legacy per-value line colors when no slot is stored", () => {
		const configs: ChannelConfigs = {
			...EMPTY_CHANNEL_CONFIGS,
			connection: { ...DEFAULT_CONNECTION_CONFIG, lineColors: { b: "#0000cc" } },
		}
		const fill = comboPointFillResolver({
			rows: ROWS,
			encodings: ENC,
			channelConfigs: configs,
			aestheticScales: scales(),
			connectionColor: "#123456",
		})
		expect(fill(ROWS[0])).toBe("#123456")
		expect(fill(ROWS[1])).toBe("#0000cc")
	})

	it("the Point fill slot's single color wins over the line color", () => {
		const configs: ChannelConfigs = {
			...EMPTY_CHANNEL_CONFIGS,
			colorSlots: { comboPointFill: { field: null, singleColor: "#ff00ff" } },
		}
		const fill = comboPointFillResolver({
			rows: ROWS,
			encodings: ENC,
			channelConfigs: configs,
			aestheticScales: scales(),
			connectionColor: "#123456",
		})
		expect(fill(ROWS[0])).toBe("#ff00ff")
	})
})

describe("comboMarksFields / dataLabelLayerFor", () => {
	it("names the marks' variables: the position drawn as marks, Connection, and the Line / Point fill slot fields", () => {
		const configs: ChannelConfigs = {
			...EMPTY_CHANNEL_CONFIGS,
			colorSlots: {
				line: { field: "region", singleColor: "#000" },
				comboPointFill: { field: "tier", singleColor: "#000" },
			},
		}
		expect([...comboMarksFields("combo-x", ENC, configs)].sort()).toEqual(
			["region", "revenue", "series", "tier"].sort()
		)
		expect([...comboMarksFields("combo-y", ENC, EMPTY_CHANNEL_CONFIGS)].sort()).toEqual(
			["month", "series"].sort()
		)
		expect(comboMarksFields("bars-x", ENC, configs).size).toBe(0)
	})

	it("a label showing a marks variable goes on the marks; anything else on the bars", () => {
		const marks = comboMarksFields("combo-x", ENC, EMPTY_CHANNEL_CONFIGS)
		expect(dataLabelLayerFor({}, "series", ["series"], marks)).toBe("marks")
		expect(dataLabelLayerFor({}, "revenue", ["revenue"], marks)).toBe("marks")
		expect(dataLabelLayerFor({}, "units", ["units"], marks)).toBe("bars")
		expect(dataLabelLayerFor({}, "month", ["month"], marks)).toBe("bars")
		// A combination follows any marks variable it shows.
		expect(dataLabelLayerFor({}, "combo-1", ["units", "series"], marks)).toBe("marks")
	})

	it("an explicit entry wins; the single-field label keys by its value field", () => {
		const marks = comboMarksFields("combo-x", ENC, EMPTY_CHANNEL_CONFIGS)
		const cfg = { fieldLayers: { series: "bars" as const, units: "marks" as const } }
		expect(dataLabelLayerFor(cfg, "series", ["series"], marks)).toBe("bars")
		expect(dataLabelLayerFor(cfg, null, ["units"], marks)).toBe("marks")
		expect(dataLabelLayerFor(cfg, null, ["month"], marks)).toBe("bars")
	})
})
