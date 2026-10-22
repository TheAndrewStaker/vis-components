import { expect, test } from "@playwright/test"

import { SIDEBAR_MIN_WIDTH } from "../src/contexts/chartBuilder/lib/storage"
import { seedFixtureScript, type SeedFixture } from "./seed"

/** Headless Chrome hides scrollbars by default. With classic scrollbars — a
 *  Mac with a mouse, Windows — the vertical scrollbar is paid out of the
 *  editor sidebar's client width, so the column must grow by that gutter to
 *  keep every control row in full (sidebar-hscroll.spec.ts has the rest).
 *  Launch options only apply per file, hence the separate spec. */
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } })

const fixture: SeedFixture = {
	visualId: "sb-gutter",
	datasetId: "ds-sb-gutter",
	datasetName: "sb-gutter",
	fields: [
		{ name: "val", inferredType: "quantitative" },
		{ name: "grp", inferredType: "categorical" },
	],
	rows: Array.from({ length: 12 }, (_, i) => ({
		val: String(i * 3),
		grp: ["A", "B", "C"][i % 3]!,
	})),
	encodings: { x: { field: "grp" }, y: { field: "val" }, hue: { field: "grp" } },
}

test("with classic scrollbars the column grows by the gutter, so no row is cut off", async ({
	page,
}) => {
	await page.addInitScript(seedFixtureScript(fixture))
	await page.goto(`/editor/${fixture.visualId}`, { waitUntil: "networkidle" })
	await page.waitForSelector("aside", { timeout: 8_000 })
	await page.getByRole("button", { name: /Toggle options for Color/i }).click()
	await page.waitForTimeout(300)

	const m = await page.evaluate(() => {
		const aside = document.querySelector("aside")!
		return {
			offsetWidth: aside.offsetWidth,
			clientWidth: aside.clientWidth,
			scrollWidth: aside.scrollWidth,
		}
	})
	const gutter = m.offsetWidth - m.clientWidth
	expect(gutter).toBeGreaterThan(0)
	expect(m.clientWidth).toBe(SIDEBAR_MIN_WIDTH)
	expect(m.scrollWidth).toBeLessThanOrEqual(m.clientWidth + 1)
})
