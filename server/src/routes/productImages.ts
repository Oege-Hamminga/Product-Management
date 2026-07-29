import { Router } from "express";
import { db } from "../db.js";
import { requireAdmin } from "../middleware/auth.js";
import { upload, publicPathFor, deleteUploadedFile } from "../upload.js";

const router = Router();

const PRODUCT_TYPES = new Set(["CC", "FC", "PW"]);

// The three Snoeks products (Crew Cab / Flex Cab / Partition Wall) each get
// one background image, shared across every brand/vehicle — this isn't
// per-brand like the logo, it's the product itself.
function currentMap(): Record<string, string | null> {
  const rows = db.prepare("SELECT product_type, image_path FROM product_images").all() as {
    product_type: string;
    image_path: string;
  }[];
  const map: Record<string, string | null> = { CC: null, FC: null, PW: null };
  rows.forEach((r) => {
    map[r.product_type] = r.image_path;
  });
  return map;
}

router.get("/", (_req, res) => {
  res.json(currentMap());
});

router.post("/:type", requireAdmin, upload.single("image"), (req, res) => {
  const type = req.params.type;
  if (!PRODUCT_TYPES.has(type)) return res.status(400).json({ error: "Product type must be CC, FC or PW." });
  if (!req.file) return res.status(400).json({ error: "No image uploaded." });

  const existing = db.prepare("SELECT image_path FROM product_images WHERE product_type = ?").get(type) as
    | { image_path: string }
    | undefined;
  if (existing) deleteUploadedFile(existing.image_path);

  const publicPath = publicPathFor(req.file.filename);
  db.prepare(
    `INSERT INTO product_images (product_type, image_path) VALUES (?, ?)
     ON CONFLICT(product_type) DO UPDATE SET image_path = excluded.image_path`
  ).run(type, publicPath);

  res.json(currentMap());
});

router.delete("/:type", requireAdmin, (req, res) => {
  const type = req.params.type;
  if (!PRODUCT_TYPES.has(type)) return res.status(400).json({ error: "Product type must be CC, FC or PW." });

  const existing = db.prepare("SELECT image_path FROM product_images WHERE product_type = ?").get(type) as
    | { image_path: string }
    | undefined;
  if (existing) {
    deleteUploadedFile(existing.image_path);
    db.prepare("DELETE FROM product_images WHERE product_type = ?").run(type);
  }

  res.json(currentMap());
});

export default router;
