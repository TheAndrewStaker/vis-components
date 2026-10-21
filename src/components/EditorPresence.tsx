import { useEffect, useState } from "react"
import { useAtomValue } from "jotai"
import { useRouterState } from "@tanstack/react-router"
import { currentVisualIdAtom } from "../contexts/chartBuilder/store/atoms"
import {
	getCurrentUser,
	initials,
	parseAppUser,
	type AppUser,
} from "../lib/currentUser"
import { stringifyJsonDangerous } from "../lib/json"

/** How often an open editor tells the server it's still there (and reads
 *  back who else is). The server forgets a tab after 45 s of silence. */
const HEARTBEAT_MS = 15_000

/** One id per page load, so the server can tell this tab from the same
 *  user's other tabs. Not `crypto.randomUUID`: that needs a secure context,
 *  and a plain-HTTP internal host isn't one. */
const TAB_ID = `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

const presenceUrl = `/api/presence/${TAB_ID}`

/** Everyone in `visualId`'s editor right now, `user` included. With no
 *  user (local mode, or a server that doesn't identify people) it's empty
 *  and nothing is sent; with no visual yet (an unsaved draft is private)
 *  it's just `user`. A failed heartbeat keeps the last answer — presence is
 *  a hint, never worth an error. */
export const usePresence = (
	visualId: string | null,
	user: AppUser | null
): AppUser[] => {
	const [editors, setEditors] = useState<{ visualId: string; users: AppUser[] } | null>(null)

	useEffect(() => {
		if (!user || !visualId) return
		let stopped = false
		const beat = async () => {
			try {
				const response = await fetch(presenceUrl, {
					method: "PUT",
					headers: { "content-type": "application/json" },
					body: stringifyJsonDangerous({ visualId }),
				})
				// 404: this server doesn't track presence — stop asking.
				if (response.status === 404) stop()
				if (!response.ok || stopped) return
				const body = (await response.json()) as { editors?: unknown }
				const users = Array.isArray(body.editors)
					? body.editors.map(parseAppUser).filter((u): u is AppUser => u !== null)
					: []
				if (!stopped) setEditors({ visualId, users })
			} catch {
				// Offline or mid-deploy: keep showing the last answer.
			}
		}
		const leave = () => {
			void fetch(presenceUrl, { method: "DELETE", keepalive: true }).catch(() => {})
		}
		// Background tabs get their timers throttled; catch up on return.
		const onVisible = () => {
			if (document.visibilityState === "visible") void beat()
		}
		const interval = window.setInterval(() => void beat(), HEARTBEAT_MS)
		const stop = () => {
			stopped = true
			window.clearInterval(interval)
		}
		void beat()
		document.addEventListener("visibilitychange", onVisible)
		window.addEventListener("pagehide", leave)
		return () => {
			stop()
			document.removeEventListener("visibilitychange", onVisible)
			window.removeEventListener("pagehide", leave)
			leave()
		}
	}, [user, visualId])

	if (!user) return []
	const others =
		editors && editors.visualId === visualId
			? editors.users.filter((u) => u.id !== user.id)
			: []
	// You last, so your own circle sits beside "New visualization".
	return [...others, user]
}

/** Contrast-safe (white text) fills; a user keeps the same one everywhere. */
const AVATAR_COLORS = [
	"bg-sky-700",
	"bg-emerald-700",
	"bg-amber-700",
	"bg-rose-700",
	"bg-violet-700",
	"bg-teal-700",
	"bg-orange-700",
	"bg-fuchsia-700",
]

const avatarColor = (id: string): string => {
	let hash = 0
	for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
	return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

/** Past this many circles the rest fold into a "+N". */
const MAX_AVATARS = 4

const AVATAR =
	"flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-white ring-2 ring-white select-none dark:ring-stone-900"

/** The editor header's "who's here" row: an initials circle for each
 *  person with this visual open, you included. Only on a server that
 *  identifies its users; hidden on phones, where the header has no room. */
export const EditorPresence = () => {
	const pathname = useRouterState({ select: (s) => s.location.pathname })
	const visualId = useAtomValue(currentVisualIdAtom)
	const user = getCurrentUser()
	const inEditor = pathname.startsWith("/editor")
	const editors = usePresence(inEditor ? visualId : null, inEditor ? user : null)
	if (editors.length === 0) return null

	const overflow = editors.length > MAX_AVATARS ? editors.length - (MAX_AVATARS - 1) : 0
	const shown = overflow ? editors.slice(editors.length - (MAX_AVATARS - 1)) : editors
	const hidden = overflow ? editors.slice(0, overflow) : []
	const label = (u: AppUser) => (u.id === user?.id ? `${u.name} (you)` : u.name)

	return (
		<ul
			aria-label="In this editor"
			className="hidden items-center -space-x-1.5 sm:flex"
		>
			{overflow > 0 && (
				<li
					title={hidden.map(label).join(", ")}
					className={`${AVATAR} bg-stone-500`}
				>
					<span aria-hidden>+{overflow}</span>
					<span className="sr-only">{hidden.map(label).join(", ")}</span>
				</li>
			)}
			{shown.map((u) => (
				<li key={u.id} title={label(u)} className={`${AVATAR} ${avatarColor(u.id)}`}>
					<span aria-hidden>{initials(u.name)}</span>
					<span className="sr-only">{label(u)}</span>
				</li>
			))}
		</ul>
	)
}
