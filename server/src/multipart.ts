/** A minimal, strict multipart/form-data reader for a buffered request
 *  body. The server is zero-dependency by policy, and the only multipart
 *  route is the thumbnail upload, so this stays deliberately small: no streaming, no nested multipart, no
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

export type MultipartPart = MultipartFile & {
	/** The Content-Disposition `name`. */
	name: string
}

/** Every part of a multipart/form-data body, in order. Strict by design —
 *  this guards an upload route, and a browser's FormData encoding is
 *  regular enough that anything looser is a request no client of ours
 *  sent: the body must open with the delimiter (no preamble), every
 *  delimiter line ends in a bare CRLF, every part carries a header block
 *  and a `form-data` Content-Disposition with a name, and the body ends
 *  at the closing `--boundary--` (one trailing CRLF allowed, nothing
 *  after). Throws on any violation — callers map that to a 400. */
export const parseMultipart = (body: Buffer, boundary: string): MultipartPart[] => {
	const delimiter = Buffer.from(`--${boundary}`)
	const nextDelimiter = Buffer.concat([CRLF, delimiter])
	if (!body.subarray(0, delimiter.length).equals(delimiter)) {
		throw new Error("multipart body does not open with its boundary")
	}
	const parts: MultipartPart[] = []
	let cursor = delimiter.length
	for (;;) {
		if (body[cursor] === 0x2d && body[cursor + 1] === 0x2d) {
			// The closing delimiter. A single CRLF may follow it; nothing else.
			const rest = body.subarray(cursor + 2)
			if (rest.length === 0 || rest.equals(CRLF)) return parts
			throw new Error("multipart body has data after its closing boundary")
		}
		if (!body.subarray(cursor, cursor + CRLF.length).equals(CRLF)) {
			throw new Error("multipart delimiter line is malformed")
		}
		const lineEnd = cursor
		// Each part's data runs up to the CRLF that precedes the next delimiter.
		const next = body.indexOf(nextDelimiter, lineEnd + CRLF.length)
		if (next === -1) throw new Error("multipart part is unterminated")
		// Searching from the delimiter line's own CRLF finds an empty header
		// block too; the match must sit inside this part, not a later one.
		const headersEnd = body.indexOf(HEADER_END, lineEnd)
		if (headersEnd === -1 || headersEnd + HEADER_END.length > next) {
			throw new Error("multipart part has no header block")
		}
		const headers = parseHeaders(
			body.subarray(lineEnd + CRLF.length, headersEnd).toString("latin1")
		)
		const disposition = parseDisposition(headers.get("content-disposition") ?? "")
		if (!disposition.formData || disposition.name === null) {
			throw new Error("multipart part has no form-data name")
		}
		parts.push({
			name: disposition.name,
			filename: disposition.filename,
			contentType: headers.get("content-type") ?? null,
			data: body.subarray(headersEnd + HEADER_END.length, next),
		})
		cursor = next + nextDelimiter.length
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
): { formData: boolean; name: string | null; filename: string | null } => {
	const read = (key: string): string | null => {
		const match = new RegExp(`(?:^|;)\\s*${key}=(?:"([^"]*)"|([^;]*))`, "i").exec(value)
		if (!match) return null
		return (match[1] ?? match[2] ?? "").trim()
	}
	const formData = value.split(";")[0]?.trim().toLowerCase() === "form-data"
	return { formData, name: read("name"), filename: read("filename") }
}
