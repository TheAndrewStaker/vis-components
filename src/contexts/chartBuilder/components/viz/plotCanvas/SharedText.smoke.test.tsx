import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { SharedText } from "./SharedText"

/** The chart-title prefix ("FIGURE 5.") must share the first line's text
 *  chunk: only the prefix tspan carries `x`, the first title tspan has none,
 *  so the parent `<text>`'s text-anchor aligns prefix + title as ONE run —
 *  a left-aligned title starts at the same x with or without its prefix,
 *  and a centered / right-aligned one centers / right-aligns the pair. */
describe("SharedText — title prefix", () => {
	afterEach(cleanup)

	const rect = {
		x: 40,
		y: 20,
		textAnchor: "start" as const,
		rotation: 0 as const,
		width: 300,
		height: 30,
	}

	it("renders the prefix in the first line's chunk with its own font", () => {
		const { container } = render(
			<svg>
				<SharedText
					rect={rect}
					text={"Distribution of CCI\nby setting"}
					fontFamily="serif"
					fontSize={16}
					fill="#111111"
					prefix={{
						text: "FIGURE 5.",
						fontWeight: 700,
						fill: "#aa0000",
						fontSize: 18,
					}}
				/>
			</svg>
		)
		const tspans = [...container.querySelectorAll("tspan")]
		expect(tspans.map((t) => t.textContent)).toEqual([
			"FIGURE 5.",
			" Distribution of CCI",
			"by setting",
		])
		// Prefix opens the chunk at the anchor x with its own styling.
		expect(tspans[0].getAttribute("x")).toBe("40")
		expect(tspans[0].getAttribute("font-weight")).toBe("700")
		expect(tspans[0].getAttribute("fill")).toBe("#aa0000")
		expect(tspans[0].getAttribute("font-size")).toBe("18")
		// First title line continues that chunk: no x, no dy, inherits font.
		expect(tspans[1].hasAttribute("x")).toBe(false)
		expect(tspans[1].hasAttribute("dy")).toBe(false)
		expect(tspans[1].hasAttribute("font-weight")).toBe(false)
		// Later lines start their own chunk at the same x, one line down.
		expect(tspans[2].getAttribute("x")).toBe("40")
		expect(tspans[2].getAttribute("dy")).toBe("1.2em")
	})

	it("renders plain lines unchanged when no prefix is given", () => {
		const { container } = render(
			<svg>
				<SharedText rect={rect} text="Plain title" fontSize={16} />
			</svg>
		)
		const tspans = [...container.querySelectorAll("tspan")]
		expect(tspans).toHaveLength(1)
		expect(tspans[0].textContent).toBe("Plain title")
		expect(tspans[0].getAttribute("x")).toBe("40")
	})
})

/** Multi-line chart titles, subtitles and facet labels grow UP: the solver
 *  hands the renderer the LAST line's baseline (`growUp` on the rect), and
 *  the first line is lifted one 1.2em step per extra line — in px, so a
 *  prefix in another font size can't scale the lift. */
describe("SharedText — growUp stacking", () => {
	afterEach(cleanup)

	const rect = {
		x: 40,
		y: 60,
		textAnchor: "start" as const,
		rotation: 0 as const,
		width: 300,
		height: 30,
		growUp: true,
	}

	it("lifts the first line by 1.2em per extra line (in px) and drops the rest 1.2em", () => {
		const { container } = render(
			<svg>
				<SharedText rect={rect} text={"a\nb\nc"} fontSize={16} />
			</svg>
		)
		const tspans = [...container.querySelectorAll("tspan")]
		// −38.4 + 19.2 + 19.2 = 0: the last line lands on the anchor.
		expect(tspans.map((t) => t.getAttribute("dy"))).toEqual([
			"-38.4",
			"1.2em",
			"1.2em",
		])
		expect(tspans.map((t) => t.getAttribute("x"))).toEqual(["40", "40", "40"])
	})

	it("puts the lift on the prefix tspan so the first line's chunk rides it", () => {
		const { container } = render(
			<svg>
				<SharedText
					rect={rect}
					text={"Distribution\nby setting"}
					fontSize={16}
					prefix={{ text: "FIGURE 5.", fontSize: 12 }}
				/>
			</svg>
		)
		const tspans = [...container.querySelectorAll("tspan")]
		expect(tspans[0].getAttribute("dy")).toBe("-19.2")
		expect(tspans[1].hasAttribute("dy")).toBe(false)
		expect(tspans[2].getAttribute("dy")).toBe("1.2em")
	})

	it("leaves a single line on the anchor", () => {
		const { container } = render(
			<svg>
				<SharedText rect={rect} text="One line" fontSize={16} />
			</svg>
		)
		expect(container.querySelector("tspan")?.getAttribute("dy")).toBe("0")
	})
})
