/** What the Connection panel does beyond storing a value, shared with the
 * settings path. */

import type { ChannelConfigs, ConnectionConfig } from "./channelConfig"
import { connectionConfigFromTheme } from "./themeConfig"
import type { Encodings, Theme } from "./types"

/** The connection slice with `next` applied, seeded from the theme when
 * the visual has none yet (the panel's `updateCfg`). */
export const withConnectionConfig = (
	configs: ChannelConfigs,
	theme: Theme,
	next: Partial<ConnectionConfig>
): ChannelConfigs => ({
	...configs,
	connection: { ...connectionConfigFromTheme(theme), ...configs.connection, ...next },
})

/** "Fill polygon" on: the y field moves to length (when length is free)
 * and a hue stacks; off: length moves back to y. */
export const switchConnectionFill = (
	encodings: Encodings,
	configs: ChannelConfigs,
	fill: ConnectionConfig["fill"],
	theme: Theme
): { encodings: Encodings; configs: ChannelConfigs } => {
	const yField = encodings.y?.field
	const lengthField = encodings.length?.field
	let enc = encodings
	let cfg = withConnectionConfig(configs, theme, { fill })
	if (fill === "area") {
		if (yField && !lengthField)
			enc = {
				...encodings,
				length: { ...encodings.length, field: yField },
				y: { ...encodings.y, field: null },
			}
		if (cfg.hue) cfg = { ...cfg, hue: { ...cfg.hue, stackMode: "stack" } }
	} else if (lengthField && !yField) {
		enc = {
			...encodings,
			y: { ...encodings.y, field: lengthField },
			length: { ...encodings.length, field: null },
		}
	}
	return { encodings: enc, configs: cfg }
}

/** Picking an axis-stem mode seeds its threshold (kept from a previous
 * visit, else 0) so stems draw at once. */
export const axisStemPatch = (
	cfg: Pick<ConnectionConfig, "axisStemCustomX" | "axisStemCustomY">,
	axisStem: ConnectionConfig["axisStem"]
): Partial<ConnectionConfig> => ({
	axisStem,
	...(axisStem === "custom-x" ? { axisStemCustomX: cfg.axisStemCustomX ?? 0 } : {}),
	...(axisStem === "custom-y" ? { axisStemCustomY: cfg.axisStemCustomY ?? 0 } : {}),
})
