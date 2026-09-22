// GitHub Contents API-backed replacement for localDb.ts — used by the
// GitHub-committed build (see vite.config.github.ts's alias, which swaps
// localClient.ts's own "./localDb" import for this file). Same exported
// shape, so localClient.ts's business logic works completely unchanged;
// only where state/images physically live differs.
//
// Reads never need a credential: the state file and every image are
// committed as plain files in this same repo, on the same branch GitHub
// Pages serves — so they're just same-origin relative fetches, exactly
// like any other asset on this site, reachable by any visitor with zero
// setup.
//
// Writes go through the GitHub Contents API, which only ever accepts a
// real GitHub token — nothing else can authenticate to it. By explicit
// request there is no login gate of any kind here: every visitor is
// already in "edit mode" from the moment the page loads (see the
// localStorage side effect below), and every save uses the one token
// embedded in EMBEDDED_TOKEN. That means, concretely: anyone who can reach
// this page can add, edit, or delete anything — there's no password, no
// per-person distinction, and no real barrier at all, since the token
// making that possible ships to every visitor's browser as plain JS
// (readable via dev tools, or just by reading this file on GitHub). Every
// save is also attributed to whichever GitHub account this token belongs
// to, not to whoever actually made the change. If that stops being
// acceptable, revoke this token at
// https://github.com/settings/personal-access-tokens and bring back some
// form of gate — see this file's git history for a version with per-person
// tokens checked for real against GitHub, or one with a single shared
// password.
import type { DbState } from "./localDb";

const OWNER = import.meta.env.VITE_GITHUB_OWNER as string;
const REPO = import.meta.env.VITE_GITHUB_REPO as string;
const BRANCH = import.meta.env.VITE_GITHUB_BRANCH as string;

// Fine-grained PAT, scoped to only this repo with Contents: Read and write
// and nothing else — see the file-level comment above for what that scoping
// does and doesn't protect against.
const EMBEDDED_TOKEN =
  "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";

// Same key localClient.ts's getToken()/setToken() already read and write —
// AuthContext.tsx derives isEditMode from whether this holds anything, so
// the auto-login side effect below just needs to stamp some truthy value
// in here once. Never used as the actual API credential (that's always
// EMBEDDED_TOKEN above).
const TOKEN_KEY = "oem_portfolio_standalone_token";

const STATE_PATH = "data/app-data.json";
const MANIFEST_PATH = "data/image-manifest.json";
const UPLOADS_DIR = "data/uploads";

function getPatToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function requireToken(): string {
  if (!getPatToken()) throw new Error("Login required to make changes.");
  return EMBEDDED_TOKEN;
}

// No login gate at all, by request — every visitor is already in edit mode
// from the moment the page loads, with nothing to click through. This just
// stamps the same token getPatToken()/requireToken() above already check
// for into storage once, so isEditMode (see AuthContext.tsx, which derives
// it from whether a token is stored) starts true immediately. A manual
// "Log out" (see NavBar.tsx) still works as a way to temporarily hide edit
// controls — refreshing the page re-runs this and restores edit mode.
if (typeof localStorage !== "undefined" && !localStorage.getItem(TOKEN_KEY)) {
  localStorage.setItem(TOKEN_KEY, "open");
}

// Resolves against this page's own deployed base path (e.g.
// "/Product-Management/" for a GitHub Pages project site), not the origin
// root, so this keeps working regardless of the repo's name.
function relativeUrl(path: string): string {
  return new URL(path, new URL(import.meta.env.BASE_URL, window.location.href)).toString();
}

async function fetchJson<T>(path: string): Promise<T | null> {
  const res = await fetch(relativeUrl(path), { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status}).`);
  return (await res.json()) as T;
}

// --- GitHub Contents API (writes only) ---

function apiHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" };
}

async function getFileSha(path: string, token: string): Promise<string | null> {
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}?ref=${encodeURIComponent(BRANCH)}`, {
    headers: apiHeaders(token),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await readErrorMessage(res, `Could not check ${path} on GitHub (${res.status})`));
  const data = (await res.json()) as { sha: string };
  return data.sha;
}

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string };
    return body.message ? `${fallback}: ${body.message}` : fallback;
  } catch {
    return fallback;
  }
}

// Thrown specifically when someone else committed to this same file between
// our read and our write (GitHub rejects the write because the sha we sent
// no longer matches) — distinguished from other failures so mutate() in
// localClient.ts knows this one specific case is worth retrying against the
// now-current file instead of just failing outright.
export class ConflictError extends Error {}

async function putFile(path: string, base64Content: string, message: string, token: string): Promise<void> {
  const sha = await getFileSha(path, token);
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`, {
    method: "PUT",
    headers: { ...apiHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ message, content: base64Content, branch: BRANCH, ...(sha ? { sha } : {}) }),
  });
  if (res.status === 409) throw new ConflictError(`${path} changed on GitHub since it was last read.`);
  if (!res.ok) throw new Error(await readErrorMessage(res, `Could not save ${path} to GitHub`));
}

async function deleteFile(path: string, message: string, token: string): Promise<void> {
  const sha = await getFileSha(path, token);
  if (!sha) return; // already gone
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`, {
    method: "DELETE",
    headers: { ...apiHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ message, sha, branch: BRANCH }),
  });
  if (!res.ok) throw new Error(await readErrorMessage(res, `Could not delete ${path} on GitHub`));
}

// --- GitHub Git Data API (writes only, for files that might exceed the
// Contents API's 1MB limit — real segment/logo photos routinely do) ---
//
// The simple Contents API (putFile above) can only accept a file up to 1MB
// through its single base64 `content` field; anything larger is rejected.
// The Git Data API has no such limit (blobs up to 100MB) but needs several
// calls to do what putFile does in one: create the file's content as a
// loose blob, read the branch's current tree, graft the blob onto a new
// tree at the right path, wrap that in a new commit, then move the branch
// ref to point at it. PATCHing the ref only succeeds as a fast-forward, so
// if someone else committed in between, this fails the same way a stale
// sha does for putFile — mapped to the same ConflictError below.
async function createBlob(base64Content: string, token: string): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/git/blobs`, {
    method: "POST",
    headers: { ...apiHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ content: base64Content, encoding: "base64" }),
  });
  if (!res.ok) throw new Error(await readErrorMessage(res, "Could not upload file content to GitHub"));
  const data = (await res.json()) as { sha: string };
  return data.sha;
}

async function getBranchHead(token: string): Promise<{ commitSha: string; treeSha: string }> {
  const refRes = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/git/ref/heads/${encodeURIComponent(BRANCH)}`,
    { headers: apiHeaders(token) }
  );
  if (!refRes.ok) throw new Error(await readErrorMessage(refRes, "Could not read the branch on GitHub"));
  const refData = (await refRes.json()) as { object: { sha: string } };
  const commitSha = refData.object.sha;
  const commitRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/git/commits/${commitSha}`, {
    headers: apiHeaders(token),
  });
  if (!commitRes.ok) throw new Error(await readErrorMessage(commitRes, "Could not read the branch's commit on GitHub"));
  const commitData = (await commitRes.json()) as { tree: { sha: string } };
  return { commitSha, treeSha: commitData.tree.sha };
}

async function putLargeFile(path: string, base64Content: string, message: string, token: string): Promise<void> {
  const blobSha = await createBlob(base64Content, token);
  const { commitSha, treeSha } = await getBranchHead(token);
  const treeRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/git/trees`, {
    method: "POST",
    headers: { ...apiHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ base_tree: treeSha, tree: [{ path, mode: "100644", type: "blob", sha: blobSha }] }),
  });
  if (!treeRes.ok) throw new Error(await readErrorMessage(treeRes, "Could not prepare the commit on GitHub"));
  const newTree = (await treeRes.json()) as { sha: string };
  const newCommitRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/git/commits`, {
    method: "POST",
    headers: { ...apiHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ message, tree: newTree.sha, parents: [commitSha] }),
  });
  if (!newCommitRes.ok) throw new Error(await readErrorMessage(newCommitRes, "Could not create the commit on GitHub"));
  const newCommit = (await newCommitRes.json()) as { sha: string };
  const updateRefRes = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/git/refs/heads/${encodeURIComponent(BRANCH)}`,
    {
      method: "PATCH",
      headers: { ...apiHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ sha: newCommit.sha }),
    }
  );
  if (!updateRefRes.ok) {
    if (updateRefRes.status === 422 || updateRefRes.status === 409) {
      throw new ConflictError(`${BRANCH} changed on GitHub since ${path}'s upload started.`);
    }
    throw new Error(await readErrorMessage(updateRefRes, "Could not update the branch on GitHub"));
  }
}

function bytesToBase64(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes);
  // Chunked rather than one String.fromCharCode call per byte — a real
  // photo (several MB) makes that loop noticeably slow; 32K bytes per call
  // stays safely under engines' apply()/spread argument-count limits while
  // being drastically fewer calls overall.
  const CHUNK_SIZE = 0x8000;
  let binary = "";
  for (let i = 0; i < arr.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(...arr.subarray(i, i + CHUNK_SIZE));
  }
  return btoa(binary);
}

function jsonToBase64(value: unknown): string {
  // btoa only handles Latin1 — encodeURIComponent/unescape round-trips any
  // UTF-8 text (accented brand names, etc.) through it safely.
  return btoa(unescape(encodeURIComponent(JSON.stringify(value, null, 2))));
}

// --- state ---

type Stamped<T> = T & { _updatedAt?: string };

export async function loadState(): Promise<DbState | null> {
  // The _updatedAt stamp travels along embedded right on the returned
  // object (not in some separate module-level variable) — mutate()'s
  // callbacks in localClient.ts only ever touch specific business fields on
  // this same object, so by the time saveState() sees it again, it still
  // carries exactly the stamp that was current when THIS COPY was read.
  // That's what makes the conflict check below correct even when several
  // browser tabs/sessions each hold their own loaded copy at once.
  const state = await fetchJson<Stamped<DbState>>(STATE_PATH);
  if (state) lastKnownUpdatedAt = state._updatedAt ?? null;
  return state;
}

export async function saveState(state: DbState): Promise<void> {
  const token = requireToken();
  const previousStamp = (state as Stamped<DbState>)._updatedAt;
  // A brand-new (never-yet-loaded-from-here) state has no stamp to compare —
  // e.g. the very first seed write. Anything that came from loadState()
  // above always has one once the file exists at all, so this only skips
  // the check on that one first-ever write.
  if (previousStamp !== undefined) {
    const current = await fetchJson<Stamped<DbState>>(STATE_PATH);
    if ((current?._updatedAt ?? null) !== previousStamp) {
      throw new ConflictError(`${STATE_PATH} changed since it was last read.`);
    }
  }
  const nextStamp = new Date().toISOString();
  await putFile(STATE_PATH, jsonToBase64({ ...state, _updatedAt: nextStamp }), "Update app data", token);
  // Keep the caller's own object in sync too, so re-saving that exact same
  // reference again right away (no fresh loadState() in between) still
  // compares against the version it just wrote, not the one before it.
  (state as Stamped<DbState>)._updatedAt = nextStamp;
  lastKnownUpdatedAt = nextStamp;
}

// --- live refresh: near-live updates across everyone viewing the site,
// without needing a real push/websocket service — just a plain same-origin
// fetch of the state file every POLL_INTERVAL_MS, comparing the _updatedAt
// stamp saveState() writes above. Paused while the tab isn't visible, so a
// forgotten background tab doesn't poll forever. ---

const POLL_INTERVAL_MS = 15_000;
let lastKnownUpdatedAt: string | null | undefined;
let pollTimer: ReturnType<typeof setInterval> | null = null;
const remoteChangeListeners = new Set<() => void>();

async function pollOnce(): Promise<void> {
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  try {
    const fresh = await fetchJson<DbState & { _updatedAt?: string }>(STATE_PATH);
    const stamp = fresh?._updatedAt ?? null;
    if (lastKnownUpdatedAt === undefined) {
      lastKnownUpdatedAt = stamp; // first poll just establishes a baseline
      return;
    }
    if (stamp !== lastKnownUpdatedAt) {
      lastKnownUpdatedAt = stamp;
      remoteChangeListeners.forEach((cb) => cb());
    }
  } catch {
    // A transient failure just tries again next tick.
  }
}

export function subscribeToRemoteChanges(onChange: () => void): () => void {
  remoteChangeListeners.add(onChange);
  if (!pollTimer) {
    pollTimer = setInterval(pollOnce, POLL_INTERVAL_MS);
    // Also check right away when the tab becomes visible again, so
    // switching back to it feels current rather than waiting out the rest
    // of the interval.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") pollOnce();
    });
  }
  return () => remoteChangeListeners.delete(onChange);
}

// --- images: a small manifest (key -> file extension) alongside the actual
// files, since a git file needs a name but callers only ever pass around a
// bare key (e.g. "brand-logo-<id>") with no extension of its own. ---

let manifestCache: Record<string, string> | null = null;

async function getManifest(): Promise<Record<string, string>> {
  if (!manifestCache) manifestCache = (await fetchJson<Record<string, string>>(MANIFEST_PATH)) ?? {};
  return manifestCache;
}

async function saveManifest(manifest: Record<string, string>, token: string): Promise<void> {
  manifestCache = manifest;
  await putFile(MANIFEST_PATH, jsonToBase64(manifest), "Update image manifest", token);
}

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

export async function putImage(id: string, blob: Blob): Promise<void> {
  const token = requireToken();
  const ext = MIME_EXT[blob.type] ?? "bin";
  const manifest = await getManifest();
  const previousExt = manifest[id];
  const bytes = await blob.arrayBuffer();
  // Real photos routinely exceed the Contents API's 1MB limit — the Git
  // Data API (putLargeFile) has none, so every image upload goes through
  // that instead of the simple putFile used for the small JSON files.
  await putLargeFile(`${UPLOADS_DIR}/${id}.${ext}`, bytesToBase64(bytes), `Update image ${id}`, token);
  // The upload's format changed since last time (rare, but possible) — drop
  // the stale file under the old extension so it doesn't linger unreferenced.
  if (previousExt && previousExt !== ext) {
    await deleteFile(`${UPLOADS_DIR}/${id}.${previousExt}`, `Remove stale image ${id}`, token);
  }
  manifest[id] = ext;
  await saveManifest(manifest, token);
}

export async function getImageUrl(id: string | null | undefined): Promise<string | null> {
  if (!id) return null;
  const manifest = await getManifest();
  const ext = manifest[id];
  return ext ? relativeUrl(`${UPLOADS_DIR}/${id}.${ext}`) : null;
}

export async function deleteImage(id: string | null | undefined): Promise<void> {
  if (!id) return;
  const token = requireToken();
  const manifest = await getManifest();
  const ext = manifest[id];
  if (!ext) return;
  await deleteFile(`${UPLOADS_DIR}/${id}.${ext}`, `Remove image ${id}`, token);
  delete manifest[id];
  await saveManifest(manifest, token);
}

// Anonymous visitors have no write access, so there's nothing they could
// clean up anyway — silently skip rather than throwing "Login required"
// from what's meant to be invisible background maintenance (see its one
// call site in localClient.ts's getState()).
export async function sweepOrphanedImages(keepKeys: Set<string>): Promise<void> {
  if (!getPatToken()) return;
  const token = EMBEDDED_TOKEN;
  const manifest = await getManifest();
  const orphaned = Object.keys(manifest).filter((key) => !keepKeys.has(key));
  if (orphaned.length === 0) return;
  for (const key of orphaned) {
    await deleteFile(`${UPLOADS_DIR}/${key}.${manifest[key]}`, `Remove orphaned image ${key}`, token);
    delete manifest[key];
  }
  await saveManifest(manifest, token);
}

// Used only by the Settings > Backup & restore "Export" button (see
// dataTransfer.ts) — reads every image the manifest currently knows about.
export async function getAllImages(): Promise<Array<{ key: string; blob: Blob }>> {
  const manifest = await getManifest();
  const out: Array<{ key: string; blob: Blob }> = [];
  for (const [key, ext] of Object.entries(manifest)) {
    const res = await fetch(relativeUrl(`${UPLOADS_DIR}/${key}.${ext}`));
    if (res.ok) out.push({ key, blob: await res.blob() });
  }
  return out;
}

// No password check at all, by request — every visitor is already editing
// (see the auto-login side effect above); this only still gets called if
// someone manually logs out and then logs back in, in which case anything
// they type works.
export async function verifyAdminCredential(_secret: string): Promise<boolean> {
  return true;
}

export const ADMIN_LOGIN_HINT = "";
