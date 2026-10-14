import { describe, expect, it } from "vitest"
import {
	DEFAULT_DATA_LABELS_CONFIG,
	type DataLabelsConfig,
} from "../../../lib/channelConfig"
import { BAR_LABEL_EDGE_PAD_PX } from "../../../lib/dataLabelsLayout"
import { ptToPx } from "../../../lib/fontUnit"
import { DEFAULT_MAP_CONFIG } from "../../../lib/mapConfig"
import { BASE_MARGIN } from "../../../lib/plotLayout"
import {
	emptyDataLabelsEncodings,
	emptyEncodings,
	type DatasetView,
	type Encodings,
} from "../../../lib/types"
import {
	LABEL_RESERVE_PAD_PX,
	computeDataLabelOverflow,
} from "./dataLabelReserve"
import { measureMaxLabelWidth } from "./measureText"

const view = (rows: Array<Record<string, string>>): DatasetView => ({
	id: "ds",
	name: "d",
	filename: "d.csv",
	fields: [
		{ name: "cat", inferredType: "categorical" },
		{ name: "val", inferredType: "quantitative" },
		{ name: "name", inferredType: "categorical" },
	],
	rows,
	createdAt: 0,
	versionCreatedAt: 0,
	versionId: "v1",
	versionIndex: 1,
	totalVersions: 1,
	isLatest: true,
})

const LONG = "A".repeat(40)
const ROWS = [
	{ cat: "a", val: "1", name: LONG },
	{ cat: "b", val: "2", name: "short" },
]

const scatterEncodings = (): Encodings => {
	const e = emptyEncodings()
	e.x = { field: "cat" }
	e.y = { field: "val" }
	return e
}

const labelsOn = (over: Partial<DataLabelsConfig> = {}): DataLabelsConfig => ({
	...DEFAULT_DATA_LABELS_CONFIG,
	...over,
})

/** Position + value mapped on the Data Labels shelf — the layer's render
 *  gate, which the reserve mirrors. */
const positionEncodings = () => ({
	...emptyDataLabelsEncodings(),
	x: { field: "cat" },
	y: { field: "val" },
})

const nameValueEncodings = () => ({
	...positionEncodings(),
	value: { field: "name" },
})

const base = {
	overrides: {},
	channelConfigs: {},
	mapConfig: DEFAULT_MAP_CONFIG,
	dataLabelsEncodings: nameValueEncodings(),
}

/** The reserve math's label width, computed with the same primitives the
 *  implementation uses (canvas measure with a char-count fallback), so the
 *  expectations hold in DOM-less and canvas-capable environments alike. */
const labelPx = (text: string, dataLabels: DataLabelsConfig): number => {
	const fontPx = ptToPx(dataLabels.fontSize)
	const measured = measureMaxLabelWidth(
		[text],
		dataLabels.fontFamily,
		fontPx,
		dataLabels.fontWeight,
		dataLabels.italic,
	)
	return measured > 0 ? measured : text.length * fontPx * 0.55
}

const cap = (n: number) => Math.max(0, Math.ceil(n))

describe("computeDataLabelOverflow", () => {
	it("reserves nothing without a dataset", () => {
		expect(
			computeDataLabelOverflow({
				...base,
				dataset: undefined,
				encodings: scatterEncodings(),
				dataLabels: labelsOn(),
			}),
		).toEqual({ left: 0, right: 0 })
	})

	it("reserves nothing when neither a label value nor a length/y fallback is mapped", () => {
		expect(
			computeDataLabelOverflow({
				...base,
				dataset: view(ROWS),
				encodings: emptyEncodings(),
				dataLabels: labelsOn(),
				dataLabelsEncodings: emptyDataLabelsEncodings(),
			}),
		).toEqual({ left: 0, right: 0 })
	})

	it("reserves nothing while labels aren't mapped, even with a y field of long names", () => {
		// The chart's y field composes the label TEXT when the Value is
		// unmapped — but no label renders until position AND value are
		// mapped, so nothing may be reserved for them.
		const e = scatterEncodings()
		e.y = { field: "name" }
		const unlabeled = {
			...base,
			dataset: view(ROWS),
			encodings: e,
			dataLabels: labelsOn({ alignment: "center" }),
		}
		expect(
			computeDataLabelOverflow({
				...unlabeled,
				dataLabelsEncodings: emptyDataLabelsEncodings(),
			}),
		).toEqual({ left: 0, right: 0 })
		// Value alone (no position) still draws nothing.
		expect(
			computeDataLabelOverflow({
				...unlabeled,
				dataLabelsEncodings: {
					...emptyDataLabelsEncodings(),
					value: { field: "name" },
				},
			}),
		).toEqual({ left: 0, right: 0 })
		// Position alone (no value) still draws nothing.
		expect(
			computeDataLabelOverflow({
				...unlabeled,
				dataLabelsEncodings: positionEncodings(),
			}),
		).toEqual({ left: 0, right: 0 })
		// Both mapped: the long name reserves on both sides.
		const labeled = computeDataLabelOverflow({
			...unlabeled,
			dataLabelsEncodings: nameValueEncodings(),
		})
		expect(labeled.right).toBeGreaterThan(0)
		expect(labeled.left).toBeGreaterThan(0)
	})

	it("left alignment reserves the full label width on the right only", () => {
		const dataLabels = labelsOn({ alignment: "left", xOffset: 0 })
		const r = computeDataLabelOverflow({
			...base,
			dataset: view(ROWS),
			encodings: scatterEncodings(),
			dataLabels,
		})
		expect(r.left).toBe(0)
		expect(r.right).toBe(cap(labelPx(LONG, dataLabels) + LABEL_RESERVE_PAD_PX - BASE_MARGIN.right))
		expect(r.right).toBeGreaterThan(0)
	})

	it("right alignment mirrors to the left, netting out the wider left base margin", () => {
		const dataLabels = labelsOn({ alignment: "right", xOffset: 0 })
		const r = computeDataLabelOverflow({
			...base,
			dataset: view(ROWS),
			encodings: scatterEncodings(),
			dataLabels,
		})
		expect(r.right).toBe(0)
		expect(r.left).toBe(cap(labelPx(LONG, dataLabels) + LABEL_RESERVE_PAD_PX - BASE_MARGIN.left))
	})

	it("center alignment splits the width half to each side", () => {
		const dataLabels = labelsOn({ alignment: "center", xOffset: 0 })
		const r = computeDataLabelOverflow({
			...base,
			dataset: view(ROWS),
			encodings: scatterEncodings(),
			dataLabels,
		})
		const half = labelPx(LONG, dataLabels) / 2
		expect(r.right).toBe(cap(half + LABEL_RESERVE_PAD_PX - BASE_MARGIN.right))
		expect(r.left).toBe(cap(half + LABEL_RESERVE_PAD_PX - BASE_MARGIN.left))
	})

	it("a positive xOffset shifts reserve to the right, away from the left", () => {
		const at = (xOffset: number) =>
			computeDataLabelOverflow({
				...base,
				dataset: view(ROWS),
				encodings: scatterEncodings(),
				dataLabels: labelsOn({ alignment: "left", xOffset }),
			})
		expect(at(10).right).toBe(at(0).right + 10)
		expect(at(10).left).toBe(0)
	})

	it("does not cap the reserve — a very long label reserves its full width", () => {
		// The solver owns the floor (fit-mode clamp); the estimate itself must
		// report the real demand so a 700px end-of-line label can compress the
		// plot instead of clipping at a fixed 400px.
		const dataLabels = labelsOn({ alignment: "left" })
		const long = "B".repeat(600)
		const r = computeDataLabelOverflow({
			...base,
			dataset: view([{ cat: "a", val: "1", name: long }]),
			encodings: scatterEncodings(),
			dataLabels,
		})
		expect(r.right).toBeGreaterThan(400)
		expect(r.right).toBe(cap(labelPx(long, dataLabels) + LABEL_RESERVE_PAD_PX - BASE_MARGIN.right))
	})

	it("uses sizeMax for the width estimate when the size channel is mapped", () => {
		const dataLabels = labelsOn({
			alignment: "left",
			sizeMax: DEFAULT_DATA_LABELS_CONFIG.fontSize * 2,
		})
		const unsized = computeDataLabelOverflow({
			...base,
			dataset: view(ROWS),
			encodings: scatterEncodings(),
			dataLabels,
		})
		const sized = computeDataLabelOverflow({
			...base,
			dataset: view(ROWS),
			encodings: scatterEncodings(),
			dataLabels,
			dataLabelsEncodings: {
				...nameValueEncodings(),
				size: { field: "val" },
			},
		})
		expect(sized.right).toBeGreaterThan(unsized.right)
	})

	it("endpoint mode reserves for the last label's own offset override", () => {
		const plain = computeDataLabelOverflow({
			...base,
			dataset: view(ROWS),
			encodings: scatterEncodings(),
			dataLabels: labelsOn({ alignment: "left", xOffset: 0 }),
		})
		const endpoint = computeDataLabelOverflow({
			...base,
			dataset: view(ROWS),
			encodings: scatterEncodings(),
			dataLabels: labelsOn({
				alignment: "left",
				xOffset: 0,
				labelPoints: "first-last",
				lastLabel: { xOffset: 25 },
			}),
		})
		expect(endpoint.right).toBe(plain.right + 25)
	})
})

describe("computeDataLabelOverflow — series-end populations touch one edge", () => {
	/** Stacked area: temporal-ish x, quantitative y, one series per `name`. */
	const areaEncodings = (): Encodings => {
		const e = emptyEncodings()
		e.x = { field: "cat" }
		e.length = { field: "val" }
		e.hue = { field: "name" }
		e.connection = { field: "name" }
		return e
	}
	/** Horizontal bars: categorical y, length on x — series ends are the
	 *  top / bottom anchors, so either one can touch either side. */
	const barsYEncodings = (): Encodings => {
		const e = emptyEncodings()
		e.y = { field: "cat" }
		e.length = { field: "val" }
		return e
	}

	it("a right-aligned LAST label hangs over the plot: no left reserve", () => {
		// The reported bug: "Last" + right alignment opened a label-wide
		// gutter on the left for a label that only renders at the right edge.
		const r = computeDataLabelOverflow({
			...base,
			dataset: view(ROWS),
			encodings: areaEncodings(),
			dataLabels: labelsOn({
				alignment: "right",
				xOffset: -14,
				labelPoints: "last",
			}),
		})
		expect(r).toEqual({ left: 0, right: 0 })
	})

	it("a left-aligned LAST label still reserves on the right", () => {
		const dataLabels = labelsOn({ alignment: "left", xOffset: 0, labelPoints: "last" })
		const r = computeDataLabelOverflow({
			...base,
			dataset: view(ROWS),
			encodings: areaEncodings(),
			dataLabels,
		})
		expect(r.left).toBe(0)
		expect(r.right).toBe(cap(labelPx(LONG, dataLabels) + LABEL_RESERVE_PAD_PX - BASE_MARGIN.right))
	})

	it("a right-aligned FIRST label reserves on the left only", () => {
		const dataLabels = labelsOn({ alignment: "right", xOffset: 0, labelPoints: "first" })
		const r = computeDataLabelOverflow({
			...base,
			dataset: view(ROWS),
			encodings: areaEncodings(),
			dataLabels,
		})
		expect(r.right).toBe(0)
		expect(r.left).toBe(cap(labelPx(LONG, dataLabels) + LABEL_RESERVE_PAD_PX - BASE_MARGIN.left))
	})

	it("a left-aligned FIRST label hangs over the plot: no reserve", () => {
		const r = computeDataLabelOverflow({
			...base,
			dataset: view(ROWS),
			encodings: areaEncodings(),
			dataLabels: labelsOn({ alignment: "left", xOffset: 0, labelPoints: "first" }),
		})
		expect(r).toEqual({ left: 0, right: 0 })
	})

	it("'all' labels keep reserving on the side the alignment extends toward", () => {
		const dataLabels = labelsOn({ alignment: "right", xOffset: 0, labelPoints: "all" })
		const r = computeDataLabelOverflow({
			...base,
			dataset: view(ROWS),
			encodings: areaEncodings(),
			dataLabels,
		})
		expect(r.right).toBe(0)
		expect(r.left).toBe(cap(labelPx(LONG, dataLabels) + LABEL_RESERVE_PAD_PX - BASE_MARGIN.left))
	})

	it("horizontal bars rank ends on y, so a LAST label may sit at either side", () => {
		const dataLabels = labelsOn({ alignment: "right", xOffset: 0, labelPoints: "last" })
		const r = computeDataLabelOverflow({
			...base,
			dataset: view(ROWS),
			encodings: barsYEncodings(),
			dataLabels,
		})
		expect(r.left).toBe(cap(labelPx(LONG, dataLabels) + LABEL_RESERVE_PAD_PX - BASE_MARGIN.left))
	})

	it("a single x value makes every series end both first and last", () => {
		const dataLabels = labelsOn({ alignment: "right", xOffset: 0, labelPoints: "last" })
		const r = computeDataLabelOverflow({
			...base,
			dataset: view([
				{ cat: "a", val: "1", name: LONG },
				{ cat: "a", val: "2", name: "short" },
			]),
			encodings: areaEncodings(),
			dataLabels,
		})
		expect(r.left).toBe(cap(labelPx(LONG, dataLabels) + LABEL_RESERVE_PAD_PX - BASE_MARGIN.left))
	})
})

describe("computeDataLabelOverflow — series ends per facet panel", () => {
	/** Vertical bars faceted by `name`: the dataset has two x values, but
	 *  each panel holds ONE bar, so its series end is first AND last. */
	const facetedBars = (): Encodings => {
		const e = emptyEncodings()
		e.x = { field: "cat" }
		e.length = { field: "val" }
		e.facet = { field: "name" }
		return e
	}
	const cap = (n: number) => Math.max(0, Math.ceil(n))

	it("one bar per facet keeps both edges, so Last reserves like All", () => {
		// User report: switching Which labels from All to Last / First on a
		// one-bar-per-facet chart moved the labels — the left reserve was
		// dropped because the WHOLE dataset has several x values.
		const rows = [
			{ cat: "a", val: "1", name: LONG },
			{ cat: "b", val: "2", name: "short" },
		]
		const all = computeDataLabelOverflow({
			...base,
			dataset: view(rows),
			encodings: facetedBars(),
			dataLabels: labelsOn({ alignment: "right", labelPoints: "all" }),
		})
		for (const labelPoints of ["last", "first"] as const) {
			const r = computeDataLabelOverflow({
				...base,
				dataset: view(rows),
				encodings: facetedBars(),
				dataLabels: labelsOn({ alignment: "right", labelPoints }),
			})
			expect(r).toEqual(all)
		}
		expect(all.left).toBe(
			cap(
				labelPx(LONG, labelsOn({ alignment: "right" })) +
					LABEL_RESERVE_PAD_PX -
					BASE_MARGIN.left
			)
		)
	})
})

describe("computeDataLabelOverflow — per-variable label populations", () => {
	const multiEncodings = () => ({
		...positionEncodings(),
		value: { field: null, multiField: true, fields: ["val", "name"] },
	})
	it("reserves for a last-label population's own offset and template", () => {
		// `val` on every label, `name` (the long one) on the last only, pushed
		// right by its override: the reserve must cover the LONG name at +25,
		// not just the short value labels at the base offset.
		const plain = computeDataLabelOverflow({
			...base,
			dataset: view(ROWS),
			encodings: scatterEncodings(),
			dataLabelsEncodings: multiEncodings(),
			dataLabels: labelsOn({
				alignment: "left",
				xOffset: 0,
				fieldLabelPoints: { name: "last" },
			}),
		})
		const pushed = computeDataLabelOverflow({
			...base,
			dataset: view(ROWS),
			encodings: scatterEncodings(),
			dataLabelsEncodings: multiEncodings(),
			dataLabels: labelsOn({
				alignment: "left",
				xOffset: 0,
				fieldLabelPoints: { name: "last" },
				lastLabel: { xOffset: 25 },
			}),
		})
		expect(pushed.right).toBe(plain.right + 25)
		// The long name only renders on the last population; a value-only
		// layer reserves strictly less.
		const valueOnly = computeDataLabelOverflow({
			...base,
			dataset: view(ROWS),
			encodings: scatterEncodings(),
			dataLabelsEncodings: {
				...positionEncodings(),
				value: { field: null, multiField: true, fields: ["val"] },
			},
			dataLabels: labelsOn({ alignment: "left", xOffset: 0 }),
		})
		expect(plain.right).toBeGreaterThan(valueOnly.right)
	})
})

describe("computeDataLabelOverflow — bar side (beside a vertical bar)", () => {
	// x = category + length = measure → vertical bars. Beside the bar the
	// layer forces the text to hang away from it and anchors on the edge
	// plus the pad; the reserve mirrors both so the label stays in view.
	const barEncodings = (): Encodings => {
		const e = emptyEncodings()
		e.x = { field: "cat" }
		e.length = { field: "val" }
		return e
	}

	it("'after' reserves the full width on the right (+ pad), whatever alignment is stored", () => {
		const dataLabels = labelsOn({
			alignment: "right",
			xOffset: 0,
			barLabelSide: "after",
		})
		const r = computeDataLabelOverflow({
			...base,
			dataset: view(ROWS),
			encodings: barEncodings(),
			dataLabels,
		})
		expect(r.left).toBe(0)
		expect(r.right).toBe(
			cap(
				BAR_LABEL_EDGE_PAD_PX +
					labelPx(LONG, dataLabels) +
					LABEL_RESERVE_PAD_PX -
					BASE_MARGIN.right
			)
		)
	})

	it("'before' mirrors to the left", () => {
		const dataLabels = labelsOn({
			alignment: "left",
			xOffset: 0,
			barLabelSide: "before",
		})
		const r = computeDataLabelOverflow({
			...base,
			dataset: view(ROWS),
			encodings: barEncodings(),
			dataLabels,
		})
		expect(r.right).toBe(0)
		expect(r.left).toBe(
			cap(
				BAR_LABEL_EDGE_PAD_PX +
					labelPx(LONG, dataLabels) +
					LABEL_RESERVE_PAD_PX -
					BASE_MARGIN.left
			)
		)
	})

	it("a stored side on a scatter changes nothing", () => {
		const dataLabels = labelsOn({ alignment: "left", xOffset: 0 })
		const plain = computeDataLabelOverflow({
			...base,
			dataset: view(ROWS),
			encodings: scatterEncodings(),
			dataLabels,
		})
		const withSide = computeDataLabelOverflow({
			...base,
			dataset: view(ROWS),
			encodings: scatterEncodings(),
			dataLabels: { ...dataLabels, barLabelSide: "after" },
		})
		expect(withSide).toEqual(plain)
	})
})

describe("computeDataLabelOverflow — per-variable bar side (separate variables)", () => {
	const barEncodings = (): Encodings => {
		const e = emptyEncodings()
		e.x = { field: "cat" }
		e.length = { field: "val" }
		return e
	}
	const separateEncodings = () => ({
		...positionEncodings(),
		value: { field: null, multiField: true, fields: ["name", "val"] },
	})

	it("only the variable beside the bar reserves on that side", () => {
		const dataLabels = labelsOn({
			combineVariables: false,
			alignment: "center",
			xOffset: 0,
			fieldBarPlacements: { name: { side: "after" } },
		})
		const r = computeDataLabelOverflow({
			...base,
			dataset: view(ROWS),
			encodings: barEncodings(),
			dataLabels,
			dataLabelsEncodings: separateEncodings(),
		})
		// "name" hangs rightward from the edge: full width + pad on the right.
		expect(r.right).toBe(
			cap(
				BAR_LABEL_EDGE_PAD_PX +
					labelPx(LONG, dataLabels) +
					LABEL_RESERVE_PAD_PX -
					BASE_MARGIN.right
			)
		)
		// "val" stays centered: half its (short) width each side, which the
		// base margins already cover.
		expect(r.left).toBe(0)
	})
})
