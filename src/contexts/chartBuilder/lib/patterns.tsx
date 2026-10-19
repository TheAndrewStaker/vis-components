import {
	DEFAULT_PATTERN_CONFIG,
	DEFAULT_PATTERN_SCALE,
	PATTERN_SCALE_MAX,
	type ChannelConfigs,
	type PatternConfig,
} from "./channelConfig"
import type { FieldType, Theme } from "./types"
import { uniqueValues } from "./uniqueFieldValues"

/**
 * Pattern rendering.
 *
 * A pattern is "a texture of a certain color" that sits on top of whatever
 * color is below it (typically from the hue encoding).
 *
 * Both the background color AND the ink color are baked directly into each
 * `<pattern>` def — no `currentColor` tricks. This is the approach used by
 * the Bar chart in Market Explorer (see Bar.tsx) and avoids browser
 * inconsistencies with `currentColor` inside SVG paint servers.
 *
 * When hue IS mapped: bg = the mark's resolved hue color (varies per mark).
 * When hue is NOT mapped: bg = PatternConfig.backgroundColor (user-editable).
 * Ink color is per-pattern-category (same ink on all marks sharing that
 * pattern category, regardless of hue).
 */

export const DEFAULT_PATTERN_INK = "#0f172a"

/** Stored in `PatternConfig.overrides[category]` to mark a category as
 * rendering with no pattern overlay — useful when the user wants to highlight
 * one category by giving the others no pattern. The resolve* helpers return
 * null for these categories; consumers must handle null by skipping the
 * `<pattern>` ref and rendering the underlying color directly. */
export const PATTERN_NONE = "none" as const
export type PatternNone = typeof PATTERN_NONE

/** The tile a pattern is drawn into, as `PatternTile` computes it from the
 * category's Scale pick. */
export type PatternTileGeometry = {
	/** Tile side (px) — the repeat distance between marks. */
	side: number
	/** Multiplier on the native mark dimensions (dot radius, stripe width);
	 * ×1 = the palette's own. */
	mark: number
}

export type PatternDef = {
	id: string
	/** Tile side at ×1. */
	size: number
	/** How the tile — the SPACING between marks — grows with the Scale
	 * pick: `size × scale^spacingExponent`, while the marks themselves
	 * always grow by the full `scale`. 1 = pure zoom (crosshatch, checker:
	 * the whole texture magnifies uniformly). Below 1 the marks outgrow
	 * their spacing a little, so zoomed-in dots and stripes don't drift
	 * apart as fast as they swell. */
	spacingExponent: number
	/** Returns the SVG children rendered inside a `<pattern>` of side
	 * `geom.side`, with mark dimensions multiplied by `geom.mark`. At
	 * `{ side: size, mark: 1 }` this is the palette's native drawing. The
	 * background rect is added separately by the caller (`PatternTile`). */
	render: (inkColor: string, geom: PatternTileGeometry) => React.ReactNode
}

/** Spacing exponent for the dot and stripe patterns (see
 * `PatternDef.spacingExponent`): at ×2 the marks are 2× and the spacing
 * ≈1.8×; at ×4, 4× and ≈3.25×. */
export const MARK_WEIGHTED_SPACING_EXPONENT = 0.85

/** Attribute-ready number: 3 decimals, so scaled geometry (1.4 × 0.1)
 * doesn't leak float noise into the SVG. */
const px = (v: number): number => Number(v.toFixed(3))

/** The anti-diagonal stripe across an `L` tile at stroke scale `m`: the
 * main line plus short stubs of the neighbouring tiles' line through the
 * two corners it passes, so the stroke isn't clipped there. The stubs reach
 * `m` each way, which covers a stroke up to 2m wide. */
const antiDiagonal = (L: number, m: number): string =>
	`M${px(-m)},${px(m)} l${px(2 * m)},${px(-2 * m)} M0,${px(L)} l${px(L)},${px(-L)} M${px(L - m)},${px(L + m)} l${px(2 * m)},${px(-2 * m)}`
/** The matching main-diagonal stripe (the crosshatch's second line). */
const mainDiagonal = (L: number, m: number): string =>
	`M${px(-m)},${px(L - m)} l${px(2 * m)},${px(2 * m)} M0,0 l${px(L)},${px(L)} M${px(L - m)},${px(-m)} l${px(2 * m)},${px(2 * m)}`

// Patterns are intentionally ink-dense: default mark radii are small (~4px),
// and the pattern tiles need enough visible ink to read as "a pattern" in
// that little space. Tiles are sized so that at least one full repeat fits
// inside an r=4 mark (diameter 8). Each drawing is written against the
// tile geometry it's given (see `PatternDef.render`) so the Scale control
// can grow marks and spacing at different rates.
export const PATTERN_PALETTE: PatternDef[] = [
	{
		id: "vc-pat-dots",
		size: 10,
		spacingExponent: MARK_WEIGHTED_SPACING_EXPONENT,
		render: (ink, { side: L, mark: m }) => (
			<>
				<circle cx={px(L / 4)} cy={px(L / 4)} r={px(1.4 * m)} fill={ink} />
				<circle
					cx={px((3 * L) / 4)}
					cy={px((3 * L) / 4)}
					r={px(1.4 * m)}
					fill={ink}
				/>
			</>
		),
	},
	{
		id: "vc-pat-diag",
		size: 10,
		spacingExponent: MARK_WEIGHTED_SPACING_EXPONENT,
		render: (ink, { side: L, mark: m }) => (
			<path d={antiDiagonal(L, m)} stroke={ink} strokeWidth={px(1.5 * m)} />
		),
	},
	{
		id: "vc-pat-vert",
		size: 8,
		spacingExponent: MARK_WEIGHTED_SPACING_EXPONENT,
		render: (ink, { side: L, mark: m }) => (
			<path
				d={`M${px(L / 2)},${px(-m)} v${px(L + 2 * m)}`}
				stroke={ink}
				strokeWidth={px(1.5 * m)}
			/>
		),
	},
	{
		id: "vc-pat-horiz",
		size: 8,
		spacingExponent: MARK_WEIGHTED_SPACING_EXPONENT,
		render: (ink, { side: L, mark: m }) => (
			<path
				d={`M${px(-m)},${px(L / 2)} h${px(L + 2 * m)}`}
				stroke={ink}
				strokeWidth={px(1.5 * m)}
			/>
		),
	},
	{
		id: "vc-pat-cross",
		size: 10,
		spacingExponent: 1,
		render: (ink, { side: L, mark: m }) => (
			<>
				<path d={antiDiagonal(L, m)} stroke={ink} strokeWidth={px(1.2 * m)} />
				<path d={mainDiagonal(L, m)} stroke={ink} strokeWidth={px(1.2 * m)} />
			</>
		),
	},
	{
		id: "vc-pat-checker",
		size: 10,
		spacingExponent: 1,
		render: (ink, { side: L }) => (
			<>
				<rect x={0} y={0} width={px(L / 2)} height={px(L / 2)} fill={ink} />
				<rect
					x={px(L / 2)}
					y={px(L / 2)}
					width={px(L / 2)}
					height={px(L / 2)}
					fill={ink}
				/>
			</>
		),
	},
]

// ----- Helpers ---------------------------------------------------------------

/** Turn any CSS color string into a short slug safe for SVG ids. */
const colorSlug = (color: string): string =>
	color.replaceAll(/[^a-zA-Z0-9]/g, "").slice(0, 12)

/** Smallest tile zoom the renderer will draw. The Pattern menu's Scale box
 * accepts 0 (see `PATTERN_SCALE_MIN`), but a zero-size `<pattern>` paints
 * nothing per the SVG spec — the mark would vanish — so 0 renders as the
 * finest step instead. */
export const PATTERN_SCALE_RENDER_MIN = 0.1

/** The tile zoom a stored scale actually renders at: absent / non-numeric →
 * ×1, otherwise clamped to [PATTERN_SCALE_RENDER_MIN, PATTERN_SCALE_MAX]. */
export const effectivePatternScale = (raw: number | null | undefined): number => {
	if (typeof raw !== "number" || !Number.isFinite(raw)) return DEFAULT_PATTERN_SCALE
	return Math.min(PATTERN_SCALE_MAX, Math.max(PATTERN_SCALE_RENDER_MIN, raw))
}

/** Id-safe spelling of a scale ("1.5" → "1p5"); empty at ×1 so ids of
 * unscaled patterns stay exactly as before the Scale control existed. */
const scaleSlug = (scale: number): string =>
	scale === DEFAULT_PATTERN_SCALE ? "" : `-x${String(scale).replace(".", "p")}`

// ----- Per-category pattern resolution -------------------------------------

/** Ordered list of unique category values for a pattern-encoded field. Both
 * the SVG <defs> generator and the mark renderer compute the same list so
 * they agree on each category's pattern-def id. */
export const patternCategoriesFor = (
	rawValues: unknown[],
	type: FieldType
): string[] => uniqueValues(rawValues, { type })

export type ResolvedPattern = {
	paletteIdx: number
	bgColor: string
	inkColor: string
	svgId: string
	/** Tile zoom to draw at (already passed through `effectivePatternScale`,
	 * so ×1 when the category has no stored scale). */
	scale: number
}

/** Look up the per-hue-color pattern-ink override for a mark. Returns the
 * paired ink when the mark's hue color is present in the categorical
 * palette and the user has set an override for that swatch, otherwise
 * `null` (callers fall back through the rest of the precedence chain). */
/** Pick the palette + paired pattern-inks that match the hue field's TYPE.
 * Ordinal hue fields render from `ordinalPalette`, so their colors aren't in
 * `categoricalPalette`. Pattern-ink lookups match a mark's resolved hue color
 * against the palette, so they MUST use the same palette the hue scale used —
 * otherwise (ordinal hue + pattern on the same field) the lookup misses and the
 * ink silently falls back to the default near-black. */
export const inkPaletteForHue = (
	configs: ChannelConfigs,
	hueType: FieldType | undefined
): {
	palette: readonly string[] | undefined
	inks: ReadonlyArray<string | null> | undefined
} =>
	hueType === "ordinal"
		? {
				palette: configs.ordinalPalette ?? configs.categoricalPalette,
				inks:
					configs.ordinalPalettePatternInks ??
					configs.categoricalPalettePatternInks,
			}
		: {
				palette: configs.categoricalPalette,
				inks: configs.categoricalPalettePatternInks,
			}

/** Flattened hex → paired-ink lookup across ALL of a theme's palettes
 * (categorical + ordinal), for colors the ACTIVE palette lookup misses.
 * A mark whose hue is overridden with a swatch borrowed from another theme
 * palette (the palette popover's "other palettes" section) isn't in the
 * palette the hue scale used — without this table its pattern ink would
 * silently fall back to the default near-black even though the borrowed
 * swatch has a paired ink in Settings. Keys are lowercased; when the same
 * hex appears in several palettes the first palette (theme list order,
 * categorical before ordinal) wins. */
export type ThemeInkFallback = Readonly<Record<string, string>>

export const buildThemeInkFallback = (
	theme: Pick<Theme, "categoricalPalettes" | "ordinalPalettes">
): ThemeInkFallback => {
	const table: Record<string, string> = {}
	for (const pal of [...theme.categoricalPalettes, ...theme.ordinalPalettes]) {
		const inks = pal.patternInks ?? []
		pal.colors.forEach((color, i) => {
			const ink = inks[i]
			if (!ink) return
			const key = color.toLowerCase()
			if (!(key in table)) table[key] = ink
		})
	}
	return table
}

export const inkForHueColor = (
	hueColor: string,
	palette: readonly string[] | undefined,
	patternInks: ReadonlyArray<string | null> | undefined,
	/** Cross-palette fallback (see `buildThemeInkFallback`), consulted when
	 * the active palette has no paired ink for `hueColor` — a per-value hue
	 * override borrowed from another theme palette still finds its ink. */
	themeInkFallback?: ThemeInkFallback
): string | null => {
	const target = hueColor.toLowerCase()
	if (palette && patternInks && patternInks.length > 0) {
		const idx = palette.findIndex((c) => c.toLowerCase() === target)
		const paired = idx === -1 ? null : (patternInks[idx] ?? null)
		if (paired) return paired
	}
	return themeInkFallback?.[target] ?? null
}

/** Resolve the full pattern def spec for a single mark, baking both the
 * background color and the ink color into the svgId. Returns null if the
 * category has been explicitly opted out via `PATTERN_NONE` — callers must
 * skip emitting the `<pattern>` ref in that case and render the underlying
 * color directly. */
export const resolvePatternForMark = (
	category: string,
	categoryIndex: number,
	bgColor: string,
	config?: PatternConfig,
	/** Optional fallback ink to use when no per-pattern-category override is
	 * set. Renderers pass the per-hue-color ink here (looked up from the
	 * categorical palette) so a blue mark can carry a darker-blue pattern
	 * overlay without the user touching `PatternConfig.inkColors`. */
	preferredInk?: string | null,
	/** When true, treat the ABSENCE of a per-category override as `PATTERN_NONE`
	 * — i.e., don't auto-cycle a palette index. Used in line chart context so
	 * points stay clean by default; users opt IN per-category via the
	 * Point-fill swatches. */
	defaultToNone?: boolean
): ResolvedPattern | null => {
	const override = config?.overrides?.[category]
	if (override === PATTERN_NONE) return null
	if (defaultToNone && typeof override !== "number") return null
	const paletteIdx =
		typeof override === "number"
			? override
			: categoryIndex % PATTERN_PALETTE.length
	const inkColor =
		config?.inkColors?.[category] ?? preferredInk ?? DEFAULT_PATTERN_INK
	const scale = effectivePatternScale(config?.scales?.[category])
	// The scale is part of the id: two categories sharing colors but zoomed
	// differently need two defs.
	const svgId = `vc-pat-${paletteIdx}-${colorSlug(bgColor)}-${colorSlug(inkColor)}${scaleSlug(scale)}`
	return { paletteIdx, bgColor, inkColor, svgId, scale }
}

/** The single no-variable DEFAULT pattern (`ChannelConfigs.defaultPattern`
 * + its ink + `PatternConfig.defaultScale`) resolved for one mark, through
 * the same resolver as field-mapped categories so renderers and legends
 * agree on the def's id. `scale` null/absent = ×1. */
export const resolveDefaultPatternForMark = (
	bgColor: string,
	paletteIdx: number,
	inkColor: string,
	scale?: number | null
): ResolvedPattern | null =>
	resolvePatternForMark("__default__", 0, bgColor, {
		...DEFAULT_PATTERN_CONFIG,
		overrides: { __default__: paletteIdx },
		inkColors: { __default__: inkColor },
		scales: scale == null ? {} : { __default__: scale },
	})
