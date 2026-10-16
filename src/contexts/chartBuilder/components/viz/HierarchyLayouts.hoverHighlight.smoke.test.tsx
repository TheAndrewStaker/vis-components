import { cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import {
	TestProvider,
	type TestStore,
} from "../../../../testSupport/TestProvider"
import { installInMemoryLocalStorage } from "../../../../testSupport/localStorageShim"
import { buildDataset as buildDatasetFixture } from "../../../../testSupport/fixtures"
import { type ChannelConfigs } from "../../lib/channelConfig"
import { DEFAULT_LABELS_CONFIG } from "../../lib/labelsConfig"
import { hierarchyHighlightField } from "../../lib/packedMeasure"
import { emptyEncodings, type Dataset } from "../../lib/types"
import {
	currentChannelConfigsAtom,
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

import { PackedCirclesPlot } from "./PackedCirclesPlot"
import { SunburstPlot } from "./SunburstPlot"
import { TreemapPlot } from "./TreemapPlot"

/** Hover highlight on the NESTED charts (packed circles / treemap /
 *  sunburst). Two gestures, two scopes:
 *  - hovering a MARK emphasizes that node alone and fades everything else —
 *    the rest of its own group, and a container's own children. These
 *    charts are usually colored by the DERIVED "Top-level group" source, and
 *    a group is a contiguous region on screen, so highlighting the series
 *    would paint over the very circle the pointer is on;
 *  - hovering a LEGEND entry highlights the whole series, keyed on the
 *    node's own group rather than a row value (no column carries it).
 *  A hover published for some unrelated field must leave the chart alone. */

const DATASET_ID = "ds-hier-hover"

/** Same fruit edge list as the other hierarchy suites: three top-level
 *  groups — Pome (Apple, Pear), Citrus (Lemon), Melon (Watermelon → Mini,
 *  Seedless) — so a group's fade is distinguishable from a single mark's. */
const buildDataset = (): Dataset =>
	buildDatasetFixture({
		id: DATASET_ID,
		name: "fruit",
		filename: "fruit.csv",
		fields: [
			{ name: "Parent", inferredType: "categorical" },
			{ name: "Child", inferredType: "categorical" },
			{ name: "Value", inferredType: "quantitative" },
		],
		rows: [
			{ Parent: "Pome", Child: "Apple", Value: "7" },
			{ Parent: "Pome", Child: "Pear", Value: "7" },
			{ Parent: "Citrus", Child: "Lemon", Value: "8" },
			{ Parent: "Melon", Child: "Watermelon", Value: "" },
			{ Parent: "Watermelon", Child: "Mini", Value: "1" },
			{ Parent: "Watermelon", Child: "Seedless", Value: "6" },
		],
	})

type Layout = "packed" | "treemap" | "sunburst"

const mount = (
	layout: Layout,
	opts: {
		/** Color by a real column instead of the derived group source. */
		hueField?: string
		/** Pre-set hovered legend entry (legend-hover / unrelated-field cases). */
		hovered?: { field: string; value: string }
		/** Overrides for the Hover appearance options (outline / fade). */
		hoverOptions?: Record<string, unknown>
	} = {}
) => {
	const store = installInMemoryLocalStorage()
	const encodings = {
		...emptyEncodings(),
		connection: { field: "Parent" },
		area: { field: "Value" },
		hue: opts.hueField
			? { field: opts.hueField }
			: { field: null, measureSource: "rootGroup" as const },
	}
	const configs: ChannelConfigs = {
		connection: {
			hierarchyLayout: layout === "packed" ? "circles" : layout,
		} as never,
	}
	/* eslint-disable @th/use-wrapped-json-functions */
	store.set(
		"vis-components:datasets",
		JSON.stringify({ [DATASET_ID]: buildDataset() })
	)
	store.set("vis-components:currentDatasetId", JSON.stringify(DATASET_ID))
	store.set("vis-components:previewVersionId", JSON.stringify(null))
	store.set("vis-components:currentEncodings", JSON.stringify(encodings))
	store.set("vis-components:currentChannelConfigs", JSON.stringify(configs))
	/* eslint-enable @th/use-wrapped-json-functions */

	const init = (snap: TestStore) => {
		snap.set(loadedDatasetsAtom, { [DATASET_ID]: buildDataset() })
		snap.set(currentDatasetIdAtom, DATASET_ID)
		snap.set(previewVersionIdAtom, null)
		snap.set(currentEncodingsAtom, encodings)
		snap.set(currentChannelConfigsAtom, configs)
		snap.set(currentLabelsAtom, DEFAULT_LABELS_CONFIG)
		snap.set(currentFieldOverridesAtom, {})
		snap.set(currentFieldLevelOrdersAtom, {})
		if (opts.hovered) snap.set(hoveredLegendEntryAtom, opts.hovered)
		if (opts.hoverOptions)
			snap.set(currentTooltipConfigAtom, {
				enabled: true,
				visibleFields: [],
				customCss: "",
				customHtml: "",
				useCustomHtml: false,
				...opts.hoverOptions,
			})
	}

	const Plot =
		layout === "packed"
			? PackedCirclesPlot
			: layout === "treemap"
				? TreemapPlot
				: SunburstPlot
	const { container } = render(
		<TestProvider initializeState={init}>
			<div style={{ width: 600, height: 400 }}>
				<Plot />
			</div>
		</TestProvider>
	)
	return container
}

/** The mark elements each layout draws (leaves + any painted containers). */
const marksOf = (c: HTMLElement, layout: Layout) =>
	[
		...c.querySelectorAll(
			layout === "treemap" ? "rect" : layout === "packed" ? "circle" : "path"
		),
	].filter((el) => el.getAttribute("fill-opacity") !== null)

const fillOpacity = (el: Element) => Number(el.getAttribute("fill-opacity"))

/** Marks sharing a fill are one series — which is exactly what the derived
 *  group color encodes, so the fill is a usable series key in these tests. */
const sameFill = (marks: Element[], mark: Element) =>
	marks.filter((m) => m.getAttribute("fill") === mark.getAttribute("fill"))

afterEach(cleanup)

describe.each<Layout>(["packed", "treemap", "sunburst"])(
	"%s — hovering a mark highlights that mark",
	(layout) => {
		it("fades every other mark, the hovered mark's own group included", async () => {
			const c = mount(layout)
			const marks = marksOf(c, layout)
			expect(marks.length).toBeGreaterThan(2)
			// The LAST mark is always a leaf: every layout emits its marks in
			// breadth-first tree order, so the deepest leaf comes last.
			const hoveredMark = marks[marks.length - 1]
			// Its group has company (in the treemap: a sibling leaf; elsewhere
			// its painted ancestors too), so a series highlight would be
			// distinguishable from a single-mark one.
			expect(sameFill(marks, hoveredMark).length).toBeGreaterThan(1)
			const before = marks.map(fillOpacity)

			fireEvent.mouseEnter(hoveredMark)

			await waitFor(() => {
				const now = marksOf(c, layout).map(fillOpacity)
				expect(now.filter((o, i) => o < before[i]).length).toBe(
					marks.length - 1
				)
			})
			// Faded marks drop by exactly the configured fade; only the
			// hovered mark is untouched.
			const after = marksOf(c, layout)
			after.forEach((m, i) => {
				const expected =
					m === hoveredMark ? before[i] : before[i] * LEGEND_HIGHLIGHT_DIM
				expect(fillOpacity(m)).toBeCloseTo(expected, 5)
			})
		})

		it("outlines the hovered mark when 'Outline hovered elements' is on", async () => {
			const c = mount(layout, {
				hoverOptions: {
					hoverOutline: true,
					hoverOutlineColor: "#ff00ff",
					hoverOutlineWidth: 3,
					hoverFade: false,
				},
			})
			const marks = marksOf(c, layout)
			const hoveredMark = marks[marks.length - 1]
			const strokesBefore = marks.map((m) => m.getAttribute("stroke"))
			expect(strokesBefore[marks.length - 1]).not.toBe("#ff00ff")

			fireEvent.mouseEnter(hoveredMark)

			await waitFor(() => {
				expect(hoveredMark.getAttribute("stroke")).toBe("#ff00ff")
				expect(hoveredMark.getAttribute("stroke-width")).toBe("3")
			})
			// Every other mark keeps its own stroke — the emphasis is the
			// hovered node's alone.
			marksOf(c, layout).forEach((m, i) => {
				if (m !== hoveredMark)
					expect(m.getAttribute("stroke")).toBe(strokesBefore[i])
			})
		})

		it("restores every mark when the pointer leaves the chart", async () => {
			const c = mount(layout)
			const before = marksOf(c, layout).map(fillOpacity)
			const all = marksOf(c, layout)
			fireEvent.mouseEnter(all[all.length - 1])
			await waitFor(() => {
				expect(
					marksOf(c, layout).map(fillOpacity).some((o, i) => o < before[i])
				).toBe(true)
			})
			fireEvent.mouseLeave(c.querySelector("g")!)
			await waitFor(() => {
				marksOf(c, layout).forEach((m, i) => {
					expect(fillOpacity(m)).toBeCloseTo(before[i], 5)
				})
			})
		})

		it("a legend hover still highlights the whole group", () => {
			// The derived Color legend publishes the hierarchy sentinel field
			// with the group name — no node key — so the series semantics
			// apply: every mark in Melon (painted container, Watermelon, its
			// two leaves) stays, everything else fades.
			const plain = marksOf(mount(layout), layout).map(fillOpacity)
			const c = mount(layout, {
				hovered: { field: hierarchyHighlightField("rootGroup"), value: "Melon" },
			})
			const marks = marksOf(c, layout)
			const lit = marks.filter((m, i) => fillOpacity(m) === plain[i])
			expect(lit.length).toBeGreaterThan(1)
			expect(lit.length).toBeLessThan(marks.length)
			// The lit marks are exactly one series: they share a fill, and no
			// faded mark has it.
			const groupFill = lit[0].getAttribute("fill")
			lit.forEach((m) => expect(m.getAttribute("fill")).toBe(groupFill))
			marks.forEach((m, i) => {
				if (lit.includes(m)) return
				expect(m.getAttribute("fill")).not.toBe(groupFill)
				expect(fillOpacity(m)).toBeCloseTo(plain[i] * LEGEND_HIGHLIGHT_DIM, 5)
			})
		})

		it("ignores a hover published for an unrelated field", () => {
			// `Parent` IS a column of these rows, but this chart is colored by
			// the derived group source — a legend hover elsewhere on Parent
			// must not dim it.
			const plain = marksOf(mount(layout), layout).map(fillOpacity)
			const c = mount(layout, {
				hovered: { field: "Parent", value: "Pome" },
			})
			marksOf(c, layout).forEach((m, i) => {
				expect(fillOpacity(m)).toBeCloseTo(plain[i], 5)
			})
		})
	}
)

describe.each<Layout>(["packed", "sunburst"])(
	"%s — hovering a container",
	(layout) => {
		it("highlights the container alone — its children fade with the rest", async () => {
			// Containers are hoverable marks in these layouts (the treemap
			// draws leaves only): the band of a circle / ring its children
			// don't cover IS the container. The Melon group is the one series
			// with FOUR marks (Melon, Watermelon, Mini, Seedless). Hovering
			// each in turn — top-level group, mid-level container, either
			// leaf — lights up exactly that mark: a container's children are
			// their own marks and recede with everything else.
			const c = mount(layout)
			const marks = marksOf(c, layout)
			const melon = marks.filter((m) => sameFill(marks, m).length === 4)
			expect(melon.length).toBe(4)
			const before = marks.map(fillOpacity)
			const g = c.querySelector("g")!

			for (const mark of melon) {
				fireEvent.mouseEnter(mark)
				await waitFor(() => {
					expect(
						marksOf(c, layout).filter((m, i) => fillOpacity(m) < before[i])
							.length
					).toBe(marks.length - 1)
				})
				expect(fillOpacity(mark)).toBeCloseTo(before[marks.indexOf(mark)], 5)
				fireEvent.mouseLeave(g)
				await waitFor(() => {
					marksOf(c, layout).forEach((m, i) => {
						expect(fillOpacity(m)).toBeCloseTo(before[i], 5)
					})
				})
			}
		})
	}
)

describe("nested charts colored by a real field", () => {
	it("hovering a treemap tile highlights that tile alone", async () => {
		// Hue on `Parent`: leaves carry Pome / Citrus / Watermelon, so the
		// series resolves through the ROW rather than the tree position — but
		// a direct hover still narrows to the hovered node.
		const c = mount("treemap", { hueField: "Parent" })
		const marks = marksOf(c, "treemap")
		const hoveredMark = marks[marks.length - 1]
		expect(sameFill(marks, hoveredMark).length).toBeGreaterThan(1)
		const before = marks.map(fillOpacity)

		fireEvent.mouseEnter(hoveredMark)

		await waitFor(() => {
			const faded = marksOf(c, "treemap").filter(
				(m, i) => fillOpacity(m) < before[i]
			)
			expect(faded.length).toBe(marks.length - 1)
		})
	})

	it("a legend hover on the hue field highlights every tile with that value", () => {
		const plain = marksOf(mount("treemap", { hueField: "Parent" }), "treemap").map(
			fillOpacity
		)
		const c = mount("treemap", {
			hueField: "Parent",
			hovered: { field: "Parent", value: "Pome" },
		})
		const marks = marksOf(c, "treemap")
		// Apple and Pear are the Pome tiles.
		const lit = marks.filter((m, i) => fillOpacity(m) === plain[i])
		expect(lit.length).toBe(2)
		expect(marks.length - lit.length).toBe(3)
	})
})
