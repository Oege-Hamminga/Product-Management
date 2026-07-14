import { Router } from "express";
import { signAdminToken } from "../middleware/auth.js";

const router = Router();

router.post("/login", (req, res) => {
  const { password } = req.body ?? {};
  const adminPassword = process.env.ADMIN_PASSWORD || "change-me";

  if (typeof password !== "string" || password !== adminPassword) {
    return res.status(401).json({ error: "Incorrect password." });
  }

  res.json({ token: signAdminToken() });
});

export default router;
