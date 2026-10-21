import { useEffect } from "react"

/** The product name every page title ends with (matches the header brand). */
export const APP_NAME = "Zafiro"

/** `<page> · Zafiro`, or the bare app name when there's no page part. */
export const pageTitle = (page?: string | null): string => {
	const p = page?.trim()
	return p ? `${p} · ${APP_NAME}` : APP_NAME
}

/** Keep `document.title` in sync with the page while it's mounted. Pass
 *  `null` to leave the title alone (another route owns it). */
export const useDocumentTitle = (title: string | null): void => {
	useEffect(() => {
		if (title === null) return
		document.title = title
	}, [title])
}
