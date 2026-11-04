import { createContext, useContext } from "react"

/** True under the editor's chart column. Embeds, the embed runtime and the
 *  hidden capture iframes mount the same ChartBody without it, so editor
 *  guidance drawn over the canvas (the empty-encodings hint) never reaches a
 *  published chart, an export or a thumbnail. */
export const EditorCanvasContext = createContext(false)

export const useInEditorCanvas = (): boolean => useContext(EditorCanvasContext)
