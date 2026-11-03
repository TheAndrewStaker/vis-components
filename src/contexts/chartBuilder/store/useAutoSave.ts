import { useEffect, useRef } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useAtomValue, useSetAtom, useStore } from "jotai"
import {
	currentAccessibilityConfigAtom,
	currentAnnotationsAtom,
	currentCaptionConfigAtom,
	currentDataTableConfigAtom,
	currentChannelConfigsAtom,
	currentDataLabelsConfigAtom,
	currentDataLabelsEncodingsAtom,
	currentDatasetIdAtom,
	currentDerivedVariablesAtom,
	currentEncodingsAtom,
	currentFieldLevelOrdersAtom,
	currentFieldLevelOrderSpecsAtom,
	currentFieldOrderAtom,
	currentFieldOverridesAtom,
	currentLabelsAtom,
	currentLegendConfigAtom,
	currentMapConfigAtom,
	currentReshapeConfigAtom,
	currentTooltipConfigAtom,
	currentVisualIdAtom,
	currentVisualNameAtom,
	embedInstancesAtom,
	republishOnSaveFor,
	republishOnSaveVisualsAtom,
	saveStatusAtom,
} from "./atoms"
import { publishedInstancesOf } from "../lib/embedInstances"
import { useRepublishVisual } from "./republishVisual"
import { useSaveVisual } from "./saveVisual"
import { useEffectiveGeographyLevel } from "./useEffectiveGeographyLevel"

const DEBOUNCE_MS = 800

/**
 * Debounced auto-save for the editor. Watches every piece of editor state and
 * persists to the current visual (creating one the first time if none exists).
 * When a new visual is created by auto-save, the router is updated so a page
 * refresh hydrates back to the correct `/editor/$visualId` route.
 *
 * Gated on `currentDatasetIdAtom` — we won't create empty visuals just because
 * the editor mounted.
 *
 * "Republish on every save": once the save lands, a visual THIS user has
 * flagged on THIS browser (`republishOnSaveVisualsAtom`, device-local) and
 * that has at least one published pin goes through the shared republish
 * (every published pin, coalesced by `republishStateAtom`, so overlapping
 * saves can't stack publishes). Both are read through the store at save
 * time, not watched: a publish rewrites the instances, and watching them
 * here would save → publish → save forever. Its errors stay in
 * `republishStateAtom` — they never break the save.
 */
export const useAutoSave = () => {
	const saveVisual = useSaveVisual()
	const navigate = useNavigate()
	const setStatus = useSetAtom(saveStatusAtom)
	const store = useStore()
	const republish = useRepublishVisual()
	// Current value in a ref so the geography level (a hook over the live
	// atoms) is read at save time without becoming a save trigger. Synced in
	// an effect, not during render; the read is 800 ms later anyway.
	const geographyLevel = useEffectiveGeographyLevel()
	const geographyLevelRef = useRef(geographyLevel)
	useEffect(() => {
		geographyLevelRef.current = geographyLevel
	}, [geographyLevel])

	const datasetId = useAtomValue(currentDatasetIdAtom)
	const visualId = useAtomValue(currentVisualIdAtom)
	const encodings = useAtomValue(currentEncodingsAtom)
	const configs = useAtomValue(currentChannelConfigsAtom)
	const labels = useAtomValue(currentLabelsAtom)
	const legend = useAtomValue(currentLegendConfigAtom)
	const tooltip = useAtomValue(currentTooltipConfigAtom)
	const dataLabelsEncodings = useAtomValue(currentDataLabelsEncodingsAtom)
	const dataLabelsConfig = useAtomValue(currentDataLabelsConfigAtom)
	const overrides = useAtomValue(currentFieldOverridesAtom)
	// Level reorders (drag/arrows/"Order by" pins) live on their own atoms;
	// leaving them unwatched meant a pure reorder never saved, so embeds and
	// image exports (which render the SAVED visual) kept the old order.
	const fieldLevelOrders = useAtomValue(currentFieldLevelOrdersAtom)
	const fieldLevelOrderSpecs = useAtomValue(currentFieldLevelOrderSpecsAtom)
	const fieldOrder = useAtomValue(currentFieldOrderAtom)
	const name = useAtomValue(currentVisualNameAtom)
	const annotations = useAtomValue(currentAnnotationsAtom)
	const caption = useAtomValue(currentCaptionConfigAtom)
	const dataTable = useAtomValue(currentDataTableConfigAtom)
	const accessibility = useAtomValue(currentAccessibilityConfigAtom)
	const mapConfig = useAtomValue(currentMapConfigAtom)
	const reshapeConfig = useAtomValue(currentReshapeConfigAtom)
	const derivedVariablesConfig = useAtomValue(currentDerivedVariablesAtom)

	// Skip the very first effect run — that's just the initial hydration
	// after a visual load; nothing has changed.
	const hydratedRef = useRef(false)

	useEffect(() => {
		if (!hydratedRef.current) {
			hydratedRef.current = true
			return
		}
		if (!datasetId) return
		setStatus("saving")
		const timer = setTimeout(async () => {
			const wasNew = !visualId
			const id = await saveVisual()
			if (wasNew) {
				// A brand-new visual can't be published yet — nothing to republish.
				await navigate({ to: "/editor/$visualId", params: { visualId: id } })
				return
			}
			const live =
				republishOnSaveFor(store.get(republishOnSaveVisualsAtom), id) &&
				publishedInstancesOf(store.get(embedInstancesAtom), id).length > 0
			if (live) {
				void republish(id, {
					includeZctaTopology: geographyLevelRef.current === "zcta",
				})
			}
		}, DEBOUNCE_MS)
		return () => clearTimeout(timer)
	}, [
		datasetId,
		visualId,
		encodings,
		configs,
		labels,
		legend,
		tooltip,
		dataLabelsEncodings,
		dataLabelsConfig,
		overrides,
		fieldLevelOrders,
		fieldLevelOrderSpecs,
		fieldOrder,
		name,
		annotations,
		caption,
		dataTable,
		accessibility,
		mapConfig,
		reshapeConfig,
		derivedVariablesConfig,
		saveVisual,
		navigate,
		setStatus,
		store,
		republish,
	])
}
