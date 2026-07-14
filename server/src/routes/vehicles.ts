import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { requireAdmin } from "../middleware/auth.js";
import { upload, publicPathFor, deleteUploadedFile } from "../upload.js";

const router = Router();

const PRODUCT_TYPES = new Set(["CC", "FC", "PW"]);

function vehicleDetail(id: string) {
  const vehicle = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(id) as any;
  if (!vehicle) return null;
  const brand = db.prepare("SELECT * FROM brands WHERE id = ?").get(vehicle.brand_id);
  const images = db
    .prepare("SELECT * FROM vehicle_images WHERE vehicle_id = ? ORDER BY position ASC, created_at ASC")
    .all(id);
  const products = db
    .prepare("SELECT * FROM vehicle_products WHERE vehicle_id = ? ORDER BY product_type ASC")
    .all(id);
  const tickets = db
    .prepare("SELECT * FROM tickets WHERE vehicle_id = ? ORDER BY category ASC, position ASC")
    .all(id);
  const topics = db
    .prepare("SELECT * FROM topics WHERE vehicle_id = ? ORDER BY created_at ASC")
    .all(id);
  return { ...vehicle, brand, images, products, tickets, topics };
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

  const images = db
    .prepare("SELECT path FROM vehicle_images WHERE vehicle_id = ?")
    .all(req.params.id) as { path: string }[];
  images.forEach((i) => deleteUploadedFile(i.path));
  const products = db
    .prepare("SELECT image_path FROM vehicle_products WHERE vehicle_id = ?")
    .all(req.params.id) as { image_path: string | null }[];
  products.forEach((p) => deleteUploadedFile(p.image_path));

  db.prepare("DELETE FROM vehicles WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

// --- Vehicle images ---

router.post(
  "/:id/images",
  requireAdmin,
  upload.single("image"),
  (req, res) => {
    const vehicle = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(req.params.id);
    if (!vehicle) return res.status(404).json({ error: "Vehicle not found." });
    if (!req.file) return res.status(400).json({ error: "No image uploaded." });

    const maxPos = db
      .prepare("SELECT COALESCE(MAX(position), -1) AS m FROM vehicle_images WHERE vehicle_id = ?")
      .get(req.params.id) as { m: number };
    const id = randomUUID();
    db.prepare(
      "INSERT INTO vehicle_images (id, vehicle_id, path, position) VALUES (?, ?, ?, ?)"
    ).run(id, req.params.id, publicPathFor(req.file.filename), maxPos.m + 1);

    res.status(201).json(vehicleDetail(req.params.id));
  }
);

router.delete("/:vehicleId/images/:imageId", requireAdmin, (req, res) => {
  const image = db
    .prepare("SELECT * FROM vehicle_images WHERE id = ? AND vehicle_id = ?")
    .get(req.params.imageId, req.params.vehicleId) as { path: string } | undefined;
  if (!image) return res.status(404).json({ error: "Image not found." });
  deleteUploadedFile(image.path);
  db.prepare("DELETE FROM vehicle_images WHERE id = ?").run(req.params.imageId);
  res.json(vehicleDetail(req.params.vehicleId));
});

// --- Vehicle products (CC / FC / PW) ---

router.post("/:id/products/:type", requireAdmin, (req, res) => {
  const type = req.params.type.toUpperCase();
  if (!PRODUCT_TYPES.has(type)) return res.status(400).json({ error: "Invalid product type." });
  const vehicle = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(req.params.id);
  if (!vehicle) return res.status(404).json({ error: "Vehicle not found." });

  const existing = db
    .prepare("SELECT * FROM vehicle_products WHERE vehicle_id = ? AND product_type = ?")
    .get(req.params.id, type);
  if (existing) return res.status(409).json({ error: `${type} already added for this vehicle.` });

  const { notes } = req.body ?? {};
  const id = randomUUID();
  db.prepare(
    "INSERT INTO vehicle_products (id, vehicle_id, product_type, notes) VALUES (?, ?, ?, ?)"
  ).run(id, req.params.id, type, typeof notes === "string" ? notes : "");

  res.status(201).json(vehicleDetail(req.params.id));
});

router.patch("/:id/products/:type", requireAdmin, (req, res) => {
  const type = req.params.type.toUpperCase();
  const product = db
    .prepare("SELECT * FROM vehicle_products WHERE vehicle_id = ? AND product_type = ?")
    .get(req.params.id, type);
  if (!product) return res.status(404).json({ error: "Product not found for this vehicle." });
  const { notes } = req.body ?? {};
  if (typeof notes === "string") {
    db.prepare(
      "UPDATE vehicle_products SET notes = ? WHERE vehicle_id = ? AND product_type = ?"
    ).run(notes, req.params.id, type);
  }
  res.json(vehicleDetail(req.params.id));
});

router.post(
  "/:id/products/:type/image",
  requireAdmin,
  upload.single("image"),
  (req, res) => {
    const type = req.params.type.toUpperCase();
    if (!PRODUCT_TYPES.has(type)) return res.status(400).json({ error: "Invalid product type." });
    if (!req.file) return res.status(400).json({ error: "No image uploaded." });

    const existing = db
      .prepare("SELECT * FROM vehicle_products WHERE vehicle_id = ? AND product_type = ?")
      .get(req.params.id, type) as { id: string; image_path: string | null } | undefined;

    const publicPath = publicPathFor(req.file.filename);

    if (existing) {
      deleteUploadedFile(existing.image_path);
      db.prepare("UPDATE vehicle_products SET image_path = ? WHERE id = ?").run(
        publicPath,
        existing.id
      );
    } else {
      const vehicle = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(req.params.id);
      if (!vehicle) return res.status(404).json({ error: "Vehicle not found." });
      db.prepare(
        "INSERT INTO vehicle_products (id, vehicle_id, product_type, image_path) VALUES (?, ?, ?, ?)"
      ).run(randomUUID(), req.params.id, type, publicPath);
    }

    res.status(201).json(vehicleDetail(req.params.id));
  }
);

router.delete("/:id/products/:type", requireAdmin, (req, res) => {
  const type = req.params.type.toUpperCase();
  const product = db
    .prepare("SELECT * FROM vehicle_products WHERE vehicle_id = ? AND product_type = ?")
    .get(req.params.id, type) as { id: string; image_path: string | null } | undefined;
  if (!product) return res.status(404).json({ error: "Product not found for this vehicle." });
  deleteUploadedFile(product.image_path);
  db.prepare("DELETE FROM vehicle_products WHERE id = ?").run(product.id);
  res.json(vehicleDetail(req.params.id));
});

export default router;
