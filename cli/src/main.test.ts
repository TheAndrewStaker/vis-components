// @vitest-environment node
// The CLI's argument handling, JSON in and out, and exit codes; and the
// file undo store separate runs share.
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { startTestServer, type TestServer } from "../../mcp/src/testServer"
import { EXIT, fileUndo, main, type Io } from "./main"

let server: TestServer
let state: string

beforeAll(async () => {
	server = await startTestServer()
	state = mkdtempSync(join(tmpdir(), "vis-cli-state-"))
})
afterAll(() => server.close())

/** One run: its exit code and the one JSON line it wrote. */
const cli = async (argv: string[], stdin = "", env: Record<string, string | undefined> = {}) => {
	const lines: string[] = []
	const io: Io = {
		stdin: async () => stdin,
		stdout: (text) => void lines.push(text),
		env: { VIS_API_URL: server.base, ZAFIRO_CLI_STATE: state, ...env },
	}
	const code = await main(argv, io)
	expect(lines).toHaveLength(1)
	return { code, out: JSON.parse(lines[0]) }
}

describe("main", () => {
	it("prints the manifest", async () => {
		const { code, out } = await cli(["manifest", "--json"])
		expect(code).toBe(0)
		expect(out.manifestVersion).toBe(1)
	})

	it.each([
		[[], "usage: zafiro"],
		[["manifest", "--yaml"], 'unknown flag "--yaml"'],
		[["chart", "get", "--id=x"], "input goes on stdin"],
		[["chart", "gte"], 'did you mean "chart get"'],
	])("refuses %j as usage, exit 2", async (argv, message) => {
		const { code, out } = await cli(argv)
		expect(code).toBe(2)
		expect(out.error.code).toBe("usage")
		expect(out.error.message).toContain(message)
	})

	it("refuses stdin that isn't JSON, and a missing or non-http VIS_API_URL", async () => {
		expect((await cli(["guide"], "{nope")).out.error.message).toBe("stdin is not JSON")
		expect((await cli(["guide"], "", { VIS_API_URL: undefined })).out.error.message).toContain("VIS_API_URL is required")
		expect((await cli(["guide"], "", { VIS_API_URL: "ftp://x" })).out.error.message).toContain("http(s)")
	})

	it("maps each refusal to its exit code", async () => {
		expect(EXIT).toEqual({ usage: 2, invalid: 2, stale: 3, not_found: 4, conflict: 5, nothing_to_undo: 5, version: 6, failed: 1 })
		const missing = await cli(["chart", "get"], JSON.stringify({ id: "vs-none" }))
		expect(missing).toMatchObject({ code: 4, out: { error: { code: "not_found" } } })
		const nothing = await cli(["chart", "undo"], JSON.stringify({ id: "vs-none" }))
		expect(nothing).toMatchObject({ code: 5, out: { error: { code: "nothing_to_undo" } } })
	})

	it("edits and undoes across separate runs through the caller's file stack", async () => {
		const ds = await cli(["dataset", "create"], JSON.stringify({ name: "runs", rows: [{ k: "a", v: 1 }] }))
		const created = await cli(
			["chart", "create"],
			JSON.stringify({ spec: { datasetId: ds.out.id, folderId: null, encodings: { x: "k", length: "v" } } })
		)
		const id = created.out.id
		const edited = await cli(
			["chart", "edit"],
			JSON.stringify({ id, patch: { title: "t" }, expectedRevision: created.out.revision, caller: "shell" })
		)
		expect(edited.code).toBe(0)
		const stale = await cli(
			["chart", "edit"],
			JSON.stringify({ id, patch: { title: "u" }, expectedRevision: created.out.revision })
		)
		expect(stale).toMatchObject({ code: 3, out: { error: { code: "stale" } } })
		const undone = await cli(["chart", "undo"], JSON.stringify({ id, caller: "shell" }))
		expect(undone.code).toBe(0)
		expect(undone.out.revision).toBe(created.out.revision)
	})
})

describe("fileUndo", () => {
	it("shares a caller's stack between stores on the same directory", async () => {
		const dir = mkdtempSync(join(tmpdir(), "vis-cli-undo-"))
		const entry = { previous: { id: "v" } as never, wrote: "r1" }
		await fileUndo(dir).push("caller", "v", entry)
		expect(await fileUndo(dir).pop("other", "v")).toBeUndefined()
		expect(await fileUndo(dir).pop("caller", "v")).toEqual(entry)
		expect(await fileUndo(dir).pop("caller", "v")).toBeUndefined()
	})
})
