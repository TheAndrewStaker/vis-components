import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { AccessibilityFinding } from "../../lib/accessibilityCheck"
import { emptyAccessibilityInput } from "../../lib/accessibilityCheck"
import { AccessibilityCheckCard, buildAccessibilityInput } from "./AccessibilityCheckPanel"
import type { AccessibilityState } from "./useAccessibilityState"
import type { CollectedDom } from "./collectAccessibilityDom"

afterEach(cleanup)

const finding = (
	id: string,
	level: AccessibilityFinding["level"],
	message: string
): AccessibilityFinding => ({
	id,
	rule: "text-contrast",
	level,
	message,
	suggestion: `Fix ${id}`,
	targets: [],
})

const noop = () => {}

const renderCard = (
	findings: AccessibilityFinding[],
	over: Partial<Parameters<typeof AccessibilityCheckCard>[0]> = {}
) =>
	render(
		<AccessibilityCheckCard
			findings={findings}
			level="AA"
			onLevelChange={noop}
			onRecheck={noop}
			onHighlight={noop}
			{...over}
		/>
	)

describe("AccessibilityCheckCard", () => {
	it("is a region named by its heading, with the finding count", () => {
		renderCard([finding("a", "fail", "Low contrast"), finding("b", "advisory", "Hover only")])
		const region = screen.getByRole("region", {
			name: "Accessibility check — 2 findings",
		})
		expect(region.tabIndex).toBe(0)
	})

	it("groups findings Fails → AAA-only → Advisories", () => {
		renderCard([
			finding("c", "advisory", "Advisory one"),
			finding("a", "fail", "Fail one"),
			finding("b", "fail-aaa", "AAA one"),
		])
		const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)
		expect(headings).toEqual(["Fails (1)", "Fails at AAA only (1)", "Advisories (1)"])
		const rows = screen.getAllByRole("button").filter((b) => b.dataset.finding)
		expect(rows.map((r) => r.dataset.finding)).toEqual(["a", "b", "c"])
		expect(within(rows[0] as HTMLElement).getByText("Fix a")).toBeTruthy()
	})

	it("switches between AA and AAA", () => {
		const onLevelChange = vi.fn()
		renderCard([], { onLevelChange })
		fireEvent.click(screen.getByLabelText("AAA"))
		expect(onLevelChange).toHaveBeenCalledWith("AAA")
	})

	it("shows the empty state for the chosen level", () => {
		renderCard([], { level: "AAA" })
		expect(screen.getByText("No accessibility issues found at AAA.")).toBeTruthy()
		expect(
			screen.getByRole("region", { name: "Accessibility check — 0 findings" })
		).toBeTruthy()
	})

	it("minimizes to its heading bar with an aria-expanded toggle", () => {
		const onToggleCollapsed = vi.fn()
		const findings = [finding("a", "fail", "Low contrast")]
		const { rerender } = renderCard(findings, { onToggleCollapsed })
		const toggle = screen.getByRole("button", { name: "Show findings" })
		expect(toggle.getAttribute("aria-expanded")).toBe("true")
		expect(screen.getByText("Low contrast")).toBeTruthy()
		fireEvent.click(toggle)
		expect(onToggleCollapsed).toHaveBeenCalled()
		rerender(
			<AccessibilityCheckCard
				findings={findings}
				level="AA"
				onLevelChange={noop}
				onRecheck={noop}
				onHighlight={noop}
				onToggleCollapsed={onToggleCollapsed}
				collapsed
			/>
		)
		expect(
			screen.getByRole("button", { name: "Show findings" }).getAttribute("aria-expanded")
		).toBe("false")
		// The heading (and its count) stays; the list, level and Re-check go.
		expect(screen.getByRole("region", { name: "Accessibility check — 1 finding" })).toBeTruthy()
		expect(screen.queryByText("Low contrast")).toBeNull()
		expect(screen.queryByRole("button", { name: "Re-check" })).toBeNull()
	})

	it("highlights on hover and focus, clears on leave, re-checks on demand", () => {
		const onHighlight = vi.fn()
		const onRecheck = vi.fn()
		renderCard([finding("a", "fail", "Low contrast")], { onHighlight, onRecheck })
		const row = screen.getByText("Low contrast").closest("button") as HTMLElement
		fireEvent.mouseEnter(row)
		expect(onHighlight).toHaveBeenLastCalledWith("a")
		fireEvent.mouseLeave(row)
		expect(onHighlight).toHaveBeenLastCalledWith(null)
		fireEvent.focus(row)
		expect(onHighlight).toHaveBeenLastCalledWith("a")
		fireEvent.click(screen.getByRole("button", { name: "Re-check" }))
		expect(onRecheck).toHaveBeenCalled()
	})
})

describe("buildAccessibilityInput", () => {
	const state: AccessibilityState = {
		hue: {
			field: "Region",
			discrete: true,
			ordered: false,
			levels: [{ value: "East", color: "#d62728" }],
			ends: null,
		},
		redundantEncoding: { shape: false, pattern: false, position: false },
		labelsNameHueField: true,
		dataLabelsMapped: false,
		tooltipsEnabled: true,
		marks: { lowOpacity: null, lineThicknessPx: null, dataOutlineWidthPx: null },
		axes: { x: "shown", y: "shown" },
		legends: [{ field: "Region", title: "hidden" }],
		description: {
			automatic: false,
			hasTitle: true,
			text: "Sales rose in the East.",
			visualName: "Sales",
		},
	}
	const legendTarget = { kind: "html" as const, id: "l", bbox: { x: 0, y: 0, width: 1, height: 1 } }
	const dom = (over: Partial<CollectedDom> = {}): CollectedDom => ({
		texts: [],
		elements: new Map(),
		plotTargets: [],
		legendTargets: [legendTarget],
		legendEntryTargets: new Map([["East", [legendTarget]]]),
		dataLabelsDrawn: false,
		legendDrawn: true,
		...over,
	})

	it("attaches legend entries to hue levels and counts drawn data labels", () => {
		const input = buildAccessibilityInput(state, dom({ dataLabelsDrawn: true }))
		expect(input.hue?.levels[0]?.targets).toEqual([legendTarget])
		expect(input.dataLabelsShown).toBe(true)
		expect(input.redundantEncoding.dataLabels).toBe(true)
	})

	it("drops legend-title findings when no legend is drawn", () => {
		expect(buildAccessibilityInput(state, dom({ legendDrawn: false })).legends).toEqual([])
	})

	it("passes the description state through", () => {
		expect(buildAccessibilityInput(state, dom()).description).toEqual(state.description)
	})

	it("is the empty input without state", () => {
		expect(buildAccessibilityInput(null, null)).toEqual(emptyAccessibilityInput())
	})
})
