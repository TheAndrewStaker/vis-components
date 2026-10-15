import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { PatternDefs, PatternTile } from "./patternDefs"
import { MARK_WEIGHTED_SPACING_EXPONENT, PATTERN_PALETTE } from "./patterns"

/** The one `<pattern>` renderer every tile goes through (chart defs, legend
 *  swatches, the Pattern menu's chips, the theme sampler, map chips). The
 *  Scale pick grows the MARKS by the full factor; the tile (spacing) grows
 *  by `scale ^ spacingExponent` — a little less for dots and stripes, so
 *  they tighten up as they're zoomed in, and uniformly for the crosshatch
 *  and checker. */

const DOTS = 0
const DIAG = 1
const VERT = 2
const CROSS = 4
const CHECKER = 5

const tile = (paletteIdx: number, scale?: number) =>
	renderToStaticMarkup(
		<svg>
			<defs>
				<PatternTile
					id="t"
					paletteIdx={paletteIdx}
					bgColor="#fff"
					inkColor="#000"
					scale={scale}
				/>
			</defs>
		</svg>
	)

const widthOf = (svg: string): number => {
	const m = /<pattern[^>]*\swidth="([^"]+)"/.exec(svg)
	return Number(m?.[1])
}

describe("PatternTile", () => {
	it("draws each palette entry's native geometry at ×1", () => {
		// The pre-Scale drawings, verbatim — saved charts must not shift.
		expect(tile(DOTS)).toContain('<circle cx="2.5" cy="2.5" r="1.4" fill="#000">')
		expect(tile(DOTS)).toContain('<circle cx="7.5" cy="7.5" r="1.4" fill="#000">')
		expect(tile(DIAG)).toContain(
			'd="M-1,1 l2,-2 M0,10 l10,-10 M9,11 l2,-2" stroke="#000" stroke-width="1.5"'
		)
		expect(tile(VERT)).toContain('d="M4,-1 v10" stroke="#000" stroke-width="1.5"')
		expect(tile(3)).toContain('d="M-1,4 h10" stroke="#000" stroke-width="1.5"')
		expect(tile(CROSS)).toContain(
			'd="M-1,9 l2,2 M0,0 l10,10 M9,-1 l2,2" stroke="#000" stroke-width="1.2"'
		)
		expect(tile(CHECKER)).toContain('<rect x="5" y="5" width="5" height="5" fill="#000">')
		for (const [i, def] of PATTERN_PALETTE.entries()) {
			expect(widthOf(tile(i))).toBe(def.size)
		}
	})

	it("zooms the crosshatch and checker uniformly", () => {
		const checker = tile(CHECKER, 2)
		expect(widthOf(checker)).toBe(20)
		expect(checker).toContain('<rect x="10" y="10" width="10" height="10" fill="#000">')
		const cross = tile(CROSS, 2)
		expect(widthOf(cross)).toBe(20)
		expect(cross).toContain('d="M-2,2 l4,-4 M0,20 l20,-20 M18,22 l4,-4"')
		expect(cross).toContain('stroke-width="2.4"')
	})

	it("grows dots and stripes by the full scale but their spacing by less", () => {
		expect(MARK_WEIGHTED_SPACING_EXPONENT).toBeLessThan(1)
		const dots = tile(DOTS, 2)
		const side = widthOf(dots)
		expect(side).toBeCloseTo(10 * 2 ** MARK_WEIGHTED_SPACING_EXPONENT, 2)
		expect(side).toBeLessThan(20)
		expect(side).toBeGreaterThan(10)
		// Dot radius at the full ×2, centred on the (smaller) tile's quarters.
		expect(dots).toContain('r="2.8"')
		expect(dots).toContain(`cx="${Number((side / 4).toFixed(3))}"`)
		const vert = tile(VERT, 2)
		expect(widthOf(vert)).toBeCloseTo(8 * 2 ** MARK_WEIGHTED_SPACING_EXPONENT, 2)
		expect(vert).toContain('stroke-width="3"')
		// Across the range the marks never swallow the spacing.
		for (const s of [0.5, 2, 4]) {
			const w = widthOf(tile(DOTS, s))
			expect(2 * 1.4 * s).toBeLessThan(w / 2)
		}
	})

	it("renders a stored 0 at the finest step rather than a zero-size tile", () => {
		expect(widthOf(tile(CHECKER, 0))).toBe(1)
		const dots = tile(DOTS, 0)
		expect(widthOf(dots)).toBeGreaterThan(0)
		expect(dots).toContain('r="0.14"')
	})

	it("PatternDefs passes each spec's scale through", () => {
		const svg = renderToStaticMarkup(
			<svg>
				<PatternDefs
					defs={[
						{ svgId: "a", paletteIdx: CHECKER, bgColor: "#fff", inkColor: "#000" },
						{
							svgId: "b",
							paletteIdx: CHECKER,
							bgColor: "#fff",
							inkColor: "#000",
							scale: 0.5,
						},
					]}
				/>
			</svg>
		)
		expect(svg).toContain('id="a" patternUnits="userSpaceOnUse" width="10"')
		expect(svg).toContain('id="b" patternUnits="userSpaceOnUse" width="5"')
	})
})
