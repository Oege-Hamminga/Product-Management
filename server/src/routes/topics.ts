import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { requireAdmin } from "../middleware/auth.js";

const router = Router();

router.get("/vehicle/:vehicleId", (req, res) => {
  const rows = db
    .prepare("SELECT * FROM topics WHERE vehicle_id = ? ORDER BY created_at ASC")
    .all(req.params.vehicleId);
  res.json(rows);
});

router.post("/vehicle/:vehicleId", requireAdmin, (req, res) => {
  const vehicle = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(req.params.vehicleId);
  if (!vehicle) return res.status(404).json({ error: "Vehicle not found." });

  const { title, description } = req.body ?? {};
  if (typeof title !== "string" || !title.trim()) {
    return res.status(400).json({ error: "Topic title is required." });
  }
  const id = randomUUID();
  db.prepare("INSERT INTO topics (id, vehicle_id, title, description) VALUES (?, ?, ?, ?)").run(
    id,
    req.params.vehicleId,
    title.trim(),
    typeof description === "string" ? description : ""
  );
  res.status(201).json(db.prepare("SELECT * FROM topics WHERE id = ?").get(id));
});

router.patch("/:id", requireAdmin, (req, res) => {
  const topic = db.prepare("SELECT * FROM topics WHERE id = ?").get(req.params.id) as
    | any
    | undefined;
  if (!topic) return res.status(404).json({ error: "Topic not found." });
  const { title, description } = req.body ?? {};
  const next = {
    title: typeof title === "string" && title.trim() ? title.trim() : topic.title,
    description: typeof description === "string" ? description : topic.description,
  };
  db.prepare("UPDATE topics SET title = ?, description = ? WHERE id = ?").run(
    next.title,
    next.description,
    req.params.id
  );
  res.json(db.prepare("SELECT * FROM topics WHERE id = ?").get(req.params.id));
});

router.delete("/:id", requireAdmin, (req, res) => {
  const topic = db.prepare("SELECT * FROM topics WHERE id = ?").get(req.params.id);
  if (!topic) return res.status(404).json({ error: "Topic not found." });
  db.prepare("DELETE FROM topics WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

export default router;
