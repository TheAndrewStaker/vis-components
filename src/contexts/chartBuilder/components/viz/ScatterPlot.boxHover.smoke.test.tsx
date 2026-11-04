import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import {
	TestProvider,
	type TestStore,
} from "../../../../testSupport/TestProvider"
import { installInMemoryLocalStorage } from "../../../../testSupport/localStorageShim"
import {
	DEFAULT_AXIS_CONFIG,
	DEFAULT_DATA_LABELS_CONFIG,
	DEFAULT_DISTRIBUTION_OVERLAY_CONFIG,
	EMPTY_CHANNEL_CONFIGS,
} from "../../lib/channelConfig"
import {
	DEFAULT_HOVER_HIGHLIGHT_COLOR,
	DEFAULT_LABELS_CONFIG,
	DEFAULT_TOOLTIP_CONFIG,
} from "../../lib/labelsConfig"
import {
	emptyDataLabelsEncodings,
	emptyEncodings,
	type Dataset,
} from "../../lib/types"
import {
	currentChannelConfigsAtom,
	currentDataLabelsConfigAtom,
	currentDataLabelsEncodingsAtom,
	currentDatasetIdAtom,
	currentEncodingsAtom,
	currentFieldLevelOrdersAtom,
	currentFieldOverridesAtom,
	currentLabelsAtom,
	currentTooltipConfigAtom,
	hoveredLegendEntryAtom,
	loadedDatasetsAtom,
	previewVersionIdAtom,
} from "../../store/atoms"
import { LEGEND_HIGHLIGHT_DIM } from "../../store/useLegendHighlight"

import { ScatterPlot } from "./ScatterPlot"

/** Every part of a violin / box chart hovers on its own: the box or violin
 *  shows its category's summary statistics (printed with the value
 *  variable's format, gated by its "Fields shown" checkbox), the mean point
 *  its mean, an outlier its value, a data point its row — and a direct
 *  hover lights that one element alone. A legend hover on the category
 *  still fades the other categories' shapes. */

const DATASET_ID = "ds-box-hover"

const buildDataset = (): Dataset => ({
	id: DATASET_ID,
	name: "groups",
	fields: [
		{ name: "g", inferredType: "categorical" },
		{ name: "v", inferredType: "quantitative" },
	],
	versions: [
		{
			id: "v1",
			filename: "groups.csv",
			rows: [
				...[1, 2, 3, 4, 5].map((v) => ({ g: "a", v: String(v) })),
				...[10, 20, 30, 40, 50].map((v) => ({ g: "b", v: String(v) })),
				// 100 sits far past q3 + 1.5 × IQR: c's one Tukey outlier.
				...[10, 11, 12, 13, 14, 100].map((v) => ({ g: "c", v: String(v) })),
			],
			createdAt: 0,
		},
	],
	latestVersionId: "v1",
	createdAt: 0,
})

type MountOpts = {
	hovered?: { field: string; value: string } | null
	violin?: boolean
	visibleFields?: string[]
	yFormat?: string
	/** Leave hue unmapped: the box plot's category is then the only series
	 *  identity the hover can highlight by. */
	noHue?: boolean
	hoverRecolor?: boolean
	/** Violin AND box. */
	both?: boolean
	points?: boolean
	markMean?: boolean
}

const initState = (opts: MountOpts) => (snap: TestStore) => {
	snap.set(loadedDatasetsAtom, { [DATASET_ID]: buildDataset() })
	snap.set(currentDatasetIdAtom, DATASET_ID)
	snap.set(previewVersionIdAtom, null)
	snap.set(currentEncodingsAtom, {
		...emptyEncodings(),
		x: { field: "g" },
		y: { field: "v" },
		...(opts.noHue ? {} : { hue: { field: "g" } }),
	})
	snap.set(currentChannelConfigsAtom, {
		...EMPTY_CHANNEL_CONFIGS,
		y: {
			...DEFAULT_AXIS_CONFIG,
			...(opts.yFormat ? { customFormat: opts.yFormat } : {}),
			distributionOverlay: {
				...DEFAULT_DISTRIBUTION_OVERLAY_CONFIG,
				showBoxPlot: !opts.violin || !!opts.both,
				showDensityViolin: !!opts.violin || !!opts.both,
				showPoints: !!opts.points,
				markMean: !!opts.markMean,
			},
		},
	})
	snap.set(currentLabelsAtom, DEFAULT_LABELS_CONFIG)
	snap.set(currentDataLabelsConfigAtom, DEFAULT_DATA_LABELS_CONFIG)
	snap.set(currentDataLabelsEncodingsAtom, emptyDataLabelsEncodings())
	snap.set(currentFieldOverridesAtom, {})
	snap.set(currentFieldLevelOrdersAtom, {})
	snap.set(hoveredLegendEntryAtom, opts.hovered ?? null)
	snap.set(currentTooltipConfigAtom, {
		...DEFAULT_TOOLTIP_CONFIG,
		visibleFields: opts.visibleFields ?? [],
		hoverRecolor: !!opts.hoverRecolor,
	})
}

const mount = (opts: MountOpts = {}) => {
	installInMemoryLocalStorage()
	const { container } = render(
		<TestProvider initializeState={initState(opts)}>
			<div style={{ width: 600, height: 400 }}>
				<ScatterPlot />
			</div>
		</TestProvider>
	)
	return container
}

/** One hoverable group per violin / box body, in category order (violin
 *  before box within a category). */
const shapes = (c: HTMLElement) =>
	[...c.querySelectorAll<SVGGElement>('g[pointer-events="visible"]')].filter(
		(g) => g.querySelector("rect, path")
	)

/** One hoverable group per outlier ring. */
const outliers = (c: HTMLElement) =>
	[...c.querySelectorAll<SVGGElement>('g[pointer-events="visible"]')].filter(
		(g) => g.querySelector("circle")
	)

/** Glyph marks: the mean points, and the data points. */
const means = (c: HTMLElement) => [
	...c.querySelectorAll<SVGPathElement>("[data-box-mean] path[transform]"),
]
const points = (c: HTMLElement) =>
	[...c.querySelectorAll<SVGPathElement>("path[transform]")].filter(
		(p) => !p.closest("[data-box-mean]")
	)

const opacityOf = (el: Element | undefined) => Number(el?.getAttribute("opacity"))
const hover = (el: Element | undefined) =>
	fireEvent.mouseEnter(el as Element, { clientX: 10, clientY: 10 })

const tooltipRows = () =>
	[...document.querySelectorAll(".vc-tooltip .flex")].map((r) =>
		[...r.children].map((s) => s.textContent).join(" ")
	)

afterEach(cleanup)

describe("violin / box hover", () => {
	it("shows the box's category and summary statistics", () => {
		const c = mount()
		const [a] = shapes(c)
		expect(a).toBeDefined()
		fireEvent.mouseEnter(a as Element, { clientX: 10, clientY: 10 })
		expect(tooltipRows()).toEqual([
			"g: a",
			"Min: 1",
			"Lower whisker: 1",
			"Q1: 2",
			"Median: 3",
			"Q3: 4",
			"Upper whisker: 5",
			"Max: 5",
			"N: 5",
		])
	})

	it("hovers a violin too", () => {
		const c = mount({ violin: true })
		const b = shapes(c)[1]
		fireEvent.mouseEnter(b as Element, { clientX: 10, clientY: 10 })
		expect(tooltipRows()).toContain("Median: 30")
	})

	it("prints the statistics with the value variable's format, but not N", () => {
		const c = mount({ yFormat: "$,.2f" })
		fireEvent.mouseEnter(shapes(c)[0] as Element, { clientX: 10, clientY: 10 })
		const rows = tooltipRows()
		expect(rows).toContain("Median: $3.00")
		expect(rows).toContain("N: 5")
	})

	it("hides the statistics when the value variable is unchecked in Fields shown", () => {
		const c = mount({ visibleFields: ["g"] })
		fireEvent.mouseEnter(shapes(c)[0] as Element, { clientX: 10, clientY: 10 })
		expect(tooltipRows()).toEqual(["g: a"])
	})

	it("fades the other categories' shapes while one is hovered", () => {
		const c = mount()
		const [a, b] = shapes(c)
		expect(a?.getAttribute("opacity")).toBe("1")
		expect(b?.getAttribute("opacity")).toBe("1")
		fireEvent.mouseEnter(a as Element, { clientX: 10, clientY: 10 })
		const [a2, b2] = shapes(c)
		expect(a2?.getAttribute("opacity")).toBe("1")
		expect(Number(b2?.getAttribute("opacity"))).toBeCloseTo(LEGEND_HIGHLIGHT_DIM, 5)
	})

	for (const violin of [false, true])
		it(`recolors the hovered ${violin ? "violin" : "box"} with no hue mapped`, () => {
			const c = mount({ violin, noHue: true, hoverRecolor: true })
			const body = (g: Element | undefined) =>
				g?.querySelector(violin ? "path" : "rect")?.getAttribute("fill")
			const [a, b] = shapes(c)
			const bFill = body(b)
			fireEvent.mouseEnter(a as Element, { clientX: 10, clientY: 10 })
			const [a2, b2] = shapes(c)
			expect(body(a2)).toBe(DEFAULT_HOVER_HIGHLIGHT_COLOR)
			expect(body(b2)).toBe(bFill)
			expect(Number(b2?.getAttribute("opacity"))).toBeCloseTo(LEGEND_HIGHLIGHT_DIM, 5)
		})

	it("shows the category and the mean on a mean point, lit alone", () => {
		const c = mount({ markMean: true })
		expect(means(c)).toHaveLength(3)
		hover(means(c)[0])
		expect(tooltipRows()).toEqual(["g: a", "Mean: 3"])
		const [ma, mb] = means(c)
		expect(opacityOf(ma)).toBe(1)
		expect(opacityOf(mb)).toBeCloseTo(LEGEND_HIGHLIGHT_DIM, 5)
		// Its own box recedes with everything else.
		expect(opacityOf(shapes(c)[0])).toBeCloseTo(LEGEND_HIGHLIGHT_DIM, 5)
	})

	it("shows the category and the value on an outlier, lit alone", () => {
		const c = mount()
		const [o] = outliers(c)
		expect(outliers(c)).toHaveLength(1)
		hover(o)
		expect(tooltipRows()).toEqual(["g: c", "Outlier: 100"])
		expect(opacityOf(outliers(c)[0])).toBe(1)
		// c's own box fades: the outlier is lit, not its category.
		expect(opacityOf(shapes(c)[2])).toBeCloseTo(LEGEND_HIGHLIGHT_DIM, 5)
	})

	it("lights the box alone, not the violin around it", () => {
		const c = mount({ both: true })
		const [violinA, boxA] = shapes(c)
		hover(boxA)
		const [violinA2, boxA2] = shapes(c)
		expect(opacityOf(boxA2)).toBe(1)
		expect(opacityOf(violinA2)).toBeCloseTo(LEGEND_HIGHLIGHT_DIM, 5)
		hover(violinA)
		const [violinA3, boxA3] = shapes(c)
		expect(opacityOf(violinA3)).toBe(1)
		expect(opacityOf(boxA3)).toBeCloseTo(LEGEND_HIGHLIGHT_DIM, 5)
	})

	it("lights a hovered data point alone, not its category", () => {
		const c = mount({ points: true })
		const [p0] = points(c)
		hover(p0)
		const lit = points(c).filter((p) => opacityOf(p) === 1)
		expect(lit).toHaveLength(1)
		// Every shape recedes, its own box included.
		for (const g of shapes(c))
			expect(opacityOf(g)).toBeCloseTo(LEGEND_HIGHLIGHT_DIM, 5)
	})

	it("leaves the box's own points faded while the box is hovered", () => {
		const c = mount({ points: true })
		hover(shapes(c)[0])
		expect(points(c).every((p) => opacityOf(p) < 1)).toBe(true)
	})

	it("fades with a legend hover on the category", () => {
		const c = mount({ hovered: { field: "g", value: "b" } })
		const [a, b] = shapes(c)
		expect(Number(a?.getAttribute("opacity"))).toBeCloseTo(LEGEND_HIGHLIGHT_DIM, 5)
		expect(b?.getAttribute("opacity")).toBe("1")
	})
})
