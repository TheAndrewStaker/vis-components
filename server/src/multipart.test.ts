// @vitest-environment node
import { describe, expect, it } from "vitest"
import { findMultipartPart, multipartBoundary } from "./multipart.js"

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

describe("findMultipartPart", () => {
	it("returns the named file part byte-for-byte, binary intact", async () => {
		// Bytes that would not survive a UTF-8 round trip, plus a CRLF and a
		// fake boundary-looking run inside the data.
		const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe, 0x2d, 0x2d, 0x00])
		const form = new FormData()
		form.append("note", "hello")
		form.append("thumbnail", new Blob([new Uint8Array(bytes)], { type: "image/png" }), "thumbnail.png")
		const { body, contentType } = await encode(form)
		const part = findMultipartPart(body, multipartBoundary(contentType) as string, "thumbnail")
		expect(part).not.toBeNull()
		expect(part?.filename).toBe("thumbnail.png")
		expect(part?.contentType).toBe("image/png")
		expect(Buffer.compare(part?.data as Buffer, bytes)).toBe(0)
	})

	it("returns null when no part carries that name", async () => {
		const form = new FormData()
		form.append("other", new Blob(["abc"]), "a.bin")
		const { body, contentType } = await encode(form)
		expect(
			findMultipartPart(body, multipartBoundary(contentType) as string, "thumbnail")
		).toBeNull()
	})

	it("reports a plain field as filename null", async () => {
		const form = new FormData()
		form.append("thumbnail", "not a file")
		const { body, contentType } = await encode(form)
		const part = findMultipartPart(body, multipartBoundary(contentType) as string, "thumbnail")
		expect(part?.filename).toBeNull()
		expect(part?.data.toString()).toBe("not a file")
	})

	it("throws on a body that is not multipart at all", () => {
		expect(() => findMultipartPart(Buffer.from("{}"), "b", "thumbnail")).toThrow(/boundary/)
		expect(() =>
			findMultipartPart(Buffer.from("--b\r\nContent-Disposition: form-data; name=\"thumbnail\"\r\n\r\ndata"), "b", "thumbnail")
		).toThrow(/unterminated/)
	})
})
