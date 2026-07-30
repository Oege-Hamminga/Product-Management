import { useState, type FormEvent } from "react";
import { api, ApiError } from "../api/client";
import type { BrandOverview, ProductType } from "../api/types";
import { currentIsoWeek } from "../utils/date";

const PRODUCTS: ProductType[] = ["CC", "FC", "PW"];

interface AddNewsTopicModalProps {
  overview: BrandOverview[];
  onClose: () => void;
  onSaved: () => void;
}

export default function AddNewsTopicModal({ overview, onClose, onSaved }: AddNewsTopicModalProps) {
  const [brandId, setBrandId] = useState(overview[0]?.id ?? "");
  const [vehicleName, setVehicleName] = useState("");
  const [product, setProduct] = useState<ProductType | "">("");
  const [title, setTitle] = useState("");
  const [longTerm, setLongTerm] = useState(false);
  const [cwDate, setCwDate] = useState(currentIsoWeek());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const brand = overview.find((b) => b.id === brandId);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const name = vehicleName.trim();
    if (!title.trim() || !name || !brandId) return;
    setBusy(true);
    setError(null);
    try {
      const existing = brand?.vehicles.find((v) => v.name.trim().toLowerCase() === name.toLowerCase());
      const vehicleId = existing ? existing.id : (await api.createVehicle(brandId, name)).id;
      if (product) {
        // Registers the segment so its tile (and Product Changes box) keeps
        // showing on the Slides page even after this topic is completed —
        // a no-op if it's already registered.
        try {
          await api.addVehicleProduct(vehicleId, product);
        } catch {
          // Already added for this vehicle — fine.
        }
      }
      await api.createNote(vehicleId, {
        kind: "news",
        title: title.trim(),
        category: "Other",
        product: product || null,
        priority: "Normal",
        cw_date: longTerm ? null : cwDate,
        long_term: longTerm,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add topic.");
    } finally {
      setBusy(false);
    }
  }

  if (overview.length === 0) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h2>New topic</h2>
          <p className="empty-state">No customers yet — nothing to add a topic for.</p>
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
              <label htmlFor="ant-brand">Customer</label>
              <select
                id="ant-brand"
                value={brandId}
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
              <label htmlFor="ant-vehicle-name">Model</label>
              <input
                id="ant-vehicle-name"
                type="text"
                autoFocus
                list="ant-vehicle-suggestions"
                value={vehicleName}
                onChange={(e) => setVehicleName(e.target.value)}
                placeholder="e.g. K0"
              />
              <datalist id="ant-vehicle-suggestions">
                {brand?.vehicles.map((v) => (
                  <option key={v.id} value={v.name} />
                ))}
              </datalist>
            </div>
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="ant-product">Product</label>
              <select id="ant-product" value={product} onChange={(e) => setProduct(e.target.value as ProductType | "")}>
                <option value="">—</option>
                {PRODUCTS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ flex: 2 }}>
              <label htmlFor="ant-title">News topic</label>
              <input
                id="ant-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Fill in your topic"
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
            {!longTerm && (
              <div className="field" style={{ flex: 1 }}>
                <label htmlFor="ant-cw-date">Calendar week</label>
                <input id="ant-cw-date" type="week" value={cwDate} onChange={(e) => setCwDate(e.target.value)} />
              </div>
            )}
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 13,
                fontWeight: 700,
                color: "var(--text-secondary)",
                paddingBottom: 10,
              }}
            >
              <input type="checkbox" checked={longTerm} onChange={(e) => setLongTerm(e.target.checked)} />
              Long term
            </label>
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
