import { cleanup, fireEvent, render, within } from "@testing-library/react"
import { TestProvider, type TestStore } from "../../../../../testSupport/TestProvider"
import { installInMemoryLocalStorage } from "../../../../../testSupport/localStorageShim"
import { buildDataset as buildDatasetFixture } from "../../../../../testSupport/fixtures"
import { afterEach, describe, expect, it } from "vitest"
import {
	DEFAULT_FACET_CONFIG,
	EMPTY_CHANNEL_CONFIGS,
	type ChannelConfigs,
	type FacetConfig,
} from "../../../lib/channelConfig"
import { emptyEncodings, type Dataset, type Encodings } from "../../../lib/types"
import {
	currentChannelConfigsAtom,
	currentDatasetIdAtom,
	currentEncodingsAtom,
	currentFieldLevelOrdersAtom,
	currentFieldOverridesAtom,
	loadedDatasetsAtom,
	previewVersionIdAtom,
} from "../../../store/atoms"

import { FacetColOptionsPanel } from "./FacetColOptionsPanel"
import { FacetRowOptionsPanel } from "./FacetRowOptionsPanel"

/** Smoke coverage for the shared `FacetAxisOptionsPanel` core behind the
 *  facetRow / facetCol wrappers: each panel carries BOTH axis
 *  subsections (own axis first) writing the grid-wide share bits, the
 *  per-group range editor keys off facet values, the panel-dim input
 *  follows the focus-fill pattern, and the intentional row/col
 *  asymmetry (pies have no row axis) survives. */

// Explicit cleanup: this file imports vitest APIs directly (no globals), so
// testing-library's automatic afterEach unmount never registers.
afterEach(cleanup)

const ID = "ds-facet-axis-panel"

const buildDataset = (): Dataset =>
	buildDatasetFixture({
		id: ID,
		name: "facetaxis",
		filename: "facetaxis.csv",
		fields: [
			{ name: "rowcat", inferredType: "categorical" },
			{ name: "colcat", inferredType: "categorical" },
			{ name: "xv", inferredType: "quantitative" },
			{ name: "yv", inferredType: "quantitative" },
		],
		rows: [
			{ rowcat: "North", colcat: "Left", xv: "1", yv: "2" },
			{ rowcat: "North", colcat: "Right", xv: "2", yv: "3" },
			{ rowcat: "South", colcat: "Left", xv: "3", yv: "4" },
			{ rowcat: "South", colcat: "Right", xv: "4", yv: "5" },
		],
	})

const scatterEncodings = (overrides: Partial<Encodings> = {}): Encodings => ({
	...emptyEncodings(),
	x: { field: "xv" },
	y: { field: "yv" },
	facetRow: { field: "rowcat" },
	facetCol: { field: "colcat" },
	...overrides,
})

const facetConfigs = (facet: Partial<FacetConfig> = {}): Partial<ChannelConfigs> => ({
	...EMPTY_CHANNEL_CONFIGS,
	facet: { ...DEFAULT_FACET_CONFIG, ...facet },
})

const mount = (
	encodings: Encodings,
	configs: Partial<ChannelConfigs>,
	children: React.ReactNode,
) => {
	// Atom storage effects re-load from localStorage on init and would reset a
	// snapshot-only seed to defaults, so the fixture goes into BOTH.
	const store = installInMemoryLocalStorage()
	/* eslint-disable @th/use-wrapped-json-functions */
	const set = (k: string, v: unknown) => store.set(k, JSON.stringify(v))
	set("vis-components:datasets", { [ID]: buildDataset() })
	set("vis-components:currentDatasetId", ID)
	set("vis-components:previewVersionId", null)
	set("vis-components:currentEncodings", encodings)
	set("vis-components:currentChannelConfigs", configs)
	/* eslint-enable @th/use-wrapped-json-functions */
	const init = (snap: TestStore) => {
		snap.set(loadedDatasetsAtom, { [ID]: buildDataset() })
		snap.set(currentDatasetIdAtom, ID)
		snap.set(previewVersionIdAtom, null)
		snap.set(currentEncodingsAtom, encodings)
		snap.set(currentChannelConfigsAtom, configs)
		snap.set(currentFieldOverridesAtom, {})
		snap.set(currentFieldLevelOrdersAtom, {})
	}
	return render(<TestProvider initializeState={init}>{children}</TestProvider>)
}

const expand = (
	utils: ReturnType<typeof render>,
	title: string | RegExp,
	index = 0,
) => {
	const header = utils.getAllByRole("button", { name: title })[index]!
	fireEvent.click(header)
}

describe("FacetAxisOptionsPanel — both axes on both panels", () => {
	it("each panel offers Rows AND Columns, own axis first, writing the shared grid-wide share bits", () => {
		const utils = mount(
			scatterEncodings(),
			facetConfigs(),
			<>
				<FacetRowOptionsPanel />
				<FacetColOptionsPanel />
			</>,
		)
		// Own axis first: row panel = Rows, Columns, Custom sizing; col
		// panel = Columns, Rows, Custom sizing.
		const headers = utils
			.getAllByRole("button", { name: /^(rows|columns|custom sizing)$/i })
			.map((b) => b.textContent?.trim())
		expect(headers).toEqual([
			"Rows",
			"Columns",
			"Custom sizing",
			"Columns",
			"Rows",
			"Custom sizing",
		])
		expand(utils, /rows/i, 0)
		expand(utils, /rows/i, 1)
		expand(utils, /columns/i, 0)
		expand(utils, /columns/i, 1)

		// DOM order: row panel's Y picker, then the col panel's Y picker.
		const yGroups = utils.getAllByRole("group", { name: "Share Y axis" })
		const xGroups = utils.getAllByRole("group", { name: "Share X axis" })
		expect(yGroups).toHaveLength(2)
		expect(xGroups).toHaveLength(2)
		// 2x2 grid → the per-group option surfaces on both, axis-named.
		expect(within(yGroups[0]!).getByRole("button", { name: "Per row" })).toBeTruthy()
		expect(
			within(xGroups[1]!).getByRole("button", { name: "Per column" }),
		).toBeTruthy()

		// Clicking "None" on the COL panel's Y picker writes shareY — the
		// row panel's Y picker follows (one config bit) and neither X
		// picker moves (they write shareX).
		fireEvent.click(within(yGroups[1]!).getByRole("button", { name: "None" }))
		for (const g of yGroups) {
			expect(
				within(g).getByRole("button", { name: "None" }).getAttribute("aria-pressed"),
			).toBe("true")
		}
		for (const g of xGroups) {
			expect(
				within(g)
					.getByRole("button", { name: "All panels" })
					.getAttribute("aria-pressed"),
			).toBe("true")
		}
	})

	it("shows the overall range under share=all and the per-group editor under perGroup", () => {
		const utils = mount(
			scatterEncodings(),
			facetConfigs({ shareY: "perGroup" }),
			<FacetRowOptionsPanel />,
		)
		expand(utils, /rows/i)
		expand(utils, /columns/i)

		// Row axis (perGroup): per-row editor keyed by facet values.
		expect(utils.getByText("Y axis range per row")).toBeTruthy()
		expect(utils.getByText("North")).toBeTruthy()
		expect(utils.getByText("South")).toBeTruthy()
		// Col axis (default all): overall X range.
		expect(utils.getByText("X axis range")).toBeTruthy()
	})

	it("row-only grid with an unshared x axis offers an X range per panel (one per row)", () => {
		// One column, 2+ rows, share X = None: every row panel has its own
		// x axis and there's no column value to key a group bound on, so
		// the editor lists each panel.
		const utils = mount(
			scatterEncodings({ facetCol: { field: null } }),
			facetConfigs({ shareX: "none" }),
			<FacetRowOptionsPanel />,
		)
		expand(utils, /columns/i)
		expect(utils.getByText("X axis range per panel")).toBeTruthy()
		expect(utils.getByText("North")).toBeTruthy()
		expect(utils.getByText("South")).toBeTruthy()
		// Two panels → two min inputs; editing the first commits a value.
		const mins = utils.getAllByLabelText("min") as HTMLInputElement[]
		expect(mins).toHaveLength(2)
		fireEvent.change(mins[0]!, { target: { value: "0" } })
		expect(mins[0]!.value).toBe("0")
	})

	it("2D grid with an unshared y axis offers a Y range per panel keyed row · column", () => {
		const utils = mount(
			scatterEncodings(),
			facetConfigs({ shareY: "none" }),
			<FacetRowOptionsPanel />,
		)
		expand(utils, /rows/i)
		expect(utils.getByText("Y axis range per panel")).toBeTruthy()
		expect(utils.getByText("North · Left")).toBeTruthy()
		expect(utils.getByText("South · Right")).toBeTruthy()
	})

	it("panel height input steps from the auto value, not from min=1", () => {
		const utils = mount(
			scatterEncodings(),
			facetConfigs(),
			<FacetRowOptionsPanel />,
		)
		expand(utils, /custom sizing/i)
		const input = utils.getByLabelText(/Panel height/) as HTMLInputElement
		// No solver-published dims in this jsdom mount → the placeholder reads
		// "auto" and the step base falls back to 200. Focus commits nothing;
		// the first arrow press lands one step above the base instead of at 2.
		expect(input.value).toBe("")
		fireEvent.focus(input)
		expect(input.value).toBe("")
		fireEvent.keyDown(input, { key: "ArrowUp" })
		expect(input.value).toBe("201")
	})

	it("panel height shows a reset link only while set; clicking it returns to auto", () => {
		const utils = mount(
			scatterEncodings(),
			facetConfigs(),
			<FacetRowOptionsPanel />,
		)
		expand(utils, /custom sizing/i)
		// Auto (null) → no reset link to click.
		expect(utils.queryByLabelText("Reset panel height")).toBeNull()

		const input = utils.getByLabelText(/Panel height/) as HTMLInputElement
		fireEvent.change(input, { target: { value: "300" } })
		expect(input.value).toBe("300")
		const reset = utils.getByLabelText("Reset panel height")
		expect(reset).toBeTruthy()

		// Reset commits null (= auto): the field empties, the placeholder shows
		// through again, and the link disappears.
		fireEvent.click(reset)
		expect(input.value).toBe("")
		expect(utils.queryByLabelText("Reset panel height")).toBeNull()
	})
})

describe("FacetAxisOptionsPanel — preserved asymmetries", () => {
	it("row panel shows the no-row-axis hint on pies but still offers the Columns (angle) picker", () => {
		const utils = mount(
			{
				...emptyEncodings(),
				angle: { field: "colcat" },
				facetRow: { field: "rowcat" },
				facetCol: { field: "colcat" },
			},
			facetConfigs(),
			<>
				<FacetRowOptionsPanel />
				<FacetColOptionsPanel />
			</>,
		)
		expect(utils.getByText(/no row axis to configure/i)).toBeTruthy()
		expect(utils.queryByRole("button", { name: /^rows$/i })).toBeNull()
		// The row panel still surfaces Vertical gap (panel layout applies to pies).
		expand(utils, /custom sizing/i, 0)
		expect(utils.getByLabelText(/Vertical gap/)).toBeTruthy()

		// Both panels carry the Columns subsection with the angle picker:
		// the row panel no longer has to point the user elsewhere.
		expand(utils, /columns/i, 0)
		expand(utils, /columns/i, 1)
		expect(
			utils.getAllByRole("group", { name: "Share angle axis" }),
		).toHaveLength(2)
	})

	it("shows the map-a-field hint when the facet channel is unmapped", () => {
		const utils = mount(
			scatterEncodings({ facetRow: undefined }),
			facetConfigs(),
			<FacetRowOptionsPanel />,
		)
		expect(utils.getByText(/Map a categorical field to Facet \(row\)/)).toBeTruthy()
	})
})

describe("FacetAxisOptionsPanel — hide empty panels", () => {
	it("surfaces the checkbox in both mirrored panels when both facet channels are mapped", () => {
		const utils = mount(
			scatterEncodings(),
			facetConfigs(),
			<>
				<FacetRowOptionsPanel />
				<FacetColOptionsPanel />
			</>,
		)
		expand(utils, /custom sizing/i, 0)
		expand(utils, /custom sizing/i, 1)
		const boxes = utils.getAllByLabelText(
			"Hide empty panels",
		) as HTMLInputElement[]
		// One code site, same config bit — the control mirrors by design.
		expect(boxes).toHaveLength(2)
		expect(boxes.every((b) => !b.checked)).toBe(true)
	})

	it("does NOT render when only one facet channel is mapped", () => {
		const utils = mount(
			scatterEncodings({ facetCol: undefined }),
			facetConfigs(),
			<FacetRowOptionsPanel />,
		)
		expand(utils, /custom sizing/i)
		// Empty cells only exist in the row × col cross-product; a single
		// facet direction derives its domain from the data, so the toggle
		// would be a no-op.
		expect(utils.queryByLabelText("Hide empty panels")).toBeNull()
	})

	it("clicking it writes channelConfigs.facet.hideEmptyPanels (shared bit — both panels flip)", () => {
		const utils = mount(
			scatterEncodings(),
			facetConfigs(),
			<>
				<FacetRowOptionsPanel />
				<FacetColOptionsPanel />
			</>,
		)
		expand(utils, /custom sizing/i, 0)
		expand(utils, /custom sizing/i, 1)
		const [rowBox, colBox] = utils.getAllByLabelText(
			"Hide empty panels",
		) as HTMLInputElement[]
		fireEvent.click(rowBox!)
		// Checked state derives from cfg.hideEmptyPanels === true, so both
		// mirrored panels flipping proves the write hit the shared
		// channelConfigs.facet config bit (not local component state).
		expect(rowBox!.checked).toBe(true)
		expect(colBox!.checked).toBe(true)
	})
})
