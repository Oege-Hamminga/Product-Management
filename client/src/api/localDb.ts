// Minimal IndexedDB wrapper for the standalone (single-file, no-server) build.
// One "state" record holds all rows (mirrors the server's SQLite tables as
// plain arrays); the brand logo (the only remaining upload) is stored as a
// Blob in a separate store so the JSON state stays small, and read back as
// an object URL at render time.

const DB_NAME = "oem_portfolio_standalone";
const DB_VERSION = 1;
const STATE_STORE = "state";
const IMAGE_STORE = "images";
const STATE_KEY = "db";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STATE_STORE)) db.createObjectStore(STATE_STORE);
      if (!db.objectStoreNames.contains(IMAGE_STORE)) db.createObjectStore(IMAGE_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(db: IDBDatabase, store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

export interface DbState {
  brands: Row[];
  vehicles: Row[];
  vehicleProducts: Row[];
  notes: Row[];
  // Optional: added after the initial shape, so a returning visitor's
  // pre-existing saved state (without this field) must not be treated as
  // stale — see isCurrentShape() in localClient.ts, which deliberately does
  // NOT require this field, and every read/write defaults it with `?? []`.
  segmentImages?: Row[];
  // Same story — a single row of Ph1-5 counts not tied to any vehicle,
  // defaulted with `?? {}` wherever read.
  universalProductChanges?: Row;
  // Same story — admin-configurable Slides layout, defaulted with `?? []`
  // wherever read and self-healed once (see getState() in localClient.ts).
  slides?: Row[];
  // Same story — external "Model (CR)" name → vehicle+product (or Universal)
  // mappings used by the Product Changes paste-import, defaulted with `?? []`
  // wherever read.
  crModelMappings?: Row[];
  // Same story — a one-time flag, set the first time this state is loaded
  // after manual Product Changes editing was removed in favour of the
  // Settings > Product Changes import, so existing hand-entered counts get
  // zeroed out exactly once (see getState() in localClient.ts) instead of
  // silently sticking around alongside imported ones.
  productChangesManualReset?: boolean;
}

// Loosely typed row bag — the localClient layer applies the real shapes.
export type Row = Record<string, unknown>;

let dbPromise: Promise<IDBDatabase> | null = null;
function getDb(): Promise<IDBDatabase> {
  if (!dbPromise) dbPromise = openDb();
  return dbPromise;
}

export async function loadState(): Promise<DbState | null> {
  const db = await getDb();
  const value = await tx<DbState | undefined>(db, STATE_STORE, "readonly", (s) => s.get(STATE_KEY));
  return value ?? null;
}

export async function saveState(state: DbState): Promise<void> {
  const db = await getDb();
  await tx(db, STATE_STORE, "readwrite", (s) => s.put(state, STATE_KEY));
}

export async function putImage(id: string, blob: Blob): Promise<void> {
  const db = await getDb();
  await tx(db, IMAGE_STORE, "readwrite", (s) => s.put(blob, id));
}

export async function getImageUrl(id: string | null | undefined): Promise<string | null> {
  if (!id) return null;
  const db = await getDb();
  const blob = await tx<Blob | undefined>(db, IMAGE_STORE, "readonly", (s) => s.get(id));
  return blob ? URL.createObjectURL(blob) : null;
}

export async function deleteImage(id: string | null | undefined): Promise<void> {
  if (!id) return;
  const db = await getDb();
  await tx(db, IMAGE_STORE, "readwrite", (s) => s.delete(id));
}

// Every stored image, key and blob together — used only by the Settings >
// Backup & restore "Export" button (see dataTransfer.ts) so a browser's
// whole IndexedDB state (including images, which live in a separate object
// store from the rest of the data) can be packed into one downloadable file.
export async function getAllImages(): Promise<Array<{ key: string; blob: Blob }>> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const out: Array<{ key: string; blob: Blob }> = [];
    const t = db.transaction(IMAGE_STORE, "readonly");
    const req = t.objectStore(IMAGE_STORE).openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) {
        resolve(out);
        return;
      }
      out.push({ key: String(cursor.key), blob: cursor.value as Blob });
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

// The credential that unlocks editing, and the hint shown when it's wrong —
// githubDb.ts (the GitHub-committed build's storage backend) exports the
// same two names with real GitHub-token verification instead, so
// localClient.ts's login() works unchanged against either backend.
export async function verifyAdminCredential(secret: string): Promise<boolean> {
  return secret === "PM";
}
export const ADMIN_LOGIN_HINT = 'Incorrect password. (Hint: it’s "PM" on this demo build.)';

// Same name/shape as githubDb.ts's real version — here a no-op, since
// nothing outside this browser can ever change its own IndexedDB, so
// there's nothing to poll for or notify about.
export class ConflictError extends Error {}
export function subscribeToRemoteChanges(_onChange: () => void): () => void {
  return () => {};
}

// Deletes any stored image whose key isn't in `keepKeys` — cleans up blobs
// left behind by a vehicle/brand deleted before its images were removed
// (e.g. the old mind map's per-product images, from before the switch to
// per-segment images), so the store doesn't grow unbounded with dead blobs.
export async function sweepOrphanedImages(keepKeys: Set<string>): Promise<void> {
  const db = await getDb();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(IMAGE_STORE, "readwrite");
    const req = t.objectStore(IMAGE_STORE).openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) {
        resolve();
        return;
      }
      if (!keepKeys.has(String(cursor.key))) cursor.delete();
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}
