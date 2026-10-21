/** The published embed's root component — EmbedPage's rendering flow with
 *  the router and storage lookups replaced by the injected payload. The
 *  chart tree underneath (ChartCanvas / ChartBody / Legend) is the real
 *  editor render path, so hover, tooltips, and legend highlighting behave
 *  exactly as they do in the app. */

import { useEffect, useState } from "react"
import { useAtomValue } from "jotai"

import {
	ChartBody,
	ChartCanvas,
} from "../contexts/chartBuilder/components/viz/ChartCanvas"
import { EmbedTableLayout } from "../contexts/chartBuilder/components/viz/DataTableBlock"
import { Legend } from "../contexts/chartBuilder/components/viz/Legend"
import { currentDataTableConfigAtom } from "../contexts/chartBuilder/store/atoms"
import { useLoadVisual } from "../contexts/chartBuilder/store/saveVisual"
import { useEnsureCurrentDatasetLoaded } from "../contexts/chartBuilder/store/useCurrentDatasetView"
import type { EmbedPart } from "./payload"

type LoadState = "loading" | "ready" | "missing"

export const EmbedRoot = ({
	part,
	visualId,
}: {
	part: EmbedPart
	visualId: string
}) => {
	// An embed pulls exactly the one dataset its visualization draws — served
	// from the payload overlay, never fetched.
	useEnsureCurrentDatasetLoaded()
	const loadVisual = useLoadVisual()
	const [state, setState] = useState<LoadState>("loading")
	// The data table rides with the chart (full page or the chart part),
	// never the legend part. A visual published before the table existed
	// carries no config, which reads as disabled.
	const dataTableOn =
		useAtomValue(currentDataTableConfigAtom)?.enabled === true &&
		part !== "legend"

	useEffect(() => {
		let cancelled = false
		void (async () => {
			const ok = await loadVisual(visualId)
			if (!cancelled) setState(ok ? "ready" : "missing")
		})()
		return () => {
			cancelled = true
		}
	}, [visualId, loadVisual])

	if (state === "loading") {
		return (
			<div className="flex h-screen items-center justify-center text-sm vc-muted">
				Loading…
			</div>
		)
	}
	if (state === "missing") {
		return (
			<div className="flex h-screen flex-col items-center justify-center gap-2 px-6 text-center">
				<p className="text-sm vc-text">
					This embed could not be loaded.
				</p>
				<p className="text-sm vc-muted">
					Its published data is incomplete.
				</p>
			</div>
		)
	}
	const body =
		part === "chart" ? <ChartBody /> : part === "legend" ? <Legend /> : <ChartCanvas />
	if (dataTableOn) return <EmbedTableLayout>{body}</EmbedTableLayout>
	// data-export-root marks the capture boundary, mirroring the in-app embed
	// page — harmless here, and keeps any future capture tooling consistent.
	return (
		<div data-export-root className="h-screen w-screen">
			{body}
		</div>
	)
}
