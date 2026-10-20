import { render } from "@testing-library/react"
import { TestProvider } from "../../../../testSupport/TestProvider"
import { installInMemoryLocalStorage } from "../../../../testSupport/localStorageShim"
import { buildDataset as buildDatasetFixture } from "../../../../testSupport/fixtures"
import { describe, expect, it } from "vitest"
import {
	DEFAULT_DATA_LABELS_CONFIG,
	type DataLabelsConfig,
} from "../../lib/channelConfig"
import { DEFAULT_LABELS_CONFIG } from "../../lib/labelsConfig"
import {
	emptyDataLabelsEncodings,
	emptyEncodings,
	type Dataset,
	type Encodings,
} from "../../lib/types"

import { ChartCanvas } from "./ChartCanvas"

/** `{Variable}` rules on an AGGREGATED mark, through the production path
 *  (ChartCanvas → BarPlot → DataLabelsLayer): each bar sums several rows,
 *  and a `{tier} == A` rule fires only on a bar whose EVERY row is tier A —
 *  never by reading one row of a mixed bar. */

const DATASET_ID = "ds-variable-rules"
const RULE_COLOR = "#123456"

const buildDataset = (): Dataset =>
	buildDatasetFixture({
		id: DATASET_ID,
		name: "bars",
		filename: "bars.csv",
		fields: [
			{ name: "region", inferredType: "categorical" },
			{ name: "tier", inferredType: "categorical" },
			{ name: "sales", inferredType: "quantitative" },
		],
		rows: [
			// North: all tier A → 23.
			{ region: "North", tier: "A", sales: "14" },
			{ region: "North", tier: "A", sales: "9" },
			// South: mixed tiers → 9.
			{ region: "South", tier: "A", sales: "5" },
			{ region: "South", tier: "B", sales: "4" },
		],
	})

const seed = (labelsCfg: Partial<DataLabelsConfig>) => {
	const store = installInMemoryLocalStorage()
	const encodings: Encodings = {
		...emptyEncodings(),
		x: { field: "region" },
		length: { field: "sales" },
	}
	/* eslint-disable @vc/use-wrapped-json-functions */
	store.set(
		"vis-components:datasets",
		JSON.stringify({ [DATASET_ID]: buildDataset() })
	)
	store.set("vis-components:currentDatasetId", JSON.stringify(DATASET_ID))
	store.set("vis-components:previewVersionId", JSON.stringify(null))
	store.set("vis-components:currentEncodings", JSON.stringify(encodings))
	store.set("vis-components:currentChannelConfigs", JSON.stringify({}))
	store.set(
		"vis-components:currentLabels",
		JSON.stringify({ _v: 1, data: DEFAULT_LABELS_CONFIG })
	)
	store.set(
		"vis-components:currentDataLabelsEncodings",
		JSON.stringify({
			...emptyDataLabelsEncodings(),
			x: { field: "region" },
			y: { field: "sales" },
			value: { field: "sales", multiField: false, fields: [] },
		})
	)
	store.set(
		"vis-components:currentDataLabelsConfig",
		JSON.stringify({ ...DEFAULT_DATA_LABELS_CONFIG, ...labelsCfg })
	)
	/* eslint-enable @vc/use-wrapped-json-functions */
}

const labelFills = (): Map<string, string | null> => {
	const { container, unmount } = render(
		<TestProvider>
			<div style={{ width: 800, height: 600 }}>
				<ChartCanvas />
			</div>
		</TestProvider>
	)
	const out = new Map<string, string | null>()
	for (const g of container.querySelectorAll(
		'g[aria-hidden="true"][pointer-events="none"]'
	)) {
		for (const t of g.querySelectorAll("text")) {
			out.set(t.textContent?.trim() ?? "", t.getAttribute("fill"))
		}
	}
	unmount()
	return out
}

describe("Data labels — {Variable} text color rules on bars", () => {
	it("colors a bar's label only when every row in the bar matches", () => {
		seed({
			textColorRules: [{ condition: "{tier} == A", color: RULE_COLOR }],
		})
		const fills = labelFills()
		expect(fills.get("23")).toBe(RULE_COLOR)
		expect(fills.get("9")).toBeDefined()
		expect(fills.get("9")).not.toBe(RULE_COLOR)
	})

	it("!= reads every row too: a mixed bar fails it", () => {
		seed({
			textColorRules: [{ condition: "{tier} != B", color: RULE_COLOR }],
		})
		const fills = labelFills()
		expect(fills.get("23")).toBe(RULE_COLOR)
		expect(fills.get("9")).not.toBe(RULE_COLOR)
	})
})
