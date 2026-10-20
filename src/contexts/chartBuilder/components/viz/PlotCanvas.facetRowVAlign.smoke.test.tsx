import { fireEvent, render } from "@testing-library/react"
import { useSetAtom } from "jotai"
import { TestProvider } from "../../../../testSupport/TestProvider"
import { installInMemoryLocalStorage } from "../../../../testSupport/localStorageShim"
import { describe, expect, it, vi } from "vitest"
import { DEFAULT_FACET_CONFIG } from "../../lib/channelConfig"
import { DEFAULT_LABELS_CONFIG } from "../../lib/labelsConfig"
import { emptyEncodings, type Dataset } from "../../lib/types"
import { currentLabelsAtom } from "../../store/atoms"

import { ChartCanvas } from "./ChartCanvas"

/** The row-title strip's vertical placement is SOLVED, not painted: the
 *  solver reads `titleVerticalAlignments` (through the facet-title styles)
 *  and computes each header's y. PlotCanvas's layout memo must therefore
 *  re-run when that map changes — it once omitted the dep, so clicking
 *  top / bottom in the Labels panel did nothing until an unrelated change
 *  forced a re-solve (and looked fixed after a reload).
 *
 *  jsdom measures the canvas as 0×0, which collapses every panel to zero
 *  height and makes top / middle / bottom coincide — so the measure hook is
 *  mocked to a real-sized canvas (same shape as Annotation.outsidePlot). */
vi.mock("react-use-measure", () => ({
	default: () => [
		() => {},
		{ x: 0, y: 0, top: 0, left: 0, right: 800, bottom: 600, width: 800, height: 600 },
	],
}))

const DATASET_ID = "ds-row-valign"

const buildRowDataset = (): Dataset => ({
	id: DATASET_ID,
	name: "rows",
	fields: [
		{ name: "x", inferredType: "quantitative" },
		{ name: "y", inferredType: "quantitative" },
		{ name: "region", inferredType: "categorical" },
	],
	versions: [
		{
			id: "v1",
			filename: "rows.csv",
			rows: [
				{ x: "1", y: "10", region: "N" },
				{ x: "2", y: "20", region: "N" },
				{ x: "3", y: "30", region: "S" },
				{ x: "4", y: "40", region: "S" },
			],
			createdAt: 0,
		},
	],
	latestVersionId: "v1",
	createdAt: 0,
})

const seedRowOnly = () => {
	const store = installInMemoryLocalStorage()
	const ds = buildRowDataset()
	/* eslint-disable @vc/use-wrapped-json-functions */
	store.set("vis-components:datasets", JSON.stringify({ [DATASET_ID]: ds }))
	store.set("vis-components:currentDatasetId", JSON.stringify(DATASET_ID))
	store.set("vis-components:previewVersionId", JSON.stringify(null))
	store.set(
		"vis-components:currentEncodings",
		JSON.stringify({
			...emptyEncodings(),
			x: { field: "x" },
			y: { field: "y" },
			facetRow: { field: "region" },
		})
	)
	store.set(
		"vis-components:currentChannelConfigs",
		JSON.stringify({ facet: { ...DEFAULT_FACET_CONFIG } })
	)
	store.set(
		"vis-components:currentLabels",
		JSON.stringify({ _v: 1, data: DEFAULT_LABELS_CONFIG })
	)
	/* eslint-enable @vc/use-wrapped-json-functions */
}

/** Writes the row-only facet title's vertical alignment through the same
 *  atom update the Labels panel's "Vertical alignment" control performs. */
const VAlignProbe = ({ value }: { value: "top" | "bottom" }) => {
	const setLabels = useSetAtom(currentLabelsAtom)
	return (
		<button
			type="button"
			data-testid={`valign-${value}`}
			onClick={() =>
				setLabels((prev) => ({
					...prev,
					titleVerticalAlignments: {
						...prev.titleVerticalAlignments,
						facetTitle: value,
					},
				}))
			}
		/>
	)
}

const rowHeaderYs = (container: HTMLElement) =>
	[...container.querySelectorAll("[data-row-header]")].map((el) =>
		Number(el.getAttribute("y"))
	)

describe("PlotCanvas — facet row-title vertical alignment re-solves live", () => {
	it("moves the row headers when the alignment changes after mount", () => {
		seedRowOnly()
		const { container } = render(
			<TestProvider>
				<div style={{ width: 800, height: 600 }}>
					<ChartCanvas />
				</div>
				<VAlignProbe value="top" />
				<VAlignProbe value="bottom" />
			</TestProvider>
		)
		const middle = rowHeaderYs(container)
		expect(middle.length).toBe(2)

		fireEvent.click(container.querySelector('[data-testid="valign-top"]')!)
		const top = rowHeaderYs(container)
		expect(top.length).toBe(2)
		top.forEach((y, i) => expect(y).toBeLessThan(middle[i]!))

		fireEvent.click(container.querySelector('[data-testid="valign-bottom"]')!)
		const bottom = rowHeaderYs(container)
		expect(bottom.length).toBe(2)
		bottom.forEach((y, i) => expect(y).toBeGreaterThan(middle[i]!))
	})
})

/** Toggles the row-only facet's "Facet titles" box the way the Labels
 *  panel's "Titles shown" checkbox does (sparse `hiddenTitles`). */
const FacetShownProbe = () => {
	const setLabels = useSetAtom(currentLabelsAtom)
	return (
		<button
			type="button"
			data-testid="toggle-facet-shown"
			onClick={() =>
				setLabels((prev) => {
					const { hiddenTitles: _h, ...rest } = prev
					return prev.hiddenTitles?.facetTitle
						? rest
						: { ...rest, hiddenTitles: { facetTitle: true } }
				})
			}
		/>
	)
}

/** Same stale-memo hazard as above: `hiddenTitles` changes no other label
 *  field, so the layout memo must list it or re-checking the box leaves the
 *  strip gone until an unrelated change forces a re-solve. */
describe("PlotCanvas — 'Titles shown' facet toggle re-solves live", () => {
	it("hides the row strip, then redraws it when re-checked", () => {
		seedRowOnly()
		const { container } = render(
			<TestProvider>
				<div style={{ width: 800, height: 600 }}>
					<ChartCanvas />
				</div>
				<FacetShownProbe />
			</TestProvider>
		)
		const toggle = container.querySelector(
			'[data-testid="toggle-facet-shown"]'
		)!
		expect(rowHeaderYs(container).length).toBe(2)
		fireEvent.click(toggle)
		expect(rowHeaderYs(container).length).toBe(0)
		fireEvent.click(toggle)
		expect(rowHeaderYs(container).length).toBe(2)
	})
})
