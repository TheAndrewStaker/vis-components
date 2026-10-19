/** Server-mode thumbnail transport. A visual's thumbnail is a PNG data URL
 *  in memory (and in the browser-local side-table), but on the wire to the
 *  self-host server it travels as a multipart FILE part: the base64 run
 *  inside the visual's JSON tripped the SQL-injection rules of the WAF in
 *  front of the hosted deployment (CRS 942180). A file part is binary the
 *  WAF never treats as a query argument. The server stores the same data
 *  URL it always did, so nothing downstream of the upload changes. */

const PNG_DATA_URL_PREFIX = "data:image/png;base64,"

/** The PNG bytes behind a `data:image/png;base64,…` URL as a File named
 *  the way the server route reads it, or null when the URL is not a base64
 *  PNG (the caller falls back to the inline JSON path the server still
 *  accepts, rather than drop the preview). A File rather than a bare Blob
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
