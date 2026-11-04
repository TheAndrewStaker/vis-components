/** The dash-gap rule on its own (no pattern drawing imports), so the
 * settings path and the MCP bundle can read it. */

/** Whether dash gaps get painted (the alternate-color underlay that keeps a
 *  dashed line reading as one CONNECTED two-color line) or stay empty (a
 *  truly dashed line). An explicit user choice wins; `null` = AUTO: paint
 *  the gaps UNLESS the pattern encoding maps the same field as the hue
 *  encoding — there the dash restates the color split, so true gaps are the
 *  default and painting is opt-in via the panel checkbox. */
export const resolveDashGapFill = ({
	configured,
	patternField,
	hueField,
}: {
	configured: boolean | null | undefined
	patternField: string | null
	hueField: string | null
}): boolean => {
	if (configured !== null && configured !== undefined) return configured
	return !(patternField !== null && patternField === hueField)
}
