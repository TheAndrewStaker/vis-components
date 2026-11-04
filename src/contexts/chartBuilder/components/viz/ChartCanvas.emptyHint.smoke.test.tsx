import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { emptyEncodings, type Encodings } from "../../lib/types"
import {
	currentDatasetIdAtom,
	currentEncodingsAtom,
	loadedDatasetsAtom,
	previewVersionIdAtom,
} from "../../store/atoms"
import { TestProvider, type TestStore } from "../../../../testSupport/TestProvider"
import { installInMemoryLocalStorage } from "../../../../testSupport/localStorageShim"
import { buildDataset } from "../../../../testSupport/fixtures"
import { ChartBody } from "./ChartCanvas"
import { EditorCanvasContext } from "./EditorCanvasContext"

const DATASET_ID = "ds-empty-hint"
const HINT = "Assign variables to visual elements in the Encodings section"

const mount = (opts: { encodings: Encodings; inEditor: boolean }) => {
	installInMemoryLocalStorage()
	const dataset = buildDataset({
		id: DATASET_ID,
		fields: [
			{ name: "cat", inferredType: "categorical" },
			{ name: "val", inferredType: "quantitative" },
		],
		rows: [
			{ cat: "A", val: "1" },
			{ cat: "B", val: "2" },
		],
	})
	const seed = (s: TestStore) => {
		s.set(loadedDatasetsAtom, { [DATASET_ID]: dataset })
		s.set(currentDatasetIdAtom, DATASET_ID)
		s.set(previewVersionIdAtom, null)
		s.set(currentEncodingsAtom, opts.encodings)
	}
	return render(
		<TestProvider initializeState={seed}>
			<EditorCanvasContext.Provider value={opts.inEditor}>
				<ChartBody />
			</EditorCanvasContext.Provider>
		</TestProvider>
	)
}

afterEach(cleanup)

describe("ChartBody — empty-encodings hint", () => {
	it("points the editor at Encodings and Quickstart when nothing is mapped", () => {
		const { container } = mount({ encodings: emptyEncodings(), inEditor: true })
		expect(container.textContent).toContain(HINT)
	})

	it("goes away once any channel has a field", () => {
		const { container } = mount({
			encodings: { ...emptyEncodings(), x: { field: "cat" } },
			inEditor: true,
		})
		expect(container.textContent).not.toContain(HINT)
	})

	// Embeds, the embed runtime and capture iframes render the same ChartBody
	// with no provider: editor guidance must never reach them.
	it("never shows outside the editor canvas", () => {
		const { container } = mount({ encodings: emptyEncodings(), inEditor: false })
		expect(container.textContent).not.toContain(HINT)
	})
})
