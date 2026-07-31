import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api, ApiError } from "../api/client";
import type { BrandOverview, ProductType } from "../api/types";
import { currentIsoWeek } from "../utils/date";

interface AddNewsTopicModalProps {
  overview: BrandOverview[];
  onClose: () => void;
  onSaved: () => void;
}

// Models and their products are managed on the Images tab now — this form
// only picks from what already exists, it never creates a brand, model or
// product on the fly.
export default function AddNewsTopicModal({ overview, onClose, onSaved }: AddNewsTopicModalProps) {
  const brandsWithVehicles = useMemo(() => overview.filter((b) => b.vehicles.length > 0), [overview]);
  const [brandId, setBrandId] = useState(brandsWithVehicles[0]?.id ?? "");
  const brand = brandsWithVehicles.find((b) => b.id === brandId);
  const [vehicleId, setVehicleId] = useState(brand?.vehicles[0]?.id ?? "");
  const vehicle = brand?.vehicles.find((v) => v.id === vehicleId);
  const [product, setProduct] = useState<ProductType | "">("");
  const [title, setTitle] = useState("");
  const [longTerm, setLongTerm] = useState(false);
  const [cwDate, setCwDate] = useState(currentIsoWeek());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const first = brand?.vehicles[0]?.id ?? "";
    setVehicleId(first);
  }, [brandId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setProduct("");
  }, [vehicleId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !vehicleId) return;
    setBusy(true);
    setError(null);
    try {
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

  if (brandsWithVehicles.length === 0) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h2>New topic</h2>
          <p className="empty-state">
            No models yet — add a brand and model on the Images tab first, then you can log topics for them here.
          </p>
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
              <select id="ant-brand" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
                {brandsWithVehicles.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="ant-vehicle-name">Model</label>
              <select id="ant-vehicle-name" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                {(brand?.vehicles ?? []).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="ant-product">Product</label>
              <select id="ant-product" value={product} onChange={(e) => setProduct(e.target.value as ProductType | "")}>
                <option value="">—</option>
                {(vehicle?.products ?? []).map((p) => (
                  <option key={p.product_type} value={p.product_type}>
                    {p.product_type}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ flex: 2 }}>
              <label htmlFor="ant-title">News topic</label>
              <input
                id="ant-title"
                type="text"
                autoFocus
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
            <button type="submit" className="btn btn-primary" disabled={busy || !title.trim() || !vehicleId}>
              {busy ? "Saving…" : "Add topic"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
