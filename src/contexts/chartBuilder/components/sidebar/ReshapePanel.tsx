import { useAtomValue, useSetAtom } from "jotai"
import { useMemo, useState } from "react"
import { Button } from "../../../../components/ui/Button"
import { Checkbox } from "../../../../components/ui/Checkbox"
import { CollapsibleSubsection } from "../../../../components/ui/CollapsibleSubsection"
import { Input } from "../../../../components/ui/Input"
import { splitDerivedVariablesAroundReshape } from "../../lib/derivedReshapeStages"
import { bakeTransforms } from "../../lib/materializeTransforms"
import { nameCollides } from "../../lib/nameUniqueness"
import {
	reshapeApplies,
	reshapeIssues,
	type ReshapeConfig,
} from "../../lib/reshape"
import type { DatasetView, Field } from "../../lib/types"
import {
	currentDatasetIdAtom,
	currentDerivedVariablesAtom,
	currentFieldOverridesAtom,
	currentReshapeConfigAtom,
	datasetIndexAtom,
	derivedVariableEditorAtom,
	reshapePanelOpenAtom,
} from "../../store/atoms"
import { saveModeFor, suggestedCopyName } from "../../store/commitDatasetVersion"
import { currentRawDatasetViewAtom } from "../../store/useCurrentDatasetView"
import { useApplyReshape } from "../../store/useMaterializeVersion"

/** Wide→long reshape options under Data, shown by the data tray's "Reshape"
 * button. The checkboxes are a DRAFT: nothing changes until "Apply reshape",
 * which melts the version shown and saves the long table as a NEW DATA
 * VERSION (`store/useMaterializeVersion.ts`) — the first change to imported
 * data forks a working copy, a change to a working copy appends a version —
 * then closes the menu. The stored wide table is never rewritten; the
 * version list takes you back to it. The lists hold the columns of the
 * version shown plus, for a visual saved before reshapes became versions,
 * the live derived variables that can be computed from them (ƒ-marked,
 * after the data columns like the tray; such a visual's live reshape seeds
 * the draft, and applying folds it all into the version).
 * Half-configured drafts (no Combine column yet, name collisions) just
 * disable Apply, with the reason shown; blanked name boxes fall back to the
 * "category" / "value" defaults shown as placeholders. */
export const ReshapePanel = () => {
	const open = useAtomValue(reshapePanelOpenAtom)
	const raw = useAtomValue(currentRawDatasetViewAtom)
	if (!open || !raw) return null
	// Mounted only while the menu is open, and keyed by what it reshapes, so
	// every opening starts a fresh draft from the stored state.
	return <ReshapeForm key={`${raw.id}:${raw.versionId}`} raw={raw} />
}

const ReshapeForm = ({ raw }: { raw: DatasetView }) => {
	const setOpen = useSetAtom(reshapePanelOpenAtom)
	const legacy = useAtomValue(currentReshapeConfigAtom)
	const legacyDerived = useAtomValue(currentDerivedVariablesAtom)
	const overrides = useAtomValue(currentFieldOverridesAtom)
	const datasetId = useAtomValue(currentDatasetIdAtom)
	const datasetIndex = useAtomValue(datasetIndexAtom)
	const setDerivedEditor = useSetAtom(derivedVariableEditorAtom)
	const applyReshape = useApplyReshape()
	// The draft: seeded from the live config an older visual still carries
	// (so its reshape can be saved as it stands), the defaults otherwise.
	const [config, setConfig] = useState<ReshapeConfig>(legacy)
	const meta = datasetId ? datasetIndex[datasetId] : undefined
	const mode = meta ? saveModeFor(meta) : "fork"
	const [name, setName] = useState(() =>
		mode === "fork" ? suggestedCopyName(raw.name, "reshaped") : raw.name
	)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)

	// Which live derived variables the draft could list and would compute
	// before the melt — see derivedReshapeStages.ts. Empty for a visual
	// made since derived variables became data versions.
	const stages = useMemo(
		() => splitDerivedVariablesAroundReshape(raw.fields, legacyDerived, config),
		[raw, legacyDerived, config]
	)
	// The columns the lists offer (only the names matter to the reshape
	// checks; the type is a stand-in), the draft's naming issues, and what
	// Apply would save — the counts line reads it out. One memo, so the melt
	// reruns on a draft change, not on every keystroke in the name box.
	const { fields, issues, applies, baked } = useMemo(() => {
		const all: Field[] = [
			...raw.fields,
			...stages.candidates.map(
				(c): Field => ({ name: c.name, inferredType: "categorical", derived: true })
			),
		]
		const ok = reshapeApplies(all, config)
		return {
			fields: all,
			issues: reshapeIssues(all, config),
			applies: ok,
			baked: ok ? bakeTransforms(raw, overrides, config, legacyDerived) : null,
		}
	}, [raw, stages, config, overrides, legacyDerived])
	const derivedIdByName = new Map(stages.candidates.map((c) => [c.name, c.id]))
	const idSet = new Set(config.idFields)
	const combineCandidates = fields.filter((f) => !idSet.has(f.name))
	// Same-named data sets are allowed (the id is the identity); a collision
	// only warns. Appending keeps the data set, so its own name doesn't count.
	const collides = nameCollides(
		name,
		Object.values(datasetIndex),
		mode === "append" ? (datasetId ?? undefined) : undefined
	)
	const canApply = applies && !busy && name.trim() !== ""

	const toggleId = (fieldName: string, on: boolean) =>
		setConfig((prev: ReshapeConfig) => ({
			...prev,
			idFields: on
				? [...prev.idFields, fieldName]
				: prev.idFields.filter((n) => n !== fieldName),
			// A column can't be both kept and combined — checking it as an ID
			// column withdraws it from the Combine list.
			meltFields: on
				? prev.meltFields.filter((n) => n !== fieldName)
				: prev.meltFields,
		}))
	const toggleMelt = (fieldName: string, on: boolean) =>
		setConfig((prev: ReshapeConfig) => ({
			...prev,
			meltFields: on
				? [...prev.meltFields, fieldName]
				: prev.meltFields.filter((n) => n !== fieldName),
		}))

	const onApply = async () => {
		if (!canApply) return
		setBusy(true)
		setError(null)
		const result = await applyReshape(config, name)
		setBusy(false)
		if (!result.ok) {
			setError(result.error)
			return
		}
		setOpen(false)
	}

	/** The tray header's italic ƒ, as a button that reopens the variable's
	 * editor — a derived variable under Combine has no column of its own
	 * after the melt, so this is where it's reachable. Inside the checkbox
	 * label, so stop the click from toggling the box. */
	const derivedMarker = (f: Field) =>
		f.derived ? (
			<button
				type="button"
				onClick={(e) => {
					e.preventDefault()
					const id = derivedIdByName.get(f.name)
					if (id) setDerivedEditor({ mode: "edit", id })
				}}
				title={`Edit the derived variable ${f.name}`}
				aria-label={`Edit derived variable ${f.name}`}
				className="flex-shrink-0 font-serif text-xs italic text-brand-500 hover:text-brand-700 dark:text-indigo-400 dark:hover:text-indigo-300"
			>
				ƒ
			</button>
		) : null
	// The checkbox label: the ƒ edit marker (derived variables only) then the
	// truncating column name. The marker is a button inside the label, so a
	// click on it edits without toggling the box.
	const columnLabel = (f: Field) => (
		<>
			{derivedMarker(f)}
			<span className="min-w-0 truncate" title={f.name}>
				{f.name}
			</span>
		</>
	)

	return (
		// mt-2: the Data section body has no gap of its own and the upload
		// controls render directly above.
		<div className="vc-option-panel mt-2">
			{/* defaultOpen: the panel only mounts right after the tray's Reshape
			 *  button enables it, and that click should reveal the options. */}
			<CollapsibleSubsection title="Reshape (wide → long)" defaultOpen>
				<p className="vc-help">
					Combine several columns into one category + value pair of columns
					(long format). The reshaped table is saved as a new data version;
					the imported data is never changed, and the version list takes you
					back to the wide table.
				</p>
				<div className="vc-divider-group">
					<span className="vc-group-header">ID columns</span>
					<p className="vc-help">Kept as-is on every row (not combined).</p>
					{fields.map((f) => (
						<Checkbox
							key={f.name}
							className="min-w-0 [&>label]:flex [&>label]:min-w-0 [&>label]:items-center [&>label]:gap-2"
							label={columnLabel(f)}
							checked={idSet.has(f.name)}
							onChange={(on) => toggleId(f.name, on)}
						/>
					))}
				</div>
				<div className="vc-divider-group">
					<span className="vc-group-header">Combine</span>
					<p className="vc-help">
						Each checked column becomes rows of the new pair. Columns
						checked in neither list are left out.
					</p>
					{combineCandidates.length === 0 ? (
						<p className="vc-help">
							Every column is an ID column — uncheck some above to combine
							them.
						</p>
					) : (
						combineCandidates.map((f) => (
							<Checkbox
								key={f.name}
								className="min-w-0 [&>label]:flex [&>label]:min-w-0 [&>label]:items-center [&>label]:gap-2"
								label={columnLabel(f)}
								checked={config.meltFields.includes(f.name)}
								onChange={(on) => toggleMelt(f.name, on)}
							/>
						))
					)}
				</div>
				<label className="flex flex-col gap-1 text-sm">
					<span className="vc-muted">Combined variable name</span>
					<Input
						type="text"
						className="w-full"
						placeholder="category"
						value={config.variableName}
						onChange={(e) =>
							setConfig((prev: ReshapeConfig) => ({
								...prev,
								variableName: e.target.value,
							}))
						}
					/>
				</label>
				<label className="flex flex-col gap-1 text-sm">
					<span className="vc-muted">Value variable name</span>
					<Input
						type="text"
						className="w-full"
						placeholder="value"
						value={config.valueName}
						onChange={(e) =>
							setConfig((prev: ReshapeConfig) => ({
								...prev,
								valueName: e.target.value,
							}))
						}
					/>
				</label>
				{issues.map((issue) => (
					<p
						key={issue}
						className="text-xs text-amber-600 dark:text-amber-400"
					>
						{issue}
					</p>
				))}
				{baked && (
					<p className="vc-help">
						{baked.wide.rows.length} rows × {baked.wide.fields.length} columns
						→ {baked.rows.length} rows × {baked.fields.length} columns.
					</p>
				)}
				{mode === "fork" ? (
					<>
						<p className="vc-help">
							Reshaping creates a new data set altogether.{" "}
							<span className="font-medium vc-text">&ldquo;{raw.name}&rdquo;</span>{" "}
							stays as it is, and this visualization moves to the reshaped
							copy.
						</p>
						<label className="flex flex-col gap-1 text-sm">
							<span className="vc-muted">Data set name</span>
							<Input
								type="text"
								className="w-full"
								value={name}
								onChange={(e) => setName(e.target.value)}
							/>
						</label>
						{collides && (
							<p className="rounded-sm border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
								A data set named &ldquo;{name.trim()}&rdquo; already exists.
								This will be saved as a separate data set with the same name.
							</p>
						)}
					</>
				) : (
					<p className="vc-help">
						Reshaping adds a new version to this data set; the versions before
						it keep the wide table.
					</p>
				)}
				{error && (
					<p
						role="alert"
						className="rounded-sm bg-red-50 px-2 py-1 text-xs text-red-800 dark:bg-red-900/20 dark:text-red-300"
					>
						{error}
					</p>
				)}
				<div className="flex gap-2">
					<Button
						compact
						onClick={() => void onApply()}
						disabled={!canApply}
						className="flex-1"
					>
						Apply reshape
					</Button>
					{/* Same as re-clicking the tray's Reshape button: hides this menu
					 *  and drops the draft. */}
					<Button compact onClick={() => setOpen(false)}>
						Cancel
					</Button>
				</div>
			</CollapsibleSubsection>
		</div>
	)
}
