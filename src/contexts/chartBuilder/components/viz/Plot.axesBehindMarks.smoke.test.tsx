import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { TestProvider } from "../../../../testSupport/TestProvider"
import { installInMemoryLocalStorage } from "../../../../testSupport/localStorageShim"
import { DEFAULT_FACET_CONFIG } from "../../lib/channelConfig"
import { DEFAULT_LABELS_CONFIG } from "../../lib/labelsConfig"
import type { PlotInner } from "../../lib/plotLayout"
import { emptyEncodings, type Dataset } from "../../lib/types"
import { ScatterPlot } from "./ScatterPlot"

/** Aesthetics → Draw order → "Draw axes behind marks". SVG paints in
 *  document order, so the setting is observable as the position of the
 *  axis tick labels (<text>) relative to the scatter marks (<path>):
 *  off (default) = marks first, labels after (axis text on top);
 *  on = every axis label precedes the first mark (marks on top). */

const DATASET_ID = "ds-axes-behind"

const dataset: Dataset = {
	id: DATASET_ID,
	name: "scatter",
	fields: [
		{ name: "x", inferredType: "quantitative" },
		{ name: "y", inferredType: "quantitative" },
	],
	versions: [
		{
			id: "v1",
			filename: "s.csv",
			rows: [
				{ x: "1", y: "10" },
				{ x: "2", y: "20" },
				{ x: "3", y: "30" },
			],
			createdAt: 0,
		},
	],
	latestVersionId: "v1",
	createdAt: 0,
}

const INNER: PlotInner = { x0: 50, y0: 20, x1: 550, y1: 400 }

const seed = (axesBehindMarks: boolean | undefined) => {
	const store = installInMemoryLocalStorage()
	/* eslint-disable @th/use-wrapped-json-functions */
	store.set("vis-components:datasets", JSON.stringify({ [DATASET_ID]: dataset }))
	store.set("vis-components:currentDatasetId", JSON.stringify(DATASET_ID))
	store.set("vis-components:previewVersionId", JSON.stringify(null))
	store.set(
		"vis-components:currentEncodings",
		JSON.stringify({ ...emptyEncodings(), x: { field: "x" }, y: { field: "y" } })
	)
	store.set(
		"vis-components:currentChannelConfigs",
		JSON.stringify({
			facet: DEFAULT_FACET_CONFIG,
			...(axesBehindMarks === undefined ? {} : { axesBehindMarks }),
		})
	)
	store.set(
		"vis-components:currentLabels",
		JSON.stringify({ _v: 1, data: DEFAULT_LABELS_CONFIG })
	)
	/* eslint-enable @th/use-wrapped-json-functions */
}

/** Document-order indices of the first scatter mark and of the first and
 *  last axis tick label. */
const orderOf = (container: HTMLElement) => {
	const nodes = [...container.querySelectorAll("svg *")]
	const isMark = (el: Element) =>
		el.tagName === "path" && /translate\(/.test(el.getAttribute("transform") ?? "")
	const isLabel = (el: Element) => el.tagName === "text"
	const markIdx = nodes.findIndex(isMark)
	const labelIdxs = nodes.flatMap((el, i) => (isLabel(el) ? [i] : []))
	expect(markIdx).toBeGreaterThanOrEqual(0)
	expect(labelIdxs.length).toBeGreaterThan(0)
	return { markIdx, firstLabel: labelIdxs[0]!, lastLabel: labelIdxs.at(-1)! }
}

const mount = () =>
	render(
		<TestProvider>
			<svg width={600} height={420}>
				<ScatterPlot inner={INNER} />
			</svg>
		</TestProvider>
	)

describe("Plot — Draw axes behind marks", () => {
	it("default: axis labels paint after (over) the marks", () => {
		seed(undefined)
		const { container } = mount()
		const { markIdx, firstLabel } = orderOf(container)
		expect(firstLabel).toBeGreaterThan(markIdx)
	})

	it("on: every axis label paints before (under) the first mark", () => {
		seed(true)
		const { container } = mount()
		const { markIdx, lastLabel } = orderOf(container)
		expect(lastLabel).toBeLessThan(markIdx)
	})
})
