/** Convert a client (screen) point into an SVG element's own user space via
 *  its screen CTM, so pointer coordinates can be compared against geometry
 *  drawn in that element's coordinate system (mark centers, projection
 *  pixels) regardless of panel offsets / facet transforms. Returns null in
 *  environments without `getScreenCTM` (happy-dom / jsdom).
 *
 *  The multiply is written out against the inverse matrix's `a…f` rather
 *  than going through `DOMPoint.matrixTransform`, so tests can stub
 *  `getScreenCTM` with a plain `{ inverse: () => ({ a, b, c, d, e, f }) }`. */
export const clientToSvgLocal = (
	el: SVGGraphicsElement,
	clientX: number,
	clientY: number
): [number, number] | null => {
	const ctm = el.getScreenCTM?.()
	if (!ctm) return null
	const m = ctm.inverse()
	return [
		m.a * clientX + m.c * clientY + m.e,
		m.b * clientX + m.d * clientY + m.f,
	]
}
