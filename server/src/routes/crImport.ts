import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { requireAdmin } from "../middleware/auth.js";

const router = Router();
const PRODUCT_TYPES = new Set(["CC", "FC", "PW"]);

// Same auto-register-on-first-write pattern as vehicles.ts's phases route —
// a tile can exist purely from a News topic with no vehicle_products row yet.
function findOrRegisterProduct(vehicleId: string, type: string): { id: string } | null {
  let existing = db
    .prepare("SELECT id FROM vehicle_products WHERE vehicle_id = ? AND product_type = ?")
    .get(vehicleId, type) as { id: string } | undefined;
  if (existing) return existing;
  const vehicle = db.prepare("SELECT id FROM vehicles WHERE id = ?").get(vehicleId);
  if (!vehicle) return null;
  const id = randomUUID();
  db.prepare("INSERT INTO vehicle_products (id, vehicle_id, product_type) VALUES (?, ?, ?)").run(id, vehicleId, type);
  return { id };
}

function mappingRow(externalName: string) {
  const row = db.prepare("SELECT * FROM cr_model_mappings WHERE external_name = ?").get(externalName) as
    | { external_name: string; vehicle_id: string | null; product: string | null; is_universal: number }
    | undefined;
  if (!row) return null;
  if (row.is_universal) {
    return { external_name: row.external_name, vehicle_id: null, product: null, is_universal: true, vehicle_name: null, brand_name: null };
  }
  const vehicle = db
    .prepare("SELECT v.name AS vehicle_name, b.name AS brand_name FROM vehicles v JOIN brands b ON b.id = v.brand_id WHERE v.id = ?")
    .get(row.vehicle_id) as { vehicle_name: string; brand_name: string } | undefined;
  return {
    external_name: row.external_name,
    vehicle_id: row.vehicle_id,
    product: row.product,
    is_universal: false,
    vehicle_name: vehicle?.vehicle_name ?? null,
    brand_name: vehicle?.brand_name ?? null,
  };
}

// Every known mapping (used by the Settings page to list + edit them, and to
// resolve each import without a mapping fully round-tripping the DB).
router.get("/mappings", (_req, res) => {
  const names = (db.prepare("SELECT external_name FROM cr_model_mappings ORDER BY external_name ASC").all() as {
    external_name: string;
  }[]).map((r) => r.external_name);
  res.json(names.map(mappingRow));
});

router.put("/mappings", requireAdmin, (req, res) => {
  const { externalName, vehicleId, product, isUniversal } = req.body ?? {};
  if (typeof externalName !== "string" || !externalName.trim()) {
    return res.status(400).json({ error: "externalName is required." });
  }
  const name = externalName.trim();

  if (isUniversal === true) {
    db.prepare(
      `INSERT INTO cr_model_mappings (external_name, vehicle_id, product, is_universal) VALUES (?, NULL, NULL, 1)
       ON CONFLICT(external_name) DO UPDATE SET vehicle_id = NULL, product = NULL, is_universal = 1`
    ).run(name);
  } else {
    if (typeof vehicleId !== "string" || !PRODUCT_TYPES.has(product)) {
      return res.status(400).json({ error: "vehicleId and a valid product (CC/FC/PW) are required." });
    }
    const vehicle = db.prepare("SELECT id FROM vehicles WHERE id = ?").get(vehicleId);
    if (!vehicle) return res.status(404).json({ error: "Vehicle not found." });
    db.prepare(
      `INSERT INTO cr_model_mappings (external_name, vehicle_id, product, is_universal) VALUES (?, ?, ?, 0)
       ON CONFLICT(external_name) DO UPDATE SET vehicle_id = excluded.vehicle_id, product = excluded.product, is_universal = 0`
    ).run(name, vehicleId, product);
  }
  res.json(mappingRow(name));
});

router.delete("/mappings/:externalName", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM cr_model_mappings WHERE external_name = ?").run(req.params.externalName);
  res.status(204).end();
});

// Extracts a leading phase digit (1-5) from strings like "2.Design" or just
// "2" — anything else (blank, "To be created", etc.) means "not yet in a
// phase" and doesn't count toward any bucket.
function phaseFromText(text: unknown): number | null {
  if (typeof text !== "string") return null;
  const m = text.trim().match(/^([1-5])\b/);
  return m ? Number(m[1]) : null;
}

// Pastes a full current snapshot each time (not a delta) — every mapped
// target's ph1-5 is replaced wholesale from this import's counts, so
// re-importing the same export twice is harmless.
router.post("/", requireAdmin, (req, res) => {
  const rows = req.body?.rows;
  if (!Array.isArray(rows)) return res.status(400).json({ error: "rows must be an array." });

  const counts = new Map<string, [number, number, number, number, number]>();
  let ignoredRows = 0;
  for (const row of rows) {
    const model = typeof row?.model === "string" ? row.model.trim() : "";
    const phase = phaseFromText(row?.phase);
    if (!model || phase === null) {
      ignoredRows++;
      continue;
    }
    if (!counts.has(model)) counts.set(model, [0, 0, 0, 0, 0]);
    counts.get(model)![phase - 1]++;
  }

  const mappings = db.prepare("SELECT * FROM cr_model_mappings").all() as {
    external_name: string;
    vehicle_id: string | null;
    product: string | null;
    is_universal: number;
  }[];
  const mapByName = new Map(mappings.map((m) => [m.external_name, m]));

  const updated: any[] = [];
  const unmapped: string[] = [];
  const universalTotals: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  let anyUniversal = false;
  // Two external names can legitimately map to the same vehicle+product (an
  // inconsistently-spelled variant on the source site, say) — sum their
  // contributions into one write per target instead of the second one
  // silently overwriting the first's.
  const targetCounts = new Map<string, { vehicleId: string; product: string; counts: [number, number, number, number, number] }>();

  for (const [model, c] of counts) {
    const mapping = mapByName.get(model);
    if (!mapping) {
      unmapped.push(model);
      continue;
    }
    if (mapping.is_universal) {
      anyUniversal = true;
      c.forEach((v, i) => (universalTotals[i] += v));
      continue;
    }
    if (!mapping.vehicle_id || !mapping.product) {
      unmapped.push(model);
      continue;
    }
    const targetKey = `${mapping.vehicle_id}:${mapping.product}`;
    let target = targetCounts.get(targetKey);
    if (!target) {
      target = { vehicleId: mapping.vehicle_id, product: mapping.product, counts: [0, 0, 0, 0, 0] };
      targetCounts.set(targetKey, target);
    }
    c.forEach((v, i) => (target!.counts[i] += v));
    const vehicle = db
      .prepare("SELECT v.name AS vehicle_name, b.name AS brand_name FROM vehicles v JOIN brands b ON b.id = v.brand_id WHERE v.id = ?")
      .get(mapping.vehicle_id) as { vehicle_name: string; brand_name: string } | undefined;
    updated.push({
      external_name: model,
      vehicle_id: mapping.vehicle_id,
      product: mapping.product,
      vehicle_name: vehicle?.vehicle_name ?? "",
      brand_name: vehicle?.brand_name ?? "",
      counts: { ph1: c[0], ph2: c[1], ph3: c[2], ph4: c[3], ph5: c[4] },
    });
  }

  for (const target of targetCounts.values()) {
    const product = findOrRegisterProduct(target.vehicleId, target.product);
    if (!product) continue; // vehicle vanished mid-request — nothing sane to write to
    db.prepare("UPDATE vehicle_products SET ph1 = ?, ph2 = ?, ph3 = ?, ph4 = ?, ph5 = ? WHERE id = ?").run(
      target.counts[0],
      target.counts[1],
      target.counts[2],
      target.counts[3],
      target.counts[4],
      product.id
    );
  }

  let universalCounts = null;
  if (anyUniversal) {
    universalCounts = { ph1: universalTotals[0], ph2: universalTotals[1], ph3: universalTotals[2], ph4: universalTotals[3], ph5: universalTotals[4] };
    db.prepare("UPDATE universal_product_changes SET ph1 = ?, ph2 = ?, ph3 = ?, ph4 = ?, ph5 = ? WHERE id = 'universal'").run(
      universalTotals[0],
      universalTotals[1],
      universalTotals[2],
      universalTotals[3],
      universalTotals[4]
    );
  }

  res.json({
    updated,
    universal_counts: universalCounts,
    unmapped,
    ignored_rows: ignoredRows,
    total_rows: rows.length,
  });
});

export default router;
