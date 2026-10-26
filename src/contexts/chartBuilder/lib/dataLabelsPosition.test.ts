import { describe, expect, it } from "vitest"

import { resolveDataLabelPositions } from "./dataLabelsPosition"
import { emptyDataLabelsEncodings, emptyEncodings } from "./types"

const chart = (x: string | null, y: string | null) => {
	const e = emptyEncodings()
	return { ...e, x: { ...e.x, field: x }, y: { ...e.y, field: y } }
}

describe("resolveDataLabelPositions", () => {
	it("fills unset X / Y from the chart's encodings", () => {
		const out = resolveDataLabelPositions(
			emptyDataLabelsEncodings(),
			chart("month", "sales"),
		)
		expect(out.x.field).toBe("month")
		expect(out.y.field).toBe("sales")
	})

	it("fills Angle from the chart on polar charts; the retired R slot is never inherited", () => {
		const c = emptyEncodings()
		// The chart's r mapping is not even consulted: the label shelf has
		// no R row, so nothing inherits from it.
		const out = resolveDataLabelPositions(emptyDataLabelsEncodings(), {
			...c,
			angle: { ...c.angle, field: "share" },
			r: { ...c.r, field: "radius" },
		} as Parameters<typeof resolveDataLabelPositions>[1])
		expect(out.angle.field).toBe("share")
		expect(out.r).toBeUndefined()
	})

	it("keeps a field the user picked", () => {
		const labels = { ...emptyDataLabelsEncodings(), x: { field: "region" } }
		const out = resolveDataLabelPositions(labels, chart("month", "sales"))
		expect(out.x.field).toBe("region")
		expect(out.y.field).toBe("sales")
	})

	it("leaves an explicit — none — empty", () => {
		const labels = {
			...emptyDataLabelsEncodings(),
			y: { field: null, none: true },
		}
		const out = resolveDataLabelPositions(labels, chart("month", "sales"))
		expect(out.y.field).toBeNull()
	})

	it("returns the same object when nothing is inherited", () => {
		const labels = emptyDataLabelsEncodings()
		expect(resolveDataLabelPositions(labels, chart(null, null))).toBe(labels)
	})

	it("never touches Value — inherited position alone draws nothing", () => {
		const out = resolveDataLabelPositions(
			emptyDataLabelsEncodings(),
			chart("month", "sales"),
		)
		expect(out.value.field).toBeNull()
	})
})
