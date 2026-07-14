import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { requireAdmin } from "../middleware/auth.js";

const router = Router();

const CATEGORIES = new Set(["Margin", "Quality", "Portfolio"]);
const PRIORITIES = new Set(["Low", "Medium", "High", "Critical"]);

// Leaderboard: which vehicles have the most ongoing change requests.
router.get("/summary", (_req, res) => {
  const rows = db
    .prepare(
      `SELECT v.id AS vehicle_id, v.name AS vehicle_name, b.id AS brand_id, b.name AS brand_name,
              COUNT(t.id) AS ticket_count,
              SUM(CASE WHEN t.priority = 'Critical' THEN 1 ELSE 0 END) AS critical_count,
              SUM(CASE WHEN t.priority = 'High' THEN 1 ELSE 0 END) AS high_count,
              SUM(CASE WHEN t.category = 'Margin' THEN 1 ELSE 0 END) AS margin_count,
              SUM(CASE WHEN t.category = 'Quality' THEN 1 ELSE 0 END) AS quality_count,
              SUM(CASE WHEN t.category = 'Portfolio' THEN 1 ELSE 0 END) AS portfolio_count
       FROM vehicles v
       JOIN brands b ON b.id = v.brand_id
       LEFT JOIN tickets t ON t.vehicle_id = v.id
       GROUP BY v.id
       ORDER BY ticket_count DESC, critical_count DESC`
    )
    .all();
  res.json(rows);
});

router.get("/vehicle/:vehicleId", (req, res) => {
  const rows = db
    .prepare("SELECT * FROM tickets WHERE vehicle_id = ? ORDER BY category ASC, position ASC")
    .all(req.params.vehicleId);
  res.json(rows);
});

router.post("/vehicle/:vehicleId", requireAdmin, (req, res) => {
  const vehicle = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(req.params.vehicleId);
  if (!vehicle) return res.status(404).json({ error: "Vehicle not found." });

  const { bt_code, bt_description, phase, priority, category } = req.body ?? {};
  if (typeof bt_code !== "string" || !bt_code.trim()) {
    return res.status(400).json({ error: "BT code is required." });
  }
  const finalPhase = Number.isInteger(phase) && phase >= 1 && phase <= 5 ? phase : 1;
  const finalPriority = PRIORITIES.has(priority) ? priority : "Medium";
  const finalCategory = CATEGORIES.has(category) ? category : "Portfolio";

  const maxPos = db
    .prepare(
      "SELECT COALESCE(MAX(position), -1) AS m FROM tickets WHERE vehicle_id = ? AND category = ?"
    )
    .get(req.params.vehicleId, finalCategory) as { m: number };

  const id = randomUUID();
  db.prepare(
    `INSERT INTO tickets (id, vehicle_id, bt_code, bt_description, phase, priority, category, position)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    req.params.vehicleId,
    bt_code.trim(),
    typeof bt_description === "string" ? bt_description : "",
    finalPhase,
    finalPriority,
    finalCategory,
    maxPos.m + 1
  );

  res.status(201).json(db.prepare("SELECT * FROM tickets WHERE id = ?").get(id));
});

router.patch("/:id", requireAdmin, (req, res) => {
  const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(req.params.id) as
    | any
    | undefined;
  if (!ticket) return res.status(404).json({ error: "Ticket not found." });

  const { bt_code, bt_description, phase, priority, category, position } = req.body ?? {};
  const next = {
    bt_code: typeof bt_code === "string" && bt_code.trim() ? bt_code.trim() : ticket.bt_code,
    bt_description: typeof bt_description === "string" ? bt_description : ticket.bt_description,
    phase: Number.isInteger(phase) && phase >= 1 && phase <= 5 ? phase : ticket.phase,
    priority: PRIORITIES.has(priority) ? priority : ticket.priority,
    category: CATEGORIES.has(category) ? category : ticket.category,
    position: Number.isInteger(position) ? position : ticket.position,
  };

  db.prepare(
    `UPDATE tickets SET bt_code = ?, bt_description = ?, phase = ?, priority = ?, category = ?, position = ?
     WHERE id = ?`
  ).run(
    next.bt_code,
    next.bt_description,
    next.phase,
    next.priority,
    next.category,
    next.position,
    req.params.id
  );

  res.json(db.prepare("SELECT * FROM tickets WHERE id = ?").get(req.params.id));
});

// Bulk reorder/move, used after a drag-and-drop operation on the kanban board.
router.post("/reorder", requireAdmin, (req, res) => {
  const { updates } = req.body ?? {};
  if (!Array.isArray(updates)) {
    return res.status(400).json({ error: "updates must be an array." });
  }
  const stmt = db.prepare("UPDATE tickets SET category = ?, position = ? WHERE id = ?");
  const tx = db.transaction((items: any[]) => {
    for (const item of items) {
      if (!CATEGORIES.has(item.category) || !Number.isInteger(item.position) || !item.id) continue;
      stmt.run(item.category, item.position, item.id);
    }
  });
  tx(updates);
  res.status(204).end();
});

router.delete("/:id", requireAdmin, (req, res) => {
  const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(req.params.id);
  if (!ticket) return res.status(404).json({ error: "Ticket not found." });
  db.prepare("DELETE FROM tickets WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

export default router;
