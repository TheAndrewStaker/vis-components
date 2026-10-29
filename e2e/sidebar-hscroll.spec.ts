import { expect, test, type Page } from "@playwright/test"

import { seedFixtureScript, type SeedFixture } from "./seed"

/** The editor sidebar column never goes narrower than the width that shows
 *  every control row in full (SIDEBAR_MIN_WIDTH, the default width): the
 *  resize handle stops there, and dragging well past it collapses the column
 *  away instead. Before this, the handle went down to 240px and the aside
 *  scrolled horizontally, so the trailing control of each row (the palette
 *  picker, a dropdown's right half) sat out of view and read as missing.
 *  The floor covers the widest row — an overridden color row, whose "reset"
 *  link used to be clipped at the aside's edge. The column also grows by the
 *  gutter the aside reserves for a vertical scrollbar (which otherwise ate
 *  the slack); sidebar-scrollbar-gutter.spec.ts covers that with the
 *  scrollbars headless Chrome normally hides. */

import { SIDEBAR_MIN_WIDTH } from "../src/contexts/chartBuilder/lib/storage"

const rows = Array.from({ length: 12 }, (_, i) => ({
	val: String(i * 3),
	grp: ["A", "B", "C"][i % 3]!,
}))

const fixture: SeedFixture = {
	visualId: "sb-hscroll",
	datasetId: "ds-sb-hscroll",
	datasetName: "sb-hscroll",
	fields: [
		{ name: "val", inferredType: "quantitative" },
		{ name: "grp", inferredType: "categorical" },
	],
	rows,
	encodings: { x: { field: "grp" }, y: { field: "val" }, hue: { field: "grp" } },
}

/** Boots the editor with the Color menu open — it carries the widest
 *  canonical rows (label column + hex box + swatch + palette-picker button). */
const openEditor = async (page: Page) => {
	await page.addInitScript(seedFixtureScript(fixture))
	await page.goto(`/editor/${fixture.visualId}`, { waitUntil: "networkidle" })
	await page.waitForSelector("aside", { timeout: 8_000 })
	await page.getByRole("button", { name: /Toggle options for Color/i }).click()
	await page.waitForTimeout(300)
}

const measureSidebar = (page: Page) =>
	page.evaluate(() => {
		const aside = document.querySelector("aside")!
		const asideLeft = aside.getBoundingClientRect().left
		const colorRows = [
			...document.querySelectorAll("aside button[data-color]"),
		].map((s) => s.closest(".flex.items-center")!)
		return {
			scrollWidth: aside.scrollWidth,
			clientWidth: aside.clientWidth,
			selectWidths: [...document.querySelectorAll("aside select")].map((el) =>
				Math.round(el.getBoundingClientRect().width)
			),
			// Right edge of the widest color row, in the aside's scroll space.
			maxRowRight: Math.max(
				...colorRows.map(
					(r) => r.getBoundingClientRect().right - asideLeft + aside.scrollLeft
				)
			),
		}
	})

/** Drags the resize handle to put the sidebar at `width` px. */
const dragSidebarTo = async (page: Page, width: number) => {
	const handle = page.getByRole("separator", { name: "Resize sidebar" })
	const box = (await handle.boundingBox())!
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
	await page.mouse.down()
	await page.mouse.move(width, box.y + box.height / 2, { steps: 8 })
	await page.mouse.up()
	await page.waitForTimeout(200)
}

test("sidebar at its default width shows every control row without horizontal scroll", async ({
	page,
}) => {
	await openEditor(page)
	const m = await measureSidebar(page)
	expect(m.scrollWidth).toBeLessThanOrEqual(m.clientWidth + 1)
	expect(m.maxRowRight).toBeLessThanOrEqual(m.clientWidth)
})

test("dragging the sidebar narrower stops at the floor, with no row cut off", async ({
	page,
}) => {
	await openEditor(page)
	const wide = await measureSidebar(page)
	expect(wide.clientWidth).toBe(SIDEBAR_MIN_WIDTH)

	// Widen it, then pull it back a little past the floor (inside the
	// collapse dead zone): it clamps at the floor rather than collapsing.
	await dragSidebarTo(page, 460)
	expect((await measureSidebar(page)).clientWidth).toBeGreaterThan(
		SIDEBAR_MIN_WIDTH
	)
	await dragSidebarTo(page, SIDEBAR_MIN_WIDTH - 40)
	const m = await measureSidebar(page)
	expect(m.clientWidth).toBe(SIDEBAR_MIN_WIDTH)
	expect(m.scrollWidth).toBeLessThanOrEqual(m.clientWidth + 1)
	expect(m.maxRowRight).toBeLessThanOrEqual(m.clientWidth)
	// Nothing squeezed: every dropdown keeps its full width.
	expect(m.selectWidths).toEqual(wide.selectWidths)
})

test("an overridden color row fits at the floor: reset link and picker inside their boxes", async ({
	page,
}) => {
	await openEditor(page)
	const hex = page.getByLabel("Color for B hex")
	await hex.fill("#123456")
	await hex.blur()
	await page.waitForTimeout(200)

	const m = await page.evaluate(() => {
		const aside = document.querySelector("aside")!
		const reset = [...aside.querySelectorAll("button")].find(
			(b) => b.textContent?.trim() === "reset"
		)!
		const row = reset.parentElement!
		const picker = row.querySelector("button[aria-label^='Pick palette']")!
		const card = picker.closest(".vc-subsection-card")!
		return {
			scrollWidth: aside.scrollWidth,
			clientWidth: aside.clientWidth,
			resetRight: reset.getBoundingClientRect().right,
			asideRight: aside.getBoundingClientRect().right,
			pickerRight: picker.getBoundingClientRect().right,
			cardRight: card.getBoundingClientRect().right,
			hexWidth: row.querySelector("input[type=text]")!.getBoundingClientRect()
				.width,
		}
	})
	expect(m.scrollWidth).toBeLessThanOrEqual(m.clientWidth + 1)
	expect(m.resetRight).toBeLessThanOrEqual(m.asideRight)
	expect(m.pickerRight).toBeLessThanOrEqual(m.cardRight)
	// Nothing squeezed to make it fit: the hex box keeps its full `w-24`.
	expect(m.hexWidth).toBe(96)
})

test("dragging the sidebar well past the floor collapses it; the tab reopens it at the floor", async ({
	page,
}) => {
	await openEditor(page)
	await dragSidebarTo(page, 160)

	await expect(page.locator("aside")).toHaveCount(0)
	const showTab = page.getByRole("button", { name: "Show menu" })
	await expect(showTab).toBeVisible()

	await showTab.click()
	await page.waitForSelector("aside", { timeout: 8_000 })
	const m = await measureSidebar(page)
	expect(m.clientWidth).toBe(SIDEBAR_MIN_WIDTH)
	expect(m.scrollWidth).toBeLessThanOrEqual(m.clientWidth + 1)
})
