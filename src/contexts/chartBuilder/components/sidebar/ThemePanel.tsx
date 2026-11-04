import { useAtomValue } from "jotai"
import { useAtomCallback } from "jotai/utils"
import { useCallback, useState } from "react"
import { isManagedTheme, themeOf } from "../../lib/systemThemes"
import {
	rethemeCaption,
	rethemeChannelConfigs,
	rethemeDataLabels,
	rethemeDataTable,
	rethemeLabels,
	rethemeLegend,
	rethemeMap,
	rethemeTooltip,
} from "../../lib/themeSwitch"
import {
	currentCaptionConfigAtom,
	currentChannelConfigsAtom,
	currentDataLabelsConfigAtom,
	currentDataTableConfigAtom,
	currentLabelsAtom,
	currentLegendConfigAtom,
	currentMapConfigAtom,
	currentTooltipConfigAtom,
	currentThemeIdAtom,
	themeAtom,
	themesAtom,
	userDefaultThemeIdAtom,
} from "../../store/atoms"

import { CollapsibleSubsection } from "../../../../components/ui/CollapsibleSubsection"
import { SelectInput } from "../../../../components/ui/SelectInput"

import { ManagedThemeGate } from "../ManagedThemeGate"

/** Per-visual theme picker. Picking a theme snapshots the saved theme's
 * values into the live editor atoms (theme, channelConfigs, labels,
 * legend) — the visual is "re-skinned" to match the chosen theme.
 *
 * The choice is saved alongside the visual via `currentThemeIdAtom` →
 * `Visual.themeId`, so subsequent loads of the same visual show the
 * dropdown selection. Editing the saved theme later does NOT silently
 * update the visual; the user has to re-pick to re-apply. */
export const ThemePanel = () => {
	const themes = useAtomValue(themesAtom)
	const currentThemeId = useAtomValue(currentThemeIdAtom)
	const userDefaultThemeId = useAtomValue(userDefaultThemeIdAtom)
	const [gateOpen, setGateOpen] = useState(false)

	const applyTheme = useAtomCallback(
		useCallback(
			(_get, set, themeId: string) => {
				const saved = themes.find((t) => t.id === themeId)
				if (!saved) return
				const theme = themeOf(saved)
				// Snapshot values into the live editor — when the user moves on
				// from a chart and saves, these become part of the Visual.
				//
				// Preserve user customizations when switching themes: only the
				// fields the theme drives change (lib/themeSwitch.ts, shared
				// with editVisual), so switching back to a prior theme restores
				// the user's customizations rather than starting over.
				set(themeAtom, theme)
				set(currentChannelConfigsAtom, (prev) => rethemeChannelConfigs(prev, theme))
				set(currentLabelsAtom, (prev) => rethemeLabels(prev, theme))
				set(currentLegendConfigAtom, (prev) => rethemeLegend(prev, theme))
				set(currentDataLabelsConfigAtom, (prev) => rethemeDataLabels(prev, theme))
				set(currentCaptionConfigAtom, (prev) => rethemeCaption(prev, theme))
				set(currentTooltipConfigAtom, (prev) => rethemeTooltip(prev, theme))
				set(currentDataTableConfigAtom, (prev) => rethemeDataTable(prev, theme))
				set(currentMapConfigAtom, (prev) => rethemeMap(prev, theme))
				set(currentThemeIdAtom, themeId)
			},
			[themes]
		)
	)

	const setDefault = useAtomCallback(
		useCallback((_get, set, themeId: string) => {
			set(userDefaultThemeIdAtom, themeId)
		}, [])
	)

	const activeId = currentThemeId ?? userDefaultThemeId
	// The default theme seeds every new visualization on this server, so
	// only a managed theme can hold the slot — and claiming it goes through
	// the administrator dialog EVERY time, like every other reach for a
	// managed theme. (Settings → Themes has the matching toggle; the two
	// must agree.)
	const activeTheme = themes.find((t) => t.id === activeId)
	const canBecomeDefault =
		activeTheme !== undefined &&
		activeTheme.id !== userDefaultThemeId &&
		isManagedTheme(activeTheme)

	const themeOptions = themes.map((t) => ({
		value: t.id,
		label: `${t.name}${isManagedTheme(t) ? " (managed)" : ""}${
			t.id === userDefaultThemeId ? " ★" : ""
		}`,
	}))

	return (
		<CollapsibleSubsection title="Theme">
			<div className="flex flex-col gap-2">
				<SelectInput
					label="Theme"
					labelClassName="sr-only"
					value={activeId ?? ""}
					options={themeOptions}
					onChange={(id) => applyTheme(id)}
					selectClassName="flex-1"
				/>
				{canBecomeDefault && activeId && (
					<button
						type="button"
						onClick={() => setGateOpen(true)}
						className="self-start text-sm underline hover:text-stone-900 dark:hover:text-white vc-muted"
					>
						Make this the default theme
					</button>
				)}
				<ManagedThemeGate
					open={gateOpen}
					onCancel={() => setGateOpen(false)}
					onConfirm={() => {
						setGateOpen(false)
						if (activeId) setDefault(activeId)
					}}
				/>
				<p className="vc-help">
					Picking a theme re-themes this visualization with the theme&apos;s palette,
					fonts, and gridline colors. Edits to a saved theme <b>don&apos;t</b> retroactively
					update visualizations using it.
				</p>
			</div>
		</CollapsibleSubsection>
	)
}
