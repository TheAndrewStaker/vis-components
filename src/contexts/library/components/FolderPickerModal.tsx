import { useState } from "react"
import { useAtomValue } from "jotai"
import { foldersAtom } from "../../chartBuilder/store/atoms"
import { folderTreeOrder } from "../lib/folderOrder"

import { Button } from "../../../components/ui/Button"
import { Modal } from "../../../components/ui/Modal"

type Props = {
	open: boolean
	title: string
	confirmLabel: string
	/** Folder pre-selected each time the modal opens (null = root). */
	initialTarget?: string | null
	onCancel: () => void
	onConfirm: (folderId: string | null) => void
}

/** Destination-folder picker shared by Move and Duplicate. */
export const FolderPickerModal = ({
	open,
	title,
	confirmLabel,
	initialTarget = null,
	onCancel,
	onConfirm,
}: Props) => {
	const folders = useAtomValue(foldersAtom)
	const [target, setTarget] = useState<string | null>(initialTarget)

	// Re-seed on every open so a previous pick doesn't leak into the next
	// action (the modal stays mounted between uses).
	const [wasOpen, setWasOpen] = useState(open)
	if (open !== wasOpen) {
		setWasOpen(open)
		if (open) setTarget(initialTarget)
	}

	// Same order the sidebar tree shows — hand-placed first, then
	// alphabetical — so a destination is where the user expects it.
	const sorted = folderTreeOrder(folders)

	return (
		<Modal open={open} onClose={onCancel} title={title} widthClass="max-w-md">
			<div className="flex flex-col gap-4">
				<p className="text-sm vc-text">
					Pick a destination folder.
				</p>
				<div className="max-h-64 overflow-y-auto rounded border border-stone-200 dark:border-stone-700">
					<button
						type="button"
						onClick={() => setTarget(null)}
						className={`w-full px-3 py-1.5 text-left text-sm hover:bg-stone-100 dark:hover:bg-stone-700 ${
							target === null
								? "vc-nav-active font-medium"
								: "vc-text"
						}`}
					>
						Root (no folder)
					</button>
					{sorted.map(({ folder: f, depth }) => (
						<button
							key={f.id}
							type="button"
							onClick={() => setTarget(f.id)}
							className={`w-full px-3 py-1.5 text-left text-sm hover:bg-stone-100 dark:hover:bg-stone-700 ${
								target === f.id
									? "vc-nav-active font-medium"
									: "vc-text"
							}`}
							style={{ paddingLeft: `${12 + depth * 12}px` }}
						>
							{f.name}
						</button>
					))}
				</div>
				<div className="flex justify-end gap-2">
					<Button compact onClick={onCancel}>
						Cancel
					</Button>
					<Button compact onClick={() => onConfirm(target)}>
						{confirmLabel}
					</Button>
				</div>
			</div>
		</Modal>
	)
}
