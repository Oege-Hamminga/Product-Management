import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../api/client";
import type { Brand, BrandOverview, ProductType, SegmentImage, VehicleSummary } from "../api/types";
import { useAuth } from "../context/AuthContext";
import { ImageIcon, PlusIcon, TrashIcon, UploadIcon } from "../components/common/Icons";
import "./SettingsPage.css";

const PRODUCT_LABEL: Record<ProductType, string> = { CC: "Crew Cab", FC: "Flex Cab", PW: "Partition Wall" };
const PRODUCTS: ProductType[] = ["CC", "FC", "PW"];

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

export default function SettingsPage() {
  const { isEditMode } = useAuth();
  const [brands, setBrands] = useState<Brand[] | null>(null);
  const [overview, setOverview] = useState<BrandOverview[] | null>(null);
  const [segmentImages, setSegmentImages] = useState<SegmentImage[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [savingProduct, setSavingProduct] = useState<string | null>(null);
  const [deletingVehicle, setDeletingVehicle] = useState<string | null>(null);
  const [deletingBrand, setDeletingBrand] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [b, ov, images] = await Promise.all([api.getBrands(), api.getOverview(), api.getSegmentImages()]);
      setBrands(b);
      setOverview(ov);
      setSegmentImages(images);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Could not load settings.");
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

  // The reserved "Overall News" brand has no logo and can't be renamed or
  // deleted, so it's left out of the Brands grid — but its "models" are
  // really just News categories (e.g. "Overall News", "Universal Product
  // Changes"), added/renamed/removed the same as any other brand's models,
  // so it does appear in the Models section below (see isReservedBrand).
  const visibleBrands = useMemo(() => (brands ?? []).filter((b) => b.name !== "Overall News"), [brands]);

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

  async function handleCreateBrand(name: string) {
    await api.createBrand(name);
    await load();
  }

  async function handleCreateVehicle(brandId: string, name: string) {
    await api.createVehicle(brandId, name);
    await load();
  }

  async function handleDeleteVehicle(vehicleId: string, vehicleName: string) {
    if (!window.confirm(`Delete "${vehicleName}"? This also removes its products, News topics and images.`)) return;
    setDeletingVehicle(vehicleId);
    try {
      await api.deleteVehicle(vehicleId);
      await load();
    } finally {
      setDeletingVehicle(null);
    }
  }

  async function handleDeleteBrand(brandId: string, brandName: string) {
    if (!window.confirm(`Delete "${brandName}"? This cannot be undone.`)) return;
    setDeletingBrand(brandId);
    try {
      await api.deleteBrand(brandId);
      await load();
    } finally {
      setDeletingBrand(null);
    }
  }

  async function handleToggleProduct(vehicleId: string, product: ProductType, active: boolean) {
    const key = segmentKey(vehicleId, product);
    setSavingProduct(key);
    try {
      if (active) await api.addVehicleProduct(vehicleId, product);
      else await api.deleteVehicleProduct(vehicleId, product);
      await load();
    } finally {
      setSavingProduct(null);
    }
  }

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
      <div className="settings-page">
        <div className="settings-hero">
          <div className="container settings-header">
            <h1 className="settings-title">Settings</h1>
          </div>
        </div>
        <div className="container settings-body">
          <p className="empty-state">Log in to manage brands, models and images.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <div className="settings-hero">
        <div className="container settings-header">
          <div>
            <h1 className="settings-title">Settings</h1>
            <p className="settings-subtitle">Create brands and models, and upload the logos and photos used on the Slides page.</p>
          </div>
        </div>
      </div>

      <div className="container settings-body">
        {loadError && <p className="error-text">{loadError}</p>}
        {!brands && !overview && !loadError && <p className="settings-loading">Loading…</p>}

        {brands && (
          <section className="settings-section">
            <h2 className="settings-section-title">Brands</h2>
            <AddBrandForm onCreate={handleCreateBrand} />
            <div className="settings-grid">
              {visibleBrands.map((b) => (
                <ImageCard
                  key={b.id}
                  label={b.name}
                  imagePath={b.logo_path}
                  isBusy={busyKey === `logo:${b.id}`}
                  onUpload={(file) => handleUploadLogo(b.id, file)}
                  onRemove={b.logo_path ? () => handleRemoveLogo(b.id) : undefined}
                />
              ))}
              {visibleBrands.length === 0 && <p className="settings-empty">No brands yet.</p>}
            </div>
          </section>
        )}

        {overview && (
          <section className="settings-section">
            <h2 className="settings-section-title">Models</h2>
            <div className="brand-models-list">
              {(overview ?? []).map((b) => (
                <BrandModelsBlock
                  key={b.id}
                  brandId={b.id}
                  brandName={b.name}
                  vehicles={b.vehicles}
                  isReservedBrand={b.name === "Overall News"}
                  savingProduct={savingProduct}
                  deletingVehicle={deletingVehicle}
                  isDeletingBrand={deletingBrand === b.id}
                  onToggleProduct={handleToggleProduct}
                  onCreateVehicle={handleCreateVehicle}
                  onDeleteVehicle={handleDeleteVehicle}
                  onDeleteBrand={handleDeleteBrand}
                />
              ))}
              {(overview ?? []).length === 0 && <p className="settings-empty">Add a brand above first.</p>}
            </div>
          </section>
        )}

        {overview && (
          <section className="settings-section">
            <h2 className="settings-section-title">Model images</h2>
            <div className="settings-grid">
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
              {segments.length === 0 && <p className="settings-empty">No models with a product yet — toggle one on above.</p>}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function AddBrandForm({ onCreate }: { onCreate: (name: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate(trimmed);
      setName("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add brand.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-add-row">
      <input
        type="text"
        placeholder="New brand name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleAdd();
        }}
      />
      <button type="button" className="btn btn-primary btn-sm" disabled={busy || !name.trim()} onClick={handleAdd}>
        <PlusIcon width={12} height={12} /> {busy ? "Adding…" : "Add brand"}
      </button>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

function BrandModelsBlock({
  brandId,
  brandName,
  vehicles,
  isReservedBrand,
  savingProduct,
  deletingVehicle,
  isDeletingBrand,
  onToggleProduct,
  onCreateVehicle,
  onDeleteVehicle,
  onDeleteBrand,
}: {
  brandId: string;
  brandName: string;
  vehicles: VehicleSummary[];
  isReservedBrand?: boolean;
  savingProduct: string | null;
  deletingVehicle: string | null;
  isDeletingBrand: boolean;
  onToggleProduct: (vehicleId: string, product: ProductType, active: boolean) => void;
  onCreateVehicle: (brandId: string, name: string) => Promise<void>;
  onDeleteVehicle: (vehicleId: string, vehicleName: string) => void;
  onDeleteBrand: (brandId: string, brandName: string) => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      await onCreateVehicle(brandId, trimmed);
      setName("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add model.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="brand-models-block">
      <div className="brand-models-header">
        <h3 className="brand-models-title">{brandName}</h3>
        <button
          type="button"
          className="icon-btn"
          title={
            isReservedBrand
              ? "This brand is reserved and can't be deleted"
              : vehicles.length === 0
                ? "Delete this brand"
                : "Remove all its models first to delete this brand"
          }
          disabled={isReservedBrand || vehicles.length > 0 || isDeletingBrand}
          onClick={() => onDeleteBrand(brandId, brandName)}
        >
          <TrashIcon width={13} height={13} />
        </button>
      </div>
      <div className="vehicle-list">
        {vehicles.map((v) => (
          <VehicleRow
            key={v.id}
            vehicle={v}
            hideProducts={isReservedBrand}
            savingProduct={savingProduct}
            isDeleting={deletingVehicle === v.id}
            onToggleProduct={onToggleProduct}
            onDelete={() => onDeleteVehicle(v.id, v.name)}
          />
        ))}
        {vehicles.length === 0 && <p className="settings-empty">No models yet.</p>}
      </div>
      <div className="settings-add-row">
        <input
          type="text"
          placeholder={isReservedBrand ? "New news category name" : "New model name"}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
        />
        <button type="button" className="btn btn-secondary btn-sm" disabled={busy || !name.trim()} onClick={handleAdd}>
          <PlusIcon width={12} height={12} /> {busy ? "Adding…" : isReservedBrand ? "Add category" : "Add model"}
        </button>
        {error && <p className="error-text">{error}</p>}
      </div>
    </div>
  );
}

function VehicleRow({
  vehicle,
  hideProducts,
  savingProduct,
  isDeleting,
  onToggleProduct,
  onDelete,
}: {
  vehicle: VehicleSummary;
  hideProducts?: boolean;
  savingProduct: string | null;
  isDeleting: boolean;
  onToggleProduct: (vehicleId: string, product: ProductType, active: boolean) => void;
  onDelete: () => void;
}) {
  const active = new Set((vehicle.products ?? []).map((p) => p.product_type));
  return (
    <div className="vehicle-row">
      <span className="vehicle-row-name">{vehicle.name}</span>
      <div className="vehicle-row-products">
        {!hideProducts &&
          PRODUCTS.map((p) => {
            const isActive = active.has(p);
            const key = segmentKey(vehicle.id, p);
            return (
              <button
                key={p}
                type="button"
                className={`product-toggle${isActive ? " active" : ""}`}
                disabled={savingProduct === key}
                onClick={() => onToggleProduct(vehicle.id, p, !isActive)}
                title={isActive ? `Remove ${PRODUCT_LABEL[p]}` : `Add ${PRODUCT_LABEL[p]}`}
              >
                {p}
              </button>
            );
          })}
        <button
          type="button"
          className="icon-btn"
          title="Delete this model"
          disabled={isDeleting}
          onClick={onDelete}
        >
          <TrashIcon width={13} height={13} />
        </button>
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
