import { Router } from "express";
import { db } from "../db.js";

const router = Router();
const ROW_ID = "universal";

async function currentRow() {
  return db.prepare("SELECT * FROM universal_product_changes WHERE id = ?").get(ROW_ID);
}

// Read-only — Product Changes counts (including this Universal bucket) are
// now set exclusively by the Settings > Product Changes import (see
// routes/crImport.ts), so there's no manual-edit PATCH here any more.
router.get("/", async (_req, res) => {
  res.json(await currentRow());
});

export default router;
