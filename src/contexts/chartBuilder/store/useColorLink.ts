import { useAtomValue } from "jotai"
import { effectiveType } from "../lib/fieldType"
import { colorLinkSource, type ColorLinkSource } from "../lib/linkedHueColors"
import {
	currentChannelConfigsAtom,
	currentEncodingsAtom,
	currentFieldOverridesAtom,
} from "./atoms"
import { useCurrentDatasetView } from "./useCurrentDatasetView"

/** The main Color mapping a secondary color control inherits palette
 *  positions from (see `linkedCategoryColors`) — so the sidebar swatches
 *  show the same defaults the render configs draw. */
export const useColorLink = (): ColorLinkSource | null => {
	const encodings = useAtomValue(currentEncodingsAtom)
	const configs = useAtomValue(currentChannelConfigsAtom)
	const overrides = useAtomValue(currentFieldOverridesAtom)
	const dataset = useCurrentDatasetView()
	const hueField = encodings.hue?.field ?? null
	if (!dataset || !hueField) return null
	return colorLinkSource(
		encodings,
		configs,
		effectiveType(dataset, hueField, overrides)
	)
}
