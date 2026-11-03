import { builtinModules } from "node:module"
import { fileURLToPath } from "node:url"

import { defineConfig } from "vite"

/** The MCP server build (mcp/): ONE ESM file, `mcp/dist/main.js`, for Node
 *  22 over stdio. Everything — the MCP SDK, zod, and the editor's own chart
 *  lib it composes with — is bundled in, so the artifact has no runtime
 *  dependencies beyond Node built-ins (the same rule the self-host server
 *  keeps). Run AFTER the main build; it touches only mcp/dist. */
export default defineConfig({
	build: {
		ssr: fileURLToPath(new URL("./mcp/src/main.ts", import.meta.url)),
		target: "node22",
		outDir: "mcp/dist",
		emptyOutDir: true,
		minify: false,
		rollupOptions: {
			external: [...builtinModules, ...builtinModules.map((m) => `node:${m}`)],
			output: { format: "es", entryFileNames: "main.js", inlineDynamicImports: true },
		},
	},
	ssr: {
		target: "node",
		noExternal: true,
	},
})
