import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { requireAdmin } from "../middleware/auth.js";

const router = Router();
const PRODUCT_TYPES = new Set(["CC", "FC", "PW"]);

// Same auto-register-on-first-write pattern as vehicles.ts's phases route —
// a tile can exist purely from a News topic with no vehicle_products row yet.
async function findOrRegisterProduct(vehicleId: string, type: string): Promise<{ id: string } | null> {
  let existing = (await db
    .prepare("SELECT id FROM vehicle_products WHERE vehicle_id = ? AND product_type = ?")
    .get(vehicleId, type)) as { id: string } | undefined;
  if (existing) return existing;
  const vehicle = await db.prepare("SELECT id FROM vehicles WHERE id = ?").get(vehicleId);
  if (!vehicle) return null;
  const id = randomUUID();
  await db.prepare("INSERT INTO vehicle_products (id, vehicle_id, product_type) VALUES (?, ?, ?)").run(id, vehicleId, type);
  return { id };
}

async function mappingRow(externalName: string) {
  const row = (await db.prepare("SELECT * FROM cr_model_mappings WHERE external_name = ?").get(externalName)) as
    | { external_name: string; vehicle_id: string | null; product: string | null; is_universal: number }
    | undefined;
  if (!row) return null;
  if (row.is_universal) {
    return { external_name: row.external_name, vehicle_id: null, product: null, is_universal: true, vehicle_name: null, brand_name: null };
  }
  const vehicle = (await db
    .prepare("SELECT v.name AS vehicle_name, b.name AS brand_name FROM vehicles v JOIN brands b ON b.id = v.brand_id WHERE v.id = ?")
    .get(row.vehicle_id)) as { vehicle_name: string; brand_name: string } | undefined;
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
router.get("/mappings", async (_req, res) => {
  const names = ((await db.prepare("SELECT external_name FROM cr_model_mappings ORDER BY external_name ASC").all()) as {
    external_name: string;
  }[]).map((r) => r.external_name);
  res.json(await Promise.all(names.map(mappingRow)));
});

router.put("/mappings", requireAdmin, async (req, res) => {
  const { externalName, vehicleId, product, isUniversal } = req.body ?? {};
  if (typeof externalName !== "string" || !externalName.trim()) {
    return res.status(400).json({ error: "externalName is required." });
  }
  const name = externalName.trim();

  if (isUniversal === true) {
    await db.prepare(
      `INSERT INTO cr_model_mappings (external_name, vehicle_id, product, is_universal) VALUES (?, NULL, NULL, 1)
       ON CONFLICT(external_name) DO UPDATE SET vehicle_id = NULL, product = NULL, is_universal = 1`
    ).run(name);
  } else {
    if (typeof vehicleId !== "string" || !PRODUCT_TYPES.has(product)) {
      return res.status(400).json({ error: "vehicleId and a valid product (CC/FC/PW) are required." });
    }
    const vehicle = await db.prepare("SELECT id FROM vehicles WHERE id = ?").get(vehicleId);
    if (!vehicle) return res.status(404).json({ error: "Vehicle not found." });
    await db.prepare(
      `INSERT INTO cr_model_mappings (external_name, vehicle_id, product, is_universal) VALUES (?, ?, ?, 0)
       ON CONFLICT(external_name) DO UPDATE SET vehicle_id = excluded.vehicle_id, product = excluded.product, is_universal = 0`
    ).run(name, vehicleId, product);
  }
  res.json(await mappingRow(name));
});

router.delete("/mappings/:externalName", requireAdmin, async (req, res) => {
  await db.prepare("DELETE FROM cr_model_mappings WHERE external_name = ?").run(req.params.externalName);
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

// The CR tracker's Status (CR) column is one of exactly four values: "On
// Track", "At Risk", "On Hold", "Not Started". A row counts as "active" for
// "On Track" or "At Risk" — still moving, even if at risk; "On Hold" and
// "Not Started" (or anything blank/unrecognized) count as inactive.
function isActiveStatus(status: unknown): boolean {
  if (typeof status !== "string") return false;
  const s = status.trim();
  return /^on\s*track$/i.test(s) || /^at\s*risk$/i.test(s);
}

type Counts5 = [number, number, number, number, number];

// Pastes a full current snapshot each time (not a delta) — every mapped
// target's counts are replaced wholesale from this import's rows, so
// re-importing the same export twice is harmless. ph1-5 keeps its original
// meaning (every counted row in that phase, any status); ph1-5_inactive is
// the subset of those that are "On Hold" or "Not Started" — active per
// phase is derived as ph{n} - ph{n}_inactive wherever it's shown, never
// stored on its own.
router.post("/", requireAdmin, async (req, res) => {
  const rows = req.body?.rows;
  if (!Array.isArray(rows)) return res.status(400).json({ error: "rows must be an array." });

  const totalCounts = new Map<string, Counts5>();
  const inactiveCounts = new Map<string, Counts5>();
  let ignoredRows = 0;
  for (const row of rows) {
    const model = typeof row?.model === "string" ? row.model.trim() : "";
    const phase = phaseFromText(row?.phase);
    if (!model || phase === null) {
      ignoredRows++;
      continue;
    }
    if (!totalCounts.has(model)) totalCounts.set(model, [0, 0, 0, 0, 0]);
    totalCounts.get(model)![phase - 1]++;
    if (!isActiveStatus(row?.status)) {
      if (!inactiveCounts.has(model)) inactiveCounts.set(model, [0, 0, 0, 0, 0]);
      inactiveCounts.get(model)![phase - 1]++;
    }
  }

  const mappings = (await db.prepare("SELECT * FROM cr_model_mappings").all()) as {
    external_name: string;
    vehicle_id: string | null;
    product: string | null;
    is_universal: number;
  }[];
  const mapByName = new Map(mappings.map((m) => [m.external_name, m]));

  const updated: any[] = [];
  const unmapped: string[] = [];
  const universalTotals: Counts5 = [0, 0, 0, 0, 0];
  const universalInactive: Counts5 = [0, 0, 0, 0, 0];
  let anyUniversal = false;
  // Two external names can legitimately map to the same vehicle+product (an
  // inconsistently-spelled variant on the source site, say) — sum their
  // contributions into one write per target instead of the second one
  // silently overwriting the first's.
  const targetCounts = new Map<string, { vehicleId: string; product: string; counts: Counts5; inactive: Counts5 }>();

  for (const [model, c] of totalCounts) {
    const inactive = inactiveCounts.get(model) ?? [0, 0, 0, 0, 0];
    const mapping = mapByName.get(model);
    if (!mapping) {
      unmapped.push(model);
      continue;
    }
    if (mapping.is_universal) {
      anyUniversal = true;
      c.forEach((v, i) => (universalTotals[i] += v));
      inactive.forEach((v, i) => (universalInactive[i] += v));
      continue;
    }
    if (!mapping.vehicle_id || !mapping.product) {
      unmapped.push(model);
      continue;
    }
    const targetKey = `${mapping.vehicle_id}:${mapping.product}`;
    let target = targetCounts.get(targetKey);
    if (!target) {
      target = { vehicleId: mapping.vehicle_id, product: mapping.product, counts: [0, 0, 0, 0, 0], inactive: [0, 0, 0, 0, 0] };
      targetCounts.set(targetKey, target);
    }
    c.forEach((v, i) => (target!.counts[i] += v));
    inactive.forEach((v, i) => (target!.inactive[i] += v));
    const vehicle = (await db
      .prepare("SELECT v.name AS vehicle_name, b.name AS brand_name FROM vehicles v JOIN brands b ON b.id = v.brand_id WHERE v.id = ?")
      .get(mapping.vehicle_id)) as { vehicle_name: string; brand_name: string } | undefined;
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
    const product = await findOrRegisterProduct(target.vehicleId, target.product);
    if (!product) continue; // vehicle vanished mid-request — nothing sane to write to
    await db.prepare(
      `UPDATE vehicle_products SET
         ph1 = ?, ph2 = ?, ph3 = ?, ph4 = ?, ph5 = ?,
         ph1_inactive = ?, ph2_inactive = ?, ph3_inactive = ?, ph4_inactive = ?, ph5_inactive = ?
       WHERE id = ?`
    ).run(
      target.counts[0],
      target.counts[1],
      target.counts[2],
      target.counts[3],
      target.counts[4],
      target.inactive[0],
      target.inactive[1],
      target.inactive[2],
      target.inactive[3],
      target.inactive[4],
      product.id
    );
  }

  let universalCounts = null;
  if (anyUniversal) {
    universalCounts = { ph1: universalTotals[0], ph2: universalTotals[1], ph3: universalTotals[2], ph4: universalTotals[3], ph5: universalTotals[4] };
    await db.prepare(
      `UPDATE universal_product_changes SET
         ph1 = ?, ph2 = ?, ph3 = ?, ph4 = ?, ph5 = ?,
         ph1_inactive = ?, ph2_inactive = ?, ph3_inactive = ?, ph4_inactive = ?, ph5_inactive = ?
       WHERE id = 'universal'`
    ).run(
      universalTotals[0],
      universalTotals[1],
      universalTotals[2],
      universalTotals[3],
      universalTotals[4],
      universalInactive[0],
      universalInactive[1],
      universalInactive[2],
      universalInactive[3],
      universalInactive[4]
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

// Zeroes every ph1-5/ph1-5_inactive count everywhere (every vehicle_products
// row plus the universal bucket) — the same wipe the one-time migration in
// db.ts does automatically for pre-existing installs, but available on
// demand from Settings for whenever the admin wants a clean slate before a
// fresh import (e.g. after retiring an old export format). Leaves
// cr_model_mappings untouched — the external-name-to-model mappings are
// still good even once the counts they produced are cleared.
router.post("/clear", requireAdmin, async (_req, res) => {
  await db.exec(
    `UPDATE vehicle_products SET
       ph1 = 0, ph2 = 0, ph3 = 0, ph4 = 0, ph5 = 0,
       ph1_inactive = 0, ph2_inactive = 0, ph3_inactive = 0, ph4_inactive = 0, ph5_inactive = 0`
  );
  await db.exec(
    `UPDATE universal_product_changes SET
       ph1 = 0, ph2 = 0, ph3 = 0, ph4 = 0, ph5 = 0,
       ph1_inactive = 0, ph2_inactive = 0, ph3_inactive = 0, ph4_inactive = 0, ph5_inactive = 0`
  );
  res.status(204).end();
});

export default router;
