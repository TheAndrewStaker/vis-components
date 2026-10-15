import { effectivePatternScale, PATTERN_PALETTE } from "./patterns"

export type PatternDefSpec = {
	svgId: string
	paletteIdx: number
	bgColor: string
	inkColor: string
	/** Tile zoom (see `PatternConfig.scales`); absent = ×1. Resolved specs
	 * always carry it; hand-built ones (the map's no-data def) leave it out. */
	scale?: number
}

/** Dedup pattern defs by svgId so we don't emit duplicate <pattern> elements. */
export const dedupPatternDefs = (specs: PatternDefSpec[]): PatternDefSpec[] => {
	const seen = new Set<string>()
	const out: PatternDefSpec[] = []
	for (const s of specs) {
		if (seen.has(s.svgId)) continue
		seen.add(s.svgId)
		out.push(s)
	}
	return out
}

/** One `<pattern>` element: the palette tile at `paletteIdx`, background +
 * ink baked in, zoomed by `scale`. The marks (dot radius, stripe width)
 * grow by the full scale; the tile — the spacing between them — grows by
 * `scale ^ spacingExponent` (see `PatternDef`), so dots and stripes
 * tighten up a little as they're zoomed in while the crosshatch and
 * checker magnify uniformly. Every pattern tile in the app — chart defs,
 * legend swatches, the Pattern menu's chips, the theme sampler, the map's
 * no-data chips — renders through here so they can't drift. Place inside
 * `<defs>`. */
export const PatternTile = ({
	id,
	paletteIdx,
	bgColor,
	inkColor,
	scale,
}: {
	id: string
	paletteIdx: number
	bgColor: string
	inkColor: string
	scale?: number | null
}) => {
	const def = PATTERN_PALETTE[paletteIdx % PATTERN_PALETTE.length]
	const s = effectivePatternScale(scale)
	// Rounded so float noise (10 × 0.3) doesn't leak into the attribute.
	const side = Number((def.size * s ** def.spacingExponent).toFixed(3))
	return (
		<pattern id={id} patternUnits="userSpaceOnUse" width={side} height={side}>
			<rect width={side} height={side} fill={bgColor} />
			{def.render(inkColor, { side, mark: s })}
		</pattern>
	)
}

/** Renders the `<defs>` block with one `<pattern>` per unique spec.
 * Use inside an SVG. */
export const PatternDefs = ({ defs }: { defs: PatternDefSpec[] }) => (
	<defs>
		{dedupPatternDefs(defs).map(
			({ svgId, paletteIdx, bgColor, inkColor, scale }) => (
				<PatternTile
					key={svgId}
					id={svgId}
					paletteIdx={paletteIdx}
					bgColor={bgColor}
					inkColor={inkColor}
					scale={scale}
				/>
			)
		)}
	</defs>
)
