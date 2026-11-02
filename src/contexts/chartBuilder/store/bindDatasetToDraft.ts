import type { Getter, Setter } from "jotai"
import { DEFAULT_DERIVED_VARIABLES_CONFIG } from "../lib/derivedVariables"
import { applyCellConversions } from "../lib/materializeTransforms"
import { DEFAULT_RESHAPE_CONFIG } from "../lib/reshape"
import { resolveDatasetView } from "../lib/resolveDatasetVersion"
import { rebindTemplate } from "../lib/templates/rebind"
import { emptyEncodings, type Dataset, type Field } from "../lib/types"
import { isTemplate } from "../lib/visualTrash"

import {
	currentDatasetIdAtom,
	currentDerivedVariablesAtom,
	currentEncodingsAtom,
	currentFieldOverridesAtom,
	currentReshapeConfigAtom,
	currentTemplateIdAtom,
	previewVersionIdAtom,
	templatePendingAtom,
	templateRebindNoticeAtom,
	visualsAtom,
} from "./atoms"
import { readFieldConfigs, writeFieldConfigs } from "./useRenameField"

/** The fields a fresh data set shows at its latest version, with the
 * view-time cell conversions applied so dollar / percent columns carry
 * their `formatHint` (the data kind the snap matches on). No live reshape
 * or derived stage: a data set just attached has none, and columns a
 * version baked in come through as ordinary fields. */
const latestViewFields = (body: Dataset): Field[] =>
	applyCellConversions(resolveDatasetView(body, null), {})?.fields ?? []

/** Bind a data set to the open draft — THE one place a template snap
 * happens. When the draft is a pending template draft
 * (`templatePendingAtom`, evaluated BEFORE the binding changes it) and the
 * data set's body is at hand, the template's field references are rebound
 * onto the new fields (`rebindTemplate`) and the banner notice is set.
 * Otherwise the draft's data-bound state is wiped as a data set change
 * always has: empty encodings, no type overrides, no reshape or derived
 * variables.
 *
 * Everything happens in this one synchronous call, binding included, so
 * the undo stack (which restarts on the dataset id) takes the post-snap
 * draft as its baseline. */
export const bindDatasetToDraft = (
	get: Getter,
	set: Setter,
	datasetId: string,
	body: Dataset | null
): void => {
	const pending = get(templatePendingAtom)
	const templateId = get(currentTemplateIdAtom)
	const template = pending
		? get(visualsAtom).find((v) => v.id === templateId)
		: undefined
	if (body && template && isTemplate(template) && template.template) {
		const configs = readFieldConfigs(get)
		const result = rebindTemplate(
			configs,
			template.template.sourceFields,
			latestViewFields(body),
			template.template.formatMemory
		)
		writeFieldConfigs(set, configs, result.configs)
		set(templateRebindNoticeAtom, {
			mapping: result.mapping,
			unmatched: result.unmatched,
		})
	} else {
		set(currentEncodingsAtom, emptyEncodings())
		set(currentFieldOverridesAtom, {})
		set(currentReshapeConfigAtom, DEFAULT_RESHAPE_CONFIG)
		set(currentDerivedVariablesAtom, DEFAULT_DERIVED_VARIABLES_CONFIG)
	}
	set(currentDatasetIdAtom, datasetId)
	set(previewVersionIdAtom, null)
}
