import { useState } from "react";
import type { ProductType, VehicleProduct } from "../../api/types";
import "./ProductCard.css";

const LABELS: Record<ProductType, { title: string; sub: string }> = {
  CC: { title: "Crew Cab", sub: "CC" },
  FC: { title: "Flex Cab", sub: "FC" },
  PW: { title: "Partition Wall", sub: "PW" },
};

interface ProductCardProps {
  type: ProductType;
  product?: VehicleProduct;
  isEditMode: boolean;
  onAdd: () => Promise<void>;
  onDelete: () => Promise<void>;
  onUploadImage: (file: File) => Promise<void>;
  onSaveNotes: (notes: string) => Promise<void>;
}

export default function ProductCard({
  type,
  product,
  isEditMode,
  onAdd,
  onDelete,
  onUploadImage,
  onSaveNotes,
}: ProductCardProps) {
  const { title, sub } = LABELS[type];
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState(product?.notes ?? "");

  if (!product) {
    return (
      <div className="card product-card">
        <div className="product-card-header">
          <div className="product-card-title">
            <span className="product-chip">{sub}</span>
            <div>
              <h3>{title}</h3>
            </div>
          </div>
        </div>
        <div className="product-card-empty">
          <p>Not currently offered for this vehicle.</p>
          {isEditMode && (
            <button
              className="btn btn-secondary btn-sm"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await onAdd();
                setBusy(false);
              }}
            >
              + Add {sub}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="card product-card">
      <div className="product-card-header">
        <div className="product-card-title">
          <span className="product-chip">{sub}</span>
          <div>
            <h3>{title}</h3>
          </div>
        </div>
        {isEditMode && (
          <button className="icon-btn" title={`Remove ${sub}`} onClick={onDelete}>
            ×
          </button>
        )}
      </div>

      <div className="product-card-image">
        {product.image_path ? (
          <img src={product.image_path} alt={title} />
        ) : (
          <div className="placeholder">No supporting image yet</div>
        )}
      </div>

      <div className="product-card-body">
        {isEditMode ? (
          <textarea
            value={notes}
            placeholder="Notes about this product on this vehicle…"
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => {
              if (notes !== product.notes) onSaveNotes(notes);
            }}
          />
        ) : product.notes ? (
          <p className="product-card-notes">{product.notes}</p>
        ) : null}
      </div>

      {isEditMode && (
        <div className="product-card-footer">
          <label className="btn btn-secondary btn-sm file-input-label">
            {product.image_path ? "Replace image" : "Upload image"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setBusy(true);
                await onUploadImage(file);
                setBusy(false);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      )}
    </div>
  );
}
