import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { SYSTEM_LIGHT_THEME, themeOf } from "../../chartBuilder/lib/systemThemes"
import type { Theme } from "../../chartBuilder/lib/types"

import { ThemeTooltipTablePreview } from "./ThemeTooltipTablePreview"

afterEach(cleanup)

const base: Theme = themeOf(SYSTEM_LIGHT_THEME)

describe("ThemeTooltipTablePreview", () => {
	it("draws a tooltip box and a 3×3 table with the live renderers' classes", () => {
		render(<ThemeTooltipTablePreview theme={base} name="Sampled" />)
		const root = screen.getByRole("img", {
			name: "Tooltip and data table in the Sampled theme",
		})
		const tooltip = root.querySelector(".vc-tooltip")
		expect(tooltip?.textContent).toContain("Region:")
		expect(tooltip?.textContent).toContain("West")
		expect(tooltip?.textContent).toContain("1,204")
		const table = root.querySelector("table.vc-data-table")
		expect(table?.querySelector("caption")?.textContent).toBe("Sales by region")
		expect(table?.querySelectorAll("thead th")).toHaveLength(3)
		expect(table?.querySelectorAll("tbody tr")).toHaveLength(3)
		expect(table?.querySelectorAll("tbody tr:first-child td")).toHaveLength(3)
	})

	it("carries the theme's tooltip box and table look as the renderers' custom properties", () => {
		const theme: Theme = {
			...base,
			tooltipCornerRadius: 3,
			tooltipBackgroundColor: "#101010",
			dataTableHeaderBackground: "#abcdef",
			dataTableStriped: false,
			dataTableNumberAlign: "center",
			dataTableFirstColumnLikeOthers: false,
		}
		render(<ThemeTooltipTablePreview theme={theme} name="Sampled" />)
		const root = screen.getByRole("img")
		const tooltip = root.querySelector<HTMLElement>(".vc-tooltip")!
		expect(tooltip.style.getPropertyValue("--vc-tooltip-radius")).toBe("3px")
		expect(tooltip.style.getPropertyValue("--vc-tooltip-fill")).toBe("#101010")
		const block = root.querySelector<HTMLElement>(".vc-data-table-block")!
		expect(block.style.getPropertyValue("--vc-dt-head-bg")).toBe("#abcdef")
		expect(block.style.getPropertyValue("--vc-dt-stripe")).toBe("transparent")
		// Numbers center; the text column stays left and takes the first-column style.
		const firstRow = [...root.querySelectorAll("tbody tr:first-child td")]
		expect(firstRow[0]?.className).toContain("vc-data-table-align-left")
		expect(firstRow[0]?.className).toContain("vc-data-table-first")
		expect(firstRow[1]?.className).toContain("vc-data-table-align-center")
	})

	it("paints the theme's chart background behind both", () => {
		render(
			<ThemeTooltipTablePreview
				theme={{ ...base, chartBackgroundColor: "#040038" }}
				name="Sampled"
			/>
		)
		expect(screen.getByRole("img").style.backgroundColor).toBe("#040038")
	})
})
