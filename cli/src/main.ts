/** Entry point: the Zafiro CLI.
 *
 *  Run:  echo '{"id":"vs-…"}' | VIS_API_URL=http://localhost:8080 node cli/dist/cli.js chart get
 *        node cli/dist/cli.js manifest --json
 *
 *  `zafiro <noun> <verb>` reads one JSON object on stdin and writes one on
 *  stdout. A refusal is `{"error": {code, message, problems?}}` on stdout,
 *  with the exit code EXIT names. VIS_API_URL is the self-host server
 *  (server/), whose existing HTTP API this talks to. ZAFIRO_CLI_STATE is
 *  where a caller's undo stack is kept between runs (default ~/.zafiro-cli).
 *
 *  The same bundle exports `run`, `manifest` and the rest for a process
 *  that calls the commands in-process instead of spawning this. */

import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

import { createApi } from "../../mcp/src/api"
import {
	COMMANDS,
	CommandError,
	findCommand,
	manifest,
	run,
	UNDO_DEPTH,
	type ErrorCode,
	type UndoEntry,
	type UndoStore,
} from "./commands"

export { createApi } from "../../mcp/src/api"
export { COMMANDS, CommandError, manifest, MANIFEST_VERSION, memoryUndo, revisionOf, run } from "./commands"
export type { AnyCommand, Command, Deps, ErrorCode, UndoEntry, UndoStore } from "./commands"

export const EXIT: Readonly<Record<ErrorCode, number>> = {
	usage: 2,
	invalid: 2,
	stale: 3,
	not_found: 4,
	conflict: 5,
	nothing_to_undo: 5,
	version: 6,
	failed: 1,
}

/** Undo entries in a file per caller, so separate CLI runs share one
 *  caller's history. A write replaces the file whole (write, then rename);
 *  two runs for the SAME caller at once can still lose one entry. */
export const fileUndo = (dir: string): UndoStore => {
	const file = (caller: string) =>
		join(dir, `undo-${createHash("sha256").update(caller).digest("hex").slice(0, 16)}.json`)
	const read = (caller: string): Record<string, UndoEntry[]> => {
		try {
			return JSON.parse(readFileSync(file(caller), "utf8"))
		} catch {
			return {}
		}
	}
	const write = (caller: string, all: Record<string, UndoEntry[]>) => {
		mkdirSync(dir, { recursive: true })
		const tmp = `${file(caller)}.${process.pid}`
		writeFileSync(tmp, JSON.stringify(all))
		renameSync(tmp, file(caller))
	}
	return {
		async push(caller, id, entry) {
			const all = read(caller)
			all[id] = [...(all[id] ?? []), entry].slice(-UNDO_DEPTH)
			write(caller, all)
		},
		async pop(caller, id) {
			const all = read(caller)
			const entry = all[id]?.pop()
			if (entry) write(caller, all)
			return entry
		},
	}
}

export type Io = {
	stdin: () => Promise<string>
	stdout: (text: string) => void
	env: Record<string, string | undefined>
}

const readStdin = async (): Promise<string> => {
	if (process.stdin.isTTY) return ""
	const chunks: Buffer[] = []
	for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
	return Buffer.concat(chunks).toString("utf8")
}

const processIo: Io = {
	stdin: readStdin,
	stdout: (text) => void process.stdout.write(text),
	env: process.env,
}

const USAGE = `usage: zafiro <noun> <verb> < input.json, or zafiro manifest --json; commands are ${COMMANDS.map((c) => c.name).join(", ")}`

const apiUrl = (raw: string | undefined): string => {
	const url = raw?.trim()
	if (!url) throw new CommandError("usage", "VIS_API_URL is required (the self-host server's URL, e.g. http://localhost:8080)")
	try {
		const parsed = new URL(url)
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error()
	} catch {
		throw new CommandError("usage", `VIS_API_URL must be an http(s) URL; got "${url}"`)
	}
	return url
}

/** One CLI run: writes one JSON line and returns the exit code. */
export const main = async (argv: readonly string[], io: Io = processIo): Promise<number> => {
	const out = (value: unknown) => io.stdout(`${JSON.stringify(value)}\n`)
	try {
		const flags = argv.filter((a) => a.startsWith("-"))
		const words = argv.filter((a) => !a.startsWith("-"))
		if (words.length === 1 && words[0] === "manifest") {
			const unknown = flags.filter((f) => f !== "--json")
			if (unknown.length > 0) throw new CommandError("usage", `unknown flag ${unknown.map((f) => `"${f}"`).join(", ")}; ${USAGE}`)
			out(manifest())
			return 0
		}
		if (words.length === 0) throw new CommandError("usage", USAGE)
		if (flags.length > 0)
			throw new CommandError("usage", `unknown flag ${flags.map((f) => `"${f}"`).join(", ")}; input goes on stdin as JSON`)
		const name = words.join(" ")
		findCommand(name)
		const text = (await io.stdin()).trim()
		let input: unknown
		try {
			input = text ? JSON.parse(text) : {}
		} catch {
			throw new CommandError("usage", "stdin is not JSON")
		}
		const api = createApi(apiUrl(io.env.VIS_API_URL))
		const undo = fileUndo(io.env.ZAFIRO_CLI_STATE || join(homedir(), ".zafiro-cli"))
		out(await run(name, input, { api, undo }))
		return 0
	} catch (error) {
		const e = error instanceof CommandError ? error : new CommandError("failed", String(error))
		out({ error: { code: e.code, message: e.message, ...(e.problems ? { problems: e.problems } : {}) } })
		return EXIT[e.code]
	}
}

/** Run as the CLI only when this file is the entry point, through a
 *  symlinked bin too; imported, it only exports. */
const isEntry = () => {
	try {
		return !!process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
	} catch {
		return false
	}
}

if (isEntry()) main(process.argv.slice(2)).then((code) => (process.exitCode = code))
