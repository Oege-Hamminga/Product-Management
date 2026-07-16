import { useState, type FormEvent } from "react";
import { api, ApiError } from "../../api/client";
import type { BrandOverview, Note, NoteCategory, NoteKind, NotePriority, ProductType } from "../../api/types";
import { currentIsoWeek } from "../../utils/date";

interface QuickAddNoteModalProps {
  overview: BrandOverview[];
  onClose: () => void;
  onSaved: () => void;
}

const PRIORITIES: NotePriority[] = ["Normal", "High"];
const CATEGORIES: NoteCategory[] = ["Margin", "Quality", "Portfolio", "Other"];
const PRODUCTS: ProductType[] = ["CC", "FC", "PW"];

export default function QuickAddNoteModal({ overview, onClose, onSaved }: QuickAddNoteModalProps) {
  const brandsWithVehicles = overview.filter((b) => b.vehicles.length > 0);
  const [vehicleId, setVehicleId] = useState(brandsWithVehicles[0]?.vehicles[0]?.id ?? "");
  const [kind, setKind] = useState<NoteKind>("news");
  const [title, setTitle] = useState("");
  const [product, setProduct] = useState<ProductType | "">("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<NoteCategory>("Margin");
  const [priority, setPriority] = useState<NotePriority>("Normal");
  const [btCode, setBtCode] = useState("");
  const [cwDate, setCwDate] = useState(currentIsoWeek());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !vehicleId) return;
    setBusy(true);
    setError(null);
    try {
      const payload: Partial<Note> = {
        kind,
        title: title.trim(),
        description,
        category,
        product: product || null,
        priority,
        bt_code: kind === "bt" ? btCode.trim() || null : null,
        cw_date: kind === "news" ? cwDate || null : null,
      };
      await api.createNote(vehicleId, payload);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (brandsWithVehicles.length === 0) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h2>New topic</h2>
          <p className="empty-state">Add a vehicle to a customer first, then you can log a topic for it here.</p>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>New topic</h2>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="field">
            <label htmlFor="qa-vehicle">Vehicle</label>
            <select id="qa-vehicle" autoFocus value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
              {brandsWithVehicles.map((brand) => (
                <optgroup key={brand.id} label={brand.name}>
                  {brand.vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="qa-title">Topic</label>
            <input
              id="qa-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Fill in your topic"
            />
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="qa-product">Product</label>
              <select id="qa-product" value={product} onChange={(e) => setProduct(e.target.value as ProductType | "")}>
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
                  <label htmlFor="qa-bt-code">BT code</label>
                  <input
                    id="qa-bt-code"
                    type="text"
                    value={btCode}
                    onChange={(e) => setBtCode(e.target.value)}
                    placeholder="e.g. BT-2451"
                  />
                </>
              ) : (
                <>
                  <label htmlFor="qa-cw-date">CW date</label>
                  <input id="qa-cw-date" type="week" value={cwDate} onChange={(e) => setCwDate(e.target.value)} />
                </>
              )}
            </div>
          </div>

          <div className="field">
            <label htmlFor="qa-description">Short description</label>
            <textarea
              id="qa-description"
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
                  className={`category-swatch${category === c ? " active" : ""}`}
                  style={{ ["--swatch-color" as string]: `var(--cat-${c.toLowerCase()})` }}
                  onClick={() => setCategory(c)}
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
              {busy ? "Saving…" : "Add topic"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
