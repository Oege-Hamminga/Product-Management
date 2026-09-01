// GitHub Contents API-backed replacement for localDb.ts — used by the
// GitHub-committed build (see vite.config.github.ts's alias, which swaps
// localClient.ts's own "./localDb" import for this file). Same exported
// shape, so localClient.ts's business logic works completely unchanged;
// only where state/images physically live differs.
//
// Reads never need a token: the state file and every image are committed as
// plain files in this same repo, on the same branch GitHub Pages serves —
// so they're just same-origin relative fetches, exactly like any other
// asset on this site, reachable by any visitor with zero setup. Only writes
// need a token capable of pushing to this repo — see verifyAdminCredential
// below, which the app's normal login screen uses by treating the
// "password" field as a GitHub Personal Access Token instead of a fixed
// shared password.
import type { DbState } from "./localDb";

const OWNER = import.meta.env.VITE_GITHUB_OWNER as string;
const REPO = import.meta.env.VITE_GITHUB_REPO as string;
const BRANCH = import.meta.env.VITE_GITHUB_BRANCH as string;

// Same key localClient.ts's getToken()/setToken() already read and write —
// here it holds the actual GitHub PAT (see login() in localClient.ts, which
// stores the entered credential itself as the session token).
const TOKEN_KEY = "oem_portfolio_standalone_token";

const STATE_PATH = "data/app-data.json";
const MANIFEST_PATH = "data/image-manifest.json";
const UPLOADS_DIR = "data/uploads";

function getPatToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function requireToken(): string {
  const token = getPatToken();
  if (!token) throw new Error("Login required to make changes.");
  return token;
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
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}`, {
    headers: apiHeaders(token),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Could not check ${path} on GitHub (${res.status}).`);
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

async function putFile(path: string, base64Content: string, message: string, token: string): Promise<void> {
  const sha = await getFileSha(path, token);
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`, {
    method: "PUT",
    headers: { ...apiHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ message, content: base64Content, branch: BRANCH, ...(sha ? { sha } : {}) }),
  });
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

function bytesToBase64(bytes: ArrayBuffer): string {
  let binary = "";
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary);
}

function jsonToBase64(value: unknown): string {
  // btoa only handles Latin1 — encodeURIComponent/unescape round-trips any
  // UTF-8 text (accented brand names, etc.) through it safely.
  return btoa(unescape(encodeURIComponent(JSON.stringify(value, null, 2))));
}

// --- state ---

export async function loadState(): Promise<DbState | null> {
  return fetchJson<DbState>(STATE_PATH);
}

export async function saveState(state: DbState): Promise<void> {
  const token = requireToken();
  await putFile(STATE_PATH, jsonToBase64(state), "Update app data", token);
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
  await putFile(`${UPLOADS_DIR}/${id}.${ext}`, bytesToBase64(bytes), `Update image ${id}`, token);
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
  const token = getPatToken();
  if (!token) return;
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

// The "password" field on the normal login screen is, in this build, a
// GitHub Personal Access Token — checked for real by asking GitHub whether
// it can push to this repo, rather than compared against a fixed string.
export async function verifyAdminCredential(secret: string): Promise<boolean> {
  const token = secret.trim();
  if (!token) return false;
  try {
    const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}`, { headers: apiHeaders(token) });
    if (!res.ok) return false;
    const data = (await res.json()) as { permissions?: { push?: boolean } };
    return data.permissions?.push === true;
  } catch {
    return false;
  }
}

export const ADMIN_LOGIN_HINT =
  "Incorrect or read-only token. Paste a GitHub personal access token with write (Contents) access to this repository.";
