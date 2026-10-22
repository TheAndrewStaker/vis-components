import { expect, test, type Page } from "@playwright/test"

import { seedFixtureScript, type SeedFixture } from "./seed"

/** Date (temporal) x axes: Scale range min / max set through the sidebar's
 *  date picker pin the axis; every tick label on a date axis shares ONE
 *  format (never d3's per-tick mix of "1988", "Jul" and "04 PM"); and the
 *  "literal" tick format prints the data column's own text shape. Plus an
 *  area chart, whose x axis is the layer's category axis, honoring pins. */

const CATEGORIES = ["Medicaid", "Medicare"]

const yearRows = (cell: (y: number) => string) =>
	Array.from({ length: 2025 - 1947 + 1 }, (_, i) => 1947 + i).flatMap((y) =>
		CATEGORIES.map((category, k) => ({
			Year: cell(y),
			category,
			value: String(Math.round((y - 1940) ** 2 / 20) + k * 7),
		}))
	)

const lineFixture = (id: string, cell: (y: number) => string, x: Record<string, unknown> = {}): SeedFixture => ({
	visualId: `vis-${id}`,
	datasetId: `ds-${id}`,
	datasetName: "date-axis-lines",
	fields: [
		{ name: "Year", inferredType: "temporal" },
		{ name: "category", inferredType: "categorical" },
		{ name: "value", inferredType: "quantitative" },
	],
	rows: yearRows(cell),
	encodings: {
		x: { field: "Year" },
		y: { field: "value" },
		hue: { field: "category" },
		connection: { field: "category" },
	},
	channelConfigs: { x: { tickCount: 8, ...x } },
	labels: { title: "Date axis", xAxisTitle: "Year", yAxisTitle: "value" },
})

const DECADES = ["1949", "1959", "1969", "1979", "1989", "1999", "2009", "2019"]

/** Shapes a date axis may print. Every label on one axis must match the
 *  SAME one — mixed shapes across ticks is the bug this suite guards. */
const SHAPES = [
	/^\d{4}$/,
	/^[A-Z][a-z]{2} \d{4}$/,
	/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/,
	/^[A-Z][a-z]{2} \d{1,2}, \d{4} \d{2}:\d{2}$/,
	/^\d{1,2}\/\d{1,2}\/\d{4}$/,
	/^\d{4}-\d{2}$/,
	/^\d{4}-\d{2}-\d{2}$/,
]
const oneShape = (labels: string[]): boolean =>
	labels.length > 0 && SHAPES.some((re) => labels.every((l) => re.test(l)))

const xTickLabels = (page: Page) =>
	page.evaluate(() =>
		[...document.querySelectorAll('svg#vc-scatter-svg text[data-vc-tick-label="x"]')].map(
			(t) => (t.textContent ?? "").trim()
		)
	)

const openVisual = async (page: Page, fx: SeedFixture) => {
	await page.addInitScript(seedFixtureScript(fx))
	await page.goto(`/editor/${fx.visualId}`, { waitUntil: "networkidle" })
	await page.waitForSelector("svg#vc-scatter-svg", { timeout: 8_000 })
	await page.waitForTimeout(300)
}

const openXScale = async (page: Page) => {
	await page.getByRole("button", { name: "Toggle options for X position" }).click()
	await page.getByRole("button", { name: "Scale", exact: true }).click()
}

test("min / max picked and typed pin a date axis; ticks lay out from the ends in one format", async ({ page }) => {
	await openVisual(page, lineFixture("date-pins", (y) => String(y)))
	await openXScale(page)

	// min = 1949-01-01 through the picker: separate Month + Year selects,
	// then one click on a day.
	const minField = page.getByLabel("Scale range min")
	await minField.locator("xpath=..").getByRole("button", { name: "Pick a date" }).click()
	const dialog = page.getByRole("dialog", { name: "Choose a date" })
	await expect(dialog).toBeVisible()
	await dialog.getByLabel("Year").selectOption("1949")
	await dialog.getByLabel("Month").selectOption({ label: "Jan" })
	await dialog.getByRole("button", { name: "1949-01-01" }).click()
	await expect(dialog).toBeHidden()
	await expect(minField).toHaveValue("1949-01-01")

	// max = 2019-01-01 typed.
	const maxField = page.getByLabel("Scale range max")
	await maxField.fill("2019-01-01")
	await maxField.press("Enter")

	await expect.poll(() => xTickLabels(page), { timeout: 5_000 }).toEqual(DECADES)
})

test("an auto-fit date axis prints every tick in the same format", async ({ page }) => {
	await openVisual(page, lineFixture("date-auto", (y) => String(y)))
	const labels = await xTickLabels(page)
	expect(labels.length).toBeGreaterThan(2)
	expect(oneShape(labels), labels.join(" | ")).toBe(true)
	expect(labels.every((l) => /^\d{4}$/.test(l)), labels.join(" | ")).toBe(true)
})

test("a pinned date axis with a mid-year end still prints one format", async ({ page }) => {
	// 1949-01-01 … 2018-07-01: the even ticks can't all be year starts, so
	// the WHOLE axis switches to month granularity — never "1959" next to
	// "Jul 2018".
	await openVisual(
		page,
		lineFixture("date-midyear", (y) => String(y), {
			min: new Date(1949, 0, 1).getTime(),
			max: new Date(2018, 6, 1).getTime(),
		})
	)
	const labels = await xTickLabels(page)
	expect(labels.length).toBeGreaterThan(2)
	expect(oneShape(labels), labels.join(" | ")).toBe(true)
	expect(labels).toContain("Jul 2018")
})

test("literal prints the data column's own text shape", async ({ page }) => {
	// Cells like "1/1/1947": Auto labels bare years, literal labels M/D/YYYY.
	await openVisual(page, lineFixture("date-literal", (y) => `1/1/${y}`))
	const auto = await xTickLabels(page)
	expect(auto.every((l) => /^\d{4}$/.test(l)), auto.join(" | ")).toBe(true)

	await page.getByRole("button", { name: "Toggle options for X position" }).click()
	await page.getByRole("button", { name: "Tick labels", exact: true }).click()
	await page.getByLabel("Custom text format").fill("literal")

	await expect
		.poll(
			async () => {
				const labels = await xTickLabels(page)
				return labels.length === auto.length && labels.every((l) => /^1\/1\/\d{4}$/.test(l))
			},
			{ timeout: 5_000 }
		)
		.toBe(true)
})

test("literal on a year-only column prints bare years, not ISO months", async ({ page }) => {
	await openVisual(
		page,
		lineFixture("date-literal-years", (y) => String(y), {
			min: new Date(1949, 0, 1).getTime(),
			max: new Date(2019, 0, 1).getTime(),
			customFormat: "literal",
		})
	)
	expect(await xTickLabels(page)).toEqual(DECADES)
})

test("an area chart's date x axis honors Scale range min / max", async ({ page }) => {
	const fx: SeedFixture = {
		visualId: "vis-area-date-pins",
		datasetId: "ds-area-date-pins",
		datasetName: "area-date-pins",
		fields: [
			{ name: "Date", inferredType: "temporal" },
			{ name: "category", inferredType: "categorical" },
			{ name: "value", inferredType: "quantitative" },
		],
		rows: [2000, 2005, 2010, 2015, 2020, 2025].flatMap((y) =>
			CATEGORIES.map((category, k) => ({
				Date: `${y}-11-01`,
				category,
				value: String(10 + k * 5),
			}))
		),
		encodings: {
			x: { field: "Date" },
			length: { field: "value" },
			hue: { field: "category" },
			connection: { field: "category" },
		},
		channelConfigs: {
			x: {
				tickCount: 7,
				min: new Date(1990, 0, 1).getTime(),
				max: new Date(2020, 0, 1).getTime(),
			},
			connection: { fill: "area" },
		},
		labels: { title: "Area date pins", xAxisTitle: "Date", yAxisTitle: "value" },
	}
	await openVisual(page, fx)
	const labels = await xTickLabels(page)
	expect(labels[0]).toBe("1990")
	expect(labels[labels.length - 1]).toBe("2020")
	expect(labels).not.toContain("2025")
	expect(oneShape(labels), labels.join(" | ")).toBe(true)
	expect(await page.locator("svg#vc-scatter-svg clipPath").count()).toBeGreaterThan(0)
})
