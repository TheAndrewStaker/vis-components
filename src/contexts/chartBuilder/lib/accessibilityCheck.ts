import { hcl, lab, rgb } from "d3-color"

/* Accessibility check — the pure half of the editor's "Accessibility check"
 * toggle (APPLICATION.md, "Accessibility preview and check"). Color math
 * (WCAG contrast, color-vision-deficiency simulation, CIE ΔE) plus the rule
 * evaluation over a mode-agnostic input the overlay collects from the
 * rendered chart and the editor state. Nothing here touches the DOM. */

// ---------------------------------------------------------------------------
// Color math
// ---------------------------------------------------------------------------

type Rgb = { r: number; g: number; b: number }

/** Parse any CSS color d3-color understands into 0–255 sRGB channels
 *  (alpha dropped). Null when unparseable. */
export const parseColor = (c: string): Rgb | null => {
	const p = rgb(c)
	if (!p || Number.isNaN(p.r) || Number.isNaN(p.g) || Number.isNaN(p.b)) {
		return null
	}
	return { r: p.r, g: p.g, b: p.b }
}

/** The alpha of a CSS color (rgba / #rrggbbaa / transparent); 1 when opaque
 *  or unparseable. */
export const colorAlpha = (c: string): number => {
	const p = rgb(c)
	return p && Number.isFinite(p.opacity) ? p.opacity : 1
}

const toHex = ({ r, g, b }: Rgb): string => rgb(r, g, b).formatHex()

const srgbToLinear = (c255: number): number => {
	const c = c255 / 255
	return c <= 0.040_45 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

const linearToSrgb = (l: number): number => {
	const c = Math.min(1, Math.max(0, l))
	const s = c <= 0.003_130_8 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055
	return Math.round(s * 255)
}

/** WCAG 2.x relative luminance. */
export const relativeLuminance = (hex: string): number => {
	const c = parseColor(hex)
	if (!c) return 0
	return (
		0.2126 * srgbToLinear(c.r) +
		0.7152 * srgbToLinear(c.g) +
		0.0722 * srgbToLinear(c.b)
	)
}

/** WCAG 2.x contrast ratio (1–21) between two opaque colors. */
export const contrastRatio = (fgHex: string, bgHex: string): number => {
	const a = relativeLuminance(fgHex)
	const b = relativeLuminance(bgHex)
	const [hi, lo] = a >= b ? [a, b] : [b, a]
	return (hi + 0.05) / (lo + 0.05)
}

/** Source-over composite of `fg` at `alpha` onto an opaque `bg` (sRGB
 *  space, as browsers blend). Returns a hex color. */
export const compositeOver = (fg: string, alpha: number, bg: string): string => {
	const f = parseColor(fg)
	const b = parseColor(bg)
	if (!f) return b ? toHex(b) : "#ffffff"
	if (!b) return toHex(f)
	const a = Math.min(1, Math.max(0, alpha))
	return toHex({
		r: Math.round(f.r * a + b.r * (1 - a)),
		g: Math.round(f.g * a + b.g * (1 - a)),
		b: Math.round(f.b * a + b.b * (1 - a)),
	})
}

export type ContrastLevel = "AA" | "AAA"

/** WCAG "large text": at least 18pt, or at least 14pt bold. */
export const isLargeText = (sizePt: number, bold: boolean): boolean =>
	sizePt >= 18 || (bold && sizePt >= 14)

/** Minimum contrast ratio WCAG 1.4.3 (AA) / 1.4.6 (AAA) asks of text. */
export const requiredContrast = (level: ContrastLevel, large: boolean): number =>
	level === "AA" ? (large ? 3 : 4.5) : large ? 4.5 : 7

export type VisionType = "protanopia" | "deuteranopia" | "tritanopia"

export const VISION_TYPES: readonly VisionType[] = [
	"protanopia",
	"deuteranopia",
	"tritanopia",
]

/** Machado, Oliveira & Fernandes (2009) dichromacy matrices at severity
 *  1.0, applied in linear RGB. */
type Mat3 = readonly [
	number, number, number,
	number, number, number,
	number, number, number,
]

const CVD_MATRICES: Record<VisionType, Mat3> = {
	protanopia: [
		0.152_286, 1.052_583, -0.204_868, 0.114_503, 0.786_281, 0.099_216,
		-0.003_882, -0.048_116, 1.051_998,
	],
	deuteranopia: [
		0.367_322, 0.860_646, -0.227_968, 0.280_085, 0.672_501, 0.047_413,
		-0.011_820, 0.042_940, 0.968_881,
	],
	tritanopia: [
		1.255_528, -0.076_749, -0.178_779, -0.078_411, 0.930_809, 0.147_602,
		0.004_733, 0.691_367, 0.303_9,
	],
}

/** How `hex` appears to someone with the given dichromacy. */
export const simulateCvd = (hex: string, type: VisionType): string => {
	const c = parseColor(hex)
	if (!c) return hex
	const r = srgbToLinear(c.r)
	const g = srgbToLinear(c.g)
	const b = srgbToLinear(c.b)
	const [m0, m1, m2, m3, m4, m5, m6, m7, m8] = CVD_MATRICES[type]
	return toHex({
		r: linearToSrgb(m0 * r + m1 * g + m2 * b),
		g: linearToSrgb(m3 * r + m4 * g + m5 * b),
		b: linearToSrgb(m6 * r + m7 * g + m8 * b),
	})
}

const rad = (d: number) => (d * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI

/** CIEDE2000 color difference (Sharma, Wu & Dalal 2005). ~1 is a just-
 *  noticeable difference; under ~10 two swatches start to read as "the
 *  same color" at chart-mark sizes. */
export const colorDistance = (a: string, b: string): number => {
	const A = lab(a)
	const B = lab(b)
	if ([A.l, A.a, A.b, B.l, B.a, B.b].some((n) => Number.isNaN(n))) return 0
	const C1 = Math.hypot(A.a, A.b)
	const C2 = Math.hypot(B.a, B.b)
	const Cm = (C1 + C2) / 2
	const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)))
	const a1 = (1 + G) * A.a
	const a2 = (1 + G) * B.a
	const c1 = Math.hypot(a1, A.b)
	const c2 = Math.hypot(a2, B.b)
	const hue = (x: number, y: number) => {
		if (x === 0 && y === 0) return 0
		const h = deg(Math.atan2(y, x))
		return h < 0 ? h + 360 : h
	}
	const h1 = hue(a1, A.b)
	const h2 = hue(a2, B.b)
	const dL = B.l - A.l
	const dC = c2 - c1
	let dh = 0
	if (c1 * c2 !== 0) {
		dh = h2 - h1
		if (dh > 180) dh -= 360
		else if (dh < -180) dh += 360
	}
	const dH = 2 * Math.sqrt(c1 * c2) * Math.sin(rad(dh / 2))
	const Lm = (A.l + B.l) / 2
	const cm = (c1 + c2) / 2
	let hm = h1 + h2
	if (c1 * c2 !== 0) {
		if (Math.abs(h1 - h2) > 180) hm = h1 + h2 < 360 ? hm + 360 : hm - 360
		hm /= 2
	}
	const T =
		1 -
		0.17 * Math.cos(rad(hm - 30)) +
		0.24 * Math.cos(rad(2 * hm)) +
		0.32 * Math.cos(rad(3 * hm + 6)) -
		0.2 * Math.cos(rad(4 * hm - 63))
	const dTheta = 30 * Math.exp(-(((hm - 275) / 25) ** 2))
	const Rc = 2 * Math.sqrt(cm ** 7 / (cm ** 7 + 25 ** 7))
	const Sl = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2)
	const Sc = 1 + 0.045 * cm
	const Sh = 1 + 0.015 * cm * T
	const Rt = -Math.sin(rad(2 * dTheta)) * Rc
	return Math.sqrt(
		(dL / Sl) ** 2 +
			(dC / Sc) ** 2 +
			(dH / Sh) ** 2 +
			Rt * (dC / Sc) * (dH / Sh)
	)
}

/** ΔE2000 below which two categorical colors count as confusable. */
export const CONFUSABLE_DELTA_E = 10

export type ConfusablePair = {
	/** Indexes into the input color list (i < j). */
	i: number
	j: number
	/** "normal" when the colors are too close as-is; otherwise every
	 *  simulated vision type under which they collapse. */
	visions: Array<"normal" | VisionType>
	/** The smallest ΔE2000 across the visions listed. */
	distance: number
}

/** Color pairs that are too close to tell apart — as-is, or under any of
 *  the three dichromacy simulations. A pair already too close as-is is
 *  reported once as "normal" (simulations can only make it worse). */
export const findConfusablePairs = (
	colors: readonly string[],
	threshold = CONFUSABLE_DELTA_E
): ConfusablePair[] => {
	// Per color, its look under each vision type (VISION_TYPES order).
	const sims = colors.map((c) => VISION_TYPES.map((v) => simulateCvd(c, v)))
	const out: ConfusablePair[] = []
	colors.forEach((a, i) => {
		colors.forEach((b, j) => {
			if (j <= i) return
			const normal = colorDistance(a, b)
			if (normal < threshold) {
				out.push({ i, j, visions: ["normal"], distance: normal })
				return
			}
			const visions: VisionType[] = []
			let distance = Number.POSITIVE_INFINITY
			VISION_TYPES.forEach((v, k) => {
				const sa = sims[i]?.[k]
				const sb = sims[j]?.[k]
				if (sa === undefined || sb === undefined) return
				const d = colorDistance(sa, sb)
				if (d < threshold) {
					visions.push(v)
					distance = Math.min(distance, d)
				}
			})
			if (visions.length > 0) out.push({ i, j, visions, distance })
		})
	})
	return out.sort((p, q) => p.distance - q.distance)
}

/** Hue family of a color for the red–green check: "red", "green" or null
 *  (anything else, or too gray to read as a hue). */
export const hueFamily = (hex: string): "red" | "green" | null => {
	const h = hcl(hex)
	if (Number.isNaN(h.h) || !(h.c >= 20)) return null
	const deg360 = ((h.h % 360) + 360) % 360
	if (deg360 <= 50 || deg360 >= 340) return "red"
	if (deg360 >= 95 && deg360 <= 185) return "green"
	return null
}

/** True when an ordered palette runs from red to green (either way): its
 *  two ends are a red and a green — the classic stoplight / RdYlGn scale
 *  whose ends collapse toward the same muddy yellow-brown for the ~8% of
 *  men with red-green color blindness. */
export const isRedGreenRamp = (lo: string, hi: string): boolean => {
	const a = hueFamily(lo)
	const b = hueFamily(hi)
	return (a === "red" && b === "green") || (a === "green" && b === "red")
}

// ---------------------------------------------------------------------------
// Rule evaluation
// ---------------------------------------------------------------------------

export type Box = { x: number; y: number; width: number; height: number }

export type AccessibilityTarget = {
	kind: "svg" | "html"
	/** Key into the overlay's live-element map, so a highlight follows the
	 *  element if the view scrolls. */
	id?: string
	/** In canvas coordinates (px from the chart viewport's top-left, as
	 *  laid out when the check ran). */
	bbox: Box
}

export type FindingLevel = "fail" | "fail-aaa" | "advisory"

export type AccessibilityRule =
	| "text-contrast"
	| "palette-distinguishable"
	| "color-only"
	| "red-green-ramp"
	| "small-text"
	| "faint-marks"
	| "hover-only"
	| "missing-titles"
	| "description"

export type AccessibilityFinding = {
	id: string
	rule: AccessibilityRule
	level: FindingLevel
	message: string
	suggestion?: string
	targets: AccessibilityTarget[]
}

/** What kind of chart text a sample is — drives the wording and the fix. */
export type TextRole =
	| "tick label"
	| "data label"
	| "annotation"
	| "caption"
	| "title"
	| "legend text"
	| "facet title"
	| "text"

/** One painted color layer under a text sample, TOP first. The last entry
 *  should be opaque (the chart / page background); translucent layers are
 *  composited onto what's beneath them. */
export type BackgroundLayer = {
	color: string
	alpha: number
	/** What the layer is, for the message ("its bar", "the chart
	 *  background"). */
	label: string
}

export type TextSample = {
	id: string
	kind: "svg" | "html"
	text: string
	role: TextRole
	bbox: Box
	/** Text fill as painted (CSS color) and its effective opacity
	 *  (fill-opacity × every ancestor's opacity). */
	color: string
	alpha: number
	/** Under the text's center, top first. Empty = unknown → skipped. */
	background: BackgroundLayer[]
	/** Resolved font size in CSS px (the UI shows points: px × 0.75). */
	fontSizePx: number
	bold: boolean
}

export type AxisTitleState = "shown" | "hidden" | "empty"

export type HueLevel = {
	value: string
	color: string
	targets: AccessibilityTarget[]
}

export type AccessibilityInput = {
	texts: TextSample[]
	/** The color (hue) encoding, when mapped. `levels` are categorical /
	 *  ordinal levels in display order; `ends` are a gradient's or an
	 *  ordered palette's two end colors. */
	hue: null | {
		field: string
		discrete: boolean
		ordered: boolean
		levels: HueLevel[]
		ends: [string, string] | null
		targets: AccessibilityTarget[]
	}
	/** Which other encodings also tell the hue field's levels apart. */
	redundantEncoding: {
		shape: boolean
		pattern: boolean
		dataLabels: boolean
		position: boolean
	}
	dataLabelsShown: boolean
	tooltipsEnabled: boolean
	marks: {
		/** Lowest resolved mark opacity, with a short phrase saying where
		 *  it comes from ("Opacity is 30%"). Null when ≥ the floor. */
		lowOpacity: { value: number; source: string } | null
		/** Thinnest line carrying data (px), when lines are drawn. */
		lineThicknessPx: number | null
		/** Mark outline width (px), only when the outline encodes data. */
		dataOutlineWidthPx: number | null
	}
	axes: { x: AxisTitleState | null; y: AxisTitleState | null }
	axisTitleTargets: { x: AccessibilityTarget[]; y: AccessibilityTarget[] }
	legends: Array<{ field: string; title: AxisTitleState }>
	plotTargets: AccessibilityTarget[]
	legendTargets: AccessibilityTarget[]
	/** The screen-reader description (Accessibility section). Null =
	 *  unknown → rule 9 skipped. */
	description: null | {
		/** No override stored: the text follows the title and subtitle. */
		automatic: boolean
		/** The authored chart title is non-empty (shown or not). */
		hasTitle: boolean
		/** The resolved description (`resolveChartDescription`). */
		text: string
		visualName: string
	}
}

export const SMALL_TEXT_ADVISORY_PT = 9
export const SMALL_TEXT_FAIL_PT = 7
export const FAINT_OPACITY = 0.4
export const THIN_STROKE_PX = 1
const PX_TO_PT = 0.75

const fmtRatio = (r: number): string => `${(Math.floor(r * 10) / 10).toFixed(1)}:1`
const fmtPt = (pt: number): string => `${Math.round(pt * 10) / 10}pt`
const plural = (n: number, one: string, many = `${one}s`) =>
	n === 1 ? one : many
const quote = (s: string): string => {
	const t = s.trim()
	return `“${t.length > 40 ? `${t.slice(0, 39)}…` : t}”`
}

const VISION_NAME: Record<"normal" | VisionType, string> = {
	normal: "anyone",
	protanopia: "people with protanopia (red-blind)",
	deuteranopia: "people with deuteranopia (green-blind)",
	tritanopia: "people with tritanopia (blue-blind)",
}

const listVisions = (vs: ReadonlyArray<"normal" | VisionType>): string => {
	const names = vs.map((v) => VISION_NAME[v])
	if (names.length <= 1) return names[0] ?? ""
	return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
}

const ROLE_FIX: Record<TextRole, string> = {
	"tick label": "Change the tick label color under the axis options (or in the theme).",
	"data label":
		"Change the data label color, or give the labels a background, under Data labels.",
	annotation: "Change the annotation's text color, or its box fill.",
	caption: "Change the caption color under Titles (or in the theme).",
	title: "Change the title color under Titles (or in the theme).",
	"legend text": "Change the legend text color under Legend (or in the theme).",
	"facet title": "Change the facet title color under Titles (or in the theme).",
	text: "Change this text's color in the sidebar (or in the theme).",
}

const ROLE_SIZE_FIX: Record<TextRole, string> = {
	"tick label": "Raise the tick label size under the axis options (or in the theme).",
	"data label": "Raise the data label size under Data labels.",
	annotation: "Raise the annotation's font size.",
	caption: "Raise the caption size under Titles.",
	title: "Raise the title size under Titles.",
	"legend text": "Raise the legend text size under Legend.",
	"facet title": "Raise the facet title size under Titles.",
	text: "Raise this text's size in the sidebar (or in the theme).",
}

const effectiveBackground = (layers: BackgroundLayer[]): string | null => {
	const base = layers.at(-1)
	if (!base) return null
	// Composite bottom-up; the bottom layer is treated as opaque.
	let bg = compositeOver(base.color, 1, "#ffffff")
	for (const l of layers.slice(0, -1).reverse()) {
		bg = compositeOver(l.color, l.alpha, bg)
	}
	return bg
}

const textTarget = (t: TextSample): AccessibilityTarget => ({
	kind: t.kind,
	id: t.id,
	bbox: t.bbox,
})

const roleNoun = (role: TextRole, n: number): string =>
	n === 1 ? role : role === "text" ? "texts" : `${role}s`

/** Text whose glyphs ignore their fill — emoji and other pictographs
 *  paint in their own colors, so a contrast ratio from the fill is
 *  meaningless. Needs at least one letter or digit to be measured. */
const hasMeasurableGlyphs = (s: string): boolean => /[\p{L}\p{N}]/u.test(s)

/** Rule 1 — text contrast, grouped by role, background and requirement so
 *  twelve failing tick labels make one finding (quoting the worst ratio)
 *  with twelve targets. */
const textContrastFindings = (
	texts: TextSample[],
	level: ContrastLevel
): AccessibilityFinding[] => {
	type Group = {
		role: TextRole
		bgLabel: string
		ratio: number
		need: number
		aaaOnly: boolean
		large: boolean
		items: TextSample[]
	}
	const groups = new Map<string, Group>()
	for (const t of texts) {
		if (!hasMeasurableGlyphs(t.text) || t.alpha <= 0) continue
		const bg = effectiveBackground(t.background)
		if (!bg) continue
		const fg = compositeOver(t.color, t.alpha, bg)
		const ratio = contrastRatio(fg, bg)
		const large = isLargeText(t.fontSizePx * PX_TO_PT, t.bold)
		const needAA = requiredContrast("AA", large)
		const needAAA = requiredContrast("AAA", large)
		let need: number
		let aaaOnly: boolean
		if (ratio < needAA) {
			need = level === "AA" ? needAA : needAAA
			aaaOnly = false
		} else if (level === "AAA" && ratio < needAAA) {
			need = needAAA
			aaaOnly = true
		} else continue
		const bgLabel = t.background[0]?.label ?? "its background"
		const key = [t.role, bgLabel, need, aaaOnly].join("\u0000")
		const g = groups.get(key)
		if (!g) {
			groups.set(key, { role: t.role, bgLabel, ratio, need, aaaOnly, large, items: [t] })
		} else {
			g.items.push(t)
			// Lead with the worst offender.
			if (ratio < g.ratio) {
				g.ratio = ratio
				g.items.unshift(g.items.pop() as TextSample)
			}
		}
	}
	return [...groups.values()].map((g, n) => {
		const count = g.items.length
		const worst = quote(g.items[0]?.text ?? "")
		const who =
			count === 1
				? `The ${g.role} ${worst} is ${fmtRatio(g.ratio)}`
				: `${count} ${roleNoun(g.role, count)} are as low as ${fmtRatio(g.ratio)} (${worst})`
		// "the mark behind it" → "… behind them" for a group.
		const against = count === 1 ? g.bgLabel : g.bgLabel.replace(/\bit$/, "them").replace(/^its /, "their ")
		const levelName = g.aaaOnly || level === "AAA" ? "AAA" : "AA"
		const sizeNote = g.large ? " for large text" : ""
		return {
			id: `text-contrast-${n}`,
			rule: "text-contrast",
			level: g.aaaOnly ? "fail-aaa" : "fail",
			message: `${who} against ${against}; ${levelName} needs ${g.need}:1${sizeNote}.`,
			suggestion: ROLE_FIX[g.role],
			targets: g.items.map(textTarget),
		}
	})
}

/** Rule 5 — small text. */
const smallTextFindings = (texts: TextSample[]): AccessibilityFinding[] => {
	const groups = new Map<string, { role: TextRole; pt: number; items: TextSample[] }>()
	for (const t of texts) {
		if (!t.text.trim() || t.fontSizePx <= 0) continue
		const pt = t.fontSizePx * PX_TO_PT
		if (pt >= SMALL_TEXT_ADVISORY_PT) continue
		const key = `${t.role}\u0000${fmtPt(pt)}`
		const g = groups.get(key)
		if (g) g.items.push(t)
		else groups.set(key, { role: t.role, pt, items: [t] })
	}
	return [...groups.values()].map((g, n) => {
		const count = g.items.length
		const who =
			count === 1
				? `The ${g.role} ${quote(g.items[0]?.text ?? "")} is`
				: `${count} ${roleNoun(g.role, count)} are`
		const fail = g.pt < SMALL_TEXT_FAIL_PT
		return {
			id: `small-text-${n}`,
			rule: "small-text",
			level: fail ? "fail" : "advisory",
			message: `${who} ${fmtPt(g.pt)}, smaller than the ${fail ? SMALL_TEXT_FAIL_PT : SMALL_TEXT_ADVISORY_PT}pt ${fail ? "minimum for legible chart text" : "most readers can comfortably read"}.`,
			suggestion: ROLE_SIZE_FIX[g.role],
			targets: g.items.map(textTarget),
		}
	})
}

/** Most confusable-pair findings listed individually; the rest fold into
 *  one summary finding so a 12-color palette doesn't bury everything else. */
const MAX_PAIR_FINDINGS = 6

const paletteFindings = (
	hue: NonNullable<AccessibilityInput["hue"]>
): AccessibilityFinding[] => {
	if (!hue.discrete || hue.levels.length < 2) return []
	const pairs = findConfusablePairs(hue.levels.map((l) => l.color))
	const shown = pairs.slice(0, MAX_PAIR_FINDINGS)
	const findings: AccessibilityFinding[] = shown.flatMap((p, n) => {
		const a = hue.levels[p.i]
		const b = hue.levels[p.j]
		if (!a || !b) return []
		const asIs = p.visions[0] === "normal"
		const finding: AccessibilityFinding = {
			id: `palette-${n}`,
			rule: "palette-distinguishable",
			level: "advisory",
			message: asIs
				? `The ${hue.field} colors for ${quote(a.value)} and ${quote(b.value)} are too similar for anyone to tell apart reliably.`
				: `The ${hue.field} colors for ${quote(a.value)} and ${quote(b.value)} look alike to ${listVisions(p.visions)}.`,
			suggestion:
				"Pick a more distinct color for one of them in the Color options, or also map the field to Pattern or Shape.",
			targets: [...a.targets, ...b.targets],
		}
		return [finding]
	})
	const rest = pairs.length - shown.length
	if (rest > 0) {
		findings.push({
			id: "palette-more",
			rule: "palette-distinguishable",
			level: "advisory",
			message: `${rest} more ${plural(rest, "pair")} of ${hue.field} colors are hard to tell apart under color-vision deficiency.`,
			suggestion:
				"With this many levels, color alone can't stay distinct; consider fewer levels, Pattern or Shape, or direct data labels.",
			targets: hue.targets,
		})
	}
	return findings
}

/** Whether the chart mode's `canvas.shapeRole` draws the Shape channel as
 *  per-mark glyphs. Only then can a Shape mapping tell color levels apart:
 *  cell modes (bars, tiles, hexbins) read only the outline width, outline
 *  modes (wedges, regions, layout shapes) draw no glyph, areas ignore it. */
export const shapeDrawsGlyphs = (
	shapeRole: "glyph" | "cell" | "outline" | "none"
): boolean => shapeRole === "glyph"

/** Whether a Pattern mapping on the color field actually draws distinct
 *  patterns for its levels. On a drawn line (`connectionRole` "line" with a
 *  Connection field) Pattern becomes the line DASH, read from
 *  `dashOverrides` (a custom dasharray counts as a dash); everywhere else
 *  it is the mark's fill pattern, from `overrides`. A level set to "none"
 *  draws plain — two or more such levels can't be told apart by pattern. */
export const patternDistinguishesLevels = ({
	levels,
	connectionRole,
	connectionMapped,
	overrides,
	dashOverrides,
	customDashOverrides,
}: {
	levels: readonly string[]
	connectionRole: "line" | "layer" | "polygon" | "key" | "none"
	connectionMapped: boolean
	overrides?: Readonly<Record<string, number | "none">>
	dashOverrides?: Readonly<Record<string, number | "none">>
	customDashOverrides?: Readonly<Record<string, string>>
}): boolean => {
	if (levels.length < 2) return false
	const dash = connectionRole === "line" && connectionMapped
	const map = dash ? dashOverrides : overrides
	const plain = levels.filter(
		(v) => map?.[v] === "none" && !(dash && customDashOverrides?.[v]?.trim())
	)
	return plain.length < 2
}

/** Contrast between two adjacent marks that WCAG (G183, 1.4.1) accepts as
 *  a cue beyond hue: at 3:1 the levels still separate in grayscale. */
export const LIGHTNESS_CUE_CONTRAST = 3

/** True when every pair of colors differs by at least 3:1 in luminance
 *  contrast — they'd still read apart in the black-and-white preview, so
 *  hue isn't the only cue. */
export const lightnessDistinguishes = (colors: readonly string[]): boolean =>
	colors.every((a, i) =>
		colors.every(
			(b, j) => j <= i || contrastRatio(a, b) >= LIGHTNESS_CUE_CONTRAST
		)
	)

const colorOnlyFindings = (input: AccessibilityInput): AccessibilityFinding[] => {
	const { hue, redundantEncoding: r } = input
	if (!hue || !hue.discrete || hue.levels.length < 2) return []
	if (r.shape || r.pattern || r.dataLabels || r.position) return []
	if (lightnessDistinguishes(hue.levels.map((l) => l.color))) return []
	return [
		{
			id: "color-only",
			rule: "color-only",
			level: "advisory",
			message: `Color is the only thing that tells the ${hue.levels.length} ${hue.field} levels apart in the plot.`,
			suggestion:
				"Also map the field to Pattern or Shape, or label the marks directly with data labels.",
			targets: hue.targets,
		},
	]
}

const redGreenFindings = (input: AccessibilityInput): AccessibilityFinding[] => {
	const { hue } = input
	if (!hue?.ordered || !hue.ends) return []
	const [lo, hi] = hue.ends
	if (!isRedGreenRamp(lo, hi)) return []
	return [
		{
			id: "red-green-ramp",
			rule: "red-green-ramp",
			level: "advisory",
			message: `The ${hue.field} color scale runs from red to green, whose ends look alike to people with red-green color blindness.`,
			suggestion:
				"Use a palette that runs light-to-dark or blue-to-orange, or make sure the ends also differ clearly in lightness.",
			targets: hue.targets,
		},
	]
}

const faintMarkFindings = (input: AccessibilityInput): AccessibilityFinding[] => {
	const out: AccessibilityFinding[] = []
	const { lowOpacity, lineThicknessPx, dataOutlineWidthPx } = input.marks
	if (lowOpacity && lowOpacity.value < FAINT_OPACITY) {
		out.push({
			id: "faint-opacity",
			rule: "faint-marks",
			level: "advisory",
			message: `${lowOpacity.source} ${Math.round(lowOpacity.value * 100)}%, so those marks may be too faint to see against the background.`,
			suggestion: `Keep data marks at ${Math.round(FAINT_OPACITY * 100)}% opacity or more (Opacity in the sidebar).`,
			targets: input.plotTargets,
		})
	}
	if (lineThicknessPx !== null && lineThicknessPx < THIN_STROKE_PX) {
		out.push({
			id: "thin-lines",
			rule: "faint-marks",
			level: "advisory",
			message: `Data lines are drawn ${lineThicknessPx}px thick, thinner than 1px, which low-vision readers may lose.`,
			suggestion: "Raise the line thickness to at least 1px in the line options.",
			targets: input.plotTargets,
		})
	}
	if (dataOutlineWidthPx !== null && dataOutlineWidthPx > 0 && dataOutlineWidthPx < THIN_STROKE_PX) {
		out.push({
			id: "thin-outlines",
			rule: "faint-marks",
			level: "advisory",
			message: `Mark outlines carry the outline-color variable but are only ${dataOutlineWidthPx}px wide, too thin to read their color.`,
			suggestion: "Raise the outline width to at least 1px in the Shape options.",
			targets: input.plotTargets,
		})
	}
	return out
}

const hoverOnlyFindings = (input: AccessibilityInput): AccessibilityFinding[] =>
	input.tooltipsEnabled && !input.dataLabelsShown
		? [
				{
					id: "hover-only",
					rule: "hover-only",
					level: "advisory",
					message:
						"Exact values are only shown in hover tooltips, which keyboard and screen-reader users can't reach.",
					suggestion:
						"Show the key values as data labels, or share the data table alongside the chart.",
					targets: input.plotTargets,
				},
			]
		: []

const titleFindings = (input: AccessibilityInput): AccessibilityFinding[] => {
	const out: AccessibilityFinding[] = []
	for (const axis of ["x", "y"] as const) {
		const state = input.axes[axis]
		if (state === null || state === "shown") continue
		const name = axis.toUpperCase()
		out.push({
			id: `axis-title-${axis}`,
			rule: "missing-titles",
			level: "advisory",
			message:
				state === "hidden"
					? `The ${name} axis title is hidden, so readers have to guess what the ${name} axis measures.`
					: `The ${name} axis has no title, so readers have to guess what it measures.`,
			suggestion:
				state === "hidden"
					? `Re-check the ${name} axis title under Titles → Titles shown, unless the chart's title already says it.`
					: `Type ${axis === "x" ? "an" : "a"} ${name} axis title under Titles, unless the chart's title already says it.`,
			targets: input.axisTitleTargets[axis].length
				? input.axisTitleTargets[axis]
				: input.plotTargets,
		})
	}
	input.legends.forEach((l, n) => {
		if (l.title === "shown") return
		out.push({
			id: `legend-title-${n}`,
			rule: "missing-titles",
			level: "advisory",
			message:
				l.title === "hidden"
					? `The legend for ${l.field} has its title hidden, so readers can't tell what its entries stand for.`
					: `The legend for ${l.field} has no title, so readers can't tell what its entries stand for.`,
			suggestion:
				l.title === "hidden"
					? "Re-check its title under Titles → Titles shown."
					: "Type a legend title under Legend, or clear it to show the field name.",
			targets: input.legendTargets,
		})
	})
	return out
}

/** Rule 9 — the screen-reader description. Fail when it says nothing
 *  (empty, or only the visual's name on an untitled chart); Advisory while
 *  it is still the automatic copy of the title. */
const descriptionFindings = (
	input: AccessibilityInput
): AccessibilityFinding[] => {
	const d = input.description
	if (!d) return []
	const text = d.text.trim()
	const justName =
		!d.hasTitle && text !== "" && text === d.visualName.trim()
	if (text === "" || justName) {
		return [
			{
				id: "description-missing",
				rule: "description",
				level: "fail",
				message:
					text === ""
						? "The chart has no screen-reader description, so screen-reader users can't tell what it shows."
						: `The screen-reader description is only the visual's name (${quote(text)}), so screen-reader users can't tell what the chart shows.`,
				suggestion:
					"Write a description under Accessibility, or give the chart a title under Titles.",
				targets: input.plotTargets,
			},
		]
	}
	if (d.automatic && d.hasTitle) {
		return [
			{
				id: "description-automatic",
				rule: "description",
				level: "advisory",
				message:
					"The screen-reader description is the chart title; write a sentence that states the takeaway, under Accessibility.",
				targets: input.plotTargets,
			},
		]
	}
	return []
}

const LEVEL_ORDER: Record<FindingLevel, number> = {
	fail: 0,
	"fail-aaa": 1,
	advisory: 2,
}

/** Every finding for the collected input at the chosen conformance level,
 *  ordered Fails → AAA-only fails → Advisories. */
export const evaluateAccessibility = (
	input: AccessibilityInput,
	level: ContrastLevel
): AccessibilityFinding[] => {
	const findings = [
		...textContrastFindings(input.texts, level),
		...smallTextFindings(input.texts),
		...(input.hue ? paletteFindings(input.hue) : []),
		...colorOnlyFindings(input),
		...redGreenFindings(input),
		...faintMarkFindings(input),
		...hoverOnlyFindings(input),
		...titleFindings(input),
		...descriptionFindings(input),
	]
	return findings
		.map((f, i) => ({ f, i }))
		.sort((a, b) => LEVEL_ORDER[a.f.level] - LEVEL_ORDER[b.f.level] || a.i - b.i)
		.map(({ f }) => f)
}

/** An input with nothing in it — the starting point for tests and for the
 *  overlay before the first collection. */
export const emptyAccessibilityInput = (): AccessibilityInput => ({
	texts: [],
	hue: null,
	redundantEncoding: { shape: false, pattern: false, dataLabels: false, position: false },
	dataLabelsShown: false,
	tooltipsEnabled: false,
	marks: { lowOpacity: null, lineThicknessPx: null, dataOutlineWidthPx: null },
	axes: { x: null, y: null },
	axisTitleTargets: { x: [], y: [] },
	legends: [],
	plotTargets: [],
	legendTargets: [],
	description: null,
})
