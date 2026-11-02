// "Outward" data-label alignment on the polar charts (pies, sunburst rings):
// the text hangs AWAY from the figure's center — left-aligned (starting at
// its anchor) on the right side, right-aligned (ending at its anchor) on the
// left, centered within a narrow band of straight up / down where neither
// side reads right. Left / center / right are screen directions and suit a
// cartesian chart; around a pie the sensible alignment flips with the side
// the label is on, which this resolves per label from its angle.

/** Half-width (degrees) of the band around 12 and 6 o'clock in which an
 *  outward label is centered rather than hung to one side. */
export const OUTWARD_CENTER_BAND_DEG = 10

/** The concrete alignment an "outward" label takes at `angle` — radians in
 *  the d3 arc convention (0 = 12 o'clock, growing clockwise). */
export const outwardAlignmentFor = (
	angle: number
): "left" | "center" | "right" => {
	const s = Math.sin(angle)
	const band = Math.sin((OUTWARD_CENTER_BAND_DEG * Math.PI) / 180)
	return s > band ? "left" : s < -band ? "right" : "center"
}

/** `alignment` with "outward" resolved for one label: its anchor's own
 *  outward side when the renderer worked one out, else centered (a
 *  cartesian chart can't say which way is outward). */
export const resolveOutwardAlignment = (
	alignment: "left" | "center" | "right" | "outward" | undefined,
	outwardAlign: "left" | "center" | "right" | undefined
): "left" | "center" | "right" | undefined =>
	alignment === "outward" ? (outwardAlign ?? "center") : alignment
