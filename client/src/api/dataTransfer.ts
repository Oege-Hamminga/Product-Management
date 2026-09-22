// Backup & restore for a browser-storage-backed build (standalone/IndexedDB,
// or the GitHub-committed build — see githubDb.ts). Exports state and/or
// every stored image as one JSON file, and can replay that same file back
// in through the same loadState/saveState/putImage functions — used to
// move a browser's existing data into a fresh backend (e.g. moving from
// the standalone build's per-browser IndexedDB into the GitHub-committed
// shared version) without losing anything already entered.
//
// Imports "./localDb" exactly like localClient.ts does, so the same build-
// time alias (see vite.config.standalone.ts / vite.config.github.ts) picks
// the right backend automatically — this file never needs to know which one
// it's actually talking to.
import { getAllImages, loadState, putImage, saveState, type DbState } from "./localDb";

const EXPORT_FORMAT = "oem-portfolio-backup";
const EXPORT_VERSION = 1;

export interface BackupFile {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  exported_at: string;
  // null on an images-only export (see exportAllData below) — importAllData
  // then leaves brands/models/topics/etc. untouched and only applies images.
  state: DbState | null;
  // Keyed the same way brand/segment image lookups already are (e.g.
  // "brand-logo-<id>") — see localClient.ts's putImage/getImageUrl calls.
  images: Record<string, { mime: string; base64: string }>;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64: string, mime: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// `includeState`/`includeImages` let the Settings page offer separate
// "Export Data", "Export images" and "Export data & images" buttons.
// Skipping images is useful when the full export is too big to hand off
// somewhere with a size limit (e.g. GitHub's 25MB web-upload cap); skipping
// state is useful for moving just images across once the data side is
// already sorted (e.g. recovering photos from an older build separately,
// after its text data was already imported).
export async function exportAllData(options: { includeState?: boolean; includeImages?: boolean } = {}): Promise<BackupFile> {
  const includeState = options.includeState ?? true;
  const includeImages = options.includeImages ?? true;
  let state: DbState | null = null;
  if (includeState) {
    state = await loadState();
    if (!state) throw new Error("Nothing to export yet.");
  }
  const images = includeImages ? await getAllImages() : [];
  const imageEntries = await Promise.all(
    images.map(async ({ key, blob }) => [key, { mime: blob.type || "application/octet-stream", base64: await blobToBase64(blob) }] as const)
  );
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exported_at: new Date().toISOString(),
    state,
    images: Object.fromEntries(imageEntries),
  };
}

export function isBackupFile(x: unknown): x is BackupFile {
  return !!x && typeof x === "object" && (x as any).format === EXPORT_FORMAT && "state" in (x as any) && "images" in (x as any);
}

// Overwrites the current backend's state (unless the backup is images-only,
// see BackupFile.state above) and applies every image in the backup —
// used once, right after switching a site over to a new backend, to carry
// existing data across rather than starting from the default seed.
export async function importAllData(backup: BackupFile): Promise<void> {
  if (!isBackupFile(backup)) throw new Error("That file doesn't look like a backup from this app.");
  if (backup.state) await saveState(backup.state);
  for (const [key, { mime, base64 }] of Object.entries(backup.images)) {
    await putImage(key, base64ToBlob(base64, mime));
  }
}
