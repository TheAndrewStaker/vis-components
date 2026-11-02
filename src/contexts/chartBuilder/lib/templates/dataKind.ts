import type {
	DataKind,
	Field,
	FieldType,
	TemplateSourceField,
} from "../types"

/** The data kind of a field: its effective type, with quantitative split by
 * the view-time format hint (dollar / percent / plain number). */
export const dataKindOf = (
	type: FieldType,
	formatHint?: Field["formatHint"],
): DataKind => {
	switch (type) {
		case "quantitative":
			return formatHint ?? "number"
		case "temporal":
			return "date"
		case "ordinal":
			return "ordinal"
		case "categorical":
			return "category"
	}
}

/** The template's record of the fields it was authored against. Effective
 * type follows `effectiveType` (`lib/fieldType.ts`): the override, else the
 * inferred type, else categorical. */
export const sourceFieldsFrom = (
	viewFields: readonly Field[],
	overrides: Record<string, FieldType>,
): TemplateSourceField[] =>
	viewFields.map((f) => {
		const type = overrides[f.name] ?? f.inferredType ?? "categorical"
		return {
			name: f.name,
			type,
			kind: dataKindOf(type, f.formatHint),
			...(f.sourceNames && f.sourceNames.length > 0
				? { sourceNames: [...f.sourceNames] }
				: {}),
		}
	})
