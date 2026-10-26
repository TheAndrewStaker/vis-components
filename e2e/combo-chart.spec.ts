import { expect, test, type Page } from "@playwright/test"

import { seedFixtureScript, type SeedFixture } from "./seed"

// Bar + marks combo: `x + y + length` with the Length panel's "Draw as" =
// Bars draws the bars of `length` and the `y` variable as marks on the SAME
// measure axis, joined per Connection value. Without the opt-in the same
// encodings stay the line-segment scatter. Screenshots land in
// e2e/screenshots/combo/ for visual comparison.

const ROWS = [
	{ month: "Jan", units: "10", revenue: "50", series: "retail" },
	{ month: "Feb", units: "20", revenue: "60", series: "retail" },
	{ month: "Mar", units: "15", revenue: "90", series: "retail" },
	{ month: "Jan", units: "8", revenue: "30", series: "online" },
	{ month: "Feb", units: "12", revenue: "45", series: "online" },
	{ month: "Mar", units: "18", revenue: "70", series: "online" },
]

const FIELDS = [
	{ name: "month", inferredType: "categorical" },
	{ name: "units", inferredType: "quantitative" },
	{ name: "revenue", inferredType: "quantitative" },
	{ name: "series", inferredType: "categorical" },
]

const LENGTH_AS_BARS = { length: { minLength: 4, maxLength: 40, render: "bars" } }

const fixture = (
	visualId: string,
	encodings: SeedFixture["encodings"],
	channelConfigs?: SeedFixture["channelConfigs"]
): SeedFixture => ({
	visualId,
	datasetId: `ds-${visualId}`,
	datasetName: visualId,
	fields: FIELDS,
	rows: ROWS,
	encodings,
	channelConfigs,
})

type Geometry = {
	bars: Array<{ x: number; y: number; w: number; h: number }>
	marks: Array<{ x: number; y: number }>
	polylines: number
	comboLayer: boolean
}

/** Bars, marks-layer glyph positions and line count from the main plot. */
const readGeometry = (page: Page): Promise<Geometry> =>
	page.evaluate(() => {
		const svgs = [...document.querySelectorAll("svg")]
		const area = (s: Element) => {
			const r = s.getBoundingClientRect()
			return r.width * r.height
		}
		const main = svgs.reduce((a, b) => (area(b) > area(a) ? b : a))
		const bars = [...main.querySelectorAll("rect")]
			.filter(
				(r) =>
					r.getAttribute("fill-opacity") !== null &&
					parseFloat(r.getAttribute("height") ?? "0") > 4 &&
					parseFloat(r.getAttribute("width") ?? "0") > 4
			)
			.map((r) => ({
				x: parseFloat(r.getAttribute("x") ?? "0"),
				y: parseFloat(r.getAttribute("y") ?? "0"),
				w: parseFloat(r.getAttribute("width") ?? "0"),
				h: parseFloat(r.getAttribute("height") ?? "0"),
			}))
		const layer = main.querySelector("[data-combo-marks]")
		const marks = layer
			? [...layer.querySelectorAll("path[transform]")].flatMap((p) => {
					const m = /translate\(([^,]+),([^)]+)\)/.exec(
						p.getAttribute("transform") ?? ""
					)
					return m ? [{ x: parseFloat(m[1]!), y: parseFloat(m[2]!) }] : []
				})
			: []
		return {
			bars,
			marks,
			polylines: layer ? layer.querySelectorAll("polyline").length : 0,
			comboLayer: layer !== null,
		}
	})

const open = async (page: Page, fx: SeedFixture) => {
	await page.addInitScript(seedFixtureScript(fx))
	await page.goto(`/editor/${fx.visualId}`, { waitUntil: "networkidle" })
	await page.waitForSelector("svg", { timeout: 8_000 })
}

test("vertical combo: stacked bars of units, one revenue line per series on the same axis", async ({
	page,
}) => {
	const fx = fixture(
		"vis-combo-x",
		{
			x: { field: "month" },
			y: { field: "revenue" },
			length: { field: "units" },
			connection: { field: "series" },
			hue: { field: "series" },
		},
		LENGTH_AS_BARS
	)
	await open(page, fx)
	await expect.poll(async () => (await readGeometry(page)).bars.length).toBe(6)
	const g = await readGeometry(page)
	expect(g.comboLayer).toBe(true)
	// One glyph per row; a polyline per series (each visible line also
	// carries an invisible hit-stroke twin, so count at least one per
	// series rather than exactly).
	expect(g.marks).toHaveLength(6)
	expect(g.polylines).toBeGreaterThanOrEqual(2)
	// Marks sit at the band CENTERS: each mark x inside some bar's span.
	for (const m of g.marks) {
		expect(g.bars.some((b) => m.x > b.x && m.x < b.x + b.w)).toBe(true)
	}
	// Shared axis: the tallest stack (Mar: 15 + 18 = 33) is below revenue
	// 90, so the highest mark sits ABOVE every bar's top (SVG y grows down),
	// and the lowest mark (30) sits within the plot (below the top mark).
	const barTop = Math.min(...g.bars.map((b) => b.y))
	expect(Math.min(...g.marks.map((m) => m.y))).toBeLessThan(barTop)
	await page.screenshot({ path: "e2e/screenshots/combo/vertical-bars-line.png" })
})

test("horizontal combo: categorical y + quantitative x flips the bars", async ({
	page,
}) => {
	const fx = fixture(
		"vis-combo-y",
		{
			y: { field: "month" },
			x: { field: "revenue" },
			length: { field: "units" },
			connection: { field: "series" },
		},
		LENGTH_AS_BARS
	)
	await open(page, fx)
	// No hue: one bar per month (units summed over both series); still one
	// mark per ROW for the x variable.
	await expect.poll(async () => (await readGeometry(page)).bars.length).toBe(3)
	const g = await readGeometry(page)
	expect(g.marks).toHaveLength(6)
	// Horizontal bars: all start at the same left edge (x axis baseline).
	const lefts = new Set(g.bars.map((b) => Math.round(b.x)))
	expect(lefts.size).toBe(1)
	// Marks sit at band centers along y.
	for (const m of g.marks) {
		expect(g.bars.some((b) => m.y > b.y && m.y < b.y + b.h)).toBe(true)
	}
	await page.screenshot({ path: "e2e/screenshots/combo/horizontal-bars-line.png" })
})

test("without the Draw-as opt-in the same encodings are the segment scatter", async ({
	page,
}) => {
	const fx = fixture("vis-combo-off", {
		x: { field: "month" },
		y: { field: "revenue" },
		length: { field: "units" },
		connection: { field: "series" },
	})
	await open(page, fx)
	await page.waitForTimeout(300)
	const g = await readGeometry(page)
	expect(g.comboLayer).toBe(false)
	expect(g.bars).toHaveLength(0)
	await page.screenshot({ path: "e2e/screenshots/combo/segments-default.png" })
})

test("Length panel: Draw as → Bars turns the segment scatter into the combo live", async ({
	page,
}) => {
	const fx = fixture("vis-combo-toggle", {
		x: { field: "month" },
		y: { field: "revenue" },
		length: { field: "units" },
		connection: { field: "series" },
	})
	await open(page, fx)
	await page.getByRole("button", { name: /Toggle options for Length/i }).click()
	const drawAs = page.getByRole("radiogroup", { name: "Draw length as" })
	await expect(drawAs).toBeVisible()
	await drawAs.getByRole("radio", { name: "Bars", exact: true }).click()
	await expect.poll(async () => (await readGeometry(page)).bars.length).toBe(3)
	await expect(page.getByLabel("Bar gap")).toBeVisible()
	await page.screenshot({ path: "e2e/screenshots/combo/sidebar-draw-as.png" })
	await drawAs.getByRole("radio", { name: "Segments", exact: true }).click()
	await expect.poll(async () => (await readGeometry(page)).bars.length).toBe(0)
})

test("quick start: the Combo chart button scaffolds bars plus a line", async ({
	page,
}) => {
	const fx = fixture("vis-combo-qs", {
		x: { field: "month" },
		length: { field: "units" },
	})
	await open(page, fx)
	const btn = page.getByRole("button", { name: "Combo chart" }).first()
	await expect(btn).toBeEnabled()
	await btn.click()
	// The visual already has encodings, so the icon bar asks before replacing.
	await page.getByRole("button", { name: "Replace", exact: true }).click()
	await expect
		.poll(async () => (await readGeometry(page)).comboLayer, { timeout: 8_000 })
		.toBe(true)
	const g = await readGeometry(page)
	expect(g.bars.length).toBeGreaterThan(0)
	expect(g.marks.length).toBeGreaterThan(0)
	await page.screenshot({ path: "e2e/screenshots/combo/quick-start.png" })
})
