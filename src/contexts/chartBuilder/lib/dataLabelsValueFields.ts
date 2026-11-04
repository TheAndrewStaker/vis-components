/** What the Data Labels panel writes when the value field(s) change,
 * shared with the settings path. */

import type { DataLabelsConfig } from "./channelConfig"
import { composedLabelForField, normalizeComposedLabels } from "./dataLabelsSelection"

/** Where a fresh Bar total starts: the last layer of each stack, outside
 * its end, movable like any label. */
export const BAR_TOTAL_SEED = {
	labelPoints: "last",
	labelPointsScope: "stack",
	barLabelPosition: "outside-end",
} as const satisfies Partial<DataLabelsConfig>

/** The patch for the checklist going from `prev` to `next`: checking a
 * variable adds its own `{Field}` label, unchecking removes the labels
 * composing just it (a combination that names it keeps its text), and a
 * newly checked Bar total seeds its own label points, scope and placement. */
export const valueFieldsPatch = (
	cfg: DataLabelsConfig,
	prev: readonly string[],
	next: readonly string[],
	barTotalName: string | null
): Partial<DataLabelsConfig> => {
	const current = normalizeComposedLabels(cfg, prev).composedLabels ?? []
	const added = next.filter((f) => !prev.includes(f))
	const removed = prev.filter((f) => !next.includes(f))
	const totalKey = barTotalName !== null && added.includes(barTotalName) ? barTotalName : null
	return {
		composedLabels: [
			...current.filter((l) => !removed.some((f) => l.template.trim() === `{${f}}`)),
			...added.filter((f) => !current.some((l) => l.id === f)).map(composedLabelForField),
		],
		...(totalKey !== null
			? {
					fieldLabelPoints: { ...(cfg.fieldLabelPoints ?? {}), [totalKey]: BAR_TOTAL_SEED.labelPoints },
					fieldLabelPointsScope: {
						...(cfg.fieldLabelPointsScope ?? {}),
						[totalKey]: BAR_TOTAL_SEED.labelPointsScope,
					},
					fieldBarPlacements: {
						...(cfg.fieldBarPlacements ?? {}),
						[totalKey]: {
							...(cfg.fieldBarPlacements?.[totalKey] ?? {}),
							position: BAR_TOTAL_SEED.barLabelPosition,
						},
					},
				}
			: {}),
	}
}
