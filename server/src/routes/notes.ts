import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { requireAdmin } from "../middleware/auth.js";

const router = Router();

const KINDS = new Set(["bugtracker", "research"]);
const CATEGORIES = new Set(["Margin", "Quality", "Portfolio"]);
const PRIORITIES = new Set(["Low", "Medium", "High", "Critical"]);

// Leaderboard: which vehicles have the most active topics.
router.get("/summary", (_req, res) => {
  const rows = db
    .prepare(
      `SELECT v.id AS vehicle_id, v.name AS vehicle_name, b.id AS brand_id, b.name AS brand_name,
              COUNT(n.id) AS note_count,
              SUM(CASE WHEN n.priority = 'Critical' THEN 1 ELSE 0 END) AS critical_count,
              SUM(CASE WHEN n.priority = 'High' THEN 1 ELSE 0 END) AS high_count,
              SUM(CASE WHEN n.category = 'Margin' THEN 1 ELSE 0 END) AS margin_count,
              SUM(CASE WHEN n.category = 'Quality' THEN 1 ELSE 0 END) AS quality_count,
              SUM(CASE WHEN n.category = 'Portfolio' THEN 1 ELSE 0 END) AS portfolio_count
       FROM vehicles v
       JOIN brands b ON b.id = v.brand_id
       LEFT JOIN notes n ON n.vehicle_id = v.id
       GROUP BY v.id
       ORDER BY note_count DESC, critical_count DESC`
    )
    .all();
  res.json(rows);
});

router.get("/vehicle/:vehicleId", (req, res) => {
  const rows = db
    .prepare("SELECT * FROM notes WHERE vehicle_id = ? ORDER BY category ASC, created_at ASC")
    .all(req.params.vehicleId);
  res.json(rows);
});

router.post("/vehicle/:vehicleId", requireAdmin, (req, res) => {
  const vehicle = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(req.params.vehicleId);
  if (!vehicle) return res.status(404).json({ error: "Vehicle not found." });

  const { kind, title, description, category, phase, priority } = req.body ?? {};
  if (!KINDS.has(kind)) return res.status(400).json({ error: "Note type must be bugtracker or research." });
  if (typeof title !== "string" || !title.trim()) {
    return res.status(400).json({ error: "Title is required." });
  }
  if (!CATEGORIES.has(category)) {
    return res.status(400).json({ error: "Category must be Margin, Quality or Portfolio." });
  }

  const isBugtracker = kind === "bugtracker";
  const finalPhase = isBugtracker && Number.isInteger(phase) && phase >= 1 && phase <= 5 ? phase : isBugtracker ? 1 : null;
  const finalPriority = isBugtracker ? (PRIORITIES.has(priority) ? priority : "Medium") : null;

  const id = randomUUID();
  db.prepare(
    `INSERT INTO notes (id, vehicle_id, kind, title, description, category, phase, priority)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    req.params.vehicleId,
    kind,
    title.trim(),
    typeof description === "string" ? description : "",
    category,
    finalPhase,
    finalPriority
  );

  res.status(201).json(db.prepare("SELECT * FROM notes WHERE id = ?").get(id));
});

router.patch("/:id", requireAdmin, (req, res) => {
  const note = db.prepare("SELECT * FROM notes WHERE id = ?").get(req.params.id) as any;
  if (!note) return res.status(404).json({ error: "Note not found." });

  const { kind, title, description, category, phase, priority } = req.body ?? {};
  const finalKind = KINDS.has(kind) ? kind : note.kind;
  const isBugtracker = finalKind === "bugtracker";

  const next = {
    kind: finalKind,
    title: typeof title === "string" && title.trim() ? title.trim() : note.title,
    description: typeof description === "string" ? description : note.description,
    category: CATEGORIES.has(category) ? category : note.category,
    phase: isBugtracker
      ? Number.isInteger(phase) && phase >= 1 && phase <= 5
        ? phase
        : note.phase ?? 1
      : null,
    priority: isBugtracker ? (PRIORITIES.has(priority) ? priority : note.priority ?? "Medium") : null,
  };

  db.prepare(
    `UPDATE notes SET kind = ?, title = ?, description = ?, category = ?, phase = ?, priority = ?
     WHERE id = ?`
  ).run(next.kind, next.title, next.description, next.category, next.phase, next.priority, req.params.id);

  res.json(db.prepare("SELECT * FROM notes WHERE id = ?").get(req.params.id));
});

router.delete("/:id", requireAdmin, (req, res) => {
  const note = db.prepare("SELECT * FROM notes WHERE id = ?").get(req.params.id);
  if (!note) return res.status(404).json({ error: "Note not found." });
  db.prepare("DELETE FROM notes WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

export default router;
