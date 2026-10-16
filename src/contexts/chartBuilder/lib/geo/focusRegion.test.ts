import { geoPath, geoNaturalEarth1 } from "d3-geo"
import { describe, expect, it } from "vitest"

import type { Feature } from "geojson"

import { FOCUS_REGIONS } from "../mapConfig"
import {
	FOCUS_REGION_BOUNDS,
	featuresViewport,
	focusRegionGeoJson,
} from "./focusRegion"

describe("focusRegionGeoJson", () => {
	it("returns null for auto (callers fall back to fitting the geometry)", () => {
		expect(focusRegionGeoJson("auto")).toBeNull()
	})

	it("builds a closed polygon ring within the region's bounds for every region", () => {
		for (const region of FOCUS_REGIONS) {
			const feature = focusRegionGeoJson(region)
			expect(feature).not.toBeNull()
			expect(feature!.geometry.type).toBe("Polygon")
			const ring = (feature!.geometry as GeoJSON.Polygon).coordinates[0]
			// Closed ring: first point equals last.
			expect(ring[0]).toEqual(ring[ring.length - 1])

			// Every vertex sits within the declared bounds (densified edges never
			// stray outside the box).
			const [[west, south], [east, north]] = FOCUS_REGION_BOUNDS[region]
			for (const [lon, lat] of ring) {
				expect(lon).toBeGreaterThanOrEqual(west)
				expect(lon).toBeLessThanOrEqual(east)
				expect(lat).toBeGreaterThanOrEqual(south)
				expect(lat).toBeLessThanOrEqual(north)
			}
		}
	})

	it("produces a fittable region (non-degenerate projected bounds)", () => {
		// The whole point is to drive `fitSize`; a degenerate (zero-area)
		// projected bbox would zoom to a point. Project Europe and assert the
		// path bounds have real width + height.
		const feature = focusRegionGeoJson("europe")!
		const proj = geoNaturalEarth1()
		const [[x0, y0], [x1, y1]] = geoPath(proj).bounds(feature)
		expect(x1 - x0).toBeGreaterThan(0)
		expect(y1 - y0).toBeGreaterThan(0)
	})

	it("winds clockwise so fitSize zooms IN, not out (d3-geo spherical interior)", () => {
		// Regression guard for the winding-order gotcha: a counterclockwise ring
		// makes d3-geo read the box as the whole-globe complement, so fitSize
		// fits the entire sphere and the focus is a no-op. A correctly wound
		// (clockwise) region must fit at a MUCH larger scale than the full
		// sphere — i.e. it actually zooms in on the region.
		for (const region of FOCUS_REGIONS) {
			const regionProj = geoNaturalEarth1()
			regionProj.fitSize([600, 400], focusRegionGeoJson(region)! as never)
			const sphereProj = geoNaturalEarth1()
			sphereProj.fitSize([600, 400], { type: "Sphere" } as never)
			expect(regionProj.scale()).toBeGreaterThan(sphereProj.scale())
		}
	})
})

/** A lon/lat rectangle feature, built like `bboxRing` in focusRegion.ts:
 *  wound CLOCKWISE (SW → NW → NE → SE) because d3-geo is spherical — a
 *  counterclockwise ring reads as the whole globe EXCEPT the box and
 *  geoBounds returns the world — and densified every 1° because geoBounds
 *  follows great-circle arcs between vertices, so a 4-corner box's north
 *  edge would bulge poleward. Real basemap features wind correctly and
 *  carry many vertices already. */
const box = (
	west: number,
	south: number,
	east: number,
	north: number
): Feature => {
	const ring: [number, number][] = []
	for (let lat = south; lat < north; lat += 1) ring.push([west, lat])
	for (let lon = west; lon < east; lon += 1) ring.push([lon, north])
	for (let lat = north; lat > south; lat -= 1) ring.push([east, lat])
	for (let lon = east; lon > west; lon -= 1) ring.push([lon, south])
	ring.push([west, south])
	return {
		type: "Feature",
		properties: {},
		geometry: { type: "Polygon", coordinates: [ring] },
	}
}

describe("featuresViewport", () => {
	it("returns null when there is nothing to frame", () => {
		expect(featuresViewport([])).toBeNull()
	})

	it("frames the features' lon/lat extent with a margin on every side", () => {
		// A Washington-ish box: 7.9° wide, 3.5° tall → 10% pads are below the
		// 1° floor, so each side gets exactly 1°.
		const vp = featuresViewport([box(-124.8, 45.5, -116.9, 49)])!
		expect(vp).not.toBeNull()
		expect(vp.west).toBeCloseTo(-125.8, 1)
		expect(vp.east).toBeCloseTo(-115.9, 1)
		expect(vp.south).toBeCloseTo(44.5, 1)
		expect(vp.north).toBeCloseTo(50, 1)
	})

	it("pads 10% of the span once that exceeds the 1° floor", () => {
		// 40° wide, 20° tall → 4° and 2° pads.
		const vp = featuresViewport([box(-100, 30, -60, 50)])!
		expect(vp.west).toBeCloseTo(-104, 1)
		expect(vp.east).toBeCloseTo(-56, 1)
		expect(vp.south).toBeCloseTo(28, 1)
		expect(vp.north).toBeCloseTo(52, 1)
	})

	it("spans the union of several features", () => {
		// West/north come from WA, east/south from OR, each padded 1°.
		const vp = featuresViewport([
			box(-124.8, 45.5, -116.9, 49), // WA
			box(-124.6, 42, -116.5, 46.3), // OR
		])!
		expect(vp.west).toBeCloseTo(-125.8, 1)
		expect(vp.east).toBeCloseTo(-115.5, 1)
		expect(vp.south).toBeCloseTo(41, 1)
		expect(vp.north).toBeCloseTo(50, 1)
	})

	it("returns null for a set that straddles the antimeridian (west > east)", () => {
		// Aleutian-style: a sliver east of +170 and one west of −170. geoBounds
		// reports the SHORT way round (west ≈ 170, east ≈ −170), which isn't a
		// simple west<east box — callers fall back to the level default.
		expect(
			featuresViewport([box(170, 51, 179, 53), box(-179, 51, -170, 53)])
		).toBeNull()
	})
})
