import { Router } from "express";
import { db } from "../db.js";
import { requireAdmin } from "../middleware/auth.js";

const router = Router();
const ROW_ID = "universal";

function clampPhaseCount(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : fallback;
}

function currentRow() {
  return db.prepare("SELECT * FROM universal_product_changes WHERE id = ?").get(ROW_ID);
}

router.get("/", (_req, res) => {
  res.json(currentRow());
});

router.patch("/", requireAdmin, (req, res) => {
  const existing = currentRow() as any;
  const body = req.body ?? {};
  const next = {
    ph1: clampPhaseCount(body.ph1, existing.ph1),
    ph2: clampPhaseCount(body.ph2, existing.ph2),
    ph3: clampPhaseCount(body.ph3, existing.ph3),
    ph4: clampPhaseCount(body.ph4, existing.ph4),
    ph5: clampPhaseCount(body.ph5, existing.ph5),
  };
  db.prepare("UPDATE universal_product_changes SET ph1 = ?, ph2 = ?, ph3 = ?, ph4 = ?, ph5 = ? WHERE id = ?").run(
    next.ph1,
    next.ph2,
    next.ph3,
    next.ph4,
    next.ph5,
    ROW_ID
  );
  res.json(currentRow());
});

export default router;
