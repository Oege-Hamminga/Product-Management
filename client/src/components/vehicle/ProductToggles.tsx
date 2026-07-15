import type { ProductType, VehicleProduct } from "../../api/types";
import { CloseIcon, PlusIcon } from "../common/Icons";
import "./ProductToggles.css";

const LABELS: Record<ProductType, { title: string; sub: string; color: string }> = {
  CC: { title: "Crew Cab", sub: "CC", color: "var(--product-cc)" },
  FC: { title: "Flex Cab", sub: "FC", color: "var(--product-fc)" },
  PW: { title: "Partition Wall", sub: "PW", color: "var(--product-pw)" },
};

const PRODUCT_TYPES: ProductType[] = ["CC", "FC", "PW"];

interface ProductTogglesProps {
  products: VehicleProduct[];
  isEditMode: boolean;
  onAdd: (type: ProductType) => Promise<void>;
  onRemove: (type: ProductType) => Promise<void>;
}

export default function ProductToggles({ products, isEditMode, onAdd, onRemove }: ProductTogglesProps) {
  const active = new Set(products.map((p) => p.product_type));

  return (
    <div className="product-toggles">
      {PRODUCT_TYPES.map((type) => {
        const { title, sub, color } = LABELS[type];
        const isActive = active.has(type);
        return (
          <div
            key={type}
            className={`product-toggle${isActive ? " active" : ""}`}
            style={isActive ? { borderColor: color, background: `color-mix(in srgb, ${color} 10%, var(--surface-1))` } : undefined}
          >
            <span className="product-toggle-chip" style={{ background: isActive ? color : "var(--surface-2)", color: isActive ? "#fff" : "var(--text-muted)" }}>
              {sub}
            </span>
            <span className="product-toggle-title">{title}</span>
            {isEditMode && (
              <button
                className="icon-btn product-toggle-btn"
                title={isActive ? `Remove ${sub}` : `Add ${sub}`}
                onClick={() => (isActive ? onRemove(type) : onAdd(type))}
              >
                {isActive ? <CloseIcon width={12} height={12} /> : <PlusIcon width={12} height={12} />}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
