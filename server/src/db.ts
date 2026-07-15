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

db.exec(`
  CREATE TABLE IF NOT EXISTS brands (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    logo_path TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS vehicles (
    id TEXT PRIMARY KEY,
    brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS vehicle_products (
    id TEXT PRIMARY KEY,
    vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    product_type TEXT NOT NULL CHECK (product_type IN ('CC','FC','PW')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(vehicle_id, product_type)
  );

  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('bugtracker','research')),
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL CHECK (category IN ('Margin','Quality','Portfolio')),
    phase INTEGER CHECK (phase IS NULL OR phase BETWEEN 1 AND 5),
    priority TEXT CHECK (priority IS NULL OR priority IN ('Low','Medium','High','Critical')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_vehicles_brand ON vehicles(brand_id);
  CREATE INDEX IF NOT EXISTS idx_products_vehicle ON vehicle_products(vehicle_id);
  CREATE INDEX IF NOT EXISTS idx_notes_vehicle ON notes(vehicle_id);
`);

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

const brandCount = (db.prepare("SELECT COUNT(*) AS c FROM brands").get() as { c: number }).c;
if (brandCount === 0) {
  const insert = db.prepare(
    "INSERT INTO brands (id, name, logo_path, position) VALUES (?, ?, NULL, ?)"
  );
  const tx = db.transaction(() => {
    SEED_BRANDS.forEach((name, i) => insert.run(randomUUID(), name, i));
  });
  tx();
}
