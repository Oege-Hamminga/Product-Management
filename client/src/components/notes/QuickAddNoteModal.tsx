import { useState, type FormEvent } from "react";
import { api, ApiError } from "../../api/client";
import type { BrandOverview, Note, NoteCategory, NoteKind, NotePriority, ProductType } from "../../api/types";
import { currentIsoWeek } from "../../utils/date";

interface QuickAddNoteModalProps {
  overview: BrandOverview[];
  initialBrandId?: string;
  onClose: () => void;
  onSaved: () => void;
}

const PRIORITIES: NotePriority[] = ["Normal", "High"];
const CATEGORIES: NoteCategory[] = ["Margin", "Quality", "Portfolio", "Other"];
const PRODUCTS: ProductType[] = ["CC", "FC", "PW"];

export default function QuickAddNoteModal({ overview, initialBrandId, onClose, onSaved }: QuickAddNoteModalProps) {
  const [brandId, setBrandId] = useState(initialBrandId ?? overview[0]?.id ?? "");
  const [vehicleName, setVehicleName] = useState("");
  const [kind, setKind] = useState<NoteKind>("news");
  const [title, setTitle] = useState("");
  const [product, setProduct] = useState<ProductType | "">("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<NoteCategory>("Margin");
  const [priority, setPriority] = useState<NotePriority>("Normal");
  const [btCode, setBtCode] = useState("");
  const [cwDate, setCwDate] = useState(currentIsoWeek());
  const [isPeriod, setIsPeriod] = useState(false);
  const [cwDateEnd, setCwDateEnd] = useState(currentIsoWeek());
  const [phase, setPhase] = useState<number>(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const brand = overview.find((b) => b.id === brandId);
  const brandLocked = Boolean(initialBrandId);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const name = vehicleName.trim();
    if (!title.trim() || !name || !brandId) return;
    if (kind === "news" && isPeriod && cwDateEnd < cwDate) {
      setError("The end week must be on or after the start week.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const existing = overview
        .find((b) => b.id === brandId)
        ?.vehicles.find((v) => v.name.trim().toLowerCase() === name.toLowerCase());
      const vehicleId = existing ? existing.id : (await api.createVehicle(brandId, name)).id;

      const payload: Partial<Note> = {
        kind,
        title: title.trim(),
        description,
        category,
        product: product || null,
        priority,
        bt_code: kind === "bt" ? btCode.trim() || null : null,
        cw_date: kind === "news" ? cwDate || null : null,
        cw_date_end: kind === "news" && isPeriod ? cwDateEnd || null : null,
        phase: kind === "bt" ? (phase as Note["phase"]) : null,
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

  if (overview.length === 0) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h2>New topic</h2>
          <p className="empty-state">Add a customer first, then you can log a topic for one of its vehicles.</p>
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
        <h2>New topic{brand ? ` — ${brand.name}` : ""}</h2>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", gap: 12 }}>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="qa-brand">Customer</label>
              <select
                id="qa-brand"
                value={brandId}
                disabled={brandLocked}
                onChange={(e) => {
                  setBrandId(e.target.value);
                  setVehicleName("");
                }}
              >
                {overview.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="qa-vehicle-name">Vehicle name</label>
              <input
                id="qa-vehicle-name"
                type="text"
                autoFocus
                list="qa-vehicle-suggestions"
                value={vehicleName}
                onChange={(e) => setVehicleName(e.target.value)}
                placeholder="e.g. Transporter T6.1"
              />
              <datalist id="qa-vehicle-suggestions">
                {brand?.vehicles.map((v) => <option key={v.id} value={v.name} />)}
              </datalist>
            </div>
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
                  <label htmlFor="qa-cw-date">CW date{isPeriod ? " (from)" : ""}</label>
                  <input id="qa-cw-date" type="week" value={cwDate} onChange={(e) => setCwDate(e.target.value)} />
                </>
              )}
            </div>
            {kind === "bt" && (
              <div className="field" style={{ flex: 1 }}>
                <label htmlFor="qa-phase">Phase</label>
                <select id="qa-phase" value={phase} onChange={(e) => setPhase(Number(e.target.value))}>
                  {[1, 2, 3, 4, 5].map((p) => (
                    <option key={p} value={p}>
                      Phase {p}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {kind === "news" && (
              <div className="field" style={{ flex: 1 }}>
                <label>&nbsp;</label>
                <button type="button" className="btn btn-secondary" onClick={() => setIsPeriod((p) => !p)}>
                  {isPeriod ? "Single week" : "+ Period"}
                </button>
              </div>
            )}
          </div>

          {kind === "news" && isPeriod && (
            <div className="field">
              <label htmlFor="qa-cw-date-end">CW date (to)</label>
              <input id="qa-cw-date-end" type="week" value={cwDateEnd} onChange={(e) => setCwDateEnd(e.target.value)} />
            </div>
          )}

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
            <button type="submit" className="btn btn-primary" disabled={busy || !title.trim() || !vehicleName.trim()}>
              {busy ? "Saving…" : "Add topic"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
