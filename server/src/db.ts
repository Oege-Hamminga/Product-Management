import { createClient, type Client, type InArgs, type InValue } from "@libsql/client";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
fs.mkdirSync(dataDir, { recursive: true });

// Turso (https://turso.tech) hosts this same libSQL engine remotely, so every
// device talking to the deployed server reads/writes one shared database
// instead of each server instance having its own local file — set
// TURSO_DATABASE_URL (and TURSO_AUTH_TOKEN) in production to point here.
// Left unset, this falls back to the same local SQLite file used before,
// unchanged, for local development.
const client: Client = process.env.TURSO_DATABASE_URL
  ? createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN })
  : createClient({ url: `file:${path.join(dataDir, "app.sqlite")}` });

// Thin compatibility layer mirroring better-sqlite3's prepare().get/all/run
// shape, so every route file keeps its existing statement-building code
// almost unchanged — just with `await` added. The underlying libSQL client
// is always async (Turso talks HTTP over the network), even for the local
// file fallback above.
function prepare(sql: string) {
  return {
    async get(...args: InValue[]) {
      const res = await client.execute({ sql, args });
      return res.rows[0] as any;
    },
    async all(...args: InValue[]) {
      const res = await client.execute({ sql, args });
      return res.rows as any[];
    },
    async run(...args: InValue[]) {
      const res = await client.execute({ sql, args });
      return { changes: Number(res.rowsAffected) };
    },
  };
}

async function exec(sql: string) {
  await client.executeMultiple(sql);
}

export const db = { prepare, exec, client };

async function tableExists(name: string): Promise<boolean> {
  const row = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
  return Boolean(row);
}

async function columnsOf(table: string): Promise<string[]> {
  const rows = (await db.prepare(`PRAGMA table_info(${table})`).all()) as { name: string }[];
  return rows.map((c) => c.name);
}

let readyPromise: Promise<void> | null = null;

// Runs once, awaited by index.ts before the server starts accepting
// requests — everything below used to run synchronously as this module's
// top-level side effects (safe with better-sqlite3's sync API); the libSQL
// client is async even for the local-file fallback, so it's now wrapped in
// an explicit init function instead.
export function initDb(): Promise<void> {
  if (!readyPromise) readyPromise = runInit();
  return readyPromise;
}

async function runInit() {
  await client.execute("PRAGMA foreign_keys = ON");

  // A local sqlite file from before the News/BT note redesign has a `notes`
  // table shaped like the old schema (phase instead of bt_code/cw_date, no
  // `product` column). Reading/writing it with the new column set would throw
  // at query time, so detect a stale shape up front and drop the table —
  // same self-healing approach used for the standalone build's IndexedDB.
  if (await tableExists("notes")) {
    const columns = await columnsOf("notes");
    const expected = ["bt_code", "cw_date", "product", "priority", "completed", "phase"];
    const isCurrentShape = expected.every((c) => columns.includes(c));
    if (!isCurrentShape) {
      await exec("DROP TABLE notes");
    } else {
      // Adding cw_date_end (a News period's end week) is purely additive, so an
      // ALTER TABLE keeps existing notes instead of dropping the table like the
      // shape check above does for real schema changes.
      if (!columns.includes("cw_date_end")) await exec("ALTER TABLE notes ADD COLUMN cw_date_end TEXT");
      // Same story for long_term (a News item with no specific week, always
      // shown until completed) — additive, existing notes default to 0/false.
      if (!columns.includes("long_term")) await exec("ALTER TABLE notes ADD COLUMN long_term INTEGER NOT NULL DEFAULT 0");
      // Same story for position (manual drag-reorder within a Slides tile) —
      // additive, existing notes default to 0 (creation order still applies
      // via the tile's topics sort, since it's a stable sort).
      if (!columns.includes("position")) await exec("ALTER TABLE notes ADD COLUMN position INTEGER NOT NULL DEFAULT 0");
    }
  }

  await exec(`
    CREATE TABLE IF NOT EXISTS slides (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS brands (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      logo_path TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      slide_id TEXT REFERENCES slides(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS vehicles (
      id TEXT PRIMARY KEY,
      brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      hidden_from_slides INTEGER NOT NULL DEFAULT 0,
      show_product_changes INTEGER NOT NULL DEFAULT 1,
      slide_weight REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS vehicle_products (
      id TEXT PRIMARY KEY,
      vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      product_type TEXT NOT NULL CHECK (product_type IN ('CC','FC','PW')),
      ph1 INTEGER NOT NULL DEFAULT 0,
      ph2 INTEGER NOT NULL DEFAULT 0,
      ph3 INTEGER NOT NULL DEFAULT 0,
      ph4 INTEGER NOT NULL DEFAULT 0,
      ph5 INTEGER NOT NULL DEFAULT 0,
      hidden_from_slides INTEGER NOT NULL DEFAULT 0,
      slide_weight REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(vehicle_id, product_type)
    );

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('bt','news')),
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL CHECK (category IN ('Margin','Quality','Portfolio','Other')),
      product TEXT CHECK (product IS NULL OR product IN ('CC','FC','PW')),
      priority TEXT NOT NULL CHECK (priority IN ('High','Normal')),
      bt_code TEXT,
      cw_date TEXT,
      cw_date_end TEXT,
      phase INTEGER CHECK (phase IS NULL OR phase BETWEEN 1 AND 5),
      completed INTEGER NOT NULL DEFAULT 0,
      long_term INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS segment_images (
      vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      product_type TEXT NOT NULL CHECK (product_type IN ('CC','FC','PW')),
      image_path TEXT NOT NULL,
      PRIMARY KEY (vehicle_id, product_type)
    );

    -- A single row of Ph1-5 "Product Changes" counts not tied to any specific
    -- vehicle/product — displayed inside the "Universal Product Changes" news
    -- category's own tile on the Slides page (see SlidesPage.tsx). ph{n} is
    -- every counted CR in that phase regardless of status; ph{n}_inactive is
    -- the subset of those whose CR status wasn't "On Track" (On Hold, Not yet
    -- started, blank, or anything else unrecognized) — active per phase is
    -- ph{n} minus ph{n}_inactive, derived rather than stored, so the two
    -- numbers can never drift apart. See routes/crImport.ts.
    CREATE TABLE IF NOT EXISTS universal_product_changes (
      id TEXT PRIMARY KEY DEFAULT 'universal',
      ph1 INTEGER NOT NULL DEFAULT 0,
      ph2 INTEGER NOT NULL DEFAULT 0,
      ph3 INTEGER NOT NULL DEFAULT 0,
      ph4 INTEGER NOT NULL DEFAULT 0,
      ph5 INTEGER NOT NULL DEFAULT 0,
      ph1_inactive INTEGER NOT NULL DEFAULT 0,
      ph2_inactive INTEGER NOT NULL DEFAULT 0,
      ph3_inactive INTEGER NOT NULL DEFAULT 0,
      ph4_inactive INTEGER NOT NULL DEFAULT 0,
      ph5_inactive INTEGER NOT NULL DEFAULT 0
    );

    -- Remembers how an external CR/issue-tracker table's "Model (CR)" text (a
    -- name we don't control the spelling of) maps to a real vehicle+product, or
    -- to the Universal Product Changes bucket, so a Settings-page paste-import
    -- can turn its Phase column straight into ph1-5 counts. Set once per
    -- external name, then reused by every later import.
    CREATE TABLE IF NOT EXISTS cr_model_mappings (
      external_name TEXT PRIMARY KEY,
      vehicle_id TEXT REFERENCES vehicles(id) ON DELETE CASCADE,
      product TEXT CHECK (product IS NULL OR product IN ('CC','FC','PW')),
      is_universal INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- One-off flags for migrations that need to run exactly once (not on every
    -- startup like the additive ALTER-TABLE blocks below) — see the Product
    -- Changes manual-reset block further down for the first user of this.
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Uploaded brand logos and segment images, stored as base64 right in this
    -- same database (rather than as files on the server's own disk) so they
    -- survive a redeploy/restart on hosts with an ephemeral filesystem (e.g.
    -- Render's free tier) exactly like every other piece of data here — see
    -- upload.ts, which is the only thing that reads/writes this table.
    CREATE TABLE IF NOT EXISTS uploaded_files (
      id TEXT PRIMARY KEY,
      mime_type TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_vehicles_brand ON vehicles(brand_id);
    CREATE INDEX IF NOT EXISTS idx_products_vehicle ON vehicle_products(vehicle_id);
    CREATE INDEX IF NOT EXISTS idx_notes_vehicle ON notes(vehicle_id);
    CREATE INDEX IF NOT EXISTS idx_brands_slide ON brands(slide_id);
  `);

  // Additive: a local DB from before Slides were admin-configurable has a
  // brands table without this column — ALTER rather than drop, same
  // self-healing approach used elsewhere in this file. A brand with no
  // slide_id (existing brands, until assigned) falls back to the last slide,
  // matching the old hardcoded catch-all behaviour.
  {
    const brandColumns = await columnsOf("brands");
    if (!brandColumns.includes("slide_id")) {
      await exec("ALTER TABLE brands ADD COLUMN slide_id TEXT REFERENCES slides(id) ON DELETE SET NULL");
    }
  }

  // Additive: a local DB from before "Product Changes" phase counts existed has
  // a vehicle_products table without the ph1-5 columns — ALTER rather than drop,
  // same self-healing approach used elsewhere in this file, since existing
  // vehicle/product associations must survive untouched.
  {
    const productColumns = await columnsOf("vehicle_products");
    for (const col of ["ph1", "ph2", "ph3", "ph4", "ph5"]) {
      if (!productColumns.includes(col)) await exec(`ALTER TABLE vehicle_products ADD COLUMN ${col} INTEGER NOT NULL DEFAULT 0`);
    }
    // Additive: a local DB from before the Active/Inactive Product Changes
    // split existed has a vehicle_products table without these — see the
    // comment on universal_product_changes above for what they mean.
    for (const col of ["ph1_inactive", "ph2_inactive", "ph3_inactive", "ph4_inactive", "ph5_inactive"]) {
      if (!productColumns.includes(col)) await exec(`ALTER TABLE vehicle_products ADD COLUMN ${col} INTEGER NOT NULL DEFAULT 0`);
    }
    // Additive: a local DB from before per-segment Slides visibility existed
    // has a vehicle_products table without this column. Existing segments
    // default to visible (0 = not hidden) — removing one tile (e.g. "K0 Crew
    // Cab") no longer takes its sibling products (e.g. "K0 Flex Cab") with it,
    // the way the old vehicle-level hidden_from_slides flag used to.
    if (!productColumns.includes("hidden_from_slides")) {
      await exec("ALTER TABLE vehicle_products ADD COLUMN hidden_from_slides INTEGER NOT NULL DEFAULT 0");
    }
    // Additive: a local DB from before the adjustable Slides split line existed
    // has a vehicle_products table without this column. NULL (the default for
    // every existing row) means "size this tile automatically from its topic
    // count", exactly matching today's behaviour — only a tile someone has
    // actually dragged gets a real number here.
    if (!productColumns.includes("slide_weight")) {
      await exec("ALTER TABLE vehicle_products ADD COLUMN slide_weight REAL");
    }
  }

  // Additive: a local DB from before per-model Slides visibility existed has a
  // vehicles table without this column — ALTER rather than drop, same
  // self-healing approach used elsewhere in this file. Existing vehicles
  // default to visible (0 = not hidden), matching "all models show by default".
  {
    const vehicleColumns = await columnsOf("vehicles");
    if (!vehicleColumns.includes("hidden_from_slides")) {
      await exec("ALTER TABLE vehicles ADD COLUMN hidden_from_slides INTEGER NOT NULL DEFAULT 0");
    }
    // Additive: a local DB from before the per-model Product Changes toggle
    // existed has a vehicles table without this column. Existing vehicles
    // default to shown (1), matching the box's previous always-on behaviour —
    // toggling it off both hides a model's Product Changes box on Slides and
    // excludes it from the Total Product Changes sum on the last slide.
    if (!vehicleColumns.includes("show_product_changes")) {
      await exec("ALTER TABLE vehicles ADD COLUMN show_product_changes INTEGER NOT NULL DEFAULT 1");
    }
    // Additive: a local DB from before the adjustable Slides split line existed
    // has a vehicles table without this column — same NULL-means-automatic
    // default as vehicle_products.slide_weight above, used here for an
    // "Overall News" category tile (single segment, no vehicle_products row).
    if (!vehicleColumns.includes("slide_weight")) {
      await exec("ALTER TABLE vehicles ADD COLUMN slide_weight REAL");
    }
  }

  // Additive: a local DB from before the Active/Inactive Product Changes split
  // existed has a universal_product_changes table without these — same story
  // as the vehicle_products migration above.
  {
    const universalColumns = await columnsOf("universal_product_changes");
    for (const col of ["ph1_inactive", "ph2_inactive", "ph3_inactive", "ph4_inactive", "ph5_inactive"]) {
      if (!universalColumns.includes(col)) await exec(`ALTER TABLE universal_product_changes ADD COLUMN ${col} INTEGER NOT NULL DEFAULT 0`);
    }
  }

  await db.prepare("INSERT OR IGNORE INTO universal_product_changes (id) VALUES ('universal')").run();

  // Product Changes counts are now exclusively set by the Settings > Product
  // Changes import (see routes/crImport.ts) — manual editing of ph1-5 on the
  // Slides page has been removed entirely, so the CR tracker import is the
  // only point of truth. Any counts already sitting in the DB predate that
  // change and weren't sourced from the tracker, so they're cleared out once.
  // Gated by a flag in app_meta so this only ever fires a single time, ever —
  // without the guard, every server restart would wipe values a real import
  // had since written.
  {
    const resetDone = await db.prepare("SELECT value FROM app_meta WHERE key = 'product_changes_manual_reset'").get();
    if (!resetDone) {
      await exec("UPDATE vehicle_products SET ph1 = 0, ph2 = 0, ph3 = 0, ph4 = 0, ph5 = 0");
      await exec("UPDATE universal_product_changes SET ph1 = 0, ph2 = 0, ph3 = 0, ph4 = 0, ph5 = 0");
      await db.prepare("INSERT INTO app_meta (key, value) VALUES ('product_changes_manual_reset', '1')").run();
    }
  }

  // Superseded by segment_images (one image per vehicle+product "K0 CC" combo
  // rather than one shared image per product across every brand) — drop the
  // old table rather than leaving it around unused.
  await exec("DROP TABLE IF EXISTS product_images");

  // The old mind map ("Board") page and its Bugtracker tickets were removed
  // entirely — nothing creates a kind='bt' note any more, so any that remain
  // are dead data from before that removal. Deleting them on every startup is
  // idempotent (a no-op once cleaned).
  await exec("DELETE FROM notes WHERE kind = 'bt'");

  // Sweep orphaned uploaded_files rows — anything no longer referenced by a
  // brand logo or a segment image (leftovers from a deleted brand/vehicle, or
  // from replacing an image) — so the table doesn't grow unbounded with dead
  // rows. Mirrors the old local-disk orphan sweep this replaced.
  try {
    const referenced = new Set<string>();
    const uploadIdFromPath = (p: string) => (p.startsWith("/uploads/") ? p.slice("/uploads/".length) : null);
    ((await db.prepare("SELECT logo_path FROM brands WHERE logo_path IS NOT NULL").all()) as { logo_path: string }[]).forEach(
      (r) => {
        const id = uploadIdFromPath(r.logo_path);
        if (id) referenced.add(id);
      }
    );
    ((await db.prepare("SELECT image_path FROM segment_images").all()) as { image_path: string }[]).forEach((r) => {
      const id = uploadIdFromPath(r.image_path);
      if (id) referenced.add(id);
    });
    const allIds = ((await db.prepare("SELECT id FROM uploaded_files").all()) as { id: string }[]).map((r) => r.id);
    const orphaned = allIds.filter((id) => !referenced.has(id));
    for (const id of orphaned) {
      await db.prepare("DELETE FROM uploaded_files WHERE id = ?").run(id);
    }
  } catch {
    // Best-effort cleanup — shouldn't crash startup.
  }

  const SEED_BRANDS = [
    "Stellantis",
    "Volkswagen",
    "Renault",
    "Ford",
    "Mercedes Benz",
    "IVECO",
    "KIA",
    "BOTT",
  ];

  // "Overall News" is a starter brand like any other in SEED_BRANDS — fully
  // creatable and deletable, no special reservation — but its two starter
  // "models" are really news categories (e.g. "Overall News", "Universal
  // Product Changes"), not real vehicles, so they never get real CC/FC/PW
  // products (see the guard in vehicles.ts). "Universal Product Changes" is
  // seeded alongside it so the legacy universal_product_changes counts (see
  // below) have a tile to live in by default, matching the always-visible box
  // this replaces.
  {
    const brandCount = ((await db.prepare("SELECT COUNT(*) AS c FROM brands").get()) as { c: number }).c;
    if (brandCount === 0) {
      const statements: { sql: string; args: InArgs }[] = [];
      SEED_BRANDS.forEach((name, i) => {
        statements.push({ sql: "INSERT INTO brands (id, name, logo_path, position) VALUES (?, ?, NULL, ?)", args: [randomUUID(), name, i] });
      });
      const overallNewsBrandId = randomUUID();
      statements.push({
        sql: "INSERT INTO brands (id, name, logo_path, position) VALUES (?, ?, NULL, ?)",
        args: [overallNewsBrandId, "Overall News", SEED_BRANDS.length],
      });
      ["Overall News", "Universal Product Changes"].forEach((name, i) => {
        statements.push({
          sql: "INSERT INTO vehicles (id, brand_id, name, position) VALUES (?, ?, ?, ?)",
          args: [randomUUID(), overallNewsBrandId, name, i],
        });
      });
      await client.batch(statements, "write");
    }
  }

  // Slides are admin-configurable from Settings (title, which brands appear on
  // which, add/delete) instead of a fixed 4-group layout. Seeds today's layout
  // exactly once (slides.length===0, so this never re-fires and clobbers an
  // admin's own edits) — for a brand-new install this is the whole seed; for
  // an install upgrading from the old hardcoded groups it reproduces the same
  // layout so nothing visibly moves. A brand left unassigned (BOTT, Overall
  // News, and anything added later) falls back to whichever slide is last.
  {
    const slideCount = ((await db.prepare("SELECT COUNT(*) AS c FROM slides").get()) as { c: number }).c;
    if (slideCount === 0) {
      const SLIDE_DEFS: { title: string; brandNames: string[] }[] = [
        { title: "Stellantis · KIA · IVECO", brandNames: ["Stellantis", "KIA", "IVECO"] },
        { title: "Volkswagen", brandNames: ["Volkswagen"] },
        { title: "Renault · Ford · Mercedes Benz", brandNames: ["Renault", "Ford", "Mercedes Benz"] },
        { title: "Overall News", brandNames: [] },
      ];
      for (const [i, def] of SLIDE_DEFS.entries()) {
        const slideId = randomUUID();
        await db.prepare("INSERT INTO slides (id, title, position) VALUES (?, ?, ?)").run(slideId, def.title, i);
        for (const brandName of def.brandNames) {
          await db.prepare("UPDATE brands SET slide_id = ? WHERE name = ?").run(slideId, brandName);
        }
      }
    }
  }
}
