import { useId } from "react"

import { CopyButton } from "../../../components/ui/CopyButton"
import { Input } from "../../../components/ui/Input"

export const LINKED_PICTURE_LABEL = "Linked picture (experimental)"
export const LINKED_PICTURE_HELP =
	"Link this in PowerPoint (Insert → Pictures → paste the link → Insert and Link). It refreshes when the deck is opened."
export const LINKED_PICTURE_RETRY = "Picture didn't publish. Republish to retry."

/** Export modal → Embed tab, under the iframe snippets of a published embed:
 *  the stable PNG url of the chart picture published alongside it, or a
 *  retry hint when that step of the publish failed (`url` undefined). */
export const LinkedPictureRow = ({ url }: { url: string | undefined }) => {
	const inputId = useId()

	if (url === undefined) {
		return (
			<div className="flex flex-col gap-2">
				<span className="vc-heading text-sm font-medium">{LINKED_PICTURE_LABEL}</span>
				<p className="vc-help">{LINKED_PICTURE_RETRY}</p>
			</div>
		)
	}

	return (
		<div className="flex flex-col gap-2">
			<label htmlFor={inputId} className="vc-heading text-sm font-medium">
				{LINKED_PICTURE_LABEL}
			</label>
			<Input
				id={inputId}
				value={url}
				readOnly
				className="font-mono"
				onFocus={(e) => e.currentTarget.select()}
			/>
			<p className="vc-help">{LINKED_PICTURE_HELP}</p>
			<div className="flex items-center justify-end">
				<CopyButton value={url} label="Copy link" />
			</div>
		</div>
	)
}
