/** A new data set from rows — the record the editor's own upload path
 * (`store/useCreateNewDataset.ts`) stores, and what a program sending rows
 * gets. Pure: duplicate detection is by the cached content hash only, a
 * PROBABLE match the caller confirms against the stored body. */

import { stringifyJsonDangerous } from "../../../lib/json"
import type { SpecProblem } from "./chartSpec"
import { datasetContentHash, findDuplicateByHash } from "./datasetDedupe"
import { datasetRejectMessage, datasetSizeIssue } from "./datasetLimits"
import { inferFieldType } from "./inferFieldType"
import type { Dataset, DatasetMeta, Field, FieldType } from "./types"

export const newDatasetId = () =>
	`ds-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export const newDatasetVersionId = () =>
	`dv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

/** The stand-in "filename" for data that arrived by paste rather than as a
 *  file: it labels the version in the history list and heads the Add-data
 *  prompt, where a real upload would show its file name. */
export const PASTED_DATA_FILENAME = "Pasted data"

/** The same stand-in for rows a program sent through the API. */
export const API_ROWS_FILENAME = "Rows from API"

/** Each column's type, inferred from its cells as an upload infers it. */
export const inferFields = (fieldNames: string[], rows: Array<Record<string, string>>): Field[] =>
	fieldNames.map((name) => ({
		name,
		inferredType: inferFieldType(rows.map((r) => r[name] ?? "")),
	}))

/** A first-version data set: fresh ids, one version, the content hash. */
export const newDatasetRecord = (
	name: string,
	filename: string,
	fields: Field[],
	rows: Array<Record<string, string>>,
	now = Date.now()
): Dataset => {
	const versionId = newDatasetVersionId()
	const versions = [{ id: versionId, filename, rows, createdAt: now }]
	return {
		id: newDatasetId(),
		name,
		fields,
		versions,
		latestVersionId: versionId,
		createdAt: now,
		contentHash: datasetContentHash({ name, fields, versions }),
	}
}

const FIELD_TYPES: readonly unknown[] = ["quantitative", "categorical", "temporal", "ordinal"]

/** Rows → data set. Cells are scalars or null, stored as text (`String()`;
 *  null and absent cells as ""); every row gets every column, in first-seen
 *  order. `types` overrides inference per column. Same-named data sets are
 *  allowed, as in the editor; `duplicateOf` names one with the same name and
 *  content hash. */
export const datasetFromRows = (
	input: { name: string; rows: Record<string, unknown>[]; types?: Record<string, FieldType> },
	opts: { existing?: readonly DatasetMeta[] } = {}
): { dataset: Dataset; problems: SpecProblem[]; duplicateOf?: string } => {
	const problems: SpecProblem[] = []
	const name = typeof input.name === "string" ? input.name.trim() : ""
	if (name === "") problems.push({ path: "name", message: "name must be a non-empty string" })
	const rows = Array.isArray(input.rows) ? input.rows : []
	if (rows.length === 0)
		problems.push({ path: "rows", message: "rows must be a non-empty array of objects" })
	const columns = new Set<string>()
	rows.forEach((row, i) => {
		if (typeof row !== "object" || row === null || Array.isArray(row)) {
			problems.push({ path: `rows[${i}]`, message: "each row must be an object" })
			return
		}
		for (const [col, v] of Object.entries(row)) {
			columns.add(col)
			if (v !== null && v !== undefined && typeof v === "object")
				problems.push({
					path: `rows[${i}].${col}`,
					message: "cells must be text, numbers, booleans or null",
				})
		}
	})
	const text = rows.map((row) => {
		const out: Record<string, string> = {}
		for (const col of columns) {
			const v = (row as Record<string, unknown> | null)?.[col]
			out[col] = v === null || v === undefined || typeof v === "object" ? "" : String(v)
		}
		return out
	})
	const types = input.types ?? {}
	for (const [col, t] of Object.entries(types)) {
		if (!columns.has(col))
			problems.push({ path: `types.${col}`, message: `no column "${col}" in the rows` })
		else if (!FIELD_TYPES.includes(t))
			problems.push({ path: `types.${col}`, message: `must be one of ${FIELD_TYPES.join(", ")}` })
	}
	const fields = inferFields([...columns], text).map((f) =>
		FIELD_TYPES.includes(types[f.name]) ? { ...f, inferredType: types[f.name] } : f
	)
	const bytes = new TextEncoder().encode(stringifyJsonDangerous(text)).byteLength
	if (datasetSizeIssue(bytes) === "reject")
		problems.push({ path: "rows", message: datasetRejectMessage(bytes) })
	const dataset = newDatasetRecord(name, API_ROWS_FILENAME, fields, text)
	const index = Object.fromEntries((opts.existing ?? []).map((m) => [m.id, m]))
	const duplicateOf = findDuplicateByHash(index, dataset) ?? undefined
	return { dataset, problems, ...(duplicateOf ? { duplicateOf } : {}) }
}
