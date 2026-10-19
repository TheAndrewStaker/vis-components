import { render } from "@testing-library/react"
import { TestProvider, type TestStore } from "../../../../testSupport/TestProvider"
import { installInMemoryLocalStorage } from "../../../../testSupport/localStorageShim"
import { buildDataset as buildDatasetFixture } from "../../../../testSupport/fixtures"
import { describe, expect, it } from "vitest"
import {
	DEFAULT_DATA_LABELS_CONFIG,
	EMPTY_CHANNEL_CONFIGS,
	type DataLabelsConfig,
	type LabelPositionRule,
} from "../../lib/channelConfig"
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

/** Position rules: a label whose backing value matches a rule's condition
 *  takes the RULE's X/Y offsets instead of the layer-wide ones — the
 *  diverging-bars use case (positive labels nudge one way, negatives the
 *  other). Verified by rendering the same chart with and without the rule
 *  and diffing each label's position: the matching (negative) label must
 *  move by exactly the rule's offsets, the non-matching one not at all.
 *
 *  Data values are 17 / -7 (and months 31 / 58) so none collides with an
 *  axis tick label (d3 picks round ticks), keeping the text lookup
 *  unambiguous. */

const DATASET_ID = "ds-position-rules"

const buildDataset = (): Dataset =>
	buildDatasetFixture({
		id: DATASET_ID,
		name: "points",
		filename: "points.csv",
		fields: [
			{ name: "month", inferredType: "quantitative" },
			{ name: "sales", inferredType: "quantitative" },
		],
		rows: [
			{ month: "31", sales: "17" },
			{ month: "58", sales: "-7" },
		],
	})

const seedState = () => {
	const store = installInMemoryLocalStorage()
	/* eslint-disable @vc/use-wrapped-json-functions */
	store.set(
		"vis-components:datasets",
		JSON.stringify({ [DATASET_ID]: buildDataset() })
	)
	store.set("vis-components:currentDatasetId", JSON.stringify(DATASET_ID))
	store.set("vis-components:previewVersionId", JSON.stringify(null))
	/* eslint-enable @vc/use-wrapped-json-functions */
}

const initState = (
	rules: LabelPositionRule[],
	cfg: Partial<DataLabelsConfig> = {}
) => (snap: TestStore) => {
	snap.set(loadedDatasetsAtom, { [DATASET_ID]: buildDataset() })
	snap.set(currentDatasetIdAtom, DATASET_ID)
	snap.set(previewVersionIdAtom, null)
	snap.set(currentEncodingsAtom, {
		...emptyEncodings(),
		x: { field: "month" },
		y: { field: "sales" },
	})
	snap.set(currentChannelConfigsAtom, EMPTY_CHANNEL_CONFIGS)
	snap.set(currentLabelsAtom, DEFAULT_LABELS_CONFIG)
	snap.set(currentDataLabelsConfigAtom, {
		...DEFAULT_DATA_LABELS_CONFIG,
		positionRules: rules,
		...cfg,
	})
	snap.set(currentDataLabelsEncodingsAtom, {
		...emptyDataLabelsEncodings(),
		x: { field: "month" },
		y: { field: "sales" },
		// Separate variables: two labels per point — the sales value and the
		// month — so each can carry its own rules.
		value:
			cfg.combineVariables === false
				? { field: null, multiField: true, fields: ["sales", "month"] }
				: { field: "sales" },
	})
	snap.set(currentFieldOverridesAtom, {})
	snap.set(currentFieldLevelOrdersAtom, {})
}

/** Render the scatter with the given rules and return each data label's
 *  position keyed by its text. */
const renderLabels = (
	rules: LabelPositionRule[],
	cfg: Partial<DataLabelsConfig> = {},
	texts: readonly string[] = ["17", "-7"]
): Map<string, { x: number; y: number }> => {
	seedState()
	const { container, unmount } = render(
		<TestProvider initializeState={initState(rules, cfg)}>
			<div style={{ width: 600, height: 400 }}>
				<ScatterPlot />
			</div>
		</TestProvider>
	)
	const groups = container.querySelectorAll(
		'g[aria-hidden="true"][pointer-events="none"]'
	)
	const out = new Map<string, { x: number; y: number }>()
	for (const g of groups) {
		for (const t of g.querySelectorAll("text")) {
			const text = t.textContent ?? ""
			if (!texts.includes(text)) continue
			out.set(text, {
				x: Number(t.getAttribute("x")),
				y: Number(t.getAttribute("y")),
			})
		}
	}
	unmount()
	return out
}

describe("Data labels — conditional position rules", () => {
	it("moves only the matching label, by the rule's own offsets", () => {
		const base = renderLabels([])
		const ruled = renderLabels([{ condition: "< 0", xOffset: 10, yOffset: -6 }])
		expect(base.get("17")).toBeDefined()
		expect(base.get("-7")).toBeDefined()
		// Non-matching label: untouched.
		expect(ruled.get("17")).toEqual(base.get("17"))
		// Matching label: shifted by exactly the rule's offsets (the rule
		// REPLACES the base offsets, which are 0 here).
		expect(ruled.get("-7")).toEqual({
			x: (base.get("-7")?.x ?? 0) + 10,
			y: (base.get("-7")?.y ?? 0) - 6,
		})
	})
})

/** Separate variables: every variable is its own LABEL, so every variable
 *  has its own rules (`fieldPositionRules`) — written from its own
 *  subsection in the sidebar. A variable's rules compare against ITS value
 *  in the row and move only ITS labels. */
describe("Data labels — per-variable position rules", () => {
	const SEPARATE: Partial<DataLabelsConfig> = { combineVariables: false }
	const TEXTS = ["17", "-7", "31", "58"]

	it("a variable's rule moves only that variable's matching labels", () => {
		const base = renderLabels([], SEPARATE, TEXTS)
		for (const t of TEXTS) expect(base.get(t), t).toBeDefined()
		const ruled = renderLabels(
			[],
			{
				...SEPARATE,
				fieldPositionRules: {
					sales: [{ condition: "< 0", xOffset: 10, yOffset: -6 }],
				},
			},
			TEXTS
		)
		// The sales label on the negative row — the only match.
		expect(ruled.get("-7")).toEqual({
			x: (base.get("-7")?.x ?? 0) + 10,
			y: (base.get("-7")?.y ?? 0) - 6,
		})
		// Same row's month label, and the other row entirely: untouched.
		expect(ruled.get("58")).toEqual(base.get("58"))
		expect(ruled.get("17")).toEqual(base.get("17"))
		expect(ruled.get("31")).toEqual(base.get("31"))
	})

	it("each variable's rules compare against ITS own value", () => {
		const base = renderLabels([], SEPARATE, TEXTS)
		// `> 40` is true of month 58 and of no sales value; the sales label on
		// that row stays put, so the rule can only have read the month.
		const ruled = renderLabels(
			[],
			{
				...SEPARATE,
				fieldPositionRules: {
					month: [{ condition: "> 40", xOffset: 8, yOffset: 4 }],
				},
			},
			TEXTS
		)
		expect(ruled.get("58")).toEqual({
			x: (base.get("58")?.x ?? 0) + 8,
			y: (base.get("58")?.y ?? 0) + 4,
		})
		expect(ruled.get("-7")).toEqual(base.get("-7"))
		expect(ruled.get("31")).toEqual(base.get("31"))
		expect(ruled.get("17")).toEqual(base.get("17"))
	})

	it("a variable's rule replaces ITS base offsets, not the layer's", () => {
		const base = renderLabels([], SEPARATE, TEXTS)
		const ruled = renderLabels(
			[],
			{
				...SEPARATE,
				xOffset: 20,
				yOffset: 20,
				fieldOffsets: { sales: { xOffset: 3, yOffset: 3 } },
				fieldPositionRules: {
					sales: [{ condition: "< 0", xOffset: -5, yOffset: -5 }],
				},
			},
			TEXTS
		)
		// Matching sales label: the rule's offsets, not its own 3/3.
		expect(ruled.get("-7")).toEqual({
			x: (base.get("-7")?.x ?? 0) - 5,
			y: (base.get("-7")?.y ?? 0) - 5,
		})
		// Non-matching sales label: its own base offsets.
		expect(ruled.get("17")).toEqual({
			x: (base.get("17")?.x ?? 0) + 3,
			y: (base.get("17")?.y ?? 0) + 3,
		})
		// Month labels have neither — they take the layer's.
		expect(ruled.get("31")).toEqual({
			x: (base.get("31")?.x ?? 0) + 20,
			y: (base.get("31")?.y ?? 0) + 20,
		})
	})
})
