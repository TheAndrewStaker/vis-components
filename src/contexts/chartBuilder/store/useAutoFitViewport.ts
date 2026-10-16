import { useMemo } from "react"
import { useAtomValue } from "jotai"

import { featuresViewport } from "../lib/geo/focusRegion"
import { matchedRowIsNoData } from "../lib/geo/geoMarkStyle"
import { featureId } from "../lib/geo/loadGeometry"
import type { GeoViewport } from "../lib/mapConfig"
import { currentEncodingsAtom, currentMapConfigAtom } from "./atoms"
import { renderChannelConfigsAtom } from "./renderConfigs"
import { useAestheticScales } from "./useAestheticScales"
import { useCurrentDatasetView } from "./useCurrentDatasetView"
import { useEffectiveGeographyLevel } from "./useEffectiveGeographyLevel"
import { useGeoJoin } from "./useGeoJoin"
import { useGeometry } from "./useGeometry"

// Stable identity so the join memo doesn't churn while no dataset is bound.
const EMPTY_ROWS: Array<Record<string, unknown>> = []

/**
 * The lon/lat box "Whole map (auto)" is framing when the map draws ONLY its
 * data-bearing regions (the choropleth with "Fill regions with no data" off —
 * see useGeoMapScaffold's `fitToMatchedRegions`). The Maps section seeds the
 * Custom focus (and "Reset view") from it, so switching to Custom starts from
 * the view on screen — Washington stays Washington — instead of jumping back
 * to the geography-level default.
 *
 * Null whenever auto frames the whole geometry instead: `enabled` false,
 * geometry still loading, nothing drawn (nothing joined, or every joined row
 * painted as no-data), or a drawn set that straddles the antimeridian.
 * Callers fall back to `levelDefaultViewport`.
 *
 * Mirrors the scaffold's own resolution (same level hook, same join over the
 * whole dataset, same keyType override, same no-data predicate) so the seed
 * can't disagree with the frame on screen. `loadGeometry` memoizes per level, so this shares the
 * renderer's load rather than fetching again.
 */
export const useAutoFitViewport = (enabled: boolean): GeoViewport | null => {
	const encodings = useAtomValue(currentEncodingsAtom)
	const mapConfig = useAtomValue(currentMapConfigAtom)
	const dataset = useCurrentDatasetView()
	const level = useEffectiveGeographyLevel()
	const { bundle } = useGeometry(enabled ? level : null)
	const matched = useGeoJoin(
		bundle,
		enabled ? encodings.connection.field : null,
		dataset?.rows ?? EMPTY_ROWS,
		mapConfig.keyType
	)
	// Drawn = joined AND not painted as no-data (a blank/NA measure), decided
	// exactly as the renderer decides it (matchedRowIsNoData, same scales and
	// configs).
	const aestheticScales = useAestheticScales()
	const channelConfigs = useAtomValue(renderChannelConfigsAtom)
	const measureField =
		aestheticScales.hue?.field ?? aestheticScales.opacity?.field ?? null
	return useMemo(() => {
		if (!enabled || !bundle || matched.size === 0) return null
		return featuresViewport(
			bundle.features.filter((f) => {
				const row = matched.get(featureId(f))
				return (
					row !== undefined &&
					!matchedRowIsNoData(row, measureField, aestheticScales, channelConfigs)
				)
			})
		)
	}, [enabled, bundle, matched, measureField, aestheticScales, channelConfigs])
}
