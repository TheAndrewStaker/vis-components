// @vitest-environment node
import { describe, expect, it } from "vitest"
import { multipartBoundary, parseMultipart } from "./multipart.js"

/** Encode a FormData the way a browser would, and hand back the exact
 *  Content-Type (boundary included) that goes with it. */
const encode = async (form: FormData): Promise<{ body: Buffer; contentType: string }> => {
	const request = new Request("http://x/", { method: "PUT", body: form })
	return {
		body: Buffer.from(await request.arrayBuffer()),
		contentType: request.headers.get("content-type") ?? "",
	}
}

describe("multipartBoundary", () => {
	it("reads a bare and a quoted boundary, case-insensitively", () => {
		expect(multipartBoundary("multipart/form-data; boundary=abc123")).toBe("abc123")
		expect(multipartBoundary('Multipart/Form-Data; Boundary="abc 123"')).toBe("abc 123")
	})

	it("is null for other media types or a missing boundary", () => {
		expect(multipartBoundary(undefined)).toBeNull()
		expect(multipartBoundary("application/json")).toBeNull()
		expect(multipartBoundary("multipart/form-data")).toBeNull()
		expect(multipartBoundary("multipart/form-data; boundary=")).toBeNull()
	})
})

/** A hand-built body, for the shapes a browser's FormData never emits. */
const raw = (...lines: string[]): Buffer => Buffer.from(lines.join("\r\n"), "latin1")
const PART_HEADER = 'Content-Disposition: form-data; name="thumbnail"; filename="t.png"'

describe("parseMultipart", () => {
	it("returns every part in order, binary intact", async () => {
		// Bytes that would not survive a UTF-8 round trip, plus a CRLF and a
		// fake boundary-looking run inside the data.
		const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe, 0x2d, 0x2d, 0x00])
		const form = new FormData()
		form.append("note", "hello")
		form.append("thumbnail", new Blob([new Uint8Array(bytes)], { type: "image/png" }), "thumbnail.png")
		const { body, contentType } = await encode(form)
		const parts = parseMultipart(body, multipartBoundary(contentType) as string)
		expect(parts.map((p) => p.name)).toEqual(["note", "thumbnail"])
		expect(parts[0]?.filename).toBeNull()
		expect(parts[0]?.data.toString()).toBe("hello")
		expect(parts[1]?.filename).toBe("thumbnail.png")
		expect(parts[1]?.contentType).toBe("image/png")
		expect(Buffer.compare(parts[1]?.data as Buffer, bytes)).toBe(0)
	})

	it("accepts the closing boundary with or without one trailing CRLF", () => {
		const parts = (tail: string) =>
			parseMultipart(raw("--b", PART_HEADER, "", "data", `--b--${tail}`), "b")
		expect(parts("")[0]?.data.toString()).toBe("data")
		expect(parts("\r\n")[0]?.data.toString()).toBe("data")
	})

	it("throws on a body that is not multipart at all", () => {
		expect(() => parseMultipart(Buffer.from("{}"), "b")).toThrow(/boundary/)
	})

	it("throws on a preamble before the opening boundary", () => {
		expect(() =>
			parseMultipart(raw("junk", "--b", PART_HEADER, "", "data", "--b--"), "b")
		).toThrow(/open/)
	})

	it("throws on an unterminated part or a missing closing boundary", () => {
		expect(() => parseMultipart(raw("--b", PART_HEADER, "", "data"), "b")).toThrow(
			/unterminated/
		)
		// The last part ends at a plain delimiter that never closes.
		expect(() => parseMultipart(raw("--b", PART_HEADER, "", "data", "--b"), "b")).toThrow(
			/unterminated|malformed/
		)
	})

	it("throws on data after the closing boundary", () => {
		expect(() =>
			parseMultipart(raw("--b", PART_HEADER, "", "data", "--b--", "trailing"), "b")
		).toThrow(/after its closing/)
		expect(() =>
			parseMultipart(Buffer.concat([raw("--b", PART_HEADER, "", "data", "--b--"), Buffer.from("x")]), "b")
		).toThrow(/after its closing/)
	})

	it("throws on a malformed delimiter line", () => {
		expect(() =>
			parseMultipart(raw("--b junk", PART_HEADER, "", "data", "--b--"), "b")
		).toThrow(/malformed/)
	})

	it("throws on a part without a header block or a form-data name", () => {
		// No blank line inside the part: the header search must not borrow
		// the next part's.
		expect(() =>
			parseMultipart(raw("--b", "data", "--b", PART_HEADER, "", "x", "--b--"), "b")
		).toThrow(/header block|form-data name/)
		expect(() =>
			parseMultipart(raw("--b", "Content-Type: image/png", "", "data", "--b--"), "b")
		).toThrow(/form-data name/)
		expect(() =>
			parseMultipart(raw("--b", 'Content-Disposition: attachment; name="thumbnail"', "", "data", "--b--"), "b")
		).toThrow(/form-data name/)
	})
})
