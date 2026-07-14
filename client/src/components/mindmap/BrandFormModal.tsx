import { useState, type FormEvent } from "react";
import { api, ApiError } from "../../api/client";
import type { Brand } from "../../api/types";
import ConfirmDialog from "../common/ConfirmDialog";
import { TrashIcon } from "../common/Icons";

interface BrandFormModalProps {
  brand?: Brand;
  onClose: () => void;
  onSaved: () => void;
}

export default function BrandFormModal({ brand, onClose, onSaved }: BrandFormModalProps) {
  const isEdit = Boolean(brand);
  const [name, setName] = useState(brand?.name ?? "");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const saved = brand ? await api.renameBrand(brand.id, name.trim()) : await api.createBrand(name.trim());
      if (logoFile) {
        await api.uploadBrandLogo(saved.id, logoFile);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveLogo() {
    if (!brand) return;
    setBusy(true);
    try {
      await api.deleteBrandLogo(brand.id);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove logo.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!brand) return;
    setBusy(true);
    try {
      await api.deleteBrand(brand.id);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete brand.");
      setBusy(false);
      setConfirmingDelete(false);
    }
  }

  if (confirmingDelete) {
    return (
      <ConfirmDialog
        title={`Delete ${brand?.name}?`}
        message="This removes the brand along with all of its vehicles, products, bugtracker tickets and topics. This cannot be undone."
        busy={busy}
        onConfirm={handleDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{isEdit ? "Edit customer" : "Add customer (OEM brand)"}</h2>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="field">
            <label htmlFor="brand-name">Name</label>
            <input
              id="brand-name"
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Stellantis"
            />
          </div>
          <div className="field">
            <label htmlFor="brand-logo">Logo (PNG, JPG, WEBP or SVG)</label>
            <input
              id="brand-logo"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
            />
            {isEdit && brand?.logo_path && (
              <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={handleRemoveLogo}>
                Remove current logo
              </button>
            )}
          </div>
          {error && <p className="error-text">{error}</p>}
          <div className="modal-actions" style={{ justifyContent: isEdit ? "space-between" : "flex-end" }}>
            {isEdit && (
              <button type="button" className="btn btn-danger" onClick={() => setConfirmingDelete(true)}>
                <TrashIcon width={13} height={13} /> Delete customer
              </button>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
                {busy ? "Saving…" : isEdit ? "Save changes" : "Add customer"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
