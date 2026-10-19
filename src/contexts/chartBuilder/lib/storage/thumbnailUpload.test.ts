import { describe, expect, it } from "vitest"
import { pngFileFromDataUrl, thumbnailFormData } from "./thumbnailUpload"

/** base64 of the eight PNG signature bytes. */
const PNG_URL = "data:image/png;base64,iVBORw0KGgo="

describe("pngFileFromDataUrl", () => {
	it("decodes a PNG data URL into an image/png Blob of the raw bytes", async () => {
		const blob = pngFileFromDataUrl(PNG_URL)
		expect(blob?.type).toBe("image/png")
		expect([...new Uint8Array(await (blob as File).arrayBuffer())]).toEqual([
			0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
		])
	})

	it("is null for anything that is not a base64 PNG data URL", () => {
		expect(pngFileFromDataUrl("data:image/jpeg;base64,/9j/4AAQ")).toBeNull()
		expect(pngFileFromDataUrl("https://example.com/x.png")).toBeNull()
		expect(pngFileFromDataUrl("data:image/png;base64,!!!not base64!!!")).toBeNull()
		// Decodes fine, but the bytes are a GIF's, not a PNG's.
		expect(pngFileFromDataUrl("data:image/png;base64,R0lGODlh")).toBeNull()
	})
})

describe("thumbnailFormData", () => {
	it("names the part and file the way the server route expects", () => {
		const form = thumbnailFormData(pngFileFromDataUrl(PNG_URL) as File)
		const part = form.get("thumbnail")
		expect(part).toBeInstanceOf(Blob)
		expect((part as File).name).toBe("thumbnail.png")
		expect((part as File).type).toBe("image/png")
	})
})
