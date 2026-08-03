import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, "app.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// A local sqlite file from before the News/BT note redesign has a `notes`
// table shaped like the old schema (phase instead of bt_code/cw_date, no
// `product` column). Reading/writing it with the new column set would throw
// at query time, so detect a stale shape up front and drop the table —
// same self-healing approach used for the standalone build's IndexedDB.
const notesTableExists = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='notes'")
  .get();
if (notesTableExists) {
  const columns = (db.prepare("PRAGMA table_info(notes)").all() as { name: string }[]).map((c) => c.name);
  const expected = ["bt_code", "cw_date", "product", "priority", "completed", "phase"];
  const isCurrentShape = expected.every((c) => columns.includes(c));
  if (!isCurrentShape) db.exec("DROP TABLE notes");
  // Adding cw_date_end (a News period's end week) is purely additive, so an
  // ALTER TABLE keeps existing notes instead of dropping the table like the
  // shape check above does for real schema changes.
  else {
    if (!columns.includes("cw_date_end")) db.exec("ALTER TABLE notes ADD COLUMN cw_date_end TEXT");
    // Same story for long_term (a News item with no specific week, always
    // shown until completed) — additive, existing notes default to 0/false.
    if (!columns.includes("long_term")) db.exec("ALTER TABLE notes ADD COLUMN long_term INTEGER NOT NULL DEFAULT 0");
    // Same story for position (manual drag-reorder within a Slides tile) —
    // additive, existing notes default to 0 (creation order still applies
    // via the tile's topics sort, since it's a stable sort).
    if (!columns.includes("position")) db.exec("ALTER TABLE notes ADD COLUMN position INTEGER NOT NULL DEFAULT 0");
  }
}

db.exec(`
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
  -- category's own tile on the Slides page (see SlidesPage.tsx).
  CREATE TABLE IF NOT EXISTS universal_product_changes (
    id TEXT PRIMARY KEY DEFAULT 'universal',
    ph1 INTEGER NOT NULL DEFAULT 0,
    ph2 INTEGER NOT NULL DEFAULT 0,
    ph3 INTEGER NOT NULL DEFAULT 0,
    ph4 INTEGER NOT NULL DEFAULT 0,
    ph5 INTEGER NOT NULL DEFAULT 0
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
  const brandColumns = (db.prepare("PRAGMA table_info(brands)").all() as { name: string }[]).map((c) => c.name);
  if (!brandColumns.includes("slide_id")) {
    db.exec("ALTER TABLE brands ADD COLUMN slide_id TEXT REFERENCES slides(id) ON DELETE SET NULL");
  }
}

// Additive: a local DB from before "Product Changes" phase counts existed has
// a vehicle_products table without the ph1-5 columns — ALTER rather than drop,
// same self-healing approach used elsewhere in this file, since existing
// vehicle/product associations must survive untouched.
{
  const productColumns = (db.prepare("PRAGMA table_info(vehicle_products)").all() as { name: string }[]).map(
    (c) => c.name
  );
  ["ph1", "ph2", "ph3", "ph4", "ph5"].forEach((col) => {
    if (!productColumns.includes(col)) db.exec(`ALTER TABLE vehicle_products ADD COLUMN ${col} INTEGER NOT NULL DEFAULT 0`);
  });
  // Additive: a local DB from before per-segment Slides visibility existed
  // has a vehicle_products table without this column. Existing segments
  // default to visible (0 = not hidden) — removing one tile (e.g. "K0 Crew
  // Cab") no longer takes its sibling products (e.g. "K0 Flex Cab") with it,
  // the way the old vehicle-level hidden_from_slides flag used to.
  if (!productColumns.includes("hidden_from_slides")) {
    db.exec("ALTER TABLE vehicle_products ADD COLUMN hidden_from_slides INTEGER NOT NULL DEFAULT 0");
  }
}

// Additive: a local DB from before per-model Slides visibility existed has a
// vehicles table without this column — ALTER rather than drop, same
// self-healing approach used elsewhere in this file. Existing vehicles
// default to visible (0 = not hidden), matching "all models show by default".
{
  const vehicleColumns = (db.prepare("PRAGMA table_info(vehicles)").all() as { name: string }[]).map((c) => c.name);
  if (!vehicleColumns.includes("hidden_from_slides")) {
    db.exec("ALTER TABLE vehicles ADD COLUMN hidden_from_slides INTEGER NOT NULL DEFAULT 0");
  }
  // Additive: a local DB from before the per-model Product Changes toggle
  // existed has a vehicles table without this column. Existing vehicles
  // default to shown (1), matching the box's previous always-on behaviour —
  // toggling it off both hides a model's Product Changes box on Slides and
  // excludes it from the Total Product Changes sum on the last slide.
  if (!vehicleColumns.includes("show_product_changes")) {
    db.exec("ALTER TABLE vehicles ADD COLUMN show_product_changes INTEGER NOT NULL DEFAULT 1");
  }
}

db.prepare("INSERT OR IGNORE INTO universal_product_changes (id) VALUES ('universal')").run();

// Superseded by segment_images (one image per vehicle+product "K0 CC" combo
// rather than one shared image per product across every brand) — drop the
// old table rather than leaving it around unused.
db.exec("DROP TABLE IF EXISTS product_images");

// The old mind map ("Board") page and its Bugtracker tickets were removed
// entirely — nothing creates a kind='bt' note any more, so any that remain
// are dead data from before that removal. Deleting them on every startup is
// idempotent (a no-op once cleaned).
db.exec("DELETE FROM notes WHERE kind = 'bt'");

// Sweep orphaned upload files — anything in uploads/ no longer referenced by
// a brand logo or a segment image (leftovers from the old mind map's
// per-product image feature, or from a vehicle deleted before its images
// were cleaned up) — so the folder doesn't grow unbounded with dead files.
try {
  const referenced = new Set<string>();
  (db.prepare("SELECT logo_path FROM brands WHERE logo_path IS NOT NULL").all() as { logo_path: string }[]).forEach(
    (r) => referenced.add(path.basename(r.logo_path))
  );
  (db.prepare("SELECT image_path FROM segment_images").all() as { image_path: string }[]).forEach((r) =>
    referenced.add(path.basename(r.image_path))
  );
  const uploadsDir = path.join(__dirname, "..", "uploads");
  if (fs.existsSync(uploadsDir)) {
    for (const filename of fs.readdirSync(uploadsDir)) {
      if (filename === ".gitkeep" || referenced.has(filename)) continue;
      fs.unlinkSync(path.join(uploadsDir, filename));
    }
  }
} catch {
  // Best-effort cleanup — a missing/unreadable uploads dir shouldn't crash startup.
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
const brandCount = (db.prepare("SELECT COUNT(*) AS c FROM brands").get() as { c: number }).c;
if (brandCount === 0) {
  const insert = db.prepare(
    "INSERT INTO brands (id, name, logo_path, position) VALUES (?, ?, NULL, ?)"
  );
  const insertVehicle = db.prepare(
    "INSERT INTO vehicles (id, brand_id, name, position) VALUES (?, ?, ?, ?)"
  );
  const tx = db.transaction(() => {
    SEED_BRANDS.forEach((name, i) => insert.run(randomUUID(), name, i));
    const overallNewsBrandId = randomUUID();
    insert.run(overallNewsBrandId, "Overall News", SEED_BRANDS.length);
    ["Overall News", "Universal Product Changes"].forEach((name, i) =>
      insertVehicle.run(randomUUID(), overallNewsBrandId, name, i)
    );
  });
  tx();
}

// Slides are admin-configurable from Settings (title, which brands appear on
// which, add/delete) instead of a fixed 4-group layout. Seeds today's layout
// exactly once (slides.length===0, so this never re-fires and clobbers an
// admin's own edits) — for a brand-new install this is the whole seed; for
// an install upgrading from the old hardcoded groups it reproduces the same
// layout so nothing visibly moves. A brand left unassigned (BOTT, Overall
// News, and anything added later) falls back to whichever slide is last.
{
  const slideCount = (db.prepare("SELECT COUNT(*) AS c FROM slides").get() as { c: number }).c;
  if (slideCount === 0) {
    const SLIDE_DEFS: { title: string; brandNames: string[] }[] = [
      { title: "Stellantis · KIA · IVECO", brandNames: ["Stellantis", "KIA", "IVECO"] },
      { title: "Volkswagen", brandNames: ["Volkswagen"] },
      { title: "Renault · Ford · Mercedes Benz", brandNames: ["Renault", "Ford", "Mercedes Benz"] },
      { title: "Overall News", brandNames: [] },
    ];
    SLIDE_DEFS.forEach((def, i) => {
      const slideId = randomUUID();
      db.prepare("INSERT INTO slides (id, title, position) VALUES (?, ?, ?)").run(slideId, def.title, i);
      def.brandNames.forEach((brandName) => {
        db.prepare("UPDATE brands SET slide_id = ? WHERE name = ?").run(slideId, brandName);
      });
    });
  }
}
