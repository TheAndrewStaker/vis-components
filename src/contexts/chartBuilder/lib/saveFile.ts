/** Hand a generated file to the user through the browser's own "Save as"
 *  dialog when it has one (File System Access API: Chrome, Edge, Opera), so
 *  they can name the file and pick the folder. Browsers without it (Safari,
 *  Firefox) fall back to a plain anchor download into the downloads folder.
 *
 *  The picker consumes the click's transient user activation, so callers
 *  that do slow work before the bytes exist (capture, rasterize) MUST pick
 *  the target FIRST, in the click handler, and write to it afterwards —
 *  hence the two-step pick / write API rather than one `saveBlob`. */

/** What `showSaveFilePicker` accepts for one offered file type. */
type SaveFilePickerType = {
	description?: string
	accept: Record<string, readonly string[]>
}

type SaveFilePickerOptions = {
	suggestedName?: string
	/** Lets the browser remember the last directory per id. */
	id?: string
	types?: readonly SaveFilePickerType[]
	excludeAcceptAllOption?: boolean
}

/** TS's lib.dom ships the handle/stream types but not the picker itself. */
type WindowWithPicker = Window & {
	showSaveFilePicker?: (
		options?: SaveFilePickerOptions
	) => Promise<FileSystemFileHandle>
}

export type SaveFileType = {
	description: string
	mimeType: string
	extensions: readonly string[]
}

export type SaveTarget =
	/** A file the user chose in the Save-as dialog. */
	| { kind: "picker"; handle: FileSystemFileHandle }
	/** No dialog available — write via an anchor download. */
	| { kind: "download" }

/** Open the Save-as dialog (where supported) for a file called
 *  `suggestedName`. Resolves `null` when the user cancels the dialog, a
 *  `download` target when the browser has no dialog or refused to open one
 *  (no user activation, sandboxed frame), and a `picker` target otherwise.
 *  Call this synchronously from the click handler. */
export const pickSaveTarget = async (opts: {
	suggestedName: string
	type: SaveFileType
	/** Stable key so the browser reopens the folder last used for this kind
	 *  of save. */
	rememberAs?: string
}): Promise<SaveTarget | null> => {
	const picker = (window as WindowWithPicker).showSaveFilePicker
	if (typeof picker !== "function") return { kind: "download" }
	try {
		const handle = await picker.call(window, {
			suggestedName: opts.suggestedName,
			id: opts.rememberAs,
			types: [
				{
					description: opts.type.description,
					accept: { [opts.type.mimeType]: opts.type.extensions },
				},
			],
		})
		return { kind: "picker", handle }
	} catch (error) {
		// The user closed the dialog: not an error, nothing to save.
		if (error instanceof DOMException && error.name === "AbortError") {
			return null
		}
		// Anything else (SecurityError, NotAllowedError, a picker the
		// platform can't show) — the plain download still works.
		return { kind: "download" }
	}
}

/** Write `blob` to the target chosen by `pickSaveTarget`. `filename` is
 *  only used by the download fallback; the picker target already knows
 *  its file. */
export const writeSaveTarget = async (
	target: SaveTarget,
	blob: Blob,
	filename: string
): Promise<void> => {
	if (target.kind === "picker") {
		const writable = await target.handle.createWritable()
		await writable.write(blob)
		await writable.close()
		return
	}
	downloadBlob(blob, filename)
}

/** Plain anchor download into the browser's downloads folder. */
export const downloadBlob = (blob: Blob, filename: string): void => {
	const url = URL.createObjectURL(blob)
	const a = document.createElement("a")
	a.href = url
	a.download = filename
	document.body.append(a)
	a.click()
	a.remove()
	// Defer revocation so the browser has a chance to start the download —
	// some browsers race the click() / revoke pair otherwise.
	window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
