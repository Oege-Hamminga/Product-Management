import { useState, type FormEvent } from "react";
import { api, ApiError } from "../../api/client";

interface VehicleFormModalProps {
  brandId: string;
  brandName: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function VehicleFormModal({ brandId, brandName, onClose, onSaved }: VehicleFormModalProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.createVehicle(brandId, name.trim());
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
        <h2>Add vehicle to {brandName}</h2>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="field">
            <label htmlFor="vehicle-name">Vehicle / variant name</label>
            <input
              id="vehicle-name"
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Transporter T6.1"
            />
          </div>
          {error && <p className="error-text">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
              {busy ? "Adding…" : "Add vehicle"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
