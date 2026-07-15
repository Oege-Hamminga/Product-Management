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
  const noteCounts = db
    .prepare(
      `SELECT vehicle_id, COUNT(*) AS open_count
       FROM notes GROUP BY vehicle_id`
    )
    .all() as { vehicle_id: string; open_count: number }[];
  const countByVehicle = new Map(noteCounts.map((t) => [t.vehicle_id, t.open_count]));

  const result = brands.map((brand) => ({
    ...brand,
    vehicles: vehicles
      .filter((v) => v.brand_id === brand.id)
      .map((v) => ({ ...v, note_count: countByVehicle.get(v.id) ?? 0 })),
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
