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

const base: DataLabelsConfig = {
	...DEFAULT_DATA_LABELS_CONFIG,
	labelTemplate: "{sales} {region}",
}

describe("Data labels — per-variable size / font / background / rules", () => {
	it("gives the sized variable its own font-size and the bold one its own weight", () => {
		const { texts } = mount({
			...base,
			fieldSizes: { sales: 20 },
			fieldFonts: { region: { fontWeight: 700, italic: true } },
		})
		expect(texts.length).toBe(2)
		for (const text of texts) {
			// The <text> keeps the label's own size; only the overridden
			// pieces carry attributes.
			expect(text.getAttribute("font-size")).toBe(String(ptToPx(base.fontSize)))
			const tspans = [...text.querySelectorAll("tspan")]
			const sales = tspans.find((t) => /^-?\d+$/.test(t.textContent ?? ""))
			const region = tspans.find((t) => t.textContent === "north")
			expect(sales?.getAttribute("font-size")).toBe(String(ptToPx(20)))
			expect(sales?.getAttribute("font-weight")).toBeNull()
			expect(region?.getAttribute("font-size")).toBeNull()
			expect(region?.getAttribute("font-weight")).toBe("700")
			expect(region?.getAttribute("font-style")).toBe("italic")
		}
	})

	it("keeps a uniformly styled label on the plain (tspan-less) path", () => {
		const { texts } = mount({
			...base,
			// Configured but equal to the layer values → nothing differs.
			fieldFonts: { region: { fontWeight: base.fontWeight } },
		})
		expect(texts.length).toBe(2)
		for (const text of texts) {
			expect(text.querySelectorAll("tspan").length).toBe(0)
			expect(text.textContent).toMatch(/^-?\d+ north$/)
		}
	})

	it("draws a background run behind only the variable that shows one", () => {
		const { texts, rects } = mount({
			...base,
			textBackground: false,
			fieldBackgrounds: {
				region: { textBackground: true, textBackgroundColor: "#ABCDEF" },
			},
		})
		expect(texts.length).toBe(2)
		// One rect per label — the region run only; the value and the
		// separating space have no background.
		expect(rects.length).toBe(2)
		for (const r of rects) expect(r.getAttribute("fill")).toBe("#ABCDEF")
	})

	it("hides one variable's background while the layer shows it, keeping one rect per label", () => {
		const { rects } = mount({
			...base,
			textBackground: true,
			textBackgroundColor: "#112233",
			fieldBackgrounds: { sales: { textBackground: false } },
		})
		// The literal space and the region piece share the layer background
		// (one contiguous run); the value piece has none.
		expect(rects.length).toBe(2)
		for (const r of rects) expect(r.getAttribute("fill")).toBe("#112233")
	})

	it("applies a variable's own color rule against that variable's value", () => {
		const { texts } = mount({
			...base,
			fieldColorRules: { sales: [{ condition: "< 0", color: "#FF0000" }] },
		})
		const fillsByValue = new Map<string, string | null>()
		for (const text of texts) {
			for (const t of text.querySelectorAll("tspan")) {
				if (/^-?\d+$/.test(t.textContent ?? "")) {
					fillsByValue.set(t.textContent ?? "", t.getAttribute("fill"))
				}
			}
		}
		// -5 matches the rule; 10 doesn't and keeps the base fill — so that
		// label has no segments at all (nothing differs) and never records.
		expect(fillsByValue.get("-5")).toBe("#FF0000")
		expect(fillsByValue.has("10")).toBe(false)
	})
})
