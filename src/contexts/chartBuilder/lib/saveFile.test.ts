import { afterEach, describe, expect, it, vi } from "vitest"
import { pickSaveTarget, writeSaveTarget } from "./saveFile"

type PickerWindow = Window & { showSaveFilePicker?: unknown }

const PNG = {
	description: "PNG image",
	mimeType: "image/png",
	extensions: [".png"],
}

const setPicker = (impl: unknown) => {
	Object.defineProperty(window, "showSaveFilePicker", {
		value: impl,
		configurable: true,
		writable: true,
	})
}

afterEach(() => {
	delete (window as PickerWindow).showSaveFilePicker
	vi.restoreAllMocks()
})

describe("pickSaveTarget", () => {
	it("falls back to a download when the browser has no Save-as dialog", async () => {
		await expect(
			pickSaveTarget({ suggestedName: "chart.png", type: PNG })
		).resolves.toEqual({ kind: "download" })
	})

	it("returns the chosen handle and passes name + type to the dialog", async () => {
		const handle = { createWritable: vi.fn() }
		const picker = vi.fn().mockResolvedValue(handle)
		setPicker(picker)

		const target = await pickSaveTarget({
			suggestedName: "chart.png",
			type: PNG,
			rememberAs: "vis-export",
		})

		expect(target).toEqual({ kind: "picker", handle })
		expect(picker).toHaveBeenCalledWith({
			suggestedName: "chart.png",
			id: "vis-export",
			types: [{ description: "PNG image", accept: { "image/png": [".png"] } }],
		})
	})

	it("resolves null when the user cancels the dialog", async () => {
		setPicker(
			vi.fn().mockRejectedValue(new DOMException("cancelled", "AbortError"))
		)
		await expect(
			pickSaveTarget({ suggestedName: "chart.png", type: PNG })
		).resolves.toBeNull()
	})

	it("falls back to a download when the dialog refuses to open", async () => {
		setPicker(
			vi
				.fn()
				.mockRejectedValue(new DOMException("no activation", "SecurityError"))
		)
		await expect(
			pickSaveTarget({ suggestedName: "chart.png", type: PNG })
		).resolves.toEqual({ kind: "download" })
	})
})

describe("writeSaveTarget", () => {
	it("streams the blob into the picked file and closes it", async () => {
		const writable = { write: vi.fn(), close: vi.fn() }
		const handle = {
			createWritable: vi.fn().mockResolvedValue(writable),
		} as unknown as FileSystemFileHandle
		const blob = new Blob(["x"], { type: "image/png" })

		await writeSaveTarget({ kind: "picker", handle }, blob, "chart.png")

		expect(writable.write).toHaveBeenCalledWith(blob)
		expect(writable.close).toHaveBeenCalled()
	})

	it("clicks an anchor download for the fallback target", async () => {
		const click = vi
			.spyOn(HTMLAnchorElement.prototype, "click")
			.mockImplementation(() => {})
		const create = vi
			.spyOn(URL, "createObjectURL")
			.mockReturnValue("blob:fake")
		vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {})

		await writeSaveTarget(
			{ kind: "download" },
			new Blob(["x"], { type: "image/png" }),
			"chart.png"
		)

		expect(create).toHaveBeenCalled()
		expect(click).toHaveBeenCalled()
	})
})
