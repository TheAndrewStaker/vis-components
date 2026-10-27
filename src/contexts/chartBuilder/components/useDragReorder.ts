import { useState } from "react"

/** Plain HTML5 drag-to-reorder over a list of `count` items laid out along
 *  one axis. The caller spreads `sourceProps(i)` on what starts a drag (a
 *  handle, or the item itself) and `targetProps(i)` on each item as a drop
 *  target; `dropSlot` is the insertion slot (0‥count) under the pointer
 *  while a drag is on, for the caller to paint. `onMove(from, slot)` fires
 *  on a drop that would change something. */
export const useDragReorder = ({
	axis,
	count,
	onMove,
}: {
	axis: "x" | "y"
	count: number
	onMove: (from: number, slot: number) => void
}) => {
	const [dragIndex, setDragIndex] = useState<number | null>(null)
	const [dropSlot, setDropSlot] = useState<number | null>(null)
	const endDrag = () => {
		setDragIndex(null)
		setDropSlot(null)
	}
	const sourceProps = (i: number, payload = String(i)) => ({
		draggable: true,
		onDragStart: (e: React.DragEvent) => {
			setDragIndex(i)
			setDropSlot(null)
			// Firefox refuses to start a drag with no payload, even though
			// the drop reads the index from local state.
			e.dataTransfer.setData("text/plain", payload)
			e.dataTransfer.effectAllowed = "move"
		},
		onDragEnd: endDrag,
	})
	const targetProps = (i: number) => ({
		onDragOver: (e: React.DragEvent) => {
			if (dragIndex === null) return
			// preventDefault is what marks this item a valid target.
			e.preventDefault()
			e.dataTransfer.dropEffect = "move"
			const box = e.currentTarget.getBoundingClientRect()
			const after =
				axis === "y"
					? e.clientY - box.top > box.height / 2
					: e.clientX - box.left > box.width / 2
			setDropSlot(after ? i + 1 : i)
		},
		onDrop: (e: React.DragEvent) => {
			if (dragIndex === null) return
			e.preventDefault()
			if (dropSlot !== null && dropSlot !== dragIndex && dropSlot !== dragIndex + 1)
				onMove(dragIndex, dropSlot)
			endDrag()
		},
	})
	/** Whether the slot before item `i` (or after the last, `i === count`)
	 *  is the one the pointer is over. */
	const isSlot = (i: number) => dropSlot === i && i <= count
	return { dragIndex, dropSlot, isSlot, sourceProps, targetProps }
}
