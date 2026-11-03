import { useEffect, useState } from "react"
import { useParams, useSearch } from "@tanstack/react-router"
import { useAtomValue, useSetAtom } from "jotai"
import { resolveDatasetVersionStrict } from "../../chartBuilder/lib/resolveDatasetVersion"
import {
	renderExport,
	resolveExportSize,
} from "../../chartBuilder/lib/exportImage"
import type { ImageFormat } from "../../chartBuilder/lib/exportImage"
import {
	currentChannelConfigsAtom,
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

	if (search.export !== undefined) {
		return <ExportMode format={search.export} state={state} search={search} />
	}
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

type ExportResult =
	| { status: "working" }
	| { status: "done"; blob: Blob; base64: string; ms: number }
	| { status: "failed"; message: string }

const blobToBase64 = (blob: Blob): Promise<string> =>
	new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.addEventListener("load", () =>
			resolve(String(reader.result).replace(/^data:[^,]*,/, ""))
		)
		reader.addEventListener("error", () => reject(reader.error))
		reader.readAsDataURL(blob)
	})

const ExportError = ({ message }: { message: string }) => (
	<pre id="export-error">{message}</pre>
)

/** `?export=png|jpeg|svg|pdf`: lay the chart out at the export size (data
 *  table off), run the Export dialog's pipeline on this page's own
 *  document, and write the file into `#export-result` as base64 with its
 *  mime type, byte count, size, resolution and render time as data
 *  attributes. Any failure lands in `#export-error`. Nothing is saved. */
const ExportMode = ({
	format,
	state,
	search,
}: {
	format: ImageFormat | null
	state: LoadState
	search: { width?: number; height?: number; ratio?: number }
}) => {
	const canvasSize = useAtomValue(currentChannelConfigsAtom).canvasSize
	const { width, height, pixelRatio } = resolveExportSize({
		canvasSize,
		width: search.width,
		height: search.height,
		ratio: search.ratio,
	})
	const ready = format !== null && state.status === "ready"
	const [result, setResult] = useState<ExportResult>({ status: "working" })

	useEffect(() => {
		if (!ready) return
		let cancelled = false
		const started = Date.now()
		;(async () => {
			try {
				const blob = await renderExport(
					document,
					format,
					width,
					height,
					pixelRatio
				)
				const base64 = await blobToBase64(blob)
				if (cancelled) return
				setResult({
					status: "done",
					blob,
					base64,
					ms: Math.round(Date.now() - started),
				})
			} catch (error) {
				if (cancelled) return
				setResult({
					status: "failed",
					message: error instanceof Error ? error.message : String(error),
				})
			}
		})()
		return () => {
			cancelled = true
		}
	}, [ready, format, width, height, pixelRatio])

	if (format === null) return <ExportError message="Unknown format." />
	if (state.status === "loading") return null
	if (state.status === "missing-visual") {
		return <ExportError message="Visualization not found." />
	}
	if (state.status === "missing-version") {
		return (
			<ExportError
				message={`Pinned version no longer exists: ${state.requestedVersionId}`}
			/>
		)
	}
	// The capture boundary at exactly the export size, as the dialog's
	// preview iframe lays it out; the result sits outside it.
	return (
		<>
			<div data-export-root style={{ width, height }}>
				<ChartCanvas />
			</div>
			{result.status === "done" && (
				<pre
					id="export-result"
					data-mime={result.blob.type}
					data-bytes={result.blob.size}
					data-width={width}
					data-height={height}
					data-pixel-ratio={pixelRatio}
					data-ms={result.ms}
				>
					{result.base64}
				</pre>
			)}
			{result.status === "failed" && <ExportError message={result.message} />}
		</>
	)
}
