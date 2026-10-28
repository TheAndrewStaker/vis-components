import { describe, expect, it } from "vitest"
import {
	colorDistance,
	compositeOver,
	apcaContrast,
	contrastRatio,
	emptyAccessibilityInput,
	evaluateAccessibility,
	findConfusablePairs,
	isLargeText,
	isLargeTextApca,
	isRedGreenRamp,
	patternDistinguishesLevels,
	shapeDrawsGlyphs,
	requiredContrast,
	requiredContrastApca,
	simulateCvd,
	type AccessibilityInput,
	type TextSample,
} from "./accessibilityCheck"

const box = { x: 0, y: 0, width: 10, height: 10 }

const text = (over: Partial<TextSample> = {}): TextSample => ({
	id: "t1",
	kind: "svg",
	text: "Label",
	role: "data label",
	bbox: box,
	color: "#777777",
	alpha: 1,
	background: [{ color: "#ffffff", alpha: 1, label: "the chart background" }],
	fontSizePx: 16,
	bold: false,
	...over,
})

const input = (over: Partial<AccessibilityInput> = {}): AccessibilityInput => ({
	...emptyAccessibilityInput(),
	...over,
})

describe("contrastRatio", () => {
	it("matches known WCAG pairs", () => {
		expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5)
		expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5)
		expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2)
		expect(contrastRatio("#767676", "#ffffff")).toBeGreaterThanOrEqual(4.5)
		expect(contrastRatio("#abcdef", "#abcdef")).toBe(1)
	})
})

describe("apcaContrast", () => {
	it("matches the published reference values (apca-w3 0.1.9)", () => {
		const cases: Array<[string, string, number]> = [
			["#888", "#fff", 63.056],
			["#fff", "#888", -68.541],
			["#000", "#aaa", 58.146],
			["#aaa", "#000", -56.241],
			["#123", "#def", 91.668],
			["#def", "#123", -93.068],
			["#123", "#444", 8.323],
			["#444", "#123", -7.527],
		]
		for (const [text, bg, lc] of cases) {
			expect(apcaContrast(text, bg)).toBeCloseTo(lc, 2)
		}
	})
	it("is zero for the same color and for unparseable input", () => {
		expect(apcaContrast("#abcdef", "#abcdef")).toBe(0)
		expect(apcaContrast("nope", "#ffffff")).toBe(0)
	})
})

describe("compositeOver", () => {
	it("blends a translucent color onto its background", () => {
		expect(compositeOver("#000000", 0.5, "#ffffff")).toBe("#808080")
		expect(compositeOver("#ff0000", 1, "#ffffff")).toBe("#ff0000")
		expect(compositeOver("#ff0000", 0, "#00ff00")).toBe("#00ff00")
	})
})

describe("thresholds", () => {
	it("treats 18pt, or 14pt bold, as large text", () => {
		expect(isLargeText(18, false)).toBe(true)
		expect(isLargeText(17.9, false)).toBe(false)
		expect(isLargeText(14, true)).toBe(true)
		expect(isLargeText(14, false)).toBe(false)
	})
	it("asks 4.5 / 3 at AA and 7 / 4.5 at AAA", () => {
		expect(requiredContrast("AA", false)).toBe(4.5)
		expect(requiredContrast("AA", true)).toBe(3)
		expect(requiredContrast("AAA", false)).toBe(7)
		expect(requiredContrast("AAA", true)).toBe(4.5)
	})
})

describe("APCA thresholds", () => {
	it("treats 36px, or 24px bold, as large text", () => {
		expect(isLargeTextApca(36, false)).toBe(true)
		expect(isLargeTextApca(35, false)).toBe(false)
		expect(isLargeTextApca(24, true)).toBe(true)
		expect(isLargeTextApca(24, false)).toBe(false)
	})
	it("asks Lc 60 / 45 at the lower level and Lc 75 / 60 at the stricter one", () => {
		expect(requiredContrastApca("AA", false)).toBe(60)
		expect(requiredContrastApca("AA", true)).toBe(45)
		expect(requiredContrastApca("AAA", false)).toBe(75)
		expect(requiredContrastApca("AAA", true)).toBe(60)
	})
})

describe("color-vision simulation", () => {
	it("collapses the classic red / green pair under deuteranopia", () => {
		const red = "#d62728"
		const green = "#2ca02c"
		expect(colorDistance(red, green)).toBeGreaterThan(40)
		const d = colorDistance(
			simulateCvd(red, "deuteranopia"),
			simulateCvd(green, "deuteranopia")
		)
		expect(d).toBeLessThan(10)
	})
	it("leaves grays alone", () => {
		expect(simulateCvd("#808080", "protanopia")).toBe("#808080")
	})
	it("ΔE is zero for identical colors and symmetric", () => {
		expect(colorDistance("#123456", "#123456")).toBe(0)
		expect(colorDistance("#123456", "#654321")).toBeCloseTo(
			colorDistance("#654321", "#123456"),
			6
		)
	})
})

describe("findConfusablePairs", () => {
	it("tags pairs by the vision type that confuses them", () => {
		const pairs = findConfusablePairs(["#d62728", "#2ca02c", "#1f77b4"])
		const rg = pairs.find((p) => p.i === 0 && p.j === 1)
		expect(rg?.visions).toContain("deuteranopia")
		expect(pairs.some((p) => p.visions.includes("normal"))).toBe(false)
	})
	it("reports near-identical colors once, as normal vision", () => {
		const pairs = findConfusablePairs(["#336699", "#33669a"])
		expect(pairs).toEqual([
			expect.objectContaining({ i: 0, j: 1, visions: ["normal"] }),
		])
	})
	it("passes a well-separated palette", () => {
		expect(findConfusablePairs(["#000000", "#ffffff"])).toEqual([])
	})
})

describe("isRedGreenRamp", () => {
	it("spots stoplight ends either way round", () => {
		expect(isRedGreenRamp("#47DDA7", "#DB0000")).toBe(true)
		expect(isRedGreenRamp("#d73027", "#1a9850")).toBe(true)
		expect(isRedGreenRamp("#f7fbff", "#08306b")).toBe(false)
	})
})

describe("evaluateAccessibility", () => {
	it("fails #777 on white at AA", () => {
		const [f] = evaluateAccessibility(input({ texts: [text()] }), "AA", "wcag2")
		expect(f?.rule).toBe("text-contrast")
		expect(f?.level).toBe("fail")
		expect(f?.message).toBe(
			"The data label “Label” is too low contrast against the chart background"
		)
		expect(f?.suggestion).toMatch(/Data labels/)
	})
	it("lets large text pass at 3:1", () => {
		const big = text({ fontSizePx: 24 })
		expect(evaluateAccessibility(input({ texts: [big] }), "AA", "wcag2")).toEqual([])
	})
	it("marks AA-passing text that misses AAA as fail-aaa", () => {
		const t = text({ color: "#595959" }) // 7.0 — passes AAA
		const u = text({ id: "t2", color: "#666666" }) // 5.7 — AA only
		const out = evaluateAccessibility(input({ texts: [t, u] }), "AAA", "wcag2")
		expect(out).toHaveLength(1)
		expect(out[0]?.level).toBe("fail-aaa")
		expect(evaluateAccessibility(input({ texts: [t, u] }), "AA", "wcag2")).toEqual([])
	})
	it("composites the text and translucent layers before measuring", () => {
		// Black text at 30% on white reads as #b3b3b3 — 2.07:1, a fail
		// (opaque black would pass).
		const faint = text({ color: "#000000", alpha: 0.3 })
		expect(evaluateAccessibility(input({ texts: [faint] }), "AA", "wcag2")[0]?.level).toBe("fail")
		// White text on a 50% black layer over white: #808080 bg → 3.9:1.
		const onLayer = text({
			color: "#ffffff",
			background: [
				{ color: "#000000", alpha: 0.5, label: "its bar" },
				{ color: "#ffffff", alpha: 1, label: "the chart background" },
			],
		})
		const [f] = evaluateAccessibility(input({ texts: [onLayer] }), "AA", "wcag2")
		expect(f?.message).toContain("against its bar")
	})
	it("groups identical failures into one finding with every target", () => {
		const texts = [text({ id: "a", role: "tick label" }), text({ id: "b", role: "tick label" })]
		const out = evaluateAccessibility(input({ texts }), "AA", "wcag2")
		expect(out).toHaveLength(1)
		expect(out[0]?.message).toBe(
			"2 tick labels are too low contrast against the chart background"
		)
		expect(out[0]?.targets.map((t) => t.id)).toEqual(["a", "b"])
	})
	it("leads a group with its worst offender and skips emoji-only text", () => {
		const texts = [
			text({ id: "a", text: "Mid", color: "#999999" }),
			text({ id: "b", text: "Worst", color: "#bbbbbb" }),
			text({ id: "c", text: "🐶", color: "#eeeeee" }),
		]
		const [f, ...rest] = evaluateAccessibility(input({ texts }), "AA", "wcag2")
		expect(rest).toEqual([])
		expect(f?.targets.map((t) => t.id)).toEqual(["b", "a"])
	})
	it("skips text whose background couldn't be resolved", () => {
		expect(evaluateAccessibility(input({ texts: [text({ background: [] })] }), "AA", "wcag2")).toEqual([])
	})
	it("flags small text in points: advisory under 9pt, fail under 7pt", () => {
		const black = { color: "#000000" }
		const eight = text({ ...black, fontSizePx: (8 * 4) / 3 })
		const six = text({ ...black, id: "t6", fontSizePx: 8 })
		const out = evaluateAccessibility(input({ texts: [eight, six] }), "AA", "wcag2")
		expect(out.map((f) => [f.rule, f.level])).toEqual([
			["small-text", "fail"],
			["small-text", "advisory"],
		])
		expect(out[0]?.message).toBe("The data label “Label” is too small")
	})
	it("orders fails, then AAA-only fails, then advisories", () => {
		const out = evaluateAccessibility(
			input({
				tooltipsEnabled: true,
				texts: [text({ id: "aa", color: "#999999" }), text({ id: "aaa", color: "#666666" })],
			}),
			"AAA",
			"wcag2"
		)
		expect(out.map((f) => f.level)).toEqual(["fail", "fail-aaa", "advisory"])
	})

	const hue = (colors: string[], over = {}) => ({
		field: "Region",
		discrete: true,
		ordered: false,
		levels: colors.map((c, i) => ({ value: `L${i}`, color: c, targets: [] })),
		ends: null,
		targets: [],
		...over,
	})

	it("names the two levels of confusable colors", () => {
		const out = evaluateAccessibility(input({ hue: hue(["#d62728", "#2ca02c"]) }), "AA", "wcag2")
		const f = out.find((x) => x.rule === "palette-distinguishable")
		expect(f?.message).toContain("“L0”")
		expect(f?.message).toContain("“L1”")
		expect(f?.message).toContain("colorblind friendly")
	})
	it("skips palette checks for gradient color", () => {
		const out = evaluateAccessibility(
			input({ hue: hue(["#d62728", "#2ca02c"], { discrete: false }) }),
			"AA",
			"wcag2"
		)
		expect(out.filter((f) => f.rule === "palette-distinguishable")).toEqual([])
		expect(out.filter((f) => f.rule === "color-only")).toEqual([])
	})
	it("lets a strong lightness difference count as a second cue", () => {
		const rules = (colors: string[]) =>
			evaluateAccessibility(input({ hue: hue(colors) }), "AA", "wcag2").map((f) => f.rule)
		expect(rules(["#08306b", "#c6dbef"])).not.toContain("color-only")
		expect(rules(["#1f77b4", "#ff7f0e"])).toContain("color-only")
	})
	it("flags color as the only encoding unless something else distinguishes it", () => {
		const h = hue(["#1f77b4", "#ff7f0e"])
		expect(
			evaluateAccessibility(input({ hue: h }), "AA", "wcag2").map((f) => f.rule)
		).toContain("color-only")
		for (const k of ["shape", "pattern", "dataLabels", "position"] as const) {
			const redundantEncoding = {
				shape: false,
				pattern: false,
				dataLabels: false,
				position: false,
				[k]: true,
			}
			expect(
				evaluateAccessibility(input({ hue: h, redundantEncoding }), "AA", "wcag2").map((f) => f.rule)
			).not.toContain("color-only")
		}
	})
	it("flags an ordered red-to-green palette", () => {
		const h = hue(["#47DDA7", "#FFB300", "#DB0000"], {
			ordered: true,
			ends: ["#47DDA7", "#DB0000"],
		})
		const rules = evaluateAccessibility(input({ hue: h }), "AA", "wcag2").map((f) => f.rule)
		expect(rules).toContain("red-green-ramp")
	})
	it("flags faint and thin data marks", () => {
		const out = evaluateAccessibility(
			input({
				marks: {
					lowOpacity: { value: 0.3 },
					lineThicknessPx: 0.5,
					dataOutlineWidthPx: 0.5,
				},
			}),
			"AA",
			"wcag2"
		)
		expect(out.map((f) => f.id)).toEqual(["faint-opacity", "thin-lines", "thin-outlines"])
	})
	it("flags hover-only values unless data labels show", () => {
		expect(evaluateAccessibility(input({ tooltipsEnabled: true }), "AA", "wcag2")[0]?.rule).toBe("hover-only")
		expect(
			evaluateAccessibility(input({ tooltipsEnabled: true, dataLabelsShown: true }), "AA", "wcag2")
		).toEqual([])
	})
	it("words missing and deliberately hidden titles differently", () => {
		const out = evaluateAccessibility(
			input({
				axes: { x: "hidden", y: "empty" },
				legends: [{ field: "Region", title: "hidden" }],
			}),
			"AA",
			"wcag2"
		)
		expect(out.map((f) => f.id)).toEqual(["axis-title-x", "axis-title-y", "legend-title-0"])
		expect(out[0]?.message).toBe("The X axis title is hidden")
		expect(out[1]?.message).toBe("The Y axis has no title")
		expect(out[2]?.message).toBe("The legend for Region has its title hidden")
	})
	it("is silent on a clean chart", () => {
		expect(
			evaluateAccessibility(
				input({ texts: [text({ color: "#000000" })], axes: { x: "shown", y: "shown" } }),
				"AAA",
				"wcag2"
			)
		).toEqual([])
	})
})

describe("evaluateAccessibility under APCA", () => {
	it("fails #999 on white at Lc 60", () => {
		const [f] = evaluateAccessibility(input({ texts: [text({ color: "#999999" })] }), "AA", "apca")
		expect(f?.rule).toBe("text-contrast")
		expect(f?.level).toBe("fail")
	})
	it("passes #888 on white at Lc 60 but lists it as Lc 75-only at the stricter level", () => {
		const t = text({ color: "#888888" }) // Lc 63
		expect(evaluateAccessibility(input({ texts: [t] }), "AA", "apca")).toEqual([])
		const [f] = evaluateAccessibility(input({ texts: [t] }), "AAA", "apca")
		expect(f?.level).toBe("fail-aaa")
	})
	it("uses APCA's own large-text sizes: Lc 45 from 36px, or 24px bold", () => {
		const faint = { color: "#aaaaaa" } // Lc 45.8
		const at = (over: Partial<TextSample>, level: "AA" | "AAA") =>
			evaluateAccessibility(input({ texts: [text({ ...faint, ...over })] }), level, "apca")
		expect(at({ fontSizePx: 36 }, "AA")).toEqual([])
		expect(at({ fontSizePx: 24, bold: true }, "AA")).toEqual([])
		expect(at({ fontSizePx: 24 }, "AA")[0]?.level).toBe("fail")
		// Large text clears Lc 45 but misses the stricter Lc 60.
		expect(at({ fontSizePx: 36 }, "AAA")[0]?.level).toBe("fail-aaa")
	})
	it("judges light-on-dark text by the magnitude of its negative Lc", () => {
		const t = text({
			color: "#ffffff",
			background: [{ color: "#808080", alpha: 1, label: "its bar" }],
		}) // Lc −72
		expect(evaluateAccessibility(input({ texts: [t] }), "AA", "apca")).toEqual([])
		expect(evaluateAccessibility(input({ texts: [t] }), "AAA", "apca")[0]?.level).toBe(
			"fail-aaa"
		)
	})
})

describe("second cues the mode actually draws", () => {
	it("counts Shape only where marks are glyphs", () => {
		expect(shapeDrawsGlyphs("glyph")).toBe(true)
		for (const role of ["cell", "outline", "none"] as const) {
			expect(shapeDrawsGlyphs(role)).toBe(false)
		}
	})
	const base = {
		levels: ["A", "B", "C"],
		connectionRole: "none" as const,
		connectionMapped: false,
	}
	it("counts fill patterns unless two levels draw plain", () => {
		expect(patternDistinguishesLevels(base)).toBe(true)
		expect(patternDistinguishesLevels({ ...base, overrides: { A: "none" } })).toBe(true)
		expect(
			patternDistinguishesLevels({ ...base, overrides: { A: "none", B: "none" } })
		).toBe(false)
	})
	it("reads line dashes on a drawn line, where a custom dash counts", () => {
		const line = { ...base, connectionRole: "line" as const, connectionMapped: true }
		// Fill overrides don't matter on a line — the dash is the cue.
		expect(
			patternDistinguishesLevels({ ...line, overrides: { A: "none", B: "none" } })
		).toBe(true)
		expect(
			patternDistinguishesLevels({ ...line, dashOverrides: { A: "none", B: "none" } })
		).toBe(false)
		expect(
			patternDistinguishesLevels({
				...line,
				dashOverrides: { A: "none", B: "none" },
				customDashOverrides: { B: "2,2" },
			})
		).toBe(true)
	})
	it("needs at least two levels", () => {
		expect(patternDistinguishesLevels({ ...base, levels: ["A"] })).toBe(false)
	})
})

describe("rule 9 — description", () => {
	const desc = (over: Partial<NonNullable<AccessibilityInput["description"]>>) =>
		input({
			description: {
				automatic: true,
				hasTitle: true,
				text: "Sales. By region.",
				visualName: "My chart",
				...over,
			},
		}).description
	const run = (d: AccessibilityInput["description"]) =>
		evaluateAccessibility(input({ description: d }), "AA", "wcag2").filter(
			(f) => f.rule === "description"
		)

	it("is skipped without description state", () => {
		expect(run(null)).toEqual([])
	})

	it("advises while the description is still the automatic title", () => {
		const out = run(desc({}))
		expect(out).toHaveLength(1)
		expect(out[0]?.level).toBe("advisory")
		expect(out[0]?.message).toBe(
			"The screen-reader description is the chart title; write a sentence that states the takeaway, under Accessibility"
		)
	})

	it("is quiet once the user writes one", () => {
		expect(run(desc({ automatic: false, text: "East outsold West." }))).toEqual([])
	})

	it("is quiet for an automatic subtitle-only description", () => {
		expect(run(desc({ hasTitle: false, text: "By region." }))).toEqual([])
	})

	it("fails when the description is empty or only the visual name", () => {
		const empty = run(desc({ automatic: false, hasTitle: false, text: "  " }))
		expect(empty.map((f) => f.level)).toEqual(["fail"])
		const name = run(desc({ hasTitle: false, text: "My chart" }))
		expect(name.map((f) => f.level)).toEqual(["fail"])
		expect(name[0]?.message).toContain("only the visual's name")
	})
})
