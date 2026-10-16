import { geoBounds } from "d3-geo"
import type { Feature } from "geojson"

import type { FocusRegion, GeographyLevel, GeoViewport } from "../mapConfig"
import { clampViewport } from "./viewportMath"

/** Human-readable labels for the Focus dropdown. */
export const FOCUS_REGION_LABELS: Record<FocusRegion, string> = {
	northAmerica: "North America",
	southAmerica: "South America",
	centralAmerica: "Central America",
	europe: "Europe",
	asia: "Asia",
	africa: "Africa",
	middleEast: "Middle East",
	oceania: "Oceania",
	australia: "Australia",
	antarctica: "Antarctica",
}

/**
 * Approximate lon/lat bounding box per region as `[[west, south], [east,
 * north]]`. These drive `fitTo` (the projection fits its rect to the box), so
 * they're framing hints, not precise borders — generous enough to keep the
 * whole region in view without a lot of empty margin. All stay within a single
 * −180…180 longitude span (no antimeridian crossing) so the projected box stays
 * a simple rectangle.
 */
export const FOCUS_REGION_BOUNDS: Record<
	FocusRegion,
	[[number, number], [number, number]]
> = {
	northAmerica: [
		[-168, 7],
		[-52, 83],
	],
	southAmerica: [
		[-82, -56],
		[-34, 13],
	],
	centralAmerica: [
		[-93, 6],
		[-77, 19],
	],
	europe: [
		[-25, 34],
		[40, 72],
	],
	asia: [
		[40, 5],
		[150, 78],
	],
	africa: [
		[-20, -36],
		[52, 38],
	],
	middleEast: [
		[34, 12],
		[63, 42],
	],
	oceania: [
		[110, -50],
		[180, 0],
	],
	australia: [
		[112, -44],
		[154, -10],
	],
	antarctica: [
		[-180, -85],
		[180, -60],
	],
}

// Build a densified rectangular ring (lon/lat) for a bbox.
//
// Two things matter here:
//  1. Winding order. d3-geo treats geometry as SPHERICAL, where a polygon's
//     interior is the region to the RIGHT of the ring (exterior rings must be
//     CLOCKWISE for an area smaller than a hemisphere). Wind it the other way
//     and d3 reads the box as "the whole globe EXCEPT this rectangle", so
//     `fitSize` fits the entire world and the focus does nothing. We therefore
//     wind CLOCKWISE in lon/lat space: SW → NW → NE → SE → SW.
//  2. Densified edges. World projections curve meridians/parallels, so a
//     4-corner box would under-fit (the bulge between corners projects beyond
//     them). Sampling every few degrees captures the true projected extent.
const bboxRing = (
	west: number,
	south: number,
	east: number,
	north: number
): [number, number][] => {
	const STEP = 5
	const ring: [number, number][] = []
	for (let lat = south; lat < north; lat += STEP) ring.push([west, lat]) // W edge, S→N
	for (let lon = west; lon < east; lon += STEP) ring.push([lon, north]) // N edge, W→E
	for (let lat = north; lat > south; lat -= STEP) ring.push([east, lat]) // E edge, N→S
	for (let lon = east; lon > west; lon -= STEP) ring.push([lon, south]) // S edge, E→W
	ring.push([west, south]) // close the ring
	return ring
}

/** GeoJSON polygon covering a lon/lat viewport box, suitable as a projection's
 *  `fitTo`. Shared by the region focus and the custom (drag) focus. */
export const viewportGeoJson = (vp: GeoViewport): Feature => ({
	type: "Feature",
	properties: {},
	geometry: {
		type: "Polygon",
		coordinates: [bboxRing(vp.west, vp.south, vp.east, vp.north)],
	},
})

/** The lon/lat viewport for a focus region (its predefined bounding box). */
export const regionViewport = (region: FocusRegion): GeoViewport => {
	const [[west, south], [east, north]] = FOCUS_REGION_BOUNDS[region]
	return { west, south, east, north }
}

/** A sensible starting viewport when the user switches to Custom focus from
 *  `"auto"` — approximates what the auto view shows for that geography level
 *  (CONUS for US levels, the whole world for countries). Used to seed
 *  `customViewport` so Custom starts "from the current view". */
export const levelDefaultViewport = (
	level: GeographyLevel | "auto"
): GeoViewport =>
	level === "countries"
		? { west: -170, south: -55, east: 180, north: 80 }
		: // states / counties / zcta / auto → continental US (incl. a margin)
			{ west: -128, south: 23, east: -66, north: 50 }

/** The lon/lat viewport that frames a set of features — what "Whole map
 *  (auto)" shows when only the data-bearing regions draw (see
 *  useGeoMapScaffold's `fitToMatchedRegions`). Padded on every side (10% of
 *  the span, at least 1°) because the Custom focus COVERS the plot rect and
 *  so crops the box's looser axis — the regions must still start in view.
 *  Null when there is nothing to frame, or when the features straddle the
 *  antimeridian (Alaska's Aleutians put west > east): the box must stay a
 *  simple west<east rectangle, so callers fall back to the level default. */
export const featuresViewport = (features: Feature[]): GeoViewport | null => {
	if (features.length === 0) return null
	const [[west, south], [east, north]] = geoBounds({
		type: "FeatureCollection",
		features,
	})
	if (!(west < east) || !(south < north)) return null
	const padLon = Math.max(1, (east - west) * 0.1)
	const padLat = Math.max(1, (north - south) * 0.1)
	return clampViewport({
		west: west - padLon,
		east: east + padLon,
		south: south - padLat,
		north: north + padLat,
	})
}

/**
 * GeoJSON polygon covering a focus region's bounding box, suitable as a
 * projection's `fitTo`. Returns `null` for `"auto"` so callers fall back to
 * fitting the loaded geometry. Shared by every geographic renderer so the
 * framing can never drift between them.
 */
export const focusRegionGeoJson = (
	region: FocusRegion | "auto"
): Feature | null =>
	region === "auto" ? null : viewportGeoJson(regionViewport(region))
