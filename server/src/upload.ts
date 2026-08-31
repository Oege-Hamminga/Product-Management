import multer from "multer";
import { randomUUID } from "node:crypto";
import { db } from "./db.js";

// Uploaded brand logos and segment images are stored as base64 rows in the
// same database as everything else (see the uploaded_files table in db.ts)
// rather than as files on the server's own disk — a host like Render's free
// tier wipes local disk on every redeploy/restart, which would otherwise
// silently lose every logo and segment image while the rest of the data
// (kept in Turso) survived fine. Keeping images in the same database means
// there's exactly one place data lives, and one thing to back up.
const storage = multer.memoryStorage();

const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);

export const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.has(file.mimetype)) {
      cb(new Error("Only PNG, JPG, WEBP or SVG images are allowed."));
      return;
    }
    cb(null, true);
  },
});

// Saves an uploaded file's bytes to the uploaded_files table and returns the
// public path routes should store (e.g. on brands.logo_path) — served back
// by the GET /uploads/:id route registered in index.ts.
export async function saveUploadedFile(file: Express.Multer.File): Promise<string> {
  const id = randomUUID();
  await db
    .prepare("INSERT INTO uploaded_files (id, mime_type, data) VALUES (?, ?, ?)")
    .run(id, file.mimetype, file.buffer.toString("base64"));
  return publicPathFor(id);
}

export function publicPathFor(id: string): string {
  return `/uploads/${id}`;
}

export async function deleteUploadedFile(publicPath: string | null | undefined) {
  if (!publicPath || !publicPath.startsWith("/uploads/")) return;
  const id = publicPath.slice("/uploads/".length);
  await db.prepare("DELETE FROM uploaded_files WHERE id = ?").run(id);
}
