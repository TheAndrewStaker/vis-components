/** Server-mode thumbnail transport. A visual's thumbnail is a PNG data URL
 *  in memory (and in the browser-local side-table), but on the wire to the
 *  self-host server it travels as a multipart FILE part: the base64 run
 *  inside the visual's JSON tripped the SQL-injection rules of the WAF in
 *  front of the hosted deployment (CRS 942180). A file part is binary the
 *  WAF never treats as a query argument. The server stores the same data
 *  URL it always did, so nothing downstream of the upload changes. */

const PNG_DATA_URL_PREFIX = "data:image/png;base64,"
/** The eight bytes every PNG starts with — the same check the server route
 *  makes, so a payload it would 400 is caught before the upload. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** The PNG bytes behind a `data:image/png;base64,…` URL as a File named
 *  the way the server route reads it, or null when the URL is not a base64
 *  PNG: another media type, undecodable base64, or bytes without the PNG
 *  signature. The caller then sends no preview at all — never the inline
 *  JSON, which is the shape the WAF rejects. A File rather than a bare Blob
 *  so the filename is the File's own: the WAF classifies a part WITH a
 *  filename as an upload rather than a form argument, which is the whole
 *  point of this transport. */
export const pngFileFromDataUrl = (dataUrl: string): File | null => {
	if (!dataUrl.startsWith(PNG_DATA_URL_PREFIX)) return null
	let binary: string
	try {
		// atob is the direct base64 decoder for a data URL's payload (the
		// embed runtime's boot.ts decodes its font binaries the same way).
		// eslint-disable-next-line no-restricted-globals
		binary = atob(dataUrl.slice(PNG_DATA_URL_PREFIX.length))
	} catch {
		return null
	}
	const bytes = new Uint8Array(binary.length)
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
	if (!PNG_SIGNATURE.every((byte, i) => bytes[i] === byte)) return null
	return new File([bytes], "thumbnail.png", { type: "image/png" })
}

/** The one field name the server route reads. Handed to fetch as the body
 *  with NO content-type header, so the browser writes the multipart
 *  boundary itself. */
export const thumbnailFormData = (png: File): FormData => {
	const form = new FormData()
	form.append("thumbnail", png)
	return form
}
