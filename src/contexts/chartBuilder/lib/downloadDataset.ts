/** Hand the bound dataset back to the user as a CSV — the round trip of the
 *  upload. A dataset that lives only inside a visual would otherwise be
 *  stranded: nothing else ever let the user get the rows back out to edit
 *  them and re-upload.
 *
 *  What goes out is the table the visual draws from (see
 *  `currentDatasetViewAtom`), at the version currently shown: hand-edited
 *  cells (edits are saved as versions, so they are simply the current
 *  rows), the per-visual wide→long reshape when one is active, "$1,234.56"
 *  and "14%" cells converted to the plain numbers the chart uses, and the
 *  derived variables appended as columns. It is the data drawer's table,
 *  and matches the row and field counts beside the link. Headers are the
 *  fields' CURRENT names; renamed variables are aliased to their old headers
 *  at upload time (`Field.sourceNames`), so the file re-imports as a new
 *  version — derived columns re-import as ordinary columns.
 *
 *  Like the image and bundle exports, the save goes through the browser's
 *  Save-as dialog where it has one (./saveFile.ts), so the user can rename
 *  the file and pick the folder; elsewhere it is a plain download. */

import { unparse as papaUnparse } from "papaparse"
import type { DatasetView } from "./types"
import { sanitizeVisualFilename } from "./downloadVisuals"
import { pickSaveTarget, writeSaveTarget } from "./saveFile"
import type { SaveFileType } from "./saveFile"

/** Serialize a view to CSV text: one column per field, in field order, so a
 *  column every row happens to leave blank still gets its header. Cells are
 *  quoted where needed by papaparse (commas, quotes, newlines). */
export const datasetViewToCsv = (view: DatasetView): string =>
	papaUnparse(
		{
			fields: view.fields.map((f) => f.name),
			data: view.rows.map((row) =>
				view.fields.map((f) => row[f.name] ?? "")
			),
		},
		{ newline: "\n" }
	)

/** The file's suggested name: the dataset name slugified the way visual
 *  downloads are (same helper, so the two files sit side by side sensibly),
 *  with a fallback of "dataset" rather than "visualization". */
export const datasetCsvFilename = (view: Pick<DatasetView, "name">): string => {
	const slug = sanitizeVisualFilename(view.name)
	return `${slug === "visualization" ? "dataset" : slug}.csv`
}

/** What the Save-as dialog offers for a dataset download. */
export const DATASET_FILE_TYPE: SaveFileType = {
	description: "CSV data",
	mimeType: "text/csv",
	extensions: [".csv"],
}

/** Shared by every dataset save, so the dialog reopens in the folder the
 *  user last saved a dataset to — not necessarily where their chart images
 *  or bundles go. */
export const DATASET_SAVE_KEY = "vis-export-dataset"

/** Ask where to save (the Save-as dialog where the browser has one, a plain
 *  download into the downloads folder otherwise), then write the CSV there.
 *  Resolves `false` when the user closes the dialog without saving. Call it
 *  straight from the click handler: the dialog needs the click's activation. */
export const downloadDatasetCsv = async (
	view: DatasetView
): Promise<boolean> => {
	const filename = datasetCsvFilename(view)
	const target = await pickSaveTarget({
		suggestedName: filename,
		type: DATASET_FILE_TYPE,
		rememberAs: DATASET_SAVE_KEY,
	})
	if (target === null) return false
	const blob = new Blob([datasetViewToCsv(view)], {
		type: "text/csv;charset=utf-8",
	})
	await writeSaveTarget(target, blob, filename)
	return true
}
