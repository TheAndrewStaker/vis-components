import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
	TestProvider,
	type TestStore,
} from "../../../../testSupport/TestProvider"
import { installInMemoryLocalStorage } from "../../../../testSupport/localStorageShim"
import {
	DEFAULT_AXIS_CONFIG,
	EMPTY_CHANNEL_CONFIGS,
} from "../../lib/channelConfig"
import { emptyEncodings } from "../../lib/types"
import {
	currentChannelConfigsAtom,
	currentEncodingsAtom,
	currentTooltipConfigAtom,
} from "../../store/atoms"

import { HoverTooltip } from "./HoverTooltip"

/** The tooltip has no Format controls of its own — each variable prints
 *  with the format the user assigned to it elsewhere (axis first). */

const initState =
	(tooltip?: Record<string, unknown>) => (snap: TestStore) => {
		snap.set(currentEncodingsAtom, {
			...emptyEncodings(),
			x: { field: "Region" },
			y: { field: "Sales" },
		})
		snap.set(currentChannelConfigsAtom, {
			...EMPTY_CHANNEL_CONFIGS,
			y: { ...DEFAULT_AXIS_CONFIG, customFormat: "$,.0f" },
		})
		snap.set(currentTooltipConfigAtom, {
			enabled: true,
			visibleFields: [],
			customCss: "",
			customHtml: "",
			useCustomHtml: false,
			...tooltip,
		})
	}

const mount = (tooltip?: Record<string, unknown>) => {
	installInMemoryLocalStorage()
	render(
		<TestProvider initializeState={initState(tooltip)}>
			<HoverTooltip
				state={{
					clientX: 100,
					clientY: 100,
					fields: [
						{ name: "Region", value: "West" },
						{ name: "Sales", value: 1234.5 },
					],
				}}
			/>
		</TestProvider>
	)
	return document.body.querySelector(".vc-tooltip") as HTMLElement
}

afterEach(cleanup)

describe("HoverTooltip value formats", () => {
	it("prints a value with the format its variable carries on the axis", () => {
		const tip = mount()
		expect(tip.textContent).toContain("$1,235")
		expect(tip.textContent).not.toContain("1234.5")
	})

	it("leaves a variable with no format anywhere alone", () => {
		expect(mount().textContent).toContain("West")
	})

	it("formats the values a custom HTML template interpolates", () => {
		const tip = mount({
			useCustomHtml: true,
			customHtml: "<b>{{Region}}</b> {{Sales}}",
		})
		expect(tip.textContent).toContain("West $1,235")
	})
})
