// Bumps package.json's version one step per commit (run by .githooks/pre-commit).
//
// Scheme: the header chip shows major.minor (vite.config.ts strips the ".0"
// patch), and the minor is read as a two-digit decimal: v1.0 → v1.10 → v1.11
// → … A minor below 10 therefore jumps straight to 10; after that it counts
// by one. The patch always stays 0. Restarting the line (e.g. at v2.0) is a
// hand edit to "2.0.0"; the next commit then makes it 2.10.0.
import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const pkgPath = resolve(dirname(fileURLToPath(import.meta.url)), "../package.json")
const raw = readFileSync(pkgPath, "utf8")
const match = raw.match(/^(\s*"version":\s*")(\d+)\.(\d+)\.(\d+)(")/m)
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
