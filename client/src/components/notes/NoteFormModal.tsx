import { useState, type FormEvent } from "react";
import { api, ApiError } from "../../api/client";
import type { Note, NoteCategory, NoteKind, NotePriority, ProductType } from "../../api/types";
import { currentIsoWeek } from "../../utils/date";

interface NoteFormModalProps {
  vehicleId: string;
  category: NoteCategory;
  note?: Note;
  onClose: () => void;
  onSaved: () => void;
}

const PRIORITIES: NotePriority[] = ["Normal", "High"];
const CATEGORIES: NoteCategory[] = ["Margin", "Quality", "Portfolio", "Other"];
const PRODUCTS: ProductType[] = ["CC", "FC", "PW"];

export default function NoteFormModal({ vehicleId, category, note, onClose, onSaved }: NoteFormModalProps) {
  const isEdit = Boolean(note);
  const [kind, setKind] = useState<NoteKind>(note?.kind ?? "news");
  const [title, setTitle] = useState(note?.title ?? "");
  const [product, setProduct] = useState<ProductType | "">(note?.product ?? "");
  const [description, setDescription] = useState(note?.description ?? "");
  const [noteCategory, setNoteCategory] = useState<NoteCategory>(note?.category ?? category);
  const [priority, setPriority] = useState<NotePriority>(note?.priority ?? "Normal");
  const [btCode, setBtCode] = useState(note?.bt_code ?? "");
  const [cwDate, setCwDate] = useState(note?.cw_date ?? currentIsoWeek());
  const [phase, setPhase] = useState<number>(note?.phase ?? 1);
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
        product: product || null,
        priority,
        bt_code: kind === "bt" ? btCode.trim() || null : null,
        cw_date: kind === "news" ? cwDate || null : null,
        phase: kind === "bt" ? (phase as Note["phase"]) : null,
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
        <h2>{isEdit ? "Edit topic" : "New topic"}</h2>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="field">
            <label htmlFor="note-title">Topic</label>
            <input
              id="note-title"
              type="text"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Fill in your topic"
            />
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="note-product">Product</label>
              <select id="note-product" value={product} onChange={(e) => setProduct(e.target.value as ProductType | "")}>
                <option value="">—</option>
                {PRODUCTS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Type</label>
              <div className="segmented">
                <button type="button" className={kind === "news" ? "active" : ""} onClick={() => setKind("news")}>
                  News
                </button>
                <button type="button" className={kind === "bt" ? "active" : ""} onClick={() => setKind("bt")}>
                  BT
                </button>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>Priority</label>
              <div className="segmented">
                {PRIORITIES.map((p) => (
                  <button type="button" key={p} className={priority === p ? "active" : ""} onClick={() => setPriority(p)}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div className="field" style={{ flex: 1 }}>
              {kind === "bt" ? (
                <>
                  <label htmlFor="note-bt-code">BT code</label>
                  <input
                    id="note-bt-code"
                    type="text"
                    value={btCode}
                    onChange={(e) => setBtCode(e.target.value)}
                    placeholder="e.g. BT-2451"
                  />
                </>
              ) : (
                <>
                  <label htmlFor="note-cw-date">CW date</label>
                  <input id="note-cw-date" type="week" value={cwDate} onChange={(e) => setCwDate(e.target.value)} />
                </>
              )}
            </div>
            {kind === "bt" && (
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
            )}
          </div>

          <div className="field">
            <label htmlFor="note-description">Short description</label>
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

          {error && <p className="error-text">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy || !title.trim()}>
              {busy ? "Saving…" : isEdit ? "Save changes" : "Add topic"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
