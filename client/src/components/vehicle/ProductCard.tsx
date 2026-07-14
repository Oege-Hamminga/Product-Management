import { useState } from "react";
import type { ProductType, VehicleProduct } from "../../api/types";
import { CloseIcon, ImageIcon, PlusIcon, UploadIcon } from "../common/Icons";
import "./ProductCard.css";

const LABELS: Record<ProductType, { title: string; sub: string; blurb: string; color: string }> = {
  CC: { title: "Crew Cab", sub: "CC", blurb: "Rear passenger module", color: "var(--product-cc)" },
  FC: { title: "Flex Cab", sub: "FC", blurb: "Convertible seating layout", color: "var(--product-fc)" },
  PW: { title: "Partition Wall", sub: "PW", blurb: "Cargo/cab separation", color: "var(--product-pw)" },
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
  const { title, sub, blurb, color } = LABELS[type];
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState(product?.notes ?? "");

  if (!product) {
    return (
      <div className="card product-card product-card-inactive">
        <div className="product-card-header">
          <div className="product-card-title">
            <span className="product-chip" style={{ background: color }}>
              {sub}
            </span>
            <div>
              <h3>{title}</h3>
              <span className="sub">{blurb}</span>
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
              <PlusIcon width={13} height={13} /> Add {sub}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="card product-card">
      <div className="product-card-header" style={{ borderBottomColor: `color-mix(in srgb, ${color} 30%, var(--border))` }}>
        <div className="product-card-title">
          <span className="product-chip" style={{ background: color }}>
            {sub}
          </span>
          <div>
            <h3>{title}</h3>
            <span className="sub">{blurb}</span>
          </div>
        </div>
        {isEditMode && (
          <button className="icon-btn" title={`Remove ${sub}`} onClick={onDelete}>
            <CloseIcon width={12} height={12} />
          </button>
        )}
      </div>

      <div className="product-card-image">
        {product.image_path ? (
          <img src={product.image_path} alt={title} />
        ) : (
          <div className="placeholder">
            <ImageIcon width={22} height={22} />
            <span>No supporting image yet</span>
          </div>
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
            <UploadIcon width={13} height={13} />
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
