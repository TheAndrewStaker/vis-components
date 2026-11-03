/** Physical-size stamp for a PNG: the `pHYs` chunk, in pixels per metre.
 *  The published-embed picture is rasterized at 2 CSS px per px (see
 *  `publishEmbedImage`) so it stays crisp when projected; without a stamp a
 *  consumer would place it at twice its size. PowerPoint honours `pHYs` for a
 *  native picture, and the Zafiro add-in reads it to size the slide shape so
 *  12pt in the app is 12pt on the slide. */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const INCHES_PER_METRE = 1 / 0.0254

const CRC_TABLE = (() => {
	const table = new Uint32Array(256)
	for (let n = 0; n < 256; n++) {
		let c = n
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
		table[n] = c >>> 0
	}
	return table
})()

const crc32 = (bytes: Uint8Array): number => {
	let crc = 0xffffffff
	for (const b of bytes) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8)
	return (crc ^ 0xffffffff) >>> 0
}

const isPng = (bytes: Uint8Array): boolean =>
	bytes.length >= 8 && PNG_SIGNATURE.every((b, i) => bytes[i] === b)

/** Walk the chunks: [offset of length field, type, data start, data length]. */
const chunks = function* (bytes: Uint8Array) {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
	let at = 8
	while (at + 12 <= bytes.length) {
		const length = view.getUint32(at)
		const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8))
		yield { at, type, dataAt: at + 8, length }
		at += 12 + length
	}
}

/** Dots per inch recorded in the PNG's `pHYs` chunk, or null when absent
 *  (or in the chunk's "unknown unit" form). */
export const readPngDpi = (bytes: Uint8Array): number | null => {
	if (!isPng(bytes)) return null
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
	for (const c of chunks(bytes)) {
		if (c.type !== "pHYs" || c.length < 9) continue
		if (view.getUint8(c.dataAt + 8) !== 1) return null
		return view.getUint32(c.dataAt) / INCHES_PER_METRE
	}
	return null
}

/** The same PNG with its physical size set to `dpi` (an existing `pHYs` is
 *  replaced; otherwise one goes in right after `IHDR`, where the spec puts
 *  it). Returns the input untouched when it is not a PNG. */
export const stampPngDpi = (bytes: Uint8Array, dpi: number): Uint8Array => {
	if (!isPng(bytes) || !(dpi > 0)) return bytes
	const ppm = Math.round(dpi * INCHES_PER_METRE)
	const chunk = new Uint8Array(4 + 4 + 9 + 4)
	const view = new DataView(chunk.buffer)
	view.setUint32(0, 9)
	chunk.set([0x70, 0x48, 0x59, 0x73], 4) // "pHYs"
	view.setUint32(8, ppm)
	view.setUint32(12, ppm)
	view.setUint8(16, 1) // unit: metre
	view.setUint32(17, crc32(chunk.subarray(4, 17)))

	let insertAt = -1
	let removeAt = -1
	let removeLength = 0
	for (const c of chunks(bytes)) {
		if (c.type === "IHDR") insertAt = c.at + 12 + c.length
		if (c.type === "pHYs") {
			removeAt = c.at
			removeLength = 12 + c.length
			break
		}
	}
	if (insertAt < 0) return bytes
	const head = bytes.subarray(0, removeAt >= 0 ? removeAt : insertAt)
	const tail = bytes.subarray(removeAt >= 0 ? removeAt + removeLength : insertAt)
	const out = new Uint8Array(head.length + chunk.length + tail.length)
	out.set(head, 0)
	out.set(chunk, head.length)
	out.set(tail, head.length + chunk.length)
	return out
}
