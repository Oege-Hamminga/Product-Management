import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { requireAdmin } from "../middleware/auth.js";

const router = Router();

router.get("/", (_req, res) => {
  res.json(db.prepare("SELECT * FROM slides ORDER BY position ASC, created_at ASC").all());
});

router.post("/", requireAdmin, (req, res) => {
  const { title } = req.body ?? {};
  if (typeof title !== "string" || !title.trim()) {
    return res.status(400).json({ error: "Slide title is required." });
  }
  const maxPos = db.prepare("SELECT COALESCE(MAX(position), -1) AS m FROM slides").get() as { m: number };
  const id = randomUUID();
  db.prepare("INSERT INTO slides (id, title, position) VALUES (?, ?, ?)").run(id, title.trim(), maxPos.m + 1);
  res.status(201).json(db.prepare("SELECT * FROM slides WHERE id = ?").get(id));
});

router.patch("/:id", requireAdmin, (req, res) => {
  const { title } = req.body ?? {};
  const slide = db.prepare("SELECT * FROM slides WHERE id = ?").get(req.params.id);
  if (!slide) return res.status(404).json({ error: "Slide not found." });
  if (typeof title === "string" && title.trim()) {
    db.prepare("UPDATE slides SET title = ? WHERE id = ?").run(title.trim(), req.params.id);
  }
  res.json(db.prepare("SELECT * FROM slides WHERE id = ?").get(req.params.id));
});

router.delete("/:id", requireAdmin, (req, res) => {
  const slide = db.prepare("SELECT * FROM slides WHERE id = ?").get(req.params.id);
  if (!slide) return res.status(404).json({ error: "Slide not found." });
  const slideCount = (db.prepare("SELECT COUNT(*) AS c FROM slides").get() as { c: number }).c;
  if (slideCount <= 1) {
    return res.status(400).json({ error: "At least one slide is required." });
  }
  // Brands assigned to this slide fall back to the last remaining slide,
  // same as any brand that was never explicitly assigned — handled by the
  // slide_id ON DELETE SET NULL foreign key.
  db.prepare("DELETE FROM slides WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

export default router;
