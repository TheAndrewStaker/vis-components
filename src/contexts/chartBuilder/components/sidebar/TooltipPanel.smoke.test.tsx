import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { buildDataset } from "../../../../testSupport/fixtures"
import {
	TestProvider,
	type TestStore,
} from "../../../../testSupport/TestProvider"
import { installInMemoryLocalStorage } from "../../../../testSupport/localStorageShim"
import { EMPTY_CHANNEL_CONFIGS } from "../../lib/channelConfig"
import { DEFAULT_TOOLTIP_CONFIG } from "../../lib/labelsConfig"
import { emptyEncodings, type Encodings } from "../../lib/types"
import {
	currentChannelConfigsAtom,
	currentDatasetIdAtom,
	currentEncodingsAtom,
	currentFieldLevelOrdersAtom,
	currentFieldOverridesAtom,
	currentTooltipConfigAtom,
	loadedDatasetsAtom,
	previewVersionIdAtom,
} from "../../store/atoms"

import { TooltipPanel } from "./TooltipPanel"

/** "Show tooltips only at points" is a LINE-chart control — it exists
 *  because a line is hoverable between its points. Everywhere else it
 *  would be inert, so it isn't rendered. */

afterEach(cleanup)

const ID = "ds-tooltip-panel"

const dataset = () =>
	buildDataset({
		id: ID,
		name: "tips",
		fields: [
			{ name: "x", inferredType: "quantitative" },
			{ name: "y", inferredType: "quantitative" },
			{ name: "g", inferredType: "categorical" },
		],
		rows: [
			{ x: "1", y: "10", g: "north" },
			{ x: "2", y: "20", g: "north" },
		],
	})

const mount = (encodings: Encodings) => {
	installInMemoryLocalStorage()
	const init = (snap: TestStore) => {
		snap.set(loadedDatasetsAtom, { [ID]: dataset() })
		snap.set(currentDatasetIdAtom, ID)
		snap.set(previewVersionIdAtom, null)
		snap.set(currentEncodingsAtom, encodings)
		snap.set(currentChannelConfigsAtom, EMPTY_CHANNEL_CONFIGS)
		snap.set(currentFieldOverridesAtom, {})
		snap.set(currentFieldLevelOrdersAtom, {})
		snap.set(currentTooltipConfigAtom, DEFAULT_TOOLTIP_CONFIG)
	}
	return render(
		<TestProvider initializeState={init}>
			<TooltipPanel />
		</TestProvider>
	)
}

const lineChart = (): Encodings => ({
	...emptyEncodings(),
	x: { field: "x" },
	y: { field: "y" },
	connection: { field: "g" },
})

describe("TooltipPanel — show tooltips only at points", () => {
	it("offers the checkbox on a line chart, naming the line's variable", () => {
		const utils = mount(lineChart())
		expect(utils.getByLabelText(/only at points/i)).toBeTruthy()
		// The help line tells the user what a bare stretch of line will say.
		expect(utils.getByText(/line's g/)).toBeTruthy()
	})

	it("is absent on a plain scatter, where there's no line to hover between points", () => {
		const utils = mount({
			...emptyEncodings(),
			x: { field: "x" },
			y: { field: "y" },
		})
		expect(utils.queryByLabelText(/only at points/i)).toBeNull()
	})

	it("is absent while tooltips are off", () => {
		const utils = mount(lineChart())
		fireEvent.click(utils.getByLabelText(/show tooltips$/i))
		expect(utils.queryByLabelText(/only at points/i)).toBeNull()
	})

	it("starts off and writes the choice through", () => {
		const utils = mount(lineChart())
		const box = utils.getByLabelText(/only at points/i) as HTMLInputElement
		expect(box.checked).toBe(false)
		fireEvent.click(box)
		expect(
			(utils.getByLabelText(/only at points/i) as HTMLInputElement).checked
		).toBe(true)
	})
})
