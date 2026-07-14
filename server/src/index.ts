import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import "./db.js";
import { uploadsDir } from "./upload.js";
import authRoutes from "./routes/auth.js";
import brandRoutes from "./routes/brands.js";
import vehicleRoutes from "./routes/vehicles.js";
import ticketRoutes from "./routes/tickets.js";
import topicRoutes from "./routes/topics.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(uploadsDir));

app.use("/api/auth", authRoutes);
app.use("/api/brands", brandRoutes);
app.use("/api/vehicles", vehicleRoutes);
app.use("/api/tickets", ticketRoutes);
app.use("/api/topics", topicRoutes);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Serve the built client in production.
const clientDist = path.join(__dirname, "..", "..", "client", "dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api|\/uploads).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(err?.status || 500).json({ error: err?.message || "Something went wrong." });
});

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => {
  console.log(`OEM portfolio API listening on http://localhost:${PORT}`);
});
