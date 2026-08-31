import "dotenv/config";
import express from "express";
// Patches Express 4's routing so a rejected promise from an async handler
// reaches the error-handling middleware below via next(err), the same as a
// synchronous throw always has — needed now that every route handler awaits
// the (always-async, Turso-backed) db calls in db.ts.
import "express-async-errors";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { db, initDb } from "./db.js";
import authRoutes from "./routes/auth.js";
import brandRoutes from "./routes/brands.js";
import vehicleRoutes from "./routes/vehicles.js";
import noteRoutes from "./routes/notes.js";
import segmentImageRoutes from "./routes/segmentImages.js";
import universalChangesRoutes from "./routes/universalChanges.js";
import slideRoutes from "./routes/slides.js";
import crImportRoutes from "./routes/crImport.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

await initDb();

const app = express();
app.use(cors());
app.use(express.json());

// Brand logos and segment images live in the uploaded_files table (see
// upload.ts) rather than on disk, so this reads them back out of the
// database instead of serving a static folder.
app.get("/uploads/:id", async (req, res) => {
  const row = (await db.prepare("SELECT mime_type, data FROM uploaded_files WHERE id = ?").get(req.params.id)) as
    | { mime_type: string; data: string }
    | undefined;
  if (!row) return res.status(404).end();
  res.set("Content-Type", row.mime_type);
  res.set("Cache-Control", "public, max-age=31536000, immutable");
  res.send(Buffer.from(row.data, "base64"));
});

app.use("/api/auth", authRoutes);
app.use("/api/brands", brandRoutes);
app.use("/api/vehicles", vehicleRoutes);
app.use("/api/notes", noteRoutes);
app.use("/api/segment-images", segmentImageRoutes);
app.use("/api/universal-changes", universalChangesRoutes);
app.use("/api/slides", slideRoutes);
app.use("/api/cr-import", crImportRoutes);

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
