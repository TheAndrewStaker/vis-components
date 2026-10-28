// Bumps package.json's version one step per PR (run by .githooks/pre-commit).
//
// "Per PR" means: the first commit on a branch since it left origin/main
// bumps; later commits on the same branch see that HEAD's version already
// differs from the merge-base's and leave it alone. Committing straight to
// main therefore bumps once per batch of unpushed commits. Amending the
// branch's only commit doesn't double-bump either.
//
// Scheme: the header chip shows major.minor (vite.config.ts strips the ".0"
// patch), and the minor is read as a two-digit decimal: v1.0 → v1.10 → v1.11
// → … A minor below 10 therefore jumps straight to 10; after that it counts
// by one. The patch always stays 0. Restarting the line (e.g. at v2.0) is a
// hand edit to "2.0.0"; the next bump then makes it 2.10.0.
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const VERSION_RE = /^(\s*"version":\s*")(\d+)\.(\d+)\.(\d+)(")/m

function git(...args) {
	try {
		return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
	} catch {
		return null
	}
}

function versionAt(rev) {
	const text = git("show", `${rev}:package.json`)
	return text?.match(VERSION_RE)?.slice(2, 5).join(".") ?? null
}

// Has this branch already bumped since it diverged from main?
function alreadyBumped() {
	const baseRef = ["origin/main", "main"].find((ref) => git("rev-parse", "--verify", "-q", ref))
	const base = baseRef && git("merge-base", "HEAD", baseRef)
	if (!base) return false
	const head = versionAt("HEAD")
	const baseVersion = versionAt(base)
	return head !== null && baseVersion !== null && head !== baseVersion
}

if (alreadyBumped()) {
	console.log("bump-version: branch already bumped since main, skipping")
	process.exit(0)
}

const pkgPath = resolve(dirname(fileURLToPath(import.meta.url)), "../package.json")
const raw = readFileSync(pkgPath, "utf8")
const match = raw.match(VERSION_RE)
if (!match) {
	console.error("bump-version: no semver \"version\" field in package.json")
	process.exit(1)
}
const major = Number(match[2])
const minor = Number(match[3])
const nextMinor = minor < 10 ? 10 : minor + 1
const next = `${major}.${nextMinor}.0`
writeFileSync(pkgPath, raw.replace(match[0], `${match[1]}${next}${match[5]}`))
console.log(`bump-version: ${match[2]}.${match[3]}.${match[4]} → ${next}`)
