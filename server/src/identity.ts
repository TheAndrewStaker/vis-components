/** Who is making a request, as the HOST says. This server has no accounts
 *  of its own: a host that runs the handler behind its own sign-in passes
 *  `identify`, and only then does the app show who is in an editor and who
 *  saved a visual last. The standalone server passes nothing, and every
 *  identity feature stays off. */

import type { IncomingMessage } from "node:http"

export type AppUser = {
	/** Stable account id (an email, a subject claim, …). Only ever compared,
	 *  never shown. */
	id: string
	/** Display name, e.g. "Jane Doe". The app derives initials and a first
	 *  name from it. */
	name: string
}

/** Resolve the signed-in user for a request, or null when there is none.
 *  Must not throw for an anonymous request. */
export type IdentifyUser = (req: IncomingMessage) => AppUser | null

const MAX_ID = 256
const MAX_NAME = 120

/** Normalize whatever the host's hook returned: trimmed, length-capped, and
 *  a blank name falls back to the id. A missing or blank id means nobody —
 *  identity without an id can't be compared, so it's worth nothing. */
export const sanitizeUser = (value: unknown): AppUser | null => {
	if (typeof value !== "object" || value === null) return null
	const record = value as Record<string, unknown>
	const id = typeof record.id === "string" ? record.id.trim().slice(0, MAX_ID) : ""
	if (!id) return null
	const rawName = typeof record.name === "string" ? record.name.trim() : ""
	return { id, name: (rawName || id).slice(0, MAX_NAME) }
}

/** Run the host's hook defensively: a hook that throws reads as anonymous
 *  rather than failing the request it was asked about. */
export const requestUser = (
	identify: IdentifyUser | undefined,
	req: IncomingMessage
): AppUser | null => {
	if (!identify) return null
	try {
		return sanitizeUser(identify(req))
	} catch {
		return null
	}
}

const sameUser = (a: unknown, b: unknown): boolean => {
	if (a === undefined || b === undefined) return a === b
	const left = sanitizeUser(a)
	const right = sanitizeUser(b)
	return left !== null && right !== null && left.id === right.id && left.name === right.name
}

/** Make a visual's `updatedBy` say who REALLY saved it.
 *
 *  Every write of a visual comes through one PUT: a real save, but also a
 *  folder move, a trash, a restore. Only a real save restamps `updatedBy`
 *  (the client stamps itself alongside `updatedAt`), so a body whose
 *  `updatedBy` matches what's stored is passed through untouched — moving
 *  Jane's chart doesn't credit you with her save. A body that CHANGES it is a
 *  save, and the server, not the client, says by whom: the requesting user,
 *  or (anonymous request) the stored saver kept as it was.
 *
 *  Returns the body to store, or null when it should be stored as received. */
export const stampSaver = (
	body: Record<string, unknown>,
	storedUpdatedBy: unknown,
	user: AppUser | null
): Record<string, unknown> | null => {
	if (sameUser(body.updatedBy, storedUpdatedBy)) return null
	const next = { ...body }
	const keep = user ?? sanitizeUser(storedUpdatedBy)
	if (keep) next.updatedBy = keep
	else delete next.updatedBy
	return next
}
