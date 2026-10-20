/** Who is in which visual's editor right now.
 *
 *  In memory, by design: presence is a few seconds of truth, not data. A
 *  restart forgets everyone, and each open editor's next heartbeat puts its
 *  user back. (The server runs as exactly one replica, so one map is the
 *  whole picture.)
 *
 *  Keyed by browser TAB, not user: one person with the same chart open in
 *  two tabs closes one and is still there. Readers get each user once. */

import type { AppUser } from "./identity.js"

/** A tab that hasn't beaten for this long has left. Comfortably over two
 *  of the client's heartbeat intervals, so one late beat doesn't flicker
 *  someone out. */
export const PRESENCE_TTL_MS = 45_000

/** Hard cap on tracked tabs — the map can't be grown without bound by a
 *  client inventing tab ids. Expired tabs are swept first. */
const MAX_TABS = 5_000

type TabEntry = { user: AppUser; visualId: string; seenAt: number }

export type PresenceTracker = {
	/** Record that `tabId` (owned by `user`) is in `visualId`'s editor. */
	beat: (tabId: string, user: AppUser, visualId: string) => void
	/** The tab left (closed, or moved off the editor). Only its owner can
	 *  remove it. */
	leave: (tabId: string, user: AppUser) => void
	/** Everyone with a live tab in `visualId`'s editor, each user once,
	 *  ordered by name. */
	editorsOf: (visualId: string) => AppUser[]
}

export const createPresenceTracker = (
	now: () => number = Date.now
): PresenceTracker => {
	const tabs = new Map<string, TabEntry>()

	const sweep = (): void => {
		const cutoff = now() - PRESENCE_TTL_MS
		for (const [tabId, entry] of tabs) {
			if (entry.seenAt < cutoff) tabs.delete(tabId)
		}
	}

	return {
		beat: (tabId, user, visualId) => {
			const existing = tabs.get(tabId)
			// A tab id belongs to whoever first beat with it.
			if (existing && existing.user.id !== user.id) return
			if (!existing && tabs.size >= MAX_TABS) {
				sweep()
				if (tabs.size >= MAX_TABS) return
			}
			tabs.set(tabId, { user, visualId, seenAt: now() })
		},
		leave: (tabId, user) => {
			if (tabs.get(tabId)?.user.id === user.id) tabs.delete(tabId)
		},
		editorsOf: (visualId) => {
			sweep()
			const byUser = new Map<string, AppUser>()
			for (const entry of tabs.values()) {
				if (entry.visualId === visualId) byUser.set(entry.user.id, entry.user)
			}
			return [...byUser.values()].sort(
				(a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
			)
		},
	}
}
