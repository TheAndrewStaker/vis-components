import {
	dataLabelsConfigFromTheme,
	mapConfigFromTheme,
} from "../../../chartBuilder/lib/themeConfig"

import { ColorInput, NumberInput, Section, SectionGroup } from "./controls"
import type { ThemeSectionProps } from "./types"

export const MapsSection = ({ theme, set, isReadOnly }: ThemeSectionProps) => {
	// Resolved values: the theme's map fields with the built-in defaults
	// behind them — exactly what the Data Labels panel seeds and shows (the
	// same builder feeds both).
	const labels = dataLabelsConfigFromTheme(theme)
	// Same for the no-data colors: what a new map visual installs (and the
	// Maps sidebar section resets to).
	const map = mapConfigFromTheme(theme)
	return (
		<SectionGroup title="Maps" isReadOnly={isReadOnly}>
			<Section title="Data label leader lines">
				<p className="text-sm vc-muted">
					Default stroke for the leader lines that connect a map&apos;s data
					labels back to their regions (&quot;Show leader lines&quot; in
					Data labels).
				</p>
				<ColorInput
					label="Line color"
					value={labels.leaderLineColor ?? "#999999"}
					onChange={(v) => set("mapLeaderLineColor", v)}
				/>
				<NumberInput
					label="Line thickness"
					value={labels.leaderLineWidth ?? 1}
					onChange={(v) => set("mapLeaderLineThickness", v)}
					min={0}
					max={10}
					step={0.5}
					suffix="px"
				/>
			</Section>
			<Section title="No-data regions">
				<p className="text-sm vc-muted">
					Default color for map regions that have no matching data, and for
					the ink of their pattern when one is picked (Maps in the chart
					sidebar).
				</p>
				<ColorInput
					label="No-data fill"
					value={map.noDataFill}
					onChange={(v) => set("mapNoDataFill", v)}
				/>
				<ColorInput
					label="Pattern ink"
					value={map.noDataPatternInk}
					onChange={(v) => set("mapNoDataPatternInk", v)}
				/>
			</Section>
		</SectionGroup>
	)
}
