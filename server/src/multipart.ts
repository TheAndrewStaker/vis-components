/** A minimal multipart/form-data reader — just enough to pull ONE named file
 *  part out of a buffered request body. The server is zero-dependency by
 *  policy, and the only multipart route is the thumbnail upload, so this
 *  stays deliberately small: no streaming, no nested multipart, no
 *  content-transfer-encoding (browsers never set one for FormData).
 *
 *  Everything works on Buffers, never on decoded strings: a file part is
 *  binary, and a UTF-8 round trip would corrupt it. */

export type MultipartFile = {
	/** The `filename` from Content-Disposition, or null for a plain field. */
	filename: string | null
	/** The part's own Content-Type header, or null when absent. */
	contentType: string | null
	data: Buffer
}

const CRLF = Buffer.from("\r\n")
const HEADER_END = Buffer.from("\r\n\r\n")

/** The boundary a `multipart/form-data` Content-Type names, or null when the
 *  header is a different media type or carries no boundary. */
export const multipartBoundary = (contentType: string | undefined): string | null => {
	if (!contentType) return null
	const [mediaType, ...params] = contentType.split(";")
	if (mediaType?.trim().toLowerCase() !== "multipart/form-data") return null
	for (const param of params) {
		const eq = param.indexOf("=")
		if (eq === -1) continue
		if (param.slice(0, eq).trim().toLowerCase() !== "boundary") continue
		const value = param.slice(eq + 1).trim()
		const unquoted =
			value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value
		return unquoted.length > 0 ? unquoted : null
	}
	return null
}

/** Find the first part whose Content-Disposition `name` is `fieldName`, or
 *  null when the body holds no such part. Throws on a body that is not
 *  well-formed multipart (no opening delimiter, a part without a header
 *  block, an unterminated part) — callers map that to a 400. */
export const findMultipartPart = (
	body: Buffer,
	boundary: string,
	fieldName: string
): MultipartFile | null => {
	const delimiter = Buffer.from(`--${boundary}`)
	let cursor = body.indexOf(delimiter)
	if (cursor === -1) throw new Error("multipart body has no opening boundary")
	for (;;) {
		cursor += delimiter.length
		// The closing delimiter is `--boundary--`; anything else after the
		// delimiter is the (optional) transport padding then CRLF.
		if (body[cursor] === 0x2d && body[cursor + 1] === 0x2d) return null
		const lineEnd = body.indexOf(CRLF, cursor)
		if (lineEnd === -1) throw new Error("multipart delimiter line is unterminated")
		const headersStart = lineEnd + CRLF.length
		const headersEnd = body.indexOf(HEADER_END, headersStart)
		if (headersEnd === -1) throw new Error("multipart part has no header block")
		const headers = parseHeaders(body.subarray(headersStart, headersEnd).toString("latin1"))
		const dataStart = headersEnd + HEADER_END.length
		// Each part's data runs up to the CRLF that precedes the next delimiter.
		const next = body.indexOf(Buffer.concat([CRLF, delimiter]), dataStart)
		if (next === -1) throw new Error("multipart part is unterminated")
		const disposition = parseDisposition(headers.get("content-disposition") ?? "")
		if (disposition.name === fieldName) {
			return {
				filename: disposition.filename,
				contentType: headers.get("content-type") ?? null,
				data: body.subarray(dataStart, next),
			}
		}
		cursor = next + CRLF.length
	}
}

const parseHeaders = (block: string): Map<string, string> => {
	const headers = new Map<string, string>()
	for (const line of block.split("\r\n")) {
		const colon = line.indexOf(":")
		if (colon === -1) continue
		headers.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim())
	}
	return headers
}

/** `form-data; name="thumbnail"; filename="thumbnail.png"` → its two names.
 *  Browsers percent-escape quotes and CR/LF inside the values (and never put
 *  a raw `"` there), so a quoted value runs to the next quote. */
const parseDisposition = (
	value: string
): { name: string | null; filename: string | null } => {
	const read = (key: string): string | null => {
		const match = new RegExp(`(?:^|;)\\s*${key}=(?:"([^"]*)"|([^;]*))`, "i").exec(value)
		if (!match) return null
		return (match[1] ?? match[2] ?? "").trim()
	}
	return { name: read("name"), filename: read("filename") }
}
