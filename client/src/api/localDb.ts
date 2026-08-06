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
