/** "Thickness, vary by": one entry per level of the chosen field at the
 * current thickness, as the Connection and Length panels seed it. */

import { orderedLevels } from "./smartSort"
import type { FieldType } from "./types"
import { uniqueFieldValues } from "./uniqueFieldValues"

/** A field's levels in display order (its pinned order, else smart sort). */
export const fieldLevels = (
	rows: ReadonlyArray<Record<string, unknown>>,
	field: string,
	type: FieldType,
	pinnedOrder?: readonly string[]
): string[] =>
	orderedLevels(uniqueFieldValues(rows, field, { type }), type, pinnedOrder).map((l) => l.value)

export const thicknessByLevel = (levels: readonly string[], thickness: number): Record<string, number> => {
	const seeded: Record<string, number> = {}
	for (const v of levels) seeded[v] = thickness
	return seeded
}
