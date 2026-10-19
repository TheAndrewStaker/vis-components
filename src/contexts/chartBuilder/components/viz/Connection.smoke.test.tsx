import { cleanup, fireEvent, render } from "@testing-library/react"
import { TestProvider, type TestStore } from "../../../../testSupport/TestProvider"
import { installInMemoryLocalStorage } from "../../../../testSupport/localStorageShim"
import { afterEach, describe, expect, it } from "vitest"
import {
	DEFAULT_CONNECTION_CONFIG,
	DEFAULT_DATA_LABELS_CONFIG,
	EMPTY_CHANNEL_CONFIGS,
	type ConnectionConfig,
} from "../../lib/channelConfig"
import {
	DEFAULT_LABELS_CONFIG,
	DEFAULT_TOOLTIP_CONFIG,
	type TooltipConfig,
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
	loadedDatasetsAtom,
	previewVersionIdAtom,
} from "../../store/atoms"

import { ScatterPlot } from "./ScatterPlot"

/** Smoke tests for the connection (line-chart) features the user
 *  reported as missing or broken: default fill mode, point sampling,
 *  and per-line dash patterns. Each test mounts ScatterPlot with a
 *  scatter+connection chart and reads back the SVG to verify the
 *  user-visible behavior. */

const DATASET_ID = "ds-conn"

const buildLineDataset = (): Dataset => ({
	id: DATASET_ID,
	name: "lines",
	fields: [
		{ name: "x", inferredType: "quantitative" },
		{ name: "y", inferredType: "quantitative" },
		{ name: "g", inferredType: "categorical" },
	],
	versions: [
		{
			id: "v1",
			filename: "lines.csv",
			rows: [
				{ x: "1", y: "10", g: "north" },
				{ x: "2", y: "20", g: "north" },
				{ x: "3", y: "30", g: "north" },
				{ x: "4", y: "40", g: "north" },
				{ x: "5", y: "50", g: "north" },
				{ x: "1", y: "5", g: "south" },
				{ x: "2", y: "15", g: "south" },
				{ x: "3", y: "25", g: "south" },
				{ x: "4", y: "35", g: "south" },
				{ x: "5", y: "45", g: "south" },
			],
			createdAt: 0,
		},
	],
	latestVersionId: "v1",
	createdAt: 0,
})

const seedState = (connectionCfg: Partial<ConnectionConfig> = {}) => {
	const store = installInMemoryLocalStorage()
	/* eslint-disable @vc/use-wrapped-json-functions */
	store.set(
		"vis-components:datasets",
		JSON.stringify({ [DATASET_ID]: buildLineDataset() })
	)
	store.set("vis-components:currentDatasetId", JSON.stringify(DATASET_ID))
	store.set("vis-components:previewVersionId", JSON.stringify(null))
	store.set(
		"vis-components:currentEncodings",
		JSON.stringify({
			...emptyEncodings(),
			x: { field: "x" },
			y: { field: "y" },
			connection: { field: "g" },
		})
	)
	store.set(
		"vis-components:currentChannelConfigs",
		JSON.stringify({
			connection: { ...DEFAULT_CONNECTION_CONFIG, ...connectionCfg },
		})
	)
	/* eslint-enable @vc/use-wrapped-json-functions */
}

const initState =
	(
		connectionCfg: Partial<ConnectionConfig> = {},
		tooltipCfg?: Partial<TooltipConfig>
	) =>
	(snap: TestStore) => {
		snap.set(loadedDatasetsAtom, { [DATASET_ID]: buildLineDataset() })
		snap.set(currentDatasetIdAtom, DATASET_ID)
		snap.set(previewVersionIdAtom, null)
		snap.set(currentEncodingsAtom, {
			...emptyEncodings(),
			x: { field: "x" },
			y: { field: "y" },
			connection: { field: "g" },
		})
		snap.set(currentChannelConfigsAtom, {
			...EMPTY_CHANNEL_CONFIGS,
			connection: { ...DEFAULT_CONNECTION_CONFIG, ...connectionCfg },
		})
		snap.set(currentLabelsAtom, DEFAULT_LABELS_CONFIG)
		snap.set(currentDataLabelsConfigAtom, DEFAULT_DATA_LABELS_CONFIG)
		snap.set(currentDataLabelsEncodingsAtom, emptyDataLabelsEncodings())
		snap.set(currentFieldOverridesAtom, {})
		snap.set(currentFieldLevelOrdersAtom, {})
		if (tooltipCfg)
			snap.set(currentTooltipConfigAtom, {
				...DEFAULT_TOOLTIP_CONFIG,
				...tooltipCfg,
			})
	}

const mount = (
	cfg: Partial<ConnectionConfig> = {},
	tooltipCfg?: Partial<TooltipConfig>
) => {
	seedState(cfg)
	const { container } = render(
		<TestProvider initializeState={initState(cfg, tooltipCfg)}>
			<div style={{ width: 600, height: 400 }}>
				<ScatterPlot />
			</div>
		</TestProvider>
	)
	return container
}

describe("Connection — point sampling", () => {
	it("default `pointSampling=all` renders one mark per row (10 rows → 10 paths)", () => {
		const c = mount()
		const paths = c.querySelectorAll("path:not(.vc-line-hit)")
		expect(paths.length).toBe(10)
	})

	it("`first-and-last` renders only 2 marks per group (4 marks total for 2 groups)", () => {
		const c = mount({ pointSampling: "first-and-last" })
		const paths = c.querySelectorAll("path:not(.vc-line-hit)")
		// 2 groups × 2 marks (first + last) = 4 marks total.
		expect(paths.length).toBe(4)
	})

	it("`first-only` renders 1 mark per group (2 marks total)", () => {
		const c = mount({ pointSampling: "first-only" })
		const paths = c.querySelectorAll("path:not(.vc-line-hit)")
		expect(paths.length).toBe(2)
	})
})

describe("Connection — default fill", () => {
	it("DEFAULT_CONNECTION_CONFIG.fill is 'line'", () => {
		// Pure value check — 'line' (not 'area') is the deliberate default.
		// Lives here so changing the default flips this loudly.
		expect(DEFAULT_CONNECTION_CONFIG.fill).toBe("line")
	})
})

describe("Connection — axis stems (lollipop)", () => {
	it("default `axisStem=none` draws no stem lines", () => {
		const c = mount()
		expect(c.querySelectorAll(".vc-axis-stem").length).toBe(0)
	})

	it("`x-axis` draws one vertical stem per point (10 rows → 10 vertical lines)", () => {
		const c = mount({ axisStem: "x-axis" })
		const lines = [...c.querySelectorAll(".vc-axis-stem")]
		expect(lines.length).toBe(10)
		// Vertical stem: x1 === x2, and it drops DOWN to the baseline (y2 >= y1).
		for (const l of lines) {
			expect(l.getAttribute("x1")).toBe(l.getAttribute("x2"))
			expect(Number(l.getAttribute("y2"))).toBeGreaterThanOrEqual(
				Number(l.getAttribute("y1"))
			)
		}
	})

	it("`y-axis` draws one horizontal stem per point (10 horizontal lines)", () => {
		const c = mount({ axisStem: "y-axis" })
		const lines = [...c.querySelectorAll(".vc-axis-stem")]
		expect(lines.length).toBe(10)
		// Horizontal stem: y1 === y2, and it runs LEFT to the baseline (x2 <= x1).
		for (const l of lines) {
			expect(l.getAttribute("y1")).toBe(l.getAttribute("y2"))
			expect(Number(l.getAttribute("x2"))).toBeLessThanOrEqual(
				Number(l.getAttribute("x1"))
			)
		}
	})

	it("`custom-y` draws vertical stems that all land on the y=25 line", () => {
		// y spans 5–50, so a 25 threshold has points on BOTH sides — stems
		// above it drop down, stems below it rise up, all meeting at one
		// shared pixel row (unlike `x-axis`, which lands on the plot edge).
		const c = mount({ axisStem: "custom-y", axisStemCustomY: 25 })
		const lines = [...c.querySelectorAll(".vc-axis-stem")]
		expect(lines.length).toBe(10)
		const y2s = lines.map((l) => Number(l.getAttribute("y2")))
		for (const l of lines) {
			expect(l.getAttribute("x1")).toBe(l.getAttribute("x2"))
			expect(Number(l.getAttribute("y2"))).toBe(y2s[0])
		}
		const y1s = lines.map((l) => Number(l.getAttribute("y1")))
		expect(y1s.some((y1) => y1 < y2s[0])).toBe(true)
		expect(y1s.some((y1) => y1 > y2s[0])).toBe(true)
	})

	it("`custom-x` draws horizontal stems that all land on the x=3 line", () => {
		const c = mount({ axisStem: "custom-x", axisStemCustomX: 3 })
		const lines = [...c.querySelectorAll(".vc-axis-stem")]
		expect(lines.length).toBe(10)
		const x2s = lines.map((l) => Number(l.getAttribute("x2")))
		for (const l of lines) {
			expect(l.getAttribute("y1")).toBe(l.getAttribute("y2"))
			expect(Number(l.getAttribute("x2"))).toBe(x2s[0])
		}
		const x1s = lines.map((l) => Number(l.getAttribute("x1")))
		expect(x1s.some((x1) => x1 < x2s[0])).toBe(true)
		expect(x1s.some((x1) => x1 > x2s[0])).toBe(true)
	})

	it("an off-domain custom threshold clamps to the plot edge", () => {
		// y=1000 sits far above the data — the landing line clamps to the
		// TOP of the plot area, so every stem points up (y2 <= y1) instead
		// of extrapolating past the panel.
		const c = mount({ axisStem: "custom-y", axisStemCustomY: 1000 })
		const lines = [...c.querySelectorAll(".vc-axis-stem")]
		expect(lines.length).toBe(10)
		for (const l of lines) {
			expect(Number(l.getAttribute("y2"))).toBeLessThanOrEqual(
				Number(l.getAttribute("y1"))
			)
		}
	})
})


describe("Connection — dash patterns", () => {
	it("default solid pattern emits a single polyline per group with NO stroke-dasharray", () => {
		const c = mount()
		const polylines = [...c.querySelectorAll("polyline:not(.vc-line-hit)")]
		// 2 groups × 1 polyline each = 2.
		expect(polylines.length).toBe(2)
		// None of them should have stroke-dasharray since the default is solid.
		const dashed = polylines.filter((p) => p.hasAttribute("stroke-dasharray"))
		expect(dashed.length).toBe(0)
	})

	it("smoothing > 0 swaps the straight polyline for a curved <path> per group", () => {
		const c = mount({ smoothing: 0.6 })
		// No connection polylines left — they render as smoothed paths now.
		expect(c.querySelectorAll("polyline:not(.vc-line-hit)").length).toBe(0)
		// The connection lines are the fill="none" paths (point marks carry a
		// real fill); each should be a cardinal spline (cubic C commands).
		const linePaths = [...c.querySelectorAll("path:not(.vc-line-hit)")].filter(
			(p) => p.getAttribute("fill") === "none"
		)
		expect(linePaths.length).toBe(2)
		expect(linePaths.every((p) => (p.getAttribute("d") ?? "").includes("C"))).toBe(
			true
		)
	})

	it("smoothing 0 (default) keeps a straight polyline per group", () => {
		const c = mount({ smoothing: 0 })
		expect(c.querySelectorAll("polyline:not(.vc-line-hit)").length).toBe(2)
	})

	it("dashed pattern emits a stacked underlay + dashed-top per group (4 polylines for 2 groups)", () => {
		// Apply a global default dashed pattern so every group inherits it.
		const c = mount({
			defaultDashPattern: "dashed",
		})
		const polylines = [...c.querySelectorAll("polyline:not(.vc-line-hit)")]
		// Each group gets 2 polylines: an alternate-color underlay (solid)
		// and a top dashed line. 2 groups → 4 polylines.
		expect(polylines.length).toBe(4)
		// Exactly half should carry stroke-dasharray (the top dashed line);
		// the other half (the underlay) should be solid.
		const dashed = polylines.filter((p) => p.hasAttribute("stroke-dasharray"))
		expect(dashed.length).toBe(2)
		// Confirm the dasharray value matches the "dashed" recipe.
		expect(dashed[0]?.getAttribute("stroke-dasharray")).toBe("8,4")
	})
})

describe("Connection — line hover tooltip", () => {
	// The tooltip portals to document.body, so unmount between tests —
	// otherwise a prior test's still-mounted tooltip leaks into the next
	// test's document-level queries.
	afterEach(cleanup)

	it("renders one invisible hit stroke per line group", () => {
		const c = mount()
		const hits = [...c.querySelectorAll("polyline.vc-line-hit")]
		expect(hits.length).toBe(2)
		// Transparent stroke, wide hit target, stroke-only pointer events.
		for (const h of hits) {
			expect(h.getAttribute("stroke")).toBe("transparent")
			expect(Number(h.getAttribute("stroke-width"))).toBeGreaterThanOrEqual(12)
			expect(h.getAttribute("pointer-events")).toBe("stroke")
		}
	})

	/** happy-dom has no `getScreenCTM`; stub an identity transform so client
	 *  coords ARE the hit stroke's local coords and the snap can be driven by
	 *  the polyline's own `points`. */
	const withIdentityCtm = (el: Element) => {
		;(el as unknown as { getScreenCTM: () => unknown }).getScreenCTM = () => ({
			inverse: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
		})
	}
	const hitPoints = (hit: Element): Array<[number, number]> =>
		(hit.getAttribute("points") ?? "")
			.split(" ")
			.map((pair) => pair.split(",").map(Number) as [number, number])

	it("hovering a line snaps the tooltip to the nearest point ON that line", () => {
		const c = mount()
		expect(document.querySelector(".vc-tooltip")).toBeNull()
		const hits = [...c.querySelectorAll("polyline.vc-line-hit")]
		const north = hits[0]!
		withIdentityCtm(north)
		const pts = hitPoints(north)
		expect(pts.length).toBe(5)
		// Aim between the 3rd and 4th points, nearer the 3rd (x=3, y=30), and
		// a few px off the stroke — nowhere near the marker itself.
		const [x3, y3] = pts[2]!
		const [x4, y4] = pts[3]!
		fireEvent.mouseMove(north, {
			clientX: x3 + (x4 - x3) * 0.3,
			clientY: y3 + (y4 - y3) * 0.3 + 3,
		})
		const tip = document.querySelector(".vc-tooltip")
		expect(tip).toBeTruthy()
		// Full-row tooltip for the snapped point: its own x / y, not just the
		// series value.
		expect(tip!.textContent).toContain("north")
		expect(tip!.textContent).toMatch(/x:\s*3(?!\d)/)
		expect(tip!.textContent).toMatch(/y:\s*30(?!\d)/)
	})

	it("the hovered line's own points win over a closer point on another line", () => {
		const c = mount()
		const hits = [...c.querySelectorAll("polyline.vc-line-hit")]
		const north = hits[0]!
		const south = hits[1]!
		withIdentityCtm(north)
		// Park the pointer ON the south line's 2nd point (x=2, y=15) but
		// deliver the event to the north hit stroke — as happens when the
		// north stroke is the one under the pointer. The snap must stay on
		// north (x=2, y=20), never jump to the geometrically closer south point.
		const [sx, sy] = hitPoints(south)[1]!
		fireEvent.mouseMove(north, { clientX: sx, clientY: sy })
		const tip = document.querySelector(".vc-tooltip")
		expect(tip).toBeTruthy()
		expect(tip!.textContent).toContain("north")
		expect(tip!.textContent).not.toContain("south")
		expect(tip!.textContent).toMatch(/y:\s*20(?!\d)/)
	})

	it("without pointer geometry (no CTM) falls back to the series-constant fields", () => {
		const c = mount()
		const hit = c.querySelector("polyline.vc-line-hit")
		expect(hit).toBeTruthy()
		fireEvent.mouseMove(hit!, { clientX: 100, clientY: 100 })
		const tip = document.querySelector(".vc-tooltip")
		expect(tip).toBeTruthy()
		// The connection variable identifies the line…
		expect(tip!.textContent).toContain("g:")
		expect(tip!.textContent).toContain("north")
		// …but fields that vary along the line (x, y) stay out: with no
		// point to snap to, no single row's values apply.
		expect(tip!.textContent).not.toContain("x:")
		expect(tip!.textContent).not.toContain("y:")
	})

	it("leaving the line clears the tooltip", () => {
		const c = mount()
		const hit = c.querySelector("polyline.vc-line-hit")!
		fireEvent.mouseMove(hit, { clientX: 100, clientY: 100 })
		expect(document.querySelector(".vc-tooltip")).toBeTruthy()
		fireEvent.mouseLeave(hit)
		expect(document.querySelector(".vc-tooltip")).toBeNull()
	})
})

describe("Connection — tooltips only at points", () => {
	// The tooltip portals to document.body; unmount between tests so a
	// previous tooltip can't answer the next document-level query.
	afterEach(cleanup)

	/** happy-dom has no `getScreenCTM`; stub an identity transform so client
	 *  coords ARE the hit stroke's local coords. */
	const withIdentityCtm = (el: Element) => {
		;(el as unknown as { getScreenCTM: () => unknown }).getScreenCTM = () => ({
			inverse: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
		})
	}
	const hitPoints = (hit: Element): Array<[number, number]> =>
		(hit.getAttribute("points") ?? "")
			.split(" ")
			.map((pair) => pair.split(",").map(Number) as [number, number])

	/** Hover the north line midway between its 3rd and 4th points — a
	 *  stretch of bare line while only the ends draw markers. */
	const hoverBareLine = (c: HTMLElement) => {
		const north = [...c.querySelectorAll("polyline.vc-line-hit")][0]!
		withIdentityCtm(north)
		const pts = hitPoints(north)
		const [x3, y3] = pts[2]!
		const [x4, y4] = pts[3]!
		fireEvent.mouseMove(north, {
			clientX: x3 + (x4 - x3) * 0.3,
			clientY: y3 + (y4 - y3) * 0.3 + 3,
		})
		return document.querySelector(".vc-tooltip")
	}

	it("reports only the line's connection value where no point is drawn", () => {
		const tip = hoverBareLine(
			mount({ pointSampling: "first-and-last" }, { pointsOnly: true })
		)
		expect(tip).toBeTruthy()
		// The line's identity — and nothing read off a point that isn't there.
		expect(tip!.textContent).toContain("g:")
		expect(tip!.textContent).toContain("north")
		expect(tip!.textContent).not.toContain("x:")
		expect(tip!.textContent).not.toContain("y:")
	})

	it("still reports the full row at a point that IS drawn", () => {
		const c = mount({ pointSampling: "first-and-last" }, { pointsOnly: true })
		const north = [...c.querySelectorAll("polyline.vc-line-hit")][0]!
		withIdentityCtm(north)
		// The last point (x=5, y=50) draws a marker under "first and last".
		const [lx, ly] = hitPoints(north)[4]!
		fireEvent.mouseMove(north, { clientX: lx, clientY: ly })
		const tip = document.querySelector(".vc-tooltip")
		expect(tip).toBeTruthy()
		expect(tip!.textContent).toMatch(/x:\s*5(?!\d)/)
		expect(tip!.textContent).toMatch(/y:\s*50(?!\d)/)
	})

	it("shows nothing at all when the connection variable isn't among the Fields shown", () => {
		const tip = hoverBareLine(
			mount(
				{ pointSampling: "first-and-last" },
				{ pointsOnly: true, visibleFields: ["x", "y"] }
			)
		)
		expect(tip).toBeNull()
	})

	it("shows nothing anywhere along a line drawn with no points at all", () => {
		const tip = hoverBareLine(
			mount(
				{ pointSampling: "none" },
				{ pointsOnly: true, visibleFields: ["x", "y"] }
			)
		)
		expect(tip).toBeNull()
	})

	it("is off by default: a bare stretch still snaps to the nearest point", () => {
		const tip = hoverBareLine(mount({ pointSampling: "first-and-last" }))
		expect(tip).toBeTruthy()
		expect(tip!.textContent).toMatch(/x:\s*3(?!\d)/)
		expect(tip!.textContent).toMatch(/y:\s*30(?!\d)/)
	})

	it("changes nothing while every point is drawn", () => {
		const tip = hoverBareLine(mount({}, { pointsOnly: true }))
		expect(tip).toBeTruthy()
		expect(tip!.textContent).toMatch(/x:\s*3(?!\d)/)
		expect(tip!.textContent).toMatch(/y:\s*30(?!\d)/)
	})
})
