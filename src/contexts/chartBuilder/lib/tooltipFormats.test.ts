import { describe, expect, it } from "vitest"

import { DEFAULT_AXIS_CONFIG, type ChannelConfigs } from "./channelConfig"
import { emptyEncodings, type Encodings } from "./types"
import {
	applyTooltipFormats,
	formatTooltipValue,
	tooltipFieldFormats,
} from "./tooltipFormats"

const encodingsWith = (map: Partial<Record<string, string>>): Encodings => {
	const out = emptyEncodings()
	for (const [ch, field] of Object.entries(map))
		out[ch as keyof Encodings] = { field: field ?? null }
	return out
}

const axis = (customFormat: string) => ({ ...DEFAULT_AXIS_CONFIG, customFormat })

describe("tooltipFieldFormats", () => {
	it("inherits an axis format for the field mapped to that axis", () => {
		const formats = tooltipFieldFormats({
			encodings: encodingsWith({ x: "Region", y: "Sales" }),
			channelConfigs: { y: axis("$,.0f") } as ChannelConfigs,
		})
		expect(formats.get("Sales")).toBe("$,.0f")
		expect(formats.has("Region")).toBe(false)
	})

	it("reads the measure axis for a bar chart, where the value rides on `length`", () => {
		// Vertical bars: category on x, measure on `length` with no y field —
		// the y axis is what prints that measure, so its format is the one.
		const formats = tooltipFieldFormats({
			encodings: encodingsWith({ x: "Region", length: "Sales" }),
			channelConfigs: { y: axis(",.1f") } as ChannelConfigs,
		})
		expect(formats.get("Sales")).toBe(",.1f")
	})

	it("ranks the axis above the legend and the data labels for the same variable", () => {
		const encodings = encodingsWith({ x: "Share", opacity: "Share" })
		const formats = tooltipFieldFormats({
			encodings,
			channelConfigs: { x: axis(".0%") } as ChannelConfigs,
			legendConfig: { channels: { opacity: { format: ".2%", breakCount: 5, breaks: [] } } },
			dataLabels: { fieldFormats: { Share: ".3%" } },
		})
		expect(formats.get("Share")).toBe(".0%")
	})

	it("ranks a legend format above a data label's when no axis carries one", () => {
		const formats = tooltipFieldFormats({
			encodings: encodingsWith({ opacity: "Share" }),
			channelConfigs: {},
			legendConfig: { channels: { opacity: { format: ".2%", breakCount: 5, breaks: [] } } },
			dataLabels: { fieldFormats: { Share: ".3%" } },
		})
		expect(formats.get("Share")).toBe(".2%")
	})

	it("falls back to a data label's per-variable format", () => {
		const formats = tooltipFieldFormats({
			encodings: encodingsWith({ x: "Region", y: "Sales" }),
			channelConfigs: {},
			dataLabels: { fieldFormats: { Sales: "$,.2f" } },
		})
		expect(formats.get("Sales")).toBe("$,.2f")
	})

	it("claims nothing for an Auto format, so a later source can still format the field", () => {
		const formats = tooltipFieldFormats({
			encodings: encodingsWith({ y: "Sales" }),
			channelConfigs: { y: axis("") } as ChannelConfigs,
			dataLabels: { fieldFormats: { Sales: "$,.0f" } },
		})
		expect(formats.get("Sales")).toBe("$,.0f")
	})

	it("inherits the chord ring axis's format for the flow value", () => {
		const formats = tooltipFieldFormats({
			encodings: encodingsWith({ connection: "From", area: "Flow" }),
			channelConfigs: {
				connection: { chordAxis: { enabled: true, tickCount: 100, customFormat: ",.0f", labelEvery: 5 } },
			} as ChannelConfigs,
		})
		expect(formats.get("Flow")).toBe(",.0f")
	})

	it("is empty when nothing anywhere carries a format", () => {
		const formats = tooltipFieldFormats({
			encodings: encodingsWith({ x: "Region", y: "Sales" }),
			channelConfigs: { x: axis(""), y: axis("") } as ChannelConfigs,
		})
		expect(formats.size).toBe(0)
	})
})

describe("formatTooltipValue", () => {
	it("applies a d3 number spec", () => {
		expect(formatTooltipValue(1234.5, "$,.0f")).toBe("$1,235")
	})

	it("applies the Before / After text around the spec", () => {
		expect(formatTooltipValue(1234.5, ",.0f kg")).toBe("1,235 kg")
	})

	it("stringifies unformatted values exactly as the tooltip always did", () => {
		expect(formatTooltipValue(1234.5, undefined)).toBe("1234.5")
		expect(formatTooltipValue(null, undefined)).toBe("")
	})

	it("prints a date cell verbatim under `literal` (the hovered value IS the cell)", () => {
		expect(formatTooltipValue("7/15/1988", "literal")).toBe("7/15/1988")
	})

	it("coerces a numeric string, so CSV cells format like axis ticks", () => {
		expect(formatTooltipValue("0.1432", ".1%")).toBe("14.3%")
	})
})

describe("applyTooltipFormats", () => {
	it("formats only the fields that inherit one, leaving the rest untouched", () => {
		const out = applyTooltipFormats(
			[
				{ name: "Region", value: "West" },
				{ name: "Sales", value: 1234.5 },
			],
			new Map([["Sales", "$,.0f"]]),
		)
		expect(out).toEqual([
			{ name: "Region", value: "West" },
			{ name: "Sales", value: "$1,235" },
		])
	})

	it("returns the same array when no field inherits a format", () => {
		const fields = [{ name: "Region", value: "West" }]
		expect(applyTooltipFormats(fields, new Map())).toBe(fields)
		expect(applyTooltipFormats(fields, new Map([["Sales", "$,.0f"]]))).toBe(fields)
	})
})
