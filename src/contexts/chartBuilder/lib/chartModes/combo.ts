import type { ChannelConfigs } from "../channelConfig"
import type { Encodings } from "../types"
import type { FieldTypeLookup } from "./types"

/** The bar + marks COMBO signature: `x + y + length` (no angle, no r) with
 * the Length panel's "Draw as" set to bars (`length.render === "bars"`).
 * Without that setting the same signature is scatter's line-segment plot,
 * so the toggle is what opts the user in — the default stays segments.
 *
 * Which way the bars run is decided by the position variables' types, the
 * way the user would read them: the bars stand on the CATEGORY axis and the
 * other position variable rides the MEASURE axis alongside the bars.
 *  - `"x"` (combo-x, vertical bars): the default. x is the category axis
 *    and y draws as marks on the measure axis.
 *  - `"y"` (combo-y, horizontal bars): only when y reads as a category
 *    and x is the lone quantitative position — a horizontal bar chart with
 *    the x variable's marks beside the bars.
 * Both quantitative (or no type lookup) falls to vertical, the common combo
 * chart (bars by period with a line over them). */
export const comboOrientation = (
	encodings: Encodings,
	getType?: FieldTypeLookup,
	channelConfigs?: ChannelConfigs
): "x" | "y" | null => {
	const xField = encodings.x?.field
	const yField = encodings.y?.field
	if (!xField || !yField || !encodings.length?.field) return null
	if (encodings.angle?.field || encodings.r?.field) return null
	if (channelConfigs?.length?.render !== "bars") return null
	const xQuant = getType?.(xField) === "quantitative"
	const yQuant = getType?.(yField) === "quantitative"
	return xQuant && !yQuant ? "y" : "x"
}
