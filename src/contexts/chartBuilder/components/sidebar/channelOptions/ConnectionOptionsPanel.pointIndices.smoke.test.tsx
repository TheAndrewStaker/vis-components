import { cleanup, fireEvent, render, within } from "@testing-library/react"
import { TestProvider, type TestStore } from "../../../../../testSupport/TestProvider"
import { installInMemoryLocalStorage } from "../../../../../testSupport/localStorageShim"
import { buildDataset as buildDatasetFixture } from "../../../../../testSupport/fixtures"
import { afterEach, describe, expect, it } from "vitest"

import { DEFAULT_LABELS_CONFIG } from "../../../lib/labelsConfig"
import { currentChannelConfigsAtom } from "../../../store/atoms"
import { emptyEncodings, type Dataset, type Encodings } from "../../../lib/types"

import { ConnectionOptionsPanel } from "./ConnectionOptionsPanel"

/** Show points → "Custom Nth point": picking the radio reveals a comma-list
 *  textbox of 1-based positions; the parsed list commits on blur / Enter
 *  as `connection.pointIndices` (structured numbers, never the typed
 *  string) and the box re-renders from a saved list. */

const DATASET_ID = "ds-connection-point-indices"

const buildDataset = (): Dataset =>
	buildDatasetFixture({
		id: DATASET_ID,
		name: "sales",
		filename: "sales.csv",
		fields: [
			{ name: "month", inferredType: "quantitative" },
			{ name: "sales", inferredType: "quantitative" },
			{ name: "region", inferredType: "categorical" },
		],
		rows: Array.from({ length: 8 }, (_, i) => ({
			month: String((i % 4) + 1),
			sales: String(10 * i),
			region: i < 4 ? "north" : "south",
		})),
	})

const seed = (encodings: Encodings, configs: Record<string, unknown> = {}) => {
	installInMemoryLocalStorage()
	/* eslint-disable no-restricted-globals, @vc/no-storage-outside-try, @vc/use-wrapped-json-functions */
	const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v))
	set("vis-components:datasets", { [DATASET_ID]: buildDataset() })
	set("vis-components:currentDatasetId", DATASET_ID)
	set("vis-components:previewVersionId", null)
	set("vis-components:currentEncodings", encodings)
	set("vis-components:currentChannelConfigs", configs)
	set("vis-components:currentLabels", { _v: 1, data: DEFAULT_LABELS_CONFIG })
	/* eslint-enable no-restricted-globals, @vc/no-storage-outside-try, @vc/use-wrapped-json-functions */
}

// Datasets hydrate asynchronously — settle a tick before asserting, and
// scope queries to this render's container. The captured store reads the
// committed config back.
const mount = async () => {
	let snapshot: TestStore | undefined
	const { container } = render(
		<TestProvider initializeState={(s) => (snapshot = s)}>
			<ConnectionOptionsPanel />
		</TestProvider>
	)
	await new Promise((r) => setTimeout(r, 50))
	return {
		...within(container),
		connection: () => snapshot!.get(currentChannelConfigsAtom).connection,
	}
}

const openShowPoints = async (q: Awaited<ReturnType<typeof mount>>) => {
	q.getByRole("button", { name: /Show points/ }).click()
	await new Promise((r) => setTimeout(r, 0))
}

afterEach(cleanup)

const LINE_CHART: Encodings = {
	...emptyEncodings(),
	x: { field: "month" },
	y: { field: "sales" },
	connection: { field: "region" },
}

describe("Connection panel — Show points → Custom Nth point", () => {
	it("offers the Custom radio and hides the Points box until it's picked", async () => {
		seed(LINE_CHART)
		const q = await mount()
		await openShowPoints(q)
		expect(q.queryByLabelText("Points")).toBeNull()
		fireEvent.click(q.getByLabelText("Custom Nth point"))
		expect(q.getByLabelText("Points")).not.toBeNull()
	})

	it("commits the typed comma list as structured 1-based numbers on blur", async () => {
		seed(LINE_CHART, { connection: { pointSampling: "custom" } })
		const q = await mount()
		await openShowPoints(q)
		const box = q.getByLabelText("Points") as HTMLInputElement
		fireEvent.change(box, { target: { value: "1, 3,  7, x, 3" } })
		fireEvent.blur(box)
		await new Promise((r) => setTimeout(r, 0))
		expect(q.connection()?.pointIndices).toEqual([1, 3, 7])
		// The box tidies to the canonical list.
		expect(box.value).toBe("1, 3, 7")
	})

	it("renders a saved list back into the box", async () => {
		seed(LINE_CHART, {
			connection: { pointSampling: "custom", pointIndices: [2, 5] },
		})
		const q = await mount()
		await openShowPoints(q)
		expect((q.getByLabelText("Custom Nth point") as HTMLInputElement).checked).toBe(
			true
		)
		expect((q.getByLabelText("Points") as HTMLInputElement).value).toBe("2, 5")
	})
})
