import { render } from "@testing-library/react"
import { TestProvider, type TestStore } from "../../../../testSupport/TestProvider"
import { installInMemoryLocalStorage } from "../../../../testSupport/localStorageShim"
import { buildDataset as buildDatasetFixture } from "../../../../testSupport/fixtures"
import { describe, expect, it } from "vitest"
import {
	DEFAULT_DATA_LABELS_CONFIG,
	EMPTY_CHANNEL_CONFIGS,
	type DataLabelsConfig,
} from "../../lib/channelConfig"
import { ptToPx } from "../../lib/fontUnit"
import { DEFAULT_LABELS_CONFIG } from "../../lib/labelsConfig"
import {
	emptyDataLabelsEncodings,
	emptyEncodings,
	type Dataset,
} from "../../lib/types"
import {
	currentChannelConfigsAtom,
	currentDataLabelsConfigAtom,
	currentDataLabelsEncodingsAtom,
	currentDatasetIdAtom,
	currentEncodingsAtom,
	currentFieldLevelOrdersAtom,
	currentFieldOverridesAtom,
	currentLabelsAtom,
	loadedDatasetsAtom,
	previewVersionIdAtom,
} from "../../store/atoms"

import { ScatterPlot } from "./ScatterPlot"

/** Multi-variable labels style each variable on its own: per-variable
 *  Size / Text properties / Text background / text color rules, mirroring
 *  the per-variable Color slots. Each variable's piece renders as its own
 *  `<tspan>` carrying only what differs from the label's base styling; a
 *  variable with its own background gets its own rect run. */

const DATASET_ID = "ds-per-variable-style"

const buildDataset = (): Dataset =>
	buildDatasetFixture({
		id: DATASET_ID,
		name: "per-variable-style",
		filename: "per-variable-style.csv",
		fields: [
			{ name: "month", inferredType: "quantitative" },
			{ name: "sales", inferredType: "quantitative" },
			{ name: "region", inferredType: "categorical" },
		],
		rows: [
			{ month: "1", sales: "10", region: "north" },
			{ month: "2", sales: "-5", region: "north" },
		],
	})

const mount = (cfg: DataLabelsConfig) => {
	installInMemoryLocalStorage()
	const initState = (snap: TestStore) => {
		snap.set(loadedDatasetsAtom, { [DATASET_ID]: buildDataset() })
		snap.set(currentDatasetIdAtom, DATASET_ID)
		snap.set(previewVersionIdAtom, null)
		snap.set(currentEncodingsAtom, {
			...emptyEncodings(),
			x: { field: "month" },
			y: { field: "sales" },
			connection: { field: "region" },
		})
		snap.set(currentChannelConfigsAtom, EMPTY_CHANNEL_CONFIGS)
		snap.set(currentLabelsAtom, DEFAULT_LABELS_CONFIG)
		snap.set(currentDataLabelsConfigAtom, cfg)
		snap.set(currentDataLabelsEncodingsAtom, {
			...emptyDataLabelsEncodings(),
			x: { field: "month" },
			y: { field: "sales" },
			value: { field: null, multiField: true, fields: ["sales", "region"] },
		})
		snap.set(currentFieldOverridesAtom, {})
		snap.set(currentFieldLevelOrdersAtom, {})
	}
	const { container } = render(
		<TestProvider initializeState={initState}>
			<div style={{ width: 600, height: 400 }}>
				<ScatterPlot />
			</div>
		</TestProvider>
	)
	const groups = [
		...container.querySelectorAll('g[aria-hidden="true"][pointer-events="none"]'),
	]
	const texts = groups.flatMap((g) => [...g.querySelectorAll("text")])
	const rects = groups.flatMap((g) => [...g.querySelectorAll("rect")])
	return { texts, rects }
}

// Two composed labels at every point: the value and the region, each its
// own label keyed by its variable's name.
const base: DataLabelsConfig = {
	...DEFAULT_DATA_LABELS_CONFIG,
	composedLabels: [
		{ id: "sales", template: "{sales}" },
		{ id: "region", template: "{region}" },
	],
}
const isSales = (t: Element) => /^-?\d+$/.test(t.textContent ?? "")
const isRegion = (t: Element) => t.textContent === "north"

describe("Data labels — per-label size / font / background / rules", () => {
	it("gives the sized label its own font-size and the bold one its own weight", () => {
		const { texts } = mount({
			...base,
			fieldSizes: { sales: 20 },
			fieldFonts: { region: { fontWeight: 700, italic: true } },
		})
		expect(texts.length).toBe(4)
		for (const text of texts) {
			// The <text> keeps the layer's size; a label whose own style
			// differs carries it on its piece tspan.
			expect(text.getAttribute("font-size")).toBe(String(ptToPx(base.fontSize)))
			const piece = text.querySelector("tspan")
			expect(piece).not.toBeNull()
			if (isSales(text)) {
				expect(piece?.getAttribute("font-size")).toBe(String(ptToPx(20)))
				expect(piece?.getAttribute("font-weight")).toBeNull()
			} else {
				expect(isRegion(text)).toBe(true)
				expect(piece?.getAttribute("font-size")).toBeNull()
				expect(piece?.getAttribute("font-weight")).toBe("700")
				expect(piece?.getAttribute("font-style")).toBe("italic")
			}
		}
	})

	it("keeps a uniformly styled label on the plain (tspan-less) path", () => {
		const { texts } = mount({
			...base,
			// Configured but equal to the layer values → nothing differs.
			fieldFonts: { region: { fontWeight: base.fontWeight } },
		})
		expect(texts.length).toBe(4)
		for (const text of texts) {
			expect(text.querySelectorAll("tspan").length).toBe(0)
			expect(text.textContent).toMatch(/^(-?\d+|north)$/)
		}
	})

	it("draws a background behind only the label that shows one", () => {
		const { texts, rects } = mount({
			...base,
			textBackground: false,
			fieldBackgrounds: {
				region: { textBackground: true, textBackgroundColor: "#ABCDEF" },
			},
		})
		expect(texts.length).toBe(4)
		// One rect per region label; the value labels have none.
		expect(rects.length).toBe(2)
		for (const r of rects) expect(r.getAttribute("fill")).toBe("#ABCDEF")
	})

	it("hides one label's background while the layer shows it", () => {
		const { rects } = mount({
			...base,
			textBackground: true,
			textBackgroundColor: "#112233",
			fieldBackgrounds: { sales: { textBackground: false } },
		})
		expect(rects.length).toBe(2)
		for (const r of rects) expect(r.getAttribute("fill")).toBe("#112233")
	})

	it("applies a label's own color rule against its variable's value", () => {
		const { texts } = mount({
			...base,
			fieldColorRules: { sales: [{ condition: "< 0", color: "#FF0000" }] },
		})
		const fillsByValue = new Map<string, string | null>()
		for (const text of texts.filter(isSales)) {
			const piece = text.querySelector("tspan")
			fillsByValue.set(text.textContent ?? "", piece?.getAttribute("fill") ?? null)
		}
		// -5 matches the rule; 10 doesn't and keeps the base fill — so that
		// label has no piece at all (nothing differs).
		expect(fillsByValue.get("-5")).toBe("#FF0000")
		expect(fillsByValue.get("10")).toBeNull()
	})

	it("a split label styles each variable on its own", () => {
		// "Split into individual variables" under Text properties: the
		// region piece bolds while the value beside it stays regular.
		const { texts } = mount({
			...base,
			composedLabels: [{ id: "lbl-both", template: "{sales} {region}" }],
			pieceSplits: { "lbl-both": { text: true } },
			pieces: { "lbl-both": { region: { font: { fontWeight: 700 } } } },
		})
		expect(texts.length).toBe(2)
		for (const text of texts) {
			const bold = [...text.querySelectorAll("tspan")].filter(
				(t) => t.getAttribute("font-weight") === "700"
			)
			expect(bold.map((t) => t.textContent)).toEqual(["north"])
		}
	})

	it("ignores piece entries while the section is unsplit", () => {
		const { texts } = mount({
			...base,
			composedLabels: [{ id: "lbl-both", template: "{sales} {region}" }],
			// No pieceSplits entry → the label styles as one.
			pieces: { "lbl-both": { region: { font: { fontWeight: 700 } } } },
		})
		expect(texts.length).toBe(2)
		for (const text of texts) {
			expect(text.querySelectorAll("tspan").length).toBe(0)
		}
	})

	it("splits one section at a time", () => {
		// Color split, Text properties NOT: the piece's colour lands, its
		// weight doesn't.
		const { texts } = mount({
			...base,
			composedLabels: [{ id: "lbl-both", template: "{sales} {region}" }],
			pieceSplits: { "lbl-both": { color: true } },
			pieces: {
				"lbl-both": {
					region: {
						color: { field: null, singleColor: "#00FF00" },
						font: { fontWeight: 700 },
					},
				},
			},
		})
		expect(texts.length).toBe(2)
		for (const text of texts) {
			const green = [...text.querySelectorAll("tspan")].filter(
				(t) => t.getAttribute("fill") === "#00FF00"
			)
			expect(green.map((t) => t.textContent)).toEqual(["north"])
			expect(text.querySelector('tspan[font-weight="700"]')).toBeNull()
		}
	})

	it("colours a split piece by its own rule, against its own value", () => {
		const { texts } = mount({
			...base,
			composedLabels: [{ id: "lbl-both", template: "{sales} {region}" }],
			pieceSplits: { "lbl-both": { color: true } },
			pieces: {
				"lbl-both": {
					sales: { colorRules: [{ condition: "< 0", color: "#FF0000" }] },
				},
			},
		})
		const reds = texts.map((t) =>
			[...t.querySelectorAll("tspan")]
				.filter((p) => p.getAttribute("fill") === "#FF0000")
				.map((p) => p.textContent)
		)
		// Only the negative row's value piece turns red.
		expect(reds.flat()).toEqual(["-5"])
	})

	it("a split piece inherits what it doesn't set from the LABEL", () => {
		const { texts } = mount({
			...base,
			composedLabels: [{ id: "lbl-both", template: "{sales} {region}" }],
			pieceSplits: { "lbl-both": { text: true } },
			// The label picks the family; only the region piece bolds.
			fieldFonts: { "lbl-both": { fontFamily: "Georgia" } },
			pieces: { "lbl-both": { region: { font: { fontWeight: 700 } } } },
		})
		expect(texts.length).toBe(2)
		for (const text of texts) {
			const pieces = [...text.querySelectorAll("tspan")]
			// Every piece keeps the label's family; only region is bold.
			for (const p of pieces) {
				expect(p.getAttribute("font-family")).toBe("Georgia")
			}
			expect(
				pieces
					.filter((p) => p.getAttribute("font-weight") === "700")
					.map((p) => p.textContent)
			).toEqual(["north"])
		}
	})

	it("a combination label styles as one: its own color covers every piece", () => {
		const { texts } = mount({
			...base,
			composedLabels: [{ id: "lbl-both", template: "{sales} {region}" }],
			fieldColors: { "lbl-both": { field: null, singleColor: "#00FF00" } },
			// A per-variable entry no longer reaches a piece inside another label.
			fieldSizes: { sales: 20 },
		})
		expect(texts.length).toBe(2)
		for (const text of texts) {
			const tspans = [...text.querySelectorAll("tspan")]
			expect(tspans.length).toBeGreaterThan(0)
			for (const t of tspans) {
				expect(t.getAttribute("fill")).toBe("#00FF00")
				expect(t.getAttribute("font-size")).toBeNull()
			}
		}
	})
})
