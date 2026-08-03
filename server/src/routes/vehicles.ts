import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { requireAdmin } from "../middleware/auth.js";
import { deleteUploadedFile } from "../upload.js";

const router = Router();

const PRODUCT_TYPES = new Set(["CC", "FC", "PW"]);

// A "model" under a brand named "Overall News" (a normal, fully deletable
// brand like any other) is really a news category (e.g. "Overall News",
// "Universal Product Changes"), not a real vehicle — it can be freely
// added/renamed/deleted like any other model, but never gets a real
// CC/FC/PW product.
function isUnderOverallNewsBrand(vehicle: { brand_id: string } | undefined): boolean {
  if (!vehicle) return false;
  const brand = db.prepare("SELECT name FROM brands WHERE id = ?").get(vehicle.brand_id) as
    | { name: string }
    | undefined;
  return brand?.name === "Overall News";
}

function vehicleDetail(id: string) {
  const vehicle = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(id) as any;
  if (!vehicle) return null;
  const brand = db.prepare("SELECT * FROM brands WHERE id = ?").get(vehicle.brand_id);
  const products = (
    db.prepare("SELECT * FROM vehicle_products WHERE vehicle_id = ? ORDER BY product_type ASC").all(id) as any[]
  ).map((p) => ({ ...p, hidden_from_slides: Boolean(p.hidden_from_slides) }));
  // The vehicle panel manages a vehicle's full topic history, so completed
  // topics stay visible here (unlike the brand map canvas / sidebar).
  const notes = (
    db.prepare("SELECT * FROM notes WHERE vehicle_id = ? ORDER BY category ASC, created_at ASC").all(id) as any[]
  ).map((n) => ({ ...n, completed: Boolean(n.completed) }));
  return {
    ...vehicle,
    hidden_from_slides: Boolean(vehicle.hidden_from_slides),
    show_product_changes: Boolean(vehicle.show_product_changes),
    brand,
    products,
    notes,
  };
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
  const vehicle = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(req.params.id) as
    | { name: string; brand_id: string }
    | undefined;
  if (!vehicle) return res.status(404).json({ error: "Vehicle not found." });
  const { name, hidden_from_slides, show_product_changes } = req.body ?? {};
  if (typeof name === "string" && name.trim()) {
    db.prepare("UPDATE vehicles SET name = ? WHERE id = ?").run(name.trim(), req.params.id);
  }
  // Removes/re-adds a model's tile(s) from the Slides page without deleting
  // the model itself — every model shows by default (0 = not hidden).
  if (typeof hidden_from_slides === "boolean") {
    db.prepare("UPDATE vehicles SET hidden_from_slides = ? WHERE id = ?").run(
      hidden_from_slides ? 1 : 0,
      req.params.id
    );
  }
  // Shows/hides this model's Product Changes box on Slides and includes/
  // excludes it from the Total Product Changes sum on the last slide — every
  // model shows by default (1 = shown).
  if (typeof show_product_changes === "boolean") {
    db.prepare("UPDATE vehicles SET show_product_changes = ? WHERE id = ?").run(
      show_product_changes ? 1 : 0,
      req.params.id
    );
  }
  res.json(vehicleDetail(req.params.id));
});

router.delete("/:id", requireAdmin, (req, res) => {
  const vehicle = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(req.params.id) as
    | { name: string; brand_id: string }
    | undefined;
  if (!vehicle) return res.status(404).json({ error: "Vehicle not found." });
  // The DB rows for its products/topics/segment images cascade-delete via the
  // foreign keys, but the uploaded image files themselves don't — clean
  // those up explicitly so deleting a model doesn't leave orphaned files.
  const images = db
    .prepare("SELECT image_path FROM segment_images WHERE vehicle_id = ?")
    .all(req.params.id) as { image_path: string }[];
  images.forEach((img) => deleteUploadedFile(img.image_path));
  db.prepare("DELETE FROM vehicles WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

// --- Vehicle products (CC / FC / PW) — a plain on/off toggle per type ---

router.post("/:id/products/:type", requireAdmin, (req, res) => {
  const type = req.params.type.toUpperCase();
  if (!PRODUCT_TYPES.has(type)) return res.status(400).json({ error: "Invalid product type." });
  const vehicle = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(req.params.id) as
    | { name: string; brand_id: string }
    | undefined;
  if (!vehicle) return res.status(404).json({ error: "Vehicle not found." });
  if (isUnderOverallNewsBrand(vehicle)) {
    return res.status(400).json({ error: "News categories can't have products." });
  }

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

// A tile can exist for a (vehicle, product) with no registered
// vehicle_products row yet — seeded purely from a News topic, with the row
// only created on first Product Changes edit (see the phases route below).
// Hiding such a tile needs somewhere to store that flag too, so this
// auto-registers the row exactly like the phases route does instead of
// 404ing. Returns null if the vehicle itself doesn't exist.
function findOrRegisterProduct(vehicleId: string, type: string): any {
  let existing = db
    .prepare("SELECT * FROM vehicle_products WHERE vehicle_id = ? AND product_type = ?")
    .get(vehicleId, type) as any;
  if (existing) return existing;
  const vehicle = db.prepare("SELECT id FROM vehicles WHERE id = ?").get(vehicleId);
  if (!vehicle) return null;
  db.prepare("INSERT INTO vehicle_products (id, vehicle_id, product_type) VALUES (?, ?, ?)").run(
    randomUUID(),
    vehicleId,
    type
  );
  return db.prepare("SELECT * FROM vehicle_products WHERE vehicle_id = ? AND product_type = ?").get(vehicleId, type);
}

// "Product Changes" — a small fillable Ph1-5 count per vehicle+product,
// shown at the bottom of that segment's tile on the Slides page.
function clampPhaseCount(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : fallback;
}

router.patch("/:id/products/:type/phases", requireAdmin, (req, res) => {
  const type = req.params.type.toUpperCase();
  if (!PRODUCT_TYPES.has(type)) return res.status(400).json({ error: "Invalid product type." });
  const existing = findOrRegisterProduct(req.params.id, type);
  if (!existing) return res.status(404).json({ error: "Vehicle not found." });

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

// Removes/re-adds a single segment's tile (e.g. "K0 Crew Cab") from Slides
// without touching its sibling products (e.g. "K0 Flex Cab") — unlike the
// vehicle-level hidden_from_slides flag (still used for Overall News
// categories, which only ever have one segment), this is per (vehicle,
// product) so hiding one doesn't take the rest of the model's tiles with it.
router.patch("/:id/products/:type/hidden", requireAdmin, (req, res) => {
  const type = req.params.type.toUpperCase();
  if (!PRODUCT_TYPES.has(type)) return res.status(400).json({ error: "Invalid product type." });
  const existing = findOrRegisterProduct(req.params.id, type);
  if (!existing) return res.status(404).json({ error: "Vehicle not found." });

  const { hidden } = req.body ?? {};
  if (typeof hidden !== "boolean") return res.status(400).json({ error: "hidden must be a boolean." });
  db.prepare("UPDATE vehicle_products SET hidden_from_slides = ? WHERE id = ?").run(hidden ? 1 : 0, existing.id);
  const updated = db.prepare("SELECT * FROM vehicle_products WHERE id = ?").get(existing.id) as any;
  res.json({ ...updated, hidden_from_slides: Boolean(updated.hidden_from_slides) });
});

export default router;
