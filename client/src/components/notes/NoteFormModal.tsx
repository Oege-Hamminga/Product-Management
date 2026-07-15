import { useState, type FormEvent } from "react";
import { api, ApiError } from "../../api/client";
import type { Note, NoteCategory, NoteKind, NotePriority } from "../../api/types";

interface NoteFormModalProps {
  vehicleId: string;
  category: NoteCategory;
  note?: Note;
  onClose: () => void;
  onSaved: () => void;
}

const PRIORITIES: NotePriority[] = ["Low", "Medium", "High", "Critical"];
const CATEGORIES: NoteCategory[] = ["Margin", "Quality", "Portfolio"];

export default function NoteFormModal({ vehicleId, category, note, onClose, onSaved }: NoteFormModalProps) {
  const isEdit = Boolean(note);
  const [kind, setKind] = useState<NoteKind>(note?.kind ?? "research");
  const [title, setTitle] = useState(note?.title ?? "");
  const [description, setDescription] = useState(note?.description ?? "");
  const [noteCategory, setNoteCategory] = useState<NoteCategory>(note?.category ?? category);
  const [phase, setPhase] = useState<number>(note?.phase ?? 1);
  const [priority, setPriority] = useState<NotePriority>(note?.priority ?? "Medium");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const payload: Partial<Note> = {
        kind,
        title: title.trim(),
        description,
        category: noteCategory,
        ...(kind === "bugtracker" ? { phase: phase as Note["phase"], priority } : {}),
      };
      if (note) await api.updateNote(note.id, payload);
      else await api.createNote(vehicleId, payload);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{isEdit ? "Edit note" : "New note"}</h2>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="field">
            <label>Type</label>
            <div className="segmented">
              <button
                type="button"
                className={kind === "research" ? "active" : ""}
                onClick={() => setKind("research")}
              >
                Research & Project
              </button>
              <button
                type="button"
                className={kind === "bugtracker" ? "active" : ""}
                onClick={() => setKind("bugtracker")}
              >
                Bugtracker
              </button>
            </div>
          </div>

          <div className="field">
            <label htmlFor="note-title">{kind === "bugtracker" ? "BT code" : "Title"}</label>
            <input
              id="note-title"
              type="text"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={kind === "bugtracker" ? "e.g. BT-2451" : "e.g. Homologation review"}
            />
          </div>

          <div className="field">
            <label htmlFor="note-description">Description</label>
            <textarea
              id="note-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional detail…"
            />
          </div>

          <div className="field">
            <label>Category</label>
            <div className="category-picker">
              {CATEGORIES.map((c) => (
                <button
                  type="button"
                  key={c}
                  className={`category-swatch${noteCategory === c ? " active" : ""}`}
                  style={{ ["--swatch-color" as string]: `var(--cat-${c.toLowerCase()})` }}
                  onClick={() => setNoteCategory(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {kind === "bugtracker" && (
            <div style={{ display: "flex", gap: 12 }}>
              <div className="field" style={{ flex: 1 }}>
                <label htmlFor="note-phase">Phase</label>
                <select id="note-phase" value={phase} onChange={(e) => setPhase(Number(e.target.value))}>
                  {[1, 2, 3, 4, 5].map((p) => (
                    <option key={p} value={p}>
                      Phase {p}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label htmlFor="note-priority">Priority</label>
                <select id="note-priority" value={priority} onChange={(e) => setPriority(e.target.value as NotePriority)}>
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {error && <p className="error-text">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy || !title.trim()}>
              {busy ? "Saving…" : isEdit ? "Save changes" : "Add note"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
