/** Pixel size of a PNG data URL, read from its IHDR header without decoding
 *  the image. The first 24 bytes of every PNG are the signature, the IHDR
 *  chunk length and type, then width and height as big-endian 32-bit ints
 *  — 32 base64 characters, so this costs nothing per visual on a library
 *  render. Null for anything that isn't a base64 PNG with a readable
 *  header. */

const PNG_DATA_URL_PREFIX = "data:image/png;base64,"
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
/** Bytes 0–23: signature (8) + IHDR length (4) + "IHDR" (4) + width (4) +
 *  height (4). 24 bytes is exactly 32 base64 characters. */
const HEADER_BYTES = 24
const HEADER_CHARS = 32

const readUint32 = (bytes: Uint8Array, at: number): number =>
	((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0

export const pngDataUrlDimensions = (
	dataUrl: string
): { width: number; height: number } | null => {
	if (!dataUrl.startsWith(PNG_DATA_URL_PREFIX)) return null
	const head = dataUrl.slice(
		PNG_DATA_URL_PREFIX.length,
		PNG_DATA_URL_PREFIX.length + HEADER_CHARS
	)
	if (head.length < HEADER_CHARS) return null
	let binary: string
	try {
		// atob is the direct base64 decoder for a data URL's payload (the
		// thumbnail upload decodes the same way).
		// eslint-disable-next-line no-restricted-globals
		binary = atob(head)
	} catch {
		return null
	}
	if (binary.length < HEADER_BYTES) return null
	const bytes = new Uint8Array(HEADER_BYTES)
	for (let i = 0; i < HEADER_BYTES; i++) bytes[i] = binary.charCodeAt(i)
	if (!PNG_SIGNATURE.every((byte, i) => bytes[i] === byte)) return null
	// "IHDR" at bytes 12–15.
	if (String.fromCharCode(...bytes.subarray(12, 16)) !== "IHDR") return null
	const width = readUint32(bytes, 16)
	const height = readUint32(bytes, 20)
	if (width === 0 || height === 0) return null
	return { width, height }
}
