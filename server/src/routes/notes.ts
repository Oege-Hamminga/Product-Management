import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { requireAdmin } from "../middleware/auth.js";

const router = Router();

const KINDS = new Set(["bt", "news"]);
const CATEGORIES = new Set(["Margin", "Quality", "Portfolio", "Other"]);
const PRIORITIES = new Set(["High", "Normal"]);
const PRODUCTS = new Set(["CC", "FC", "PW"]);

// Leaderboard: which vehicles have the most active topics.
router.get("/summary", (_req, res) => {
  const rows = db
    .prepare(
      `SELECT v.id AS vehicle_id, v.name AS vehicle_name, b.id AS brand_id, b.name AS brand_name,
              COUNT(n.id) AS note_count,
              SUM(CASE WHEN n.priority = 'High' THEN 1 ELSE 0 END) AS high_count,
              SUM(CASE WHEN n.category = 'Margin' THEN 1 ELSE 0 END) AS margin_count,
              SUM(CASE WHEN n.category = 'Quality' THEN 1 ELSE 0 END) AS quality_count,
              SUM(CASE WHEN n.category = 'Portfolio' THEN 1 ELSE 0 END) AS portfolio_count,
              SUM(CASE WHEN n.category = 'Other' THEN 1 ELSE 0 END) AS other_count
       FROM vehicles v
       JOIN brands b ON b.id = v.brand_id
       LEFT JOIN notes n ON n.vehicle_id = v.id
       GROUP BY v.id
       ORDER BY note_count DESC, high_count DESC`
    )
    .all();
  res.json(rows);
});

// Sidebar data: the highest-priority topics across every brand, and news
// items logged in the last N days — used by the persistent right sidebar.
router.get("/sidebar", (req, res) => {
  const priorityLimit = Math.min(Number(req.query.priorityLimit) || 8, 50);
  const newsLimit = Math.min(Number(req.query.newsLimit) || 8, 50);
  const days = Number(req.query.days) || 7;

  const highPriority = db
    .prepare(
      `SELECT n.*, v.name AS vehicle_name, b.id AS brand_id, b.name AS brand_name
       FROM notes n
       JOIN vehicles v ON v.id = n.vehicle_id
       JOIN brands b ON b.id = v.brand_id
       WHERE n.priority = 'High'
       ORDER BY n.created_at DESC
       LIMIT ?`
    )
    .all(priorityLimit);

  const weeklyNews = db
    .prepare(
      `SELECT n.*, v.name AS vehicle_name, b.id AS brand_id, b.name AS brand_name
       FROM notes n
       JOIN vehicles v ON v.id = n.vehicle_id
       JOIN brands b ON b.id = v.brand_id
       WHERE n.kind = 'news' AND n.created_at >= datetime('now', ?)
       ORDER BY n.created_at DESC
       LIMIT ?`
    )
    .all(`-${days} days`, newsLimit);

  res.json({ highPriority, weeklyNews });
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

  const { kind, title, description, category, priority, product, bt_code, cw_date } = req.body ?? {};
  if (!KINDS.has(kind)) return res.status(400).json({ error: "Note type must be bt or news." });
  if (typeof title !== "string" || !title.trim()) {
    return res.status(400).json({ error: "Title is required." });
  }
  if (!CATEGORIES.has(category)) {
    return res.status(400).json({ error: "Category must be Margin, Quality, Portfolio or Other." });
  }

  const isBt = kind === "bt";
  const finalPriority = PRIORITIES.has(priority) ? priority : "Normal";
  const finalProduct = PRODUCTS.has(product) ? product : null;
  const finalBtCode = isBt && typeof bt_code === "string" && bt_code.trim() ? bt_code.trim() : null;
  const finalCwDate = !isBt && typeof cw_date === "string" && cw_date.trim() ? cw_date.trim() : null;

  const id = randomUUID();
  db.prepare(
    `INSERT INTO notes (id, vehicle_id, kind, title, description, category, product, priority, bt_code, cw_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    req.params.vehicleId,
    kind,
    title.trim(),
    typeof description === "string" ? description : "",
    category,
    finalProduct,
    finalPriority,
    finalBtCode,
    finalCwDate
  );

  res.status(201).json(db.prepare("SELECT * FROM notes WHERE id = ?").get(id));
});

router.patch("/:id", requireAdmin, (req, res) => {
  const note = db.prepare("SELECT * FROM notes WHERE id = ?").get(req.params.id) as any;
  if (!note) return res.status(404).json({ error: "Note not found." });

  const { kind, title, description, category, priority, product, bt_code, cw_date } = req.body ?? {};
  const finalKind = KINDS.has(kind) ? kind : note.kind;
  const isBt = finalKind === "bt";

  const next = {
    kind: finalKind,
    title: typeof title === "string" && title.trim() ? title.trim() : note.title,
    description: typeof description === "string" ? description : note.description,
    category: CATEGORIES.has(category) ? category : note.category,
    product: product === null ? null : PRODUCTS.has(product) ? product : note.product,
    priority: PRIORITIES.has(priority) ? priority : note.priority,
    bt_code: isBt ? (typeof bt_code === "string" && bt_code.trim() ? bt_code.trim() : note.bt_code ?? null) : null,
    cw_date: !isBt ? (typeof cw_date === "string" && cw_date.trim() ? cw_date.trim() : note.cw_date ?? null) : null,
  };

  db.prepare(
    `UPDATE notes SET kind = ?, title = ?, description = ?, category = ?, product = ?, priority = ?, bt_code = ?, cw_date = ?
     WHERE id = ?`
  ).run(
    next.kind,
    next.title,
    next.description,
    next.category,
    next.product,
    next.priority,
    next.bt_code,
    next.cw_date,
    req.params.id
  );

  res.json(db.prepare("SELECT * FROM notes WHERE id = ?").get(req.params.id));
});

router.delete("/:id", requireAdmin, (req, res) => {
  const note = db.prepare("SELECT * FROM notes WHERE id = ?").get(req.params.id);
  if (!note) return res.status(404).json({ error: "Note not found." });
  db.prepare("DELETE FROM notes WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

export default router;
