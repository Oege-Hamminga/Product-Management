import { Router } from "express";
import { db } from "../db.js";
import { requireAdmin } from "../middleware/auth.js";
import { upload, publicPathFor, deleteUploadedFile } from "../upload.js";

const router = Router();
const PRODUCT_TYPES = new Set(["CC", "FC", "PW"]);

interface SegmentImageRow {
  vehicle_id: string;
  product_type: string;
  image_path: string;
}

function allRows(): SegmentImageRow[] {
  return db.prepare("SELECT vehicle_id, product_type, image_path FROM segment_images").all() as SegmentImageRow[];
}

router.get("/", (_req, res) => {
  res.json(allRows());
});

router.post("/:vehicleId/:type", requireAdmin, upload.single("image"), (req, res) => {
  const { vehicleId, type } = req.params;
  if (!PRODUCT_TYPES.has(type)) return res.status(400).json({ error: "Product type must be CC, FC or PW." });
  const vehicle = db.prepare("SELECT id FROM vehicles WHERE id = ?").get(vehicleId);
  if (!vehicle) return res.status(404).json({ error: "Vehicle not found." });
  if (!req.file) return res.status(400).json({ error: "No image uploaded." });

  const existing = db
    .prepare("SELECT image_path FROM segment_images WHERE vehicle_id = ? AND product_type = ?")
    .get(vehicleId, type) as { image_path: string } | undefined;
  if (existing) deleteUploadedFile(existing.image_path);

  const publicPath = publicPathFor(req.file.filename);
  db.prepare(
    `INSERT INTO segment_images (vehicle_id, product_type, image_path) VALUES (?, ?, ?)
     ON CONFLICT(vehicle_id, product_type) DO UPDATE SET image_path = excluded.image_path`
  ).run(vehicleId, type, publicPath);

  res.json(allRows());
});

router.delete("/:vehicleId/:type", requireAdmin, (req, res) => {
  const { vehicleId, type } = req.params;
  if (!PRODUCT_TYPES.has(type)) return res.status(400).json({ error: "Product type must be CC, FC or PW." });

  const existing = db
    .prepare("SELECT image_path FROM segment_images WHERE vehicle_id = ? AND product_type = ?")
    .get(vehicleId, type) as { image_path: string } | undefined;
  if (existing) {
    deleteUploadedFile(existing.image_path);
    db.prepare("DELETE FROM segment_images WHERE vehicle_id = ? AND product_type = ?").run(vehicleId, type);
  }

  res.json(allRows());
});

export default router;
