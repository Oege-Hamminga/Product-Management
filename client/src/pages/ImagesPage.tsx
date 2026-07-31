import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../api/client";
import type { Brand, BrandOverview, ProductType, SegmentImage } from "../api/types";
import { useAuth } from "../context/AuthContext";
import { ImageIcon, TrashIcon, UploadIcon } from "../components/common/Icons";
import "./ImagesPage.css";

const PRODUCT_LABEL: Record<ProductType, string> = { CC: "Crew Cab", FC: "Flex Cab", PW: "Partition Wall" };

function segmentKey(vehicleId: string, product: ProductType): string {
  return `${vehicleId}:${product}`;
}

interface SegmentEntry {
  key: string;
  vehicleId: string;
  vehicleName: string;
  brandName: string;
  product: ProductType;
}

export default function ImagesPage() {
  const { isEditMode } = useAuth();
  const [brands, setBrands] = useState<Brand[] | null>(null);
  const [overview, setOverview] = useState<BrandOverview[] | null>(null);
  const [segmentImages, setSegmentImages] = useState<SegmentImage[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [b, ov, images] = await Promise.all([api.getBrands(), api.getOverview(), api.getSegmentImages()]);
      setBrands(b);
      setOverview(ov);
      setSegmentImages(images);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Could not load images.");
    }
  }, []);

  useEffect(() => {
    if (isEditMode) load();
  }, [isEditMode, load]);

  const imageMap = useMemo(() => {
    const map = new Map<string, string>();
    segmentImages.forEach((s) => map.set(segmentKey(s.vehicle_id, s.product_type), s.image_path));
    return map;
  }, [segmentImages]);

  const segments: SegmentEntry[] = useMemo(() => {
    if (!overview) return [];
    const out: SegmentEntry[] = [];
    overview.forEach((b) => {
      b.vehicles.forEach((v) => {
        (v.products ?? []).forEach((vp) => {
          out.push({
            key: segmentKey(v.id, vp.product_type),
            vehicleId: v.id,
            vehicleName: v.name,
            brandName: b.name,
            product: vp.product_type,
          });
        });
      });
    });
    return out.sort(
      (a, b) => a.brandName.localeCompare(b.brandName) || a.vehicleName.localeCompare(b.vehicleName) || a.product.localeCompare(b.product)
    );
  }, [overview]);

  async function handleUploadLogo(brandId: string, file: File) {
    setBusyKey(`logo:${brandId}`);
    try {
      const brand = await api.uploadBrandLogo(brandId, file);
      setBrands((prev) => (prev ? prev.map((b) => (b.id === brandId ? brand : b)) : prev));
    } finally {
      setBusyKey(null);
    }
  }

  async function handleRemoveLogo(brandId: string) {
    setBusyKey(`logo:${brandId}`);
    try {
      const brand = await api.deleteBrandLogo(brandId);
      setBrands((prev) => (prev ? prev.map((b) => (b.id === brandId ? brand : b)) : prev));
    } finally {
      setBusyKey(null);
    }
  }

  async function handleUploadSegment(vehicleId: string, product: ProductType, file: File) {
    const key = segmentKey(vehicleId, product);
    setBusyKey(key);
    try {
      const images = await api.uploadSegmentImage(vehicleId, product, file);
      setSegmentImages(images);
    } finally {
      setBusyKey(null);
    }
  }

  async function handleRemoveSegment(vehicleId: string, product: ProductType) {
    const key = segmentKey(vehicleId, product);
    setBusyKey(key);
    try {
      const images = await api.deleteSegmentImage(vehicleId, product);
      setSegmentImages(images);
    } finally {
      setBusyKey(null);
    }
  }

  if (!isEditMode) {
    return (
      <div className="images-page">
        <div className="images-hero">
          <div className="container images-header">
            <h1 className="images-title">Images</h1>
          </div>
        </div>
        <div className="container images-body">
          <p className="empty-state">Log in to manage brand logos and model images.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="images-page">
      <div className="images-hero">
        <div className="container images-header">
          <div>
            <h1 className="images-title">Images</h1>
            <p className="images-subtitle">Upload brand logos and model images used on the Slides page.</p>
          </div>
        </div>
      </div>

      <div className="container images-body">
        {loadError && <p className="error-text">{loadError}</p>}
        {!brands && !overview && !loadError && <p className="images-loading">Loading…</p>}

        {brands && (
          <section className="images-section">
            <h2 className="images-section-title">Brand logos</h2>
            <div className="images-grid">
              {brands.map((b) => (
                <ImageCard
                  key={b.id}
                  label={b.name}
                  imagePath={b.logo_path}
                  isBusy={busyKey === `logo:${b.id}`}
                  onUpload={(file) => handleUploadLogo(b.id, file)}
                  onRemove={b.logo_path ? () => handleRemoveLogo(b.id) : undefined}
                />
              ))}
              {brands.length === 0 && <p className="images-empty">No brands yet.</p>}
            </div>
          </section>
        )}

        {overview && (
          <section className="images-section">
            <h2 className="images-section-title">Model images</h2>
            <div className="images-grid">
              {segments.map((s) => (
                <ImageCard
                  key={s.key}
                  label={`${s.brandName} · ${s.vehicleName} · ${PRODUCT_LABEL[s.product]}`}
                  imagePath={imageMap.get(s.key) ?? null}
                  isBusy={busyKey === s.key}
                  onUpload={(file) => handleUploadSegment(s.vehicleId, s.product, file)}
                  onRemove={imageMap.get(s.key) ? () => handleRemoveSegment(s.vehicleId, s.product) : undefined}
                />
              ))}
              {segments.length === 0 && <p className="images-empty">No models with a product yet.</p>}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function ImageCard({
  label,
  imagePath,
  isBusy,
  onUpload,
  onRemove,
}: {
  label: string;
  imagePath: string | null;
  isBusy: boolean;
  onUpload: (file: File) => void;
  onRemove?: () => void;
}) {
  return (
    <div className="image-card">
      <div className="image-card-thumb" style={imagePath ? { backgroundImage: `url(${imagePath})` } : undefined}>
        {!imagePath && <ImageIcon width={20} height={20} />}
      </div>
      <div className="image-card-label" title={label}>
        {label}
      </div>
      <div className="image-card-actions">
        <label className="btn btn-secondary btn-sm">
          <UploadIcon width={12} height={12} /> {isBusy ? "Uploading…" : imagePath ? "Replace" : "Upload"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            style={{ display: "none" }}
            disabled={isBusy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
              e.target.value = "";
            }}
          />
        </label>
        {onRemove && (
          <button type="button" className="icon-btn" title="Remove image" disabled={isBusy} onClick={onRemove}>
            <TrashIcon width={14} height={14} />
          </button>
        )}
      </div>
    </div>
  );
}
