/** The signed-in user, when the app runs under a host that has accounts.
 *  It comes from /api/config at boot, and main.tsx installs it before render.
 *  In local mode, and on the standalone server, it stays null: nobody is
 *  named, the header shows no presence, and saves carry no `updatedBy`. */

export type AppUser = {
	/** Stable account id — compared, never shown. */
	id: string
	/** Display name, e.g. "Jane Doe". */
	name: string
}

let currentUser: AppUser | null = null

/** Install the server-provided user. Called once at boot, before render,
 *  and only in server mode. */
export const setCurrentUser = (user: AppUser): void => {
	currentUser = user
}

export const getCurrentUser = (): AppUser | null => currentUser

/** Normalize an untrusted value into an AppUser, or null. A blank name
 *  falls back to the id. */
export const parseAppUser = (value: unknown): AppUser | null => {
	if (typeof value !== "object" || value === null) return null
	const record = value as Record<string, unknown>
	const id = typeof record.id === "string" ? record.id.trim() : ""
	if (!id) return null
	const name = typeof record.name === "string" ? record.name.trim() : ""
	return { id, name: name || id }
}

/** Words of a display name. An email-shaped name ("jane.doe@x.com") is read
 *  through its local part, split on the usual separators. */
const nameWords = (name: string): string[] => {
	const base = name.includes("@") && !/\s/.test(name.trim())
		? name.trim().split("@")[0]
		: name
	return base.split(/[\s._-]+/).filter(Boolean)
}

const capitalize = (word: string): string =>
	word.charAt(0).toLocaleUpperCase() + word.slice(1)

/** "Jane Doe" → "Jane" — what "Saved by …" says. */
export const firstName = (name: string): string => {
	const [first] = nameWords(name)
	return first ? capitalize(first) : name
}

/** "Jane Doe" → "JD"; "Cher" → "C"; "Mary Ann van Dyke" → "MD". */
export const initials = (name: string): string => {
	const words = nameWords(name)
	if (words.length === 0) return "?"
	const first = words[0].charAt(0)
	const last = words.length > 1 ? words[words.length - 1].charAt(0) : ""
	return `${first}${last}`.toLocaleUpperCase()
}
