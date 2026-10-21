import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
	DEFAULT_DATA_LABELS_CONFIG,
	type DataLabelsConfig,
} from "../../../lib/channelConfig"
import { TextBackgroundPanel } from "./TextBackgroundPanel"

/** Data Labels → Box: the Border toggle IS the border thickness (off = 0,
 *  on = the last non-zero thickness or 1px), and Border color / Border
 *  thickness show only while it's on. Per-variable blocks write their own
 *  `fieldBackgrounds` entry. */

afterEach(cleanup)

const toggleLabeled = (c: HTMLElement, label: string) => {
	const l = Array.from(c.querySelectorAll("label")).find(
		(x) => x.textContent?.trim() === label
	)
	const id = l?.getAttribute("for")
	return id ? (document.getElementById(id) as HTMLInputElement | null) : null
}

const mount = (
	over: Partial<DataLabelsConfig>,
	onChange = vi.fn(),
	multiFields: string[] = []
) => {
	const cfg = { ...DEFAULT_DATA_LABELS_CONFIG, textBackground: true, ...over }
	const utils = render(
		<TextBackgroundPanel
			cfg={cfg}
			onChange={onChange}
			vizBackground="#ffffff"
			multiFields={multiFields}
		/>
	)
	return { ...utils, onChange }
}

describe("TextBackgroundPanel — Border", () => {
	it("orders Background · Corner radius · padding · Border", () => {
		const { container } = mount({})
		const text = container.textContent ?? ""
		const at = (s: string) => text.indexOf(s)
		expect(at("Background")).toBeLessThan(at("Corner radius"))
		expect(at("Corner radius")).toBeLessThan(at("Horizontal padding"))
		expect(at("Horizontal padding")).toBeLessThan(at("Vertical padding"))
		expect(at("Vertical padding")).toBeLessThan(at("Border"))
		// Off by default: no color / thickness rows.
		expect(text).not.toContain("Border color")
		expect(text).not.toContain("Border thickness")
	})

	it("turning Border on writes a 1px thickness", () => {
		const { container, onChange } = mount({})
		const input = toggleLabeled(container, "Border")
		fireEvent.click(input!)
		expect(onChange).toHaveBeenCalledWith({ textBackgroundBorderWidth: 1 })
	})

	it("with a border, shows color + thickness and turning it off writes 0", () => {
		const { container, onChange } = mount({ textBackgroundBorderWidth: 2 })
		expect(container.textContent).toContain("Border color")
		expect(container.textContent).toContain("Border thickness")
		const input = toggleLabeled(container, "Border")
		fireEvent.click(input!)
		expect(onChange).toHaveBeenCalledWith({ textBackgroundBorderWidth: 0 })
	})

	it("a per-variable block writes its own fieldBackgrounds entry", () => {
		const { container, onChange } = mount({}, vi.fn(), ["A", "B"])
		// Expand the first variable's block.
		const header = Array.from(container.querySelectorAll("button")).find(
			(b) => b.textContent?.includes("A")
		)
		fireEvent.click(header!)
		const input = toggleLabeled(container, "Border")
		fireEvent.click(input!)
		expect(onChange).toHaveBeenCalledWith({
			fieldBackgrounds: { A: { textBackgroundBorderWidth: 1 } },
		})
	})
})
