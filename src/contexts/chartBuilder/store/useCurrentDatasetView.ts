import { atom, useAtomValue, useSetAtom } from "jotai"
import { useEffect } from "react"
import {
	applyDerivedVariablesBeforeReshape,
	splitDerivedVariablesAroundReshape,
	type DerivedReshapeStages,
} from "../lib/derivedReshapeStages"
import {
	applyDerivedVariablesToView,
	type DerivedVariable,
} from "../lib/derivedVariables"
import { applyCellConversions } from "../lib/materializeTransforms"
import { applyReshapeToView } from "../lib/reshape"
import {
	resolveDatasetView,
	resolveDatasetViewFromMeta,
	resolveVersionIdFromMeta,
} from "../lib/resolveDatasetVersion"
import type { DatasetView } from "../lib/types"
import { derivedVariablesOfVersion } from "../lib/versionTransforms"

import {
	currentDatasetIdAtom,
	datasetIndexAtom,
	datasetIndexReadyAtom,
	datasetLoadStatesAtom,
	ensureDatasetLoadedAtom,
	loadedVersionRowsAtom,
	versionRowsKey,
	currentDerivedVariablesAtom,
	currentFieldOverridesAtom,
	currentReshapeConfigAtom,
	loadedDatasetsAtom,
	previewVersionIdAtom,
	type DatasetLoadState,
} from "./atoms"

/** The currently-bound dataset resolved to a flat DatasetView at the latest
 * version (or the preview version, when one is pinned), BEFORE any live
 * per-visual transform: the version's stored rows as they are. The Edit
 * dialog, the Reshape panel and the save paths that make new versions read
 * this (a change is always made from what is STORED); everything that
 * draws wants {@link currentDatasetViewAtom}. For a visual made since
 * reshapes and derived variables became data versions the two are the same
 * table (up to the cell conversions). */
export const currentRawDatasetViewAtom = atom(
	(get): DatasetView | undefined => {
		const datasetId = get(currentDatasetIdAtom)
		if (!datasetId) return undefined
		const preferredVersionId = get(previewVersionIdAtom)

		// A whole body in memory wins — a just-uploaded or just-imported
		// dataset is here before anything has been persisted, let alone split
		// into per-version bodies.
		const whole = get(loadedDatasetsAtom)[datasetId]
		if (whole) return resolveDatasetView(whole, preferredVersionId)

		// The lazy path: everything but the rows comes from the index, and the
		// rows are just the one version being drawn.
		const meta = get(datasetIndexAtom)[datasetId]
		const versionId = resolveVersionIdFromMeta(meta, preferredVersionId)
		if (!versionId) return undefined
		return resolveDatasetViewFromMeta(
			meta,
			get(loadedVersionRowsAtom)[versionRowsKey(datasetId, versionId)],
			preferredVersionId
		)
	}
)

const NO_MATERIALIZED: ReadonlyMap<string, DerivedVariable> = new Map()

/** The derived variables behind the current version's columns — the ones
 * saved as data versions (`lib/versionTransforms.ts`), by column name,
 * restricted to the columns the version still has. The tray's ƒ marker and
 * the Fields panel's ƒ pill reopen these in the editor; the live per-visual
 * definitions of older visuals (`currentDerivedVariablesAtom`) are separate. */
export const materializedDerivedAtom = atom(
	(get): ReadonlyMap<string, DerivedVariable> => {
		const datasetId = get(currentDatasetIdAtom)
		const view = get(currentRawDatasetViewAtom)
		if (!datasetId || !view) return NO_MATERIALIZED
		const meta = get(datasetIndexAtom)[datasetId]
		if (!meta) return NO_MATERIALIZED
		const all = derivedVariablesOfVersion(meta.versions, view.versionId)
		if (all.size === 0) return NO_MATERIALIZED
		// In column order, so a list built from this reads like the table.
		const out = new Map<string, DerivedVariable>()
		for (const f of view.fields) {
			const v = all.get(f.name)
			if (v) out.set(f.name, v)
		}
		return out.size === 0 ? NO_MATERIALIZED : out
	}
)

/** Which derived variables run before the melt (the ones the reshape uses)
 * and which after — see `derivedReshapeStages.ts`. Read by the Reshape
 * panel (its column lists) and the derived-variable editor (which table a
 * variable evaluates against). Both are the LIVE, per-visual configs of
 * visuals saved before reshapes and derived variables became data versions;
 * a visual made since has nothing here. */
export const derivedReshapeStagesAtom = atom(
	(get): DerivedReshapeStages =>
		splitDerivedVariablesAroundReshape(
			get(currentRawDatasetViewAtom)?.fields ?? [],
			get(currentDerivedVariablesAtom),
			get(currentReshapeConfigAtom)
		)
)

/** The wide table with the cell conversions applied and nothing else: what
 * a before-melt derived variable evaluates against. Exported for the
 * derived-variable editor only (editing a variable the reshape uses); the
 * view chain reads it lazily through `preReshapeDatasetViewAtom`, so
 * visuals with no such variable never compute it. */
export const convertedWideDatasetViewAtom = atom(
	(get): DatasetView | undefined =>
		applyCellConversions(
			get(currentRawDatasetViewAtom),
			get(currentFieldOverridesAtom)
		)
)

/** The raw wide view plus the derived variables the reshape uses, computed
 * as wide columns so the melt can keep or combine them. Same object as the
 * raw view when the reshape uses none. */
export const preReshapeDatasetViewAtom = atom(
	(get): DatasetView | undefined =>
		applyDerivedVariablesBeforeReshape(
			get(currentRawDatasetViewAtom),
			get(currentDerivedVariablesAtom),
			get(derivedReshapeStagesAtom).beforeIds,
			() => get(convertedWideDatasetViewAtom)
		)
)

/** The pre-reshape view with the per-visual wide→long reshape applied when
 * active, BEFORE the percent / dollar cell conversions. Kept as its own
 * stage so `reshapeAppliedAtom` can detect the reshape by identity without
 * a cell conversion registering as a reshape. */
const reshapedDatasetViewAtom = atom((get): DatasetView | undefined =>
	applyReshapeToView(
		get(preReshapeDatasetViewAtom),
		get(currentReshapeConfigAtom)
	)
)

/** The reshaped view with the cell-format conversions applied, BEFORE the
 * derived variables. Its own stage so the derived stage sees plain numeric
 * strings (Math formulas parse with Number()) and stages compare by
 * identity. Exported for the derived-variable editor only — it needs the
 * columns UPSTREAM of the variable being edited (a variable must not
 * reference itself or a later one); everything else wants
 * {@link currentDatasetViewAtom}. */
export const preDerivedDatasetViewAtom = atom((get): DatasetView | undefined =>
	applyCellConversions(
		get(reshapedDatasetViewAtom),
		get(currentFieldOverridesAtom)
	)
)

/** The dataset view the editor renders: the raw view with the per-visual
 * wide→long reshape applied when active, then percent-formatted cells
 * ("14%") converted to numeric fractions ("0.14") and dollar/comma-
 * formatted cells ("$1,234.56") converted to plain numeric strings, both
 * in effectively-quantitative columns (inferred or overridden; tagging
 * those fields with the "percent" / "dollar" format hint), then the
 * per-visual derived variables appended as computed columns (those the
 * reshape doesn't use — the ones it uses were computed wide, upstream of
 * the melt). A derived atom rather than a per-component derive so the view
 * (and its `fields`/`rows` arrays) keeps a stable identity between store
 * updates — memos and effects may key on it safely. */
export const currentDatasetViewAtom = atom((get): DatasetView | undefined =>
	applyDerivedVariablesToView(
		get(preDerivedDatasetViewAtom),
		get(currentDerivedVariablesAtom),
		get(derivedReshapeStagesAtom).afterIds
	)
)

/** True when the reshape is actively transforming the current view —
 * `applyReshapeToView` passes the raw view through by identity when it
 * doesn't apply, so an object comparison is exact. Drives the tray button's
 * "Reshape ✓" active state. Compares the reshape STAGE, not the final view,
 * so a cell conversion alone doesn't read as a reshape. */
export const reshapeAppliedAtom = atom((get): boolean => {
	const wide = get(preReshapeDatasetViewAtom)
	return wide !== undefined && get(reshapedDatasetViewAtom) !== wide
})

/**
 * Resolve the currently-bound dataset to a flat DatasetView at the latest
 * version (or, if a preview version is active, that version), with the
 * per-visual wide→long reshape applied when one is active. Returns
 * `undefined` when no dataset is bound or it can't be resolved.
 *
 * Editor consumers (chart canvas, encoding shelves, channel panels,
 * data drawer) should use this rather than reaching into `loadedDatasetsAtom`
 * directly, so version selection, the reshape, and live updates flow
 * through one place.
 */
export const useCurrentDatasetView = (): DatasetView | undefined =>
	useAtomValue(currentDatasetViewAtom)

/** Whether the bound dataset's rows are here yet.
 *
 *  Derived from the SAME view the canvas renders, so the two can never
 *  disagree — a status computed from raw ingredients drifted from the view
 *  resolution once already. "loading" is the window this whole design
 *  creates: the visualization is known but its rows are still in flight. The
 *  canvas MUST render a distinct loading state through it rather than an
 *  empty chart — `chartLayoutReady` only checks that the plot SVG exists at
 *  a non-zero size, so a data-less chart reads as "ready and stable" to the
 *  thumbnail capture pipeline and gets saved as a blank preview. */
export const currentDatasetStatusAtom = atom(
	(get): DatasetLoadState | "absent" | "loading" | "ready" => {
		const datasetId = get(currentDatasetIdAtom)
		if (!datasetId) return "absent"
		if (get(currentRawDatasetViewAtom)) return "ready"
		const state = get(datasetLoadStatesAtom)[datasetId]
		if (state) return state
		// A body in memory that still resolves no view is a dataset with no
		// versions — the empty state, not a load in progress.
		if (get(loadedDatasetsAtom)[datasetId]) return "absent"
		return "loading"
	}
)

export const useCurrentDatasetStatus = () =>
	useAtomValue(currentDatasetStatusAtom)

/** Pull the bound dataset's rows in when the editor (or an embed) opens one.
 *  Mounted once per app shell; the action is idempotent per id. */
export const useEnsureCurrentDatasetLoaded = (): void => {
	const datasetId = useAtomValue(currentDatasetIdAtom)
	// Pinning an older version asks for different rows, so it re-triggers the
	// fetch just as switching dataset does. Without this, previewing v1 of a
	// dataset whose v3 is loaded would sit on the loading state forever.
	const previewVersionId = useAtomValue(previewVersionIdAtom)
	// The ensure action refuses to run before the index is authoritative (it
	// couldn't tell "not split yet" from "deleted"), so its no-op there must
	// be re-fired when readiness flips — this dep is what re-fires it.
	const indexReady = useAtomValue(datasetIndexReadyAtom)
	const ensure = useSetAtom(ensureDatasetLoadedAtom)
	useEffect(() => {
		ensure(datasetId)
	}, [datasetId, previewVersionId, indexReady, ensure])
}
