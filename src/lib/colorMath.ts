/** Hex ⇄ HSV conversion for the custom color picker. HSV (not HSL) because
 *  that's the model the familiar "big swath" picker exposes: a square where
 *  x is saturation and y is value (brightness) under a fixed hue, plus a hue
 *  strip. Alpha is ignored on the way in and never emitted. */

export type Hsv = {
	/** Degrees, 0–360 (360 is folded onto 0). */
	h: number
	/** 0–100. */
	s: number
	/** 0–100. */
	v: number
}

const clamp = (n: number, lo: number, hi: number) =>
	Math.min(hi, Math.max(lo, n))

/** Parses 3-, 6- or 8-digit hex (with or without the `#`) into 0–255 RGB.
 *  Returns null for anything else so callers can fall back. */
export const hexToRgb = (
	hex: string
): { r: number; g: number; b: number } | null => {
	const m = /^#?([\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i.exec(hex.trim())
	if (!m) return null
	let digits = m[1]
	if (digits.length === 3)
		digits = digits
			.split("")
			.map((d) => d + d)
			.join("")
	return {
		r: parseInt(digits.slice(0, 2), 16),
		g: parseInt(digits.slice(2, 4), 16),
		b: parseInt(digits.slice(4, 6), 16),
	}
}

/** 6-digit uppercase hex with a leading `#`. */
export const rgbToHex = (r: number, g: number, b: number): string =>
	"#" +
	[r, g, b]
		.map((n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0"))
		.join("")
		.toUpperCase()

export const rgbToHsv = (r: number, g: number, b: number): Hsv => {
	const rn = r / 255
	const gn = g / 255
	const bn = b / 255
	const max = Math.max(rn, gn, bn)
	const min = Math.min(rn, gn, bn)
	const d = max - min
	let h = 0
	if (d !== 0) {
		if (max === rn) h = ((gn - bn) / d) % 6
		else if (max === gn) h = (bn - rn) / d + 2
		else h = (rn - gn) / d + 4
		h *= 60
		if (h < 0) h += 360
	}
	const s = max === 0 ? 0 : (d / max) * 100
	return { h, s, v: max * 100 }
}

export const hsvToRgb = ({
	h,
	s,
	v,
}: Hsv): { r: number; g: number; b: number } => {
	const hh = (((h % 360) + 360) % 360) / 60
	const sn = clamp(s, 0, 100) / 100
	const vn = clamp(v, 0, 100) / 100
	const c = vn * sn
	const x = c * (1 - Math.abs((hh % 2) - 1))
	const m = vn - c
	// One sextant of the hue circle per row.
	const sextants: Array<[number, number, number]> = [
		[c, x, 0],
		[x, c, 0],
		[0, c, x],
		[0, x, c],
		[x, 0, c],
		[c, 0, x],
	]
	const [r, g, b] = sextants[Math.min(Math.floor(hh), 5)]
	return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 }
}

/** Null for unparseable input (the picker then keeps its current state). */
export const hexToHsv = (hex: string): Hsv | null => {
	const rgb = hexToRgb(hex)
	return rgb ? rgbToHsv(rgb.r, rgb.g, rgb.b) : null
}

export const hsvToHex = (hsv: Hsv): string => {
	const { r, g, b } = hsvToRgb(hsv)
	return rgbToHex(r, g, b)
}

/** True when two hex strings name the same color (case and 3-digit
 *  shorthand aside; alpha ignored). */
export const sameHex = (a: string, b: string): boolean => {
	const ra = hexToRgb(a)
	const rb = hexToRgb(b)
	return !!ra && !!rb && ra.r === rb.r && ra.g === rb.g && ra.b === rb.b
}
