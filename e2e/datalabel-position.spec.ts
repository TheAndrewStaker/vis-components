import { expect, test } from "@playwright/test"

import { seedFixtureScript, type SeedFixture } from "./seed"

const fx = (id: string, encodings: SeedFixture["encodings"]): SeedFixture => ({
	visualId: id,
	datasetId: `ds-${id}`,
	datasetName: id,
	fields: [
		{ name: "cat", inferredType: "categorical" },
		{ name: "num", inferredType: "quantitative" },
		{ name: "num2", inferredType: "quantitative" },
	],
	rows: Array.from({ length: 9 }, (_, i) => ({
		cat: ["A", "B", "C"][i % 3]!,
		num: String((i + 1) * 3),
		num2: String((i + 2) * 2),
	})),
	encodings,
})

const openPositionSubsection = async (
	page: import("@playwright/test").Page
) => {
	await page.getByRole("button", { name: "Data Labels" }).click()
	await page.waitForTimeout(150)
	await page
		.getByRole("button", { name: "Position and alignment" })
		.click()
	await page.waitForTimeout(150)
}

test("Bar placement lives in the Position subsection, only for bar charts", async ({
	page,
}) => {
	// Bars-x: x (categorical) + length (quantitative).
	const bars = fx("dlp-bars", {
		x: { field: "cat" },
		length: { field: "num" },
	})
	await page.addInitScript(seedFixtureScript(bars))
	await page.goto(`/editor/${bars.visualId}`, { waitUntil: "networkidle" })
	await page.waitForSelector("svg", { timeout: 8_000 })
	await openPositionSubsection(page)
	await page.screenshot({ path: "/tmp/dlp-bars.png", fullPage: true })

	// Inside the subsection: Alignment + the bar "Placement" group both
	// visible. Vertical bars name the measure-axis select "Vertical" and the
	// side select "Horizontal" (the screen direction each moves labels in).
	expect(await page.getByText("Align", { exact: true }).isVisible()).toBe(true)
	expect(await page.getByText("Placement", { exact: true }).isVisible()).toBe(
		true
	)
	expect(await page.getByText("Vertical", { exact: true }).isVisible()).toBe(true)
	expect(await page.getByText("Horizontal", { exact: true }).isVisible()).toBe(
		true
	)
})

test("Bar placement is hidden on a non-bar (scatter) chart", async ({ page }) => {
	const scatter = fx("dlp-scatter", {
		x: { field: "num" },
		y: { field: "num2" },
	})
	await page.addInitScript(seedFixtureScript(scatter))
	await page.goto(`/editor/${scatter.visualId}`, { waitUntil: "networkidle" })
	await page.waitForSelector("svg", { timeout: 8_000 })
	await openPositionSubsection(page)

	expect(await page.getByText("Align", { exact: true }).isVisible()).toBe(true)
	expect(await page.getByText("Placement", { exact: true }).count()).toBe(0)
})
