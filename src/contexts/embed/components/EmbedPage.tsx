import { useEffect, useState } from "react"
import { useParams, useSearch } from "@tanstack/react-router"
import { useAtomValue, useSetAtom } from "jotai"
import { resolveDatasetVersionStrict } from "../../chartBuilder/lib/resolveDatasetVersion"
import {
	currentDataTableConfigAtom,
	datasetIndexAtom,
	previewVersionIdAtom,
	visualsAtom,
	visualsHydratedAtom,
} from "../../chartBuilder/store/atoms"
import { useLoadVisual } from "../../chartBuilder/store/saveVisual"

import {
	ChartBody,
	ChartCanvas,
} from "../../chartBuilder/components/viz/ChartCanvas"
import { Legend } from "../../chartBuilder/components/viz/Legend"
import {
	EmbedTableLayout,
	ExportTableLayout,
} from "../../chartBuilder/components/viz/DataTableBlock"
import { useEnsureCurrentDatasetLoaded } from "../../chartBuilder/store/useCurrentDatasetView"
import { useDocumentTitle } from "../../../lib/documentTitle"

type LoadState =
	| { status: "loading" }
	| { status: "ready" }
	| { status: "missing-visual" }
	| { status: "missing-version"; requestedVersionId: string }

export const EmbedPage = () => {
	// An embed pulls exactly the one dataset its visualization draws.
	useEnsureCurrentDatasetLoaded()
	const { visualId } = useParams({ from: "/embed/$visualId" })
	const search = useSearch({ from: "/embed/$visualId" })
	const requestedVersionId = search.v ?? null
	const part = search.part ?? null
	// The data table rides with the chart (full page or the chart part of a
	// split embed), never the legend part; capture iframes switch it off,
	// or (`table=image`) ask for the export's static copy under the chart.
	const dataTableOn =
		useAtomValue(currentDataTableConfigAtom)?.enabled === true &&
		part !== "legend" &&
		search.table !== "off"

	const visuals = useAtomValue(visualsAtom)
	// Server mode fills the visuals list asynchronously; an id absent from
	// the pre-hydration (empty) list means "still loading", not "missing" —
	// judging it early flashed "Visualization not found" on every cold load.
	const visualsHydrated = useAtomValue(visualsHydratedAtom)
	const datasets = useAtomValue(datasetIndexAtom)
	// The embed's document is named for its chart (iframe title fallback).
	useDocumentTitle(
		visuals.find((v) => v.id === visualId)?.name.trim() || null
	)
	const setPreviewVersionId = useSetAtom(previewVersionIdAtom)
	const loadVisual = useLoadVisual()
	const [state, setState] = useState<LoadState>({ status: "loading" })

	useEffect(() => {
		if (!visualsHydrated) return
		let cancelled = false
		;(async () => {
			const visual = visuals.find((v) => v.id === visualId)
			if (!visual) {
				if (!cancelled) setState({ status: "missing-visual" })
				return
			}
			// If a specific version was requested, validate it exists strictly —
			// silently falling back to latest defeats the purpose of pinning.
			// Judged only when the index actually LISTS the dataset: an id
			// absent from the index means "not listed" (a hydration that
			// failed, an index still settling) — never "deleted" — and a false
			// "version no longer exists" here sticks for the whole session,
			// where proceeding lets the load path report a real, retryable
			// failure instead.
			if (requestedVersionId && visual.datasetId) {
				const dataset = datasets[visual.datasetId]
				if (dataset && !resolveDatasetVersionStrict(dataset, requestedVersionId)) {
					if (!cancelled) {
						setState({
							status: "missing-version",
							requestedVersionId,
						})
					}
					return
				}
			}
			const ok = await loadVisual(visualId)
			if (cancelled) return
			if (!ok) {
				setState({ status: "missing-visual" })
				return
			}
			// Pin the editor's preview state to the requested version (or null = latest).
			setPreviewVersionId(requestedVersionId)
			setState({ status: "ready" })
		})()
		return () => {
			cancelled = true
		}
	}, [
		visualId,
		requestedVersionId,
		visuals,
		visualsHydrated,
		datasets,
		loadVisual,
		setPreviewVersionId,
	])

	if (state.status === "loading") {
		return (
			<div className="flex h-screen items-center justify-center text-sm vc-muted">
				Loading…
			</div>
		)
	}
	if (state.status === "missing-visual") {
		return (
			<div className="flex h-screen flex-col items-center justify-center gap-2 px-6 text-center">
				<p className="text-sm vc-text">
					This embed could not be loaded.
				</p>
				<p className="text-sm vc-muted">Visualization not found.</p>
			</div>
		)
	}
	if (state.status === "missing-version") {
		return (
			<div className="flex h-screen flex-col items-center justify-center gap-2 px-6 text-center">
				<p className="text-sm vc-text">
					This embed is pinned to a version that no longer exists.
				</p>
				<p className="text-sm vc-muted">
					Pinned version: <code>{state.requestedVersionId}</code>
				</p>
			</div>
		)
	}
	const body =
		part === "chart" ? (
			<ChartBody />
		) : part === "legend" ? (
			<Legend />
		) : (
			<ChartCanvas />
		)
	if (dataTableOn && search.table === "image") {
		return <ExportTableLayout>{body}</ExportTableLayout>
	}
	if (dataTableOn) return <EmbedTableLayout>{body}</EmbedTableLayout>
	// data-export-root marks the capture boundary for image exports — the
	// Export modal serializes everything inside it (chart + legend).
	return (
		<div data-export-root className="h-screen w-screen">
			{body}
		</div>
	)
}
