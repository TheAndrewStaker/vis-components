import { builtinModules } from "node:module"
import { fileURLToPath } from "node:url"

import { defineConfig } from "vite"

/** The CLI build (cli/): ONE ESM file, `cli/dist/cli.js`, for Node 22.
 *  zod and the editor's own chart lib the commands compose with are bundled
 *  in, so the artifact has no runtime dependencies beyond Node built-ins
 *  (the same rule the self-host server and mcp/ keep). The file runs as the
 *  CLI and exports `run` and `manifest` for in-process use; a copy shipped
 *  elsewhere ships LICENSE beside it. It touches only cli/dist. */
export default defineConfig({
	// The app's public/ (icons, manifest) has no place beside a CLI.
	publicDir: false,
	build: {
		ssr: fileURLToPath(new URL("./cli/src/main.ts", import.meta.url)),
		target: "node22",
		outDir: "cli/dist",
		emptyOutDir: true,
		minify: false,
		rollupOptions: {
			external: [...builtinModules, ...builtinModules.map((m) => `node:${m}`)],
			output: { format: "es", entryFileNames: "cli.js", inlineDynamicImports: true },
		},
	},
	ssr: {
		target: "node",
		noExternal: true,
	},
})
