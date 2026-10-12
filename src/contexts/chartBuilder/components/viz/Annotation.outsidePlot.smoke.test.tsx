import { render } from "@testing-library/react"
import { TestProvider } from "../../../../testSupport/TestProvider"
import { installInMemoryLocalStorage } from "../../../../testSupport/localStorageShim"
import { buildDataset as buildDatasetFixture } from "../../../../testSupport/fixtures"
import { describe, expect, it, vi } from "vitest"
import { DEFAULT_AXIS_CONFIG } from "../../lib/channelConfig"
import { DEFAULT_LABELS_CONFIG } from "../../lib/labelsConfig"
import {
	newRectangle,
	newTextAnnotation,
	type AnnotationsConfig,
} from "../../lib/annotationsConfig"
import { emptyEncodings, type Dataset } from "../../lib/types"

import { ChartCanvas } from "./ChartCanvas"

// happy-dom lays nothing out, so react-use-measure reports a 0×0 container
// and the solver floors the plot at its minimum size — the reserve would be
// invisible. Report a real viewport so the plot has room to give up.
vi.mock("react-use-measure", () => ({
	default: () => [
		() => {},
		{ x: 0, y: 0, top: 0, left: 0, right: 800, bottom: 600, width: 800, height: 600 },
	],
}))

/** Annotations may sit anywhere on the canvas — beside the y-axis, above the
 *  title, past the right edge — and the layout reserves room so they stay
 *  in view, the way a wide legend or an end-of-line data label compresses
 *  the plot. Only value-mode annotations on a MULTI-panel chart clip to
 *  their panel (each facet draws them in its own coordinates). */

const DATASET_ID = "ds-anno-outside"

const buildDataset = (): Dataset =>
	buildDatasetFixture({
		id: DATASET_ID,
		name: "anno-outside",
		filename: "anno.csv",
		fields: [
			{ name: "x", inferredType: "quantitative" },
			{ name: "y", inferredType: "quantitative" },
			{ name: "g", inferredType: "categorical" },
		],
		rows: Array.from({ length: 10 }, (_, i) => ({
			x: String(i),
			y: String(i * 2),
			g: i % 2 ? "a" : "b",
		})),
	})

const seed = (
	annotations: Partial<AnnotationsConfig>,
	{ facet = false }: { facet?: boolean } = {}
) => {
	installInMemoryLocalStorage()
	/* eslint-disable no-restricted-globals, @th/no-storage-outside-try, @th/use-wrapped-json-functions */
	const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v))
	set("vis-components:datasets", { [DATASET_ID]: buildDataset() })
	set("vis-components:currentDatasetId", DATASET_ID)
	set("vis-components:previewVersionId", null)
	set("vis-components:currentEncodings", {
		...emptyEncodings(),
		x: { field: "x" },
		y: { field: "y" },
		...(facet ? { facet: { field: "g" } } : {}),
	})
	set("vis-components:currentChannelConfigs", {
		x: { ...DEFAULT_AXIS_CONFIG },
		y: { ...DEFAULT_AXIS_CONFIG },
	})
	set("vis-components:currentLabels", { _v: 1, data: DEFAULT_LABELS_CONFIG })
	set("vis-components:currentAnnotations", {
		_v: 4,
		data: {
			rectangles: [],
			circles: [],
			lineSegments: [],
			texts: [],
			...annotations,
		},
	})
	/* eslint-enable no-restricted-globals, @th/no-storage-outside-try, @th/use-wrapped-json-functions */
}

const mount = () =>
	render(
		<TestProvider>
			<div style={{ width: 800, height: 600 }}>
				<ChartCanvas />
			</div>
		</TestProvider>
	)

const num = (el: Element | null, attr: string) =>
	Number(el?.getAttribute(attr) ?? NaN)

/** The first panel's plot rect, read back from the rect annotation that
 *  spans exactly 0–100% of it. */
const plotOf = (container: HTMLElement) => {
	const probe = container.querySelector("[data-annotation='probe']")
	return {
		x: num(probe, "x"),
		y: num(probe, "y"),
		width: num(probe, "width"),
		height: num(probe, "height"),
	}
}

const probeRect = () => ({
	...newRectangle("probe"),
	xMin: 0,
	xMax: 1,
	yMin: 0,
	yMax: 1,
	borderThickness: 0,
})

describe("annotations outside the plot", () => {
	it("draws a percent rectangle past the right edge unclipped, inside the canvas, and shrinks the plot for it", () => {
		seed({ rectangles: [probeRect()] })
		const plain = plotOf(mount().container)
		expect(plain.width).toBeGreaterThan(0)

		seed({
			rectangles: [
				probeRect(),
				{ ...newRectangle("out"), xMin: 0.9, xMax: 1.3, yMin: 0.2, yMax: 0.8, borderThickness: 0 },
			],
		})
		const { container } = mount()
		const out = container.querySelector("[data-annotation='out']")!
		// Not clipped: no clip-path on the annotation or any ancestor group.
		expect(out.closest("[clip-path]")).toBeNull()
		expect(container.querySelector("clipPath")).toBeNull()
		// Fully inside the SVG canvas.
		const svg = container.querySelector("svg")!
		expect(num(out, "x") + num(out, "width")).toBeLessThanOrEqual(num(svg, "width"))
		// 30% of the plot now sits to its right, so the plot got narrower.
		const squeezed = plotOf(container)
		expect(squeezed.width).toBeLessThan(plain.width)
		expect(num(out, "x") + num(out, "width")).toBeCloseTo(
			squeezed.x + 1.3 * squeezed.width,
			3
		)
	})

	it("reserves room above the plot for a text annotation placed over the top edge", () => {
		seed({ rectangles: [probeRect()] })
		const plain = plotOf(mount().container)

		seed({
			rectangles: [probeRect()],
			texts: [
				{ ...newTextAnnotation("t"), text: "Peak demand", x: 0.5, y: 1.5 },
			],
		})
		const { container } = mount()
		const box = container.querySelector("[data-annotation-text-box='t']")!
		expect(num(box, "y")).toBeGreaterThanOrEqual(0)
		expect(box.closest("[clip-path]")).toBeNull()
		const squeezed = plotOf(container)
		// The grid moved down to make room — the plot starts lower and is
		// shorter than without the annotation.
		expect(squeezed.y).toBeGreaterThan(plain.y)
		expect(squeezed.height).toBeLessThan(plain.height)
	})

	it("keeps the per-panel clip only for value-mode annotations on a faceted chart", () => {
		seed(
			{
				rectangles: [
					{ ...newRectangle("pct"), xMin: 0.5, xMax: 1.2, yMin: 0, yMax: 1 },
					{
						...newRectangle("val"),
						coordSystem: "values",
						xMin: 0,
						xMax: 20,
						yMin: 0,
						yMax: 30,
					},
				],
			},
			{ facet: true }
		)
		const { container } = mount()
		expect(container.querySelectorAll("[data-panel]").length).toBe(2)
		const pct = container.querySelector("[data-annotation='pct']")!
		const val = container.querySelector("[data-annotation='val']")!
		expect(pct.closest("[clip-path]")).toBeNull()
		expect(val.closest("[clip-path]")).not.toBeNull()
		// The clip region is the panel's plot area, defined in the same layer.
		const clip = val.closest('g[aria-hidden="true"]')!.querySelector("clipPath rect")
		expect(clip).not.toBeNull()
	})
})
