import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"
import { OUTLINE_HUE_SCATTER, seedFixtureScript } from "./seed"

/** End-to-end coverage for the embed page's export mode
 *  (`/embed/<id>?export=…`): the page runs the Export dialog's pipeline on
 *  itself and writes the file into #export-result as base64. Asserts type
 *  and pixel size rather than bytes, which drift by a pixel of layout
 *  between hosts. */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const openExport = async (page: Page, query: string, visualId = OUTLINE_HUE_SCATTER.visualId) => {
	await page.addInitScript(seedFixtureScript(OUTLINE_HUE_SCATTER))
	await page.goto(`/embed/${visualId}?${query}`)
	const done = page.locator("#export-result, #export-error")
	await expect(done).toBeAttached({ timeout: 25_000 })
	return done
}

const readResult = async (page: Page) => {
	const result = page.locator("#export-result")
	await expect(result).toBeAttached()
	const bytes = Buffer.from((await result.textContent()) ?? "", "base64")
	expect(Number(await result.getAttribute("data-bytes"))).toBe(bytes.length)
	return { result, bytes }
}

test.describe("Embed export mode", () => {
	test("PNG at the dialog's default size and resolution", async ({ page }) => {
		await openExport(page, "export=png")
		const { result, bytes } = await readResult(page)
		expect(await result.getAttribute("data-mime")).toBe("image/png")
		expect(bytes.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true)
		expect(await result.getAttribute("data-width")).toBe("650")
		expect(await result.getAttribute("data-height")).toBe("400")
		expect(await result.getAttribute("data-pixel-ratio")).toBe("4")
		// IHDR: 650×400 CSS px at 4× is 2600×1600.
		expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([2600, 1600])
	})

	test("explicit width / height / ratio are honored and clamped", async ({ page }) => {
		await openExport(page, "export=png&width=300&height=20&ratio=2")
		const { result, bytes } = await readResult(page)
		expect(await result.getAttribute("data-width")).toBe("300")
		// Under the dialog's 50 px floor.
		expect(await result.getAttribute("data-height")).toBe("50")
		expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([600, 100])
	})

	test("SVG carries the chart and its legend", async ({ page }) => {
		await openExport(page, "export=svg")
		const { result, bytes } = await readResult(page)
		expect(await result.getAttribute("data-mime")).toBe("image/svg+xml")
		const content = bytes.toString("utf8")
		for (const category of ["alpha", "beta", "gamma"]) {
			expect(content).toContain(`>${category}</text>`)
		}
		expect(content).toContain("<path")
	})

	test("an unknown format reports an error", async ({ page }) => {
		const done = await openExport(page, "export=gif")
		await expect(done).toHaveAttribute("id", "export-error")
		await expect(done).toHaveText("Unknown format.")
	})

	test("an unknown visual reports an error", async ({ page }) => {
		const done = await openExport(page, "export=png", "no-such-visual")
		await expect(done).toHaveAttribute("id", "export-error")
		await expect(done).toHaveText("Visualization not found.")
	})
})
