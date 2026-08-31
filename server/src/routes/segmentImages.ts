import { Router } from "express";
import { db } from "../db.js";
import { requireAdmin } from "../middleware/auth.js";
import { upload, saveUploadedFile, deleteUploadedFile } from "../upload.js";

const router = Router();
const PRODUCT_TYPES = new Set(["CC", "FC", "PW"]);

interface SegmentImageRow {
  vehicle_id: string;
  product_type: string;
  image_path: string;
}

async function allRows(): Promise<SegmentImageRow[]> {
  return (await db.prepare("SELECT vehicle_id, product_type, image_path FROM segment_images").all()) as SegmentImageRow[];
}

router.get("/", async (_req, res) => {
  res.json(await allRows());
});

router.post("/:vehicleId/:type", requireAdmin, upload.single("image"), async (req, res) => {
  const { vehicleId, type } = req.params;
  if (!PRODUCT_TYPES.has(type)) return res.status(400).json({ error: "Product type must be CC, FC or PW." });
  const vehicle = await db.prepare("SELECT id FROM vehicles WHERE id = ?").get(vehicleId);
  if (!vehicle) return res.status(404).json({ error: "Vehicle not found." });
  if (!req.file) return res.status(400).json({ error: "No image uploaded." });

  const existing = (await db
    .prepare("SELECT image_path FROM segment_images WHERE vehicle_id = ? AND product_type = ?")
    .get(vehicleId, type)) as { image_path: string } | undefined;
  if (existing) await deleteUploadedFile(existing.image_path);

  const publicPath = await saveUploadedFile(req.file);
  await db.prepare(
    `INSERT INTO segment_images (vehicle_id, product_type, image_path) VALUES (?, ?, ?)
     ON CONFLICT(vehicle_id, product_type) DO UPDATE SET image_path = excluded.image_path`
  ).run(vehicleId, type, publicPath);

  res.json(await allRows());
});

router.delete("/:vehicleId/:type", requireAdmin, async (req, res) => {
  const { vehicleId, type } = req.params;
  if (!PRODUCT_TYPES.has(type)) return res.status(400).json({ error: "Product type must be CC, FC or PW." });

  const existing = (await db
    .prepare("SELECT image_path FROM segment_images WHERE vehicle_id = ? AND product_type = ?")
    .get(vehicleId, type)) as { image_path: string } | undefined;
  if (existing) {
    await deleteUploadedFile(existing.image_path);
    await db.prepare("DELETE FROM segment_images WHERE vehicle_id = ? AND product_type = ?").run(vehicleId, type);
  }

  res.json(await allRows());
});

export default router;
