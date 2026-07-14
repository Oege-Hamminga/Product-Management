import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from "node:path";

// Builds a fully self-contained, single HTML file with no backend
// dependency: every import of "api/client" is swapped for "api/localClient"
// (IndexedDB-backed) and vite-plugin-singlefile inlines all JS/CSS so the
// output can be opened directly, offline, with no server at all.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  resolve: {
    alias: [
      {
        find: /^(\.\.\/)+api\/client$/,
        replacement: path.resolve(__dirname, "src/api/localClient.ts"),
      },
    ],
  },
  build: {
    outDir: "dist-standalone",
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
