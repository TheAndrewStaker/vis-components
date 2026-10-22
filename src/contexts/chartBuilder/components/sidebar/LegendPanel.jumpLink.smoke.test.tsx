import { act, cleanup, fireEvent, render, within } from "@testing-library/react"
import { TestProvider, type TestStore } from "../../../../testSupport/TestProvider"
import { installInMemoryLocalStorage } from "../../../../testSupport/localStorageShim"
import { buildDataset as buildDatasetFixture } from "../../../../testSupport/fixtures"
import { afterEach, describe, expect, it } from "vitest"
import { CollapsibleSubsection } from "../../../../components/ui/CollapsibleSubsection"
import { DEFAULT_LEGEND_CONFIG, type LegendConfig } from "../../lib/labelsConfig"
import { emptyEncodings } from "../../lib/types"
import {
	currentLegendConfigAtom,
	sidebarCollapsedAtom,
	sidebarJumpTargetAtom,
} from "../../store/atoms"

import { LegendPanel } from "./LegendPanel"

/** Sidebar jump links: Legend → Legend text's "Edit legend titles →" opens the
 *  Titles section and asks the "Legend titles" subsection (jumpId
 *  "legend-titles") to open and scroll itself into view. */

const DATASET_ID = "ds-legendpanel-jump"

afterEach(cleanup)

describe("sidebar jump links", () => {
	it("Edit legend titles → un-collapses Titles and sets the jump target", () => {
		const ls = installInMemoryLocalStorage()
		const encodings = { ...emptyEncodings(), hue: { field: "Tier" } }
		const legendCfg: LegendConfig = { ...DEFAULT_LEGEND_CONFIG }
		/* eslint-disable @vc/use-wrapped-json-functions */
		ls.set(
			"vis-components:datasets",
			JSON.stringify({
				[DATASET_ID]: buildDatasetFixture({
					id: DATASET_ID,
					name: "tiers",
					filename: "tiers.csv",
					fields: [{ name: "Tier", inferredType: "categorical" }],
					rows: [{ Tier: "A" }, { Tier: "B" }],
				}),
			})
		)
		ls.set("vis-components:currentDatasetId", JSON.stringify(DATASET_ID))
		ls.set("vis-components:previewVersionId", JSON.stringify(null))
		ls.set("vis-components:currentEncodings", JSON.stringify(encodings))
		ls.set("vis-components:currentLegend", JSON.stringify(legendCfg))
		/* eslint-enable @vc/use-wrapped-json-functions */
		let store: TestStore | null = null
		const { container } = render(
			<TestProvider
				initializeState={(s) => {
					store = s
					s.set(currentLegendConfigAtom, legendCfg)
					s.set(sidebarCollapsedAtom, { Titles: true })
				}}
			>
				<LegendPanel />
			</TestProvider>
		)
		fireEvent.click(within(container).getByText("Legend text"))
		fireEvent.click(within(container).getByText("Edit legend titles →"))
		const s = store as TestStore | null
		expect(s?.get(sidebarCollapsedAtom).Titles).toBe(false)
		expect(s?.get(sidebarJumpTargetAtom)).toEqual({
			section: "Titles",
			subsection: "legend-titles",
		})
	})

	it("a CollapsibleSubsection with the matching jumpId opens and clears the target", () => {
		let store: TestStore | null = null
		const { container } = render(
			<TestProvider initializeState={(s) => (store = s)}>
				<CollapsibleSubsection title="Legend titles" jumpId="legend-titles">
					<span>body</span>
				</CollapsibleSubsection>
				<CollapsibleSubsection title="Other" jumpId="other">
					<span>other body</span>
				</CollapsibleSubsection>
			</TestProvider>
		)
		expect(within(container).queryByText("body")).toBeNull()
		act(() => {
			;(store as TestStore | null)?.set(sidebarJumpTargetAtom, {
				section: "Titles",
				subsection: "legend-titles",
			})
		})
		expect(within(container).getByText("body")).toBeTruthy()
		expect(within(container).queryByText("other body")).toBeNull()
		expect((store as TestStore | null)?.get(sidebarJumpTargetAtom)).toBeNull()
	})
})
