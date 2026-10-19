import { combine as c } from "../../../../lib/cls"
import {
	facetPanelKeyOf,
	facetScopeIncludes,
	type FacetPanelRef,
} from "../../lib/facetPanelRef"

/** Facet targeting for a setting that can apply to some panels only.
 *  The all-facets toggle checked ⇒ `facetKeys` is null = every panel (the
 *  default). Unchecking reveals a checkbox per facet so the user picks
 *  exactly which panels the setting applies to. Callers render it only
 *  when the chart is actually faceted. `facetOptions` come from
 *  `facetPanelOptions(resolveFacetPanels(…))`: each option's `ref` is what
 *  gets stored (a facet value, or a row / column pair in grid mode) and
 *  its `key` is the panel key PlotCanvas renders against, which is how a
 *  stored reference is matched here and in the renderer. */
export const FacetScopeControl = ({
	label,
	facetKeys,
	facetOptions,
	onChange,
	className,
}: {
	/** The all-facets toggle text, e.g. "Apply to all facets". */
	label: string
	facetKeys: readonly FacetPanelRef[] | null | undefined
	facetOptions: ReadonlyArray<{ key: string; label: string; ref: FacetPanelRef }>
	onChange: (next: FacetPanelRef[] | null) => void
	className?: string
}) => {
	const applyAll = facetKeys == null
	const ticked = (key: string) =>
		facetKeys != null && facetScopeIncludes(facetKeys, key)
	return (
		<div className={c("flex flex-col gap-1.5", className)}>
			<label className="flex items-center gap-2 text-sm">
				<input
					type="checkbox"
					checked={applyAll}
					onChange={(e) =>
						onChange(e.target.checked ? null : facetOptions.map((o) => o.ref))
					}
					className="h-3 w-3"
				/>
				<span className="vc-muted">{label}</span>
			</label>
			{!applyAll && (
				<div className="flex flex-col gap-1 pl-5">
					{facetOptions.map((o) => (
						<label key={o.key} className="flex items-center gap-2 text-sm">
							<input
								type="checkbox"
								checked={ticked(o.key)}
								onChange={(e) => {
									const set = new Set(
										(facetKeys ?? []).map((ref) => facetPanelKeyOf(ref))
									)
									if (e.target.checked) set.add(o.key)
									else set.delete(o.key)
									// Store the options' own refs, in panel order, so the
									// list reads stably and a legacy string ref is replaced
									// by the structured one on the first edit.
									onChange(
										facetOptions
											.filter((opt) => set.has(opt.key))
											.map((opt) => opt.ref)
									)
								}}
								className="h-3 w-3"
							/>
							<span
								className="min-w-0 truncate vc-text"
								title={o.label}
							>
								{o.label}
							</span>
						</label>
					))}
				</div>
			)}
		</div>
	)
}
