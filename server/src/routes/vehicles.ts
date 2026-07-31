import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { requireAdmin } from "../middleware/auth.js";

const router = Router();

const PRODUCT_TYPES = new Set(["CC", "FC", "PW"]);

function vehicleDetail(id: string) {
  const vehicle = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(id) as any;
  if (!vehicle) return null;
  const brand = db.prepare("SELECT * FROM brands WHERE id = ?").get(vehicle.brand_id);
  const products = db
    .prepare("SELECT * FROM vehicle_products WHERE vehicle_id = ? ORDER BY product_type ASC")
    .all(id);
  // The vehicle panel manages a vehicle's full topic history, so completed
  // topics stay visible here (unlike the brand map canvas / sidebar).
  const notes = (
    db.prepare("SELECT * FROM notes WHERE vehicle_id = ? ORDER BY category ASC, created_at ASC").all(id) as any[]
  ).map((n) => ({ ...n, completed: Boolean(n.completed) }));
  return { ...vehicle, brand, products, notes };
}

router.get("/:id", (req, res) => {
  const detail = vehicleDetail(req.params.id);
  if (!detail) return res.status(404).json({ error: "Vehicle not found." });
  res.json(detail);
});

router.post("/brand/:brandId", requireAdmin, (req, res) => {
  const brand = db.prepare("SELECT * FROM brands WHERE id = ?").get(req.params.brandId);
  if (!brand) return res.status(404).json({ error: "Brand not found." });
  const { name } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "Vehicle name is required." });
  }
  const maxPos = db
    .prepare("SELECT COALESCE(MAX(position), -1) AS m FROM vehicles WHERE brand_id = ?")
    .get(req.params.brandId) as { m: number };
  const id = randomUUID();
  db.prepare("INSERT INTO vehicles (id, brand_id, name, position) VALUES (?, ?, ?, ?)").run(
    id,
    req.params.brandId,
    name.trim(),
    maxPos.m + 1
  );
  res.status(201).json(vehicleDetail(id));
});

router.patch("/:id", requireAdmin, (req, res) => {
  const vehicle = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(req.params.id);
  if (!vehicle) return res.status(404).json({ error: "Vehicle not found." });
  const { name } = req.body ?? {};
  if (typeof name === "string" && name.trim()) {
    db.prepare("UPDATE vehicles SET name = ? WHERE id = ?").run(name.trim(), req.params.id);
  }
  res.json(vehicleDetail(req.params.id));
});

router.delete("/:id", requireAdmin, (req, res) => {
  const vehicle = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(req.params.id);
  if (!vehicle) return res.status(404).json({ error: "Vehicle not found." });
  db.prepare("DELETE FROM vehicles WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

// --- Vehicle products (CC / FC / PW) — a plain on/off toggle per type ---

router.post("/:id/products/:type", requireAdmin, (req, res) => {
  const type = req.params.type.toUpperCase();
  if (!PRODUCT_TYPES.has(type)) return res.status(400).json({ error: "Invalid product type." });
  const vehicle = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(req.params.id);
  if (!vehicle) return res.status(404).json({ error: "Vehicle not found." });

  const existing = db
    .prepare("SELECT * FROM vehicle_products WHERE vehicle_id = ? AND product_type = ?")
    .get(req.params.id, type);
  if (existing) return res.status(409).json({ error: `${type} already added for this vehicle.` });

  db.prepare(
    "INSERT INTO vehicle_products (id, vehicle_id, product_type) VALUES (?, ?, ?)"
  ).run(randomUUID(), req.params.id, type);

  res.status(201).json(vehicleDetail(req.params.id));
});

router.delete("/:id/products/:type", requireAdmin, (req, res) => {
  const type = req.params.type.toUpperCase();
  const product = db
    .prepare("SELECT * FROM vehicle_products WHERE vehicle_id = ? AND product_type = ?")
    .get(req.params.id, type) as { id: string } | undefined;
  if (!product) return res.status(404).json({ error: "Product not found for this vehicle." });
  db.prepare("DELETE FROM vehicle_products WHERE id = ?").run(product.id);
  res.json(vehicleDetail(req.params.id));
});

// "Product Changes" — a small fillable Ph1-5 count per vehicle+product,
// shown at the bottom of that segment's tile on the Slides page.
function clampPhaseCount(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : fallback;
}

router.patch("/:id/products/:type/phases", requireAdmin, (req, res) => {
  const type = req.params.type.toUpperCase();
  if (!PRODUCT_TYPES.has(type)) return res.status(400).json({ error: "Invalid product type." });
  let existing = db
    .prepare("SELECT * FROM vehicle_products WHERE vehicle_id = ? AND product_type = ?")
    .get(req.params.id, type) as any;
  if (!existing) {
    // A tile can show a Product Changes box for a (vehicle, product) that
    // only exists via a News topic, with no registered vehicle_products row
    // yet — auto-register it here instead of 404ing.
    const vehicle = db.prepare("SELECT id FROM vehicles WHERE id = ?").get(req.params.id);
    if (!vehicle) return res.status(404).json({ error: "Vehicle not found." });
    db.prepare("INSERT INTO vehicle_products (id, vehicle_id, product_type) VALUES (?, ?, ?)").run(
      randomUUID(),
      req.params.id,
      type
    );
    existing = db
      .prepare("SELECT * FROM vehicle_products WHERE vehicle_id = ? AND product_type = ?")
      .get(req.params.id, type) as any;
  }

  const body = req.body ?? {};
  const next = {
    ph1: clampPhaseCount(body.ph1, existing.ph1),
    ph2: clampPhaseCount(body.ph2, existing.ph2),
    ph3: clampPhaseCount(body.ph3, existing.ph3),
    ph4: clampPhaseCount(body.ph4, existing.ph4),
    ph5: clampPhaseCount(body.ph5, existing.ph5),
  };
  db.prepare("UPDATE vehicle_products SET ph1 = ?, ph2 = ?, ph3 = ?, ph4 = ?, ph5 = ? WHERE id = ?").run(
    next.ph1,
    next.ph2,
    next.ph3,
    next.ph4,
    next.ph5,
    existing.id
  );
  res.json(db.prepare("SELECT * FROM vehicle_products WHERE id = ?").get(existing.id));
});

export default router;
