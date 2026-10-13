import { Fragment } from "react"

import {
	FORMAT_PRESET_CUSTOM,
	formatPresetGroups,
} from "../../lib/formatPresets"

/** Renders the ONE preset list (`formatPresetGroups`) inside every format
 *  `<select>` in the sidebar — x / y / r tick labels, the chord ring axis
 *  tick labels, per-field data labels, legend measure labels — so the
 *  choices (and their wording) can never drift apart again. `countryNames`
 *  adds the Geography group; the data-label panels pass it on
 *  countries-level geo charts only.
 *
 *  `selected` is the dropdown's current value (`formatPresetValueFor` of the
 *  Format box text). The dropdown SHOWS that preset — the box below holds
 *  the user's edit of it — so the only entry that needs adding is the
 *  display-only "Custom" one, for box text no preset accounts for. */
export const FormatPresetOptions = ({
	countryNames = false,
	selected,
}: {
	countryNames?: boolean
	selected?: string
}) => (
	<>
		{selected === FORMAT_PRESET_CUSTOM && (
			<option value={FORMAT_PRESET_CUSTOM}>Custom (edited below)</option>
		)}
		{formatPresetGroups(countryNames).map((group) => {
			const options = group.options.map((o) => (
				<option key={o.value} value={o.value}>
					{o.label}
				</option>
			))
			return group.label ? (
				<optgroup key={group.label} label={group.label}>
					{options}
				</optgroup>
			) : (
				<Fragment key="general">{options}</Fragment>
			)
		})}
	</>
)
