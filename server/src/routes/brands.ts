import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { requireAdmin } from "../middleware/auth.js";
import { upload, publicPathFor, deleteUploadedFile } from "../upload.js";

const router = Router();

router.get("/", (_req, res) => {
  const brands = db
    .prepare(
      `SELECT b.*, (SELECT COUNT(*) FROM vehicles v WHERE v.brand_id = b.id) AS vehicle_count
       FROM brands b ORDER BY b.position ASC, b.created_at ASC`
    )
    .all();
  res.json(brands);
});

router.get("/overview", (_req, res) => {
  const brands = db
    .prepare(`SELECT * FROM brands ORDER BY position ASC, created_at ASC`)
    .all() as any[];
  const vehicles = db
    .prepare(`SELECT * FROM vehicles ORDER BY position ASC, created_at ASC`)
    .all() as any[];
  // Only open (not-yet-completed) topics drive the brand map: bubble size, the
  // fanned-out topic cards, and category counts. Completed topics stay
  // visible in the vehicle panel's own history, not here.
  const allNotes = (
    db.prepare(`SELECT * FROM notes WHERE completed = 0 ORDER BY created_at DESC`).all() as any[]
  ).map((n) => ({ ...n, completed: Boolean(n.completed), long_term: Boolean(n.long_term) }));
  // A vehicle's registered products (with their Product Changes phase counts)
  // are attached regardless of whether they currently have any open topics,
  // so the Slides page can always show a segment's tile.
  const allProducts = db.prepare(`SELECT * FROM vehicle_products ORDER BY product_type ASC`).all() as any[];

  const notesByVehicle = new Map<string, any[]>();
  const categoryByVehicle = new Map<string, Record<string, number>>();
  for (const note of allNotes) {
    const notes = notesByVehicle.get(note.vehicle_id) ?? [];
    notes.push(note);
    notesByVehicle.set(note.vehicle_id, notes);

    const bucket = categoryByVehicle.get(note.vehicle_id) ?? { Margin: 0, Quality: 0, Portfolio: 0, Other: 0 };
    bucket[note.category] = (bucket[note.category] ?? 0) + 1;
    categoryByVehicle.set(note.vehicle_id, bucket);
  }

  const productsByVehicle = new Map<string, any[]>();
  for (const product of allProducts) {
    const products = productsByVehicle.get(product.vehicle_id) ?? [];
    products.push(product);
    productsByVehicle.set(product.vehicle_id, products);
  }

  const result = brands.map((brand) => ({
    ...brand,
    vehicles: vehicles
      .filter((v) => v.brand_id === brand.id)
      .map((v) => ({
        ...v,
        note_count: notesByVehicle.get(v.id)?.length ?? 0,
        category_counts: categoryByVehicle.get(v.id) ?? { Margin: 0, Quality: 0, Portfolio: 0, Other: 0 },
        notes: notesByVehicle.get(v.id) ?? [],
        products: productsByVehicle.get(v.id) ?? [],
      })),
  }));

  res.json(result);
});

router.post("/", requireAdmin, (req, res) => {
  const { name } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "Brand name is required." });
  }
  const maxPos = db
    .prepare("SELECT COALESCE(MAX(position), -1) AS m FROM brands")
    .get() as { m: number };
  const id = randomUUID();
  db.prepare("INSERT INTO brands (id, name, position) VALUES (?, ?, ?)").run(
    id,
    name.trim(),
    maxPos.m + 1
  );
  const brand = db.prepare("SELECT * FROM brands WHERE id = ?").get(id);
  res.status(201).json(brand);
});

router.patch("/:id", requireAdmin, (req, res) => {
  const { name } = req.body ?? {};
  const brand = db.prepare("SELECT * FROM brands WHERE id = ?").get(req.params.id);
  if (!brand) return res.status(404).json({ error: "Brand not found." });
  if (typeof name === "string" && name.trim()) {
    db.prepare("UPDATE brands SET name = ? WHERE id = ?").run(name.trim(), req.params.id);
  }
  res.json(db.prepare("SELECT * FROM brands WHERE id = ?").get(req.params.id));
});

router.post(
  "/:id/logo",
  requireAdmin,
  upload.single("logo"),
  (req, res) => {
    const brand = db.prepare("SELECT * FROM brands WHERE id = ?").get(req.params.id) as
      | { logo_path: string | null }
      | undefined;
    if (!brand) return res.status(404).json({ error: "Brand not found." });
    if (!req.file) return res.status(400).json({ error: "No image uploaded." });

    deleteUploadedFile(brand.logo_path);
    const publicPath = publicPathFor(req.file.filename);
    db.prepare("UPDATE brands SET logo_path = ? WHERE id = ?").run(publicPath, req.params.id);
    res.json(db.prepare("SELECT * FROM brands WHERE id = ?").get(req.params.id));
  }
);

router.delete("/:id/logo", requireAdmin, (req, res) => {
  const brand = db.prepare("SELECT * FROM brands WHERE id = ?").get(req.params.id) as
    | { logo_path: string | null }
    | undefined;
  if (!brand) return res.status(404).json({ error: "Brand not found." });
  deleteUploadedFile(brand.logo_path);
  db.prepare("UPDATE brands SET logo_path = NULL WHERE id = ?").run(req.params.id);
  res.json(db.prepare("SELECT * FROM brands WHERE id = ?").get(req.params.id));
});

router.delete("/:id", requireAdmin, (req, res) => {
  const brand = db.prepare("SELECT * FROM brands WHERE id = ?").get(req.params.id) as
    | { logo_path: string | null }
    | undefined;
  if (!brand) return res.status(404).json({ error: "Brand not found." });

  deleteUploadedFile(brand.logo_path);

  db.prepare("DELETE FROM brands WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

export default router;
