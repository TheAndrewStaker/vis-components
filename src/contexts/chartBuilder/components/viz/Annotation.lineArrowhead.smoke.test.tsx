import { render } from "@testing-library/react"
import { TestProvider } from "../../../../testSupport/TestProvider"
import { installInMemoryLocalStorage } from "../../../../testSupport/localStorageShim"
import { buildDataset as buildDatasetFixture } from "../../../../testSupport/fixtures"
import { describe, expect, it, vi } from "vitest"
import { DEFAULT_AXIS_CONFIG } from "../../lib/channelConfig"
import { DEFAULT_LABELS_CONFIG } from "../../lib/labelsConfig"
import {
	newLineSegment,
	newRectangle,
	type AnnotationsConfig,
	type LineSegmentAnnotation,
} from "../../lib/annotationsConfig"
import { emptyEncodings, type Dataset } from "../../lib/types"

import { ChartCanvas } from "./ChartCanvas"

vi.mock("react-use-measure", () => ({
	default: () => [
		() => {},
		{ x: 0, y: 0, top: 0, left: 0, right: 800, bottom: 600, width: 800, height: 600 },
	],
}))

/** A line annotation's ends on the rendered chart: the cap choice reaches
 *  the SVG stroke, and an arrowhead is explicit path geometry at the
 *  right / top endpoint (no `<marker>` — PowerPoint's SVG import drops
 *  them), with the line's own stroke stopping at the head's base. */

const DATASET_ID = "ds-anno-arrow"

const buildDataset = (): Dataset =>
	buildDatasetFixture({
		id: DATASET_ID,
		name: "anno-arrow",
		filename: "anno.csv",
		fields: [
			{ name: "x", inferredType: "quantitative" },
			{ name: "y", inferredType: "quantitative" },
		],
		rows: Array.from({ length: 10 }, (_, i) => ({
			x: String(i),
			y: String(i * 2),
		})),
	})

const seed = (annotations: Partial<AnnotationsConfig>) => {
	installInMemoryLocalStorage()
	/* eslint-disable no-restricted-globals, @vc/no-storage-outside-try, @vc/use-wrapped-json-functions */
	const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v))
	set("vis-components:datasets", { [DATASET_ID]: buildDataset() })
	set("vis-components:currentDatasetId", DATASET_ID)
	set("vis-components:previewVersionId", null)
	set("vis-components:currentEncodings", {
		...emptyEncodings(),
		x: { field: "x" },
		y: { field: "y" },
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
	/* eslint-enable no-restricted-globals, @vc/no-storage-outside-try, @vc/use-wrapped-json-functions */
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

/** The plot rect, read back from a rect annotation spanning 0–100% of it. */
const probeRect = () => ({
	...newRectangle("probe"),
	xMin: 0,
	xMax: 1,
	yMin: 0,
	yMax: 1,
	borderThickness: 0,
})

/** A 2px horizontal line across the middle of the plot, from 20% to 80%. */
const rule = (patch: Partial<LineSegmentAnnotation> = {}): LineSegmentAnnotation => ({
	...newLineSegment("l"),
	xMin: 0.2,
	xMax: 0.8,
	yMin: 0.5,
	yMax: 0.5,
	lineThickness: 2,
	lineColor: "#123456",
	...patch,
})

const draw = (patch: Partial<LineSegmentAnnotation> = {}) => {
	seed({ rectangles: [probeRect()], lineSegments: [rule(patch)] })
	const { container } = mount()
	const probe = container.querySelector("[data-annotation='probe']")!
	const tipX = num(probe, "x") + 0.8 * num(probe, "width")
	return {
		container,
		tipX,
		line: container.querySelector("[data-annotation-line='l']")!,
		head: container.querySelector("[data-annotation-arrowhead='l']"),
	}
}

describe("line annotation ends", () => {
	it("draws a plain line flush to its endpoints with no head", () => {
		const { line, head, tipX } = draw()
		expect(head).toBeNull()
		expect(num(line, "x2")).toBeCloseTo(tipX, 3)
		expect(line.getAttribute("stroke-linecap")).toBe("butt")
	})

	it("rounds the cap when asked", () => {
		const { line } = draw({ lineCap: "round" })
		expect(line.getAttribute("stroke-linecap")).toBe("round")
	})

	it("adds a filled triangle at the end point and stops the line at its base", () => {
		const { line, head, tipX, container } = draw({ arrowhead: true })
		expect(head).not.toBeNull()
		expect(head!.tagName.toLowerCase()).toBe("path")
		expect(head!.getAttribute("data-arrowhead-style")).toBe("triangle")
		expect(head!.getAttribute("fill")).toBe("#123456")
		expect(container.querySelector("marker")).toBeNull()
		// 2px line → 8px head: the stroke ends 8px short of the tip.
		expect(num(line, "x2")).toBeCloseTo(tipX - 8, 3)
		// The tip itself is the configured endpoint.
		expect(head!.getAttribute("d")).toContain(`M${Math.round(tipX * 1000) / 1000},`)
	})

	it("strokes an open chevron in the line's own stroke and runs the line to the tip", () => {
		const { line, head, tipX } = draw({ arrowhead: true, arrowheadStyle: "open" })
		expect(head!.getAttribute("fill")).toBe("none")
		expect(head!.getAttribute("stroke")).toBe("#123456")
		expect(head!.getAttribute("stroke-width")).toBe("2")
		expect(num(line, "x2")).toBeCloseTo(tipX, 3)
	})

	it("applies the line's opacity to line and head as one group, so the overlap can't darken", () => {
		const { line, head } = draw({
			arrowhead: true,
			arrowheadStyle: "open",
			lineOpacity: 0.5,
		})
		const group = line.parentElement!
		expect(group.tagName.toLowerCase()).toBe("g")
		expect(group.getAttribute("opacity")).toBe("0.5")
		expect(head!.parentElement).toBe(group)
		expect(line.getAttribute("stroke-opacity")).toBeNull()
		expect(head!.getAttribute("stroke-opacity")).toBeNull()
		expect(head!.getAttribute("fill-opacity")).toBeNull()
	})

	it("leaves a fully opaque line's group without an opacity attribute", () => {
		const { line } = draw()
		expect(line.parentElement!.getAttribute("opacity")).toBeNull()
	})

	it("scales the head with the arrowhead scale", () => {
		const { line, tipX } = draw({ arrowhead: true, arrowheadScale: 2 })
		expect(num(line, "x2")).toBeCloseTo(tipX - 16, 3)
	})
})
