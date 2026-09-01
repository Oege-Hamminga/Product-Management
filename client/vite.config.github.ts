import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Builds the client for the GitHub-committed shared deployment: every
// import of "api/client" is swapped for "api/localClient" (reusing all its
// state-shape logic) and, within that file, its own "./localDb" import is
// swapped again for "api/githubDb" (GitHub Contents API-backed instead of
// IndexedDB) — see githubDb.ts for how reads/writes actually work.
//
// `base: "./"` makes every emitted asset reference relative to wherever the
// built index.html itself ends up served from, rather than assuming the
// site is hosted at its origin's root — needed because this is a GitHub
// Pages *project* site (served under /<repo-name>/, not just /).
// This repo's own coordinates — fixed for this specific deployment, so
// they're baked in here rather than left as CI configuration to remember.
// Change these if this ever moves to a different repo/owner/branch.
const GITHUB_OWNER = "Oege-Hamminga";
const GITHUB_REPO = "Product-Management";
const GITHUB_BRANCH = "claude/oem-brands-portfolio-site-m5l55d";

export default defineConfig({
  base: "./",
  plugins: [react()],
  define: {
    "import.meta.env.VITE_GITHUB_OWNER": JSON.stringify(GITHUB_OWNER),
    "import.meta.env.VITE_GITHUB_REPO": JSON.stringify(GITHUB_REPO),
    "import.meta.env.VITE_GITHUB_BRANCH": JSON.stringify(GITHUB_BRANCH),
  },
  resolve: {
    alias: [
      { find: /^(\.\.\/)+api\/client$/, replacement: path.resolve(__dirname, "src/api/localClient.ts") },
      { find: /^\.\/localDb$/, replacement: path.resolve(__dirname, "src/api/githubDb.ts") },
    ],
  },
  build: {
    outDir: "dist-github",
  },
});
