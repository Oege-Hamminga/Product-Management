import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../api/client";
import type { Brand, BrandOverview, ProductType, SegmentImage, Slide, VehicleSummary } from "../api/types";
import { useAuth } from "../context/AuthContext";
import { ImageIcon, PlusIcon, TrashIcon, UploadIcon } from "../components/common/Icons";
import "./SettingsPage.css";

const LAST_SLIDE_VALUE = "";

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
  const [slides, setSlides] = useState<Slide[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [savingProduct, setSavingProduct] = useState<string | null>(null);
  const [deletingVehicle, setDeletingVehicle] = useState<string | null>(null);
  const [deletingBrand, setDeletingBrand] = useState<string | null>(null);
  const [deletingSlide, setDeletingSlide] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [b, ov, images, sl] = await Promise.all([
        api.getBrands(),
        api.getOverview(),
        api.getSegmentImages(),
        api.getSlides(),
      ]);
      setBrands(b);
      setOverview(ov);
      setSegmentImages(images);
      setSlides(sl);
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

  async function handleCreateSlide(title: string) {
    await api.createSlide(title);
    await load();
  }

  async function handleRenameSlide(id: string, title: string) {
    await api.renameSlide(id, title);
    await load();
  }

  async function handleDeleteSlide(id: string, title: string) {
    if (!window.confirm(`Delete the "${title}" slide? Brands on it move to the last slide.`)) return;
    setDeletingSlide(id);
    try {
      await api.deleteSlide(id);
      await load();
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Could not delete slide.");
    } finally {
      setDeletingSlide(null);
    }
  }

  async function handleSetBrandSlide(brandId: string, slideId: string | null) {
    await api.setBrandSlide(brandId, slideId);
    await load();
  }

  async function handleToggleShowProductChanges(vehicleId: string, show: boolean) {
    await api.setVehicleShowProductChanges(vehicleId, show);
    await load();
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
              {(brands ?? []).map((b) => (
                <ImageCard
                  key={b.id}
                  label={b.name}
                  imagePath={b.logo_path}
                  isBusy={busyKey === `logo:${b.id}`}
                  onUpload={(file) => handleUploadLogo(b.id, file)}
                  onRemove={b.logo_path ? () => handleRemoveLogo(b.id) : undefined}
                />
              ))}
              {(brands ?? []).length === 0 && <p className="settings-empty">No brands yet.</p>}
            </div>
          </section>
        )}

        {slides && brands && (
          <section className="settings-section">
            <h2 className="settings-section-title">Slides</h2>
            <p className="settings-section-desc">
              Each slide is screenshotted on its own for the presentation — add, rename or delete slides, and choose
              which one each brand appears on.
            </p>
            <div className="slide-manage-list">
              {slides.map((s) => (
                <SlideRow
                  key={s.id}
                  slide={s}
                  isOnly={slides.length <= 1}
                  isDeleting={deletingSlide === s.id}
                  onRename={handleRenameSlide}
                  onDelete={() => handleDeleteSlide(s.id, s.title)}
                />
              ))}
            </div>
            <AddSlideForm onCreate={handleCreateSlide} />

            <h3 className="settings-subsection-title">Assign brands to slides</h3>
            <div className="brand-slide-list">
              {brands.map((b) => (
                <div className="brand-slide-row" key={b.id}>
                  <span className="vehicle-row-name">{b.name}</span>
                  <select
                    value={slides.some((s) => s.id === b.slide_id) ? (b.slide_id as string) : LAST_SLIDE_VALUE}
                    onChange={(e) => handleSetBrandSlide(b.id, e.target.value || null)}
                  >
                    <option value={LAST_SLIDE_VALUE}>— Last slide (default) —</option>
                    {slides.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              {brands.length === 0 && <p className="settings-empty">No brands yet.</p>}
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
                  isNewsCategoryBrand={b.name === "Overall News"}
                  savingProduct={savingProduct}
                  deletingVehicle={deletingVehicle}
                  isDeletingBrand={deletingBrand === b.id}
                  onToggleProduct={handleToggleProduct}
                  onToggleShowProductChanges={handleToggleShowProductChanges}
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

function SlideRow({
  slide,
  isOnly,
  isDeleting,
  onRename,
  onDelete,
}: {
  slide: Slide;
  isOnly: boolean;
  isDeleting: boolean;
  onRename: (id: string, title: string) => Promise<void>;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(slide.title);

  useEffect(() => setTitle(slide.title), [slide.title]);

  function handleBlur() {
    const trimmed = title.trim();
    if (!trimmed) {
      setTitle(slide.title);
      return;
    }
    if (trimmed !== slide.title) onRename(slide.id, trimmed);
  }

  return (
    <div className="slide-row">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
      <button
        type="button"
        className="icon-btn"
        title={isOnly ? "At least one slide is required" : "Delete this slide"}
        disabled={isOnly || isDeleting}
        onClick={onDelete}
      >
        <TrashIcon width={13} height={13} />
      </button>
    </div>
  );
}

function AddSlideForm({ onCreate }: { onCreate: (title: string) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    const trimmed = title.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate(trimmed);
      setTitle("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add slide.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-add-row">
      <input
        type="text"
        placeholder="New slide title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleAdd();
        }}
      />
      <button type="button" className="btn btn-secondary btn-sm" disabled={busy || !title.trim()} onClick={handleAdd}>
        <PlusIcon width={12} height={12} /> {busy ? "Adding…" : "Add slide"}
      </button>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

function BrandModelsBlock({
  brandId,
  brandName,
  vehicles,
  isNewsCategoryBrand,
  savingProduct,
  deletingVehicle,
  isDeletingBrand,
  onToggleProduct,
  onToggleShowProductChanges,
  onCreateVehicle,
  onDeleteVehicle,
  onDeleteBrand,
}: {
  brandId: string;
  brandName: string;
  vehicles: VehicleSummary[];
  isNewsCategoryBrand?: boolean;
  savingProduct: string | null;
  deletingVehicle: string | null;
  isDeletingBrand: boolean;
  onToggleProduct: (vehicleId: string, product: ProductType, active: boolean) => void;
  onToggleShowProductChanges: (vehicleId: string, show: boolean) => Promise<void>;
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
          title={vehicles.length === 0 ? "Delete this brand" : "Remove all its models first to delete this brand"}
          disabled={vehicles.length > 0 || isDeletingBrand}
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
            hideProducts={isNewsCategoryBrand}
            savingProduct={savingProduct}
            isDeleting={deletingVehicle === v.id}
            onToggleProduct={onToggleProduct}
            onToggleShowProductChanges={onToggleShowProductChanges}
            onDelete={() => onDeleteVehicle(v.id, v.name)}
          />
        ))}
        {vehicles.length === 0 && <p className="settings-empty">No models yet.</p>}
      </div>
      <div className="settings-add-row">
        <input
          type="text"
          placeholder={isNewsCategoryBrand ? "New news category name" : "New model name"}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
        />
        <button type="button" className="btn btn-secondary btn-sm" disabled={busy || !name.trim()} onClick={handleAdd}>
          <PlusIcon width={12} height={12} /> {busy ? "Adding…" : isNewsCategoryBrand ? "Add category" : "Add model"}
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
  onToggleShowProductChanges,
  onDelete,
}: {
  vehicle: VehicleSummary;
  hideProducts?: boolean;
  savingProduct: string | null;
  isDeleting: boolean;
  onToggleProduct: (vehicleId: string, product: ProductType, active: boolean) => void;
  onToggleShowProductChanges: (vehicleId: string, show: boolean) => Promise<void>;
  onDelete: () => void;
}) {
  const [savingShowChanges, setSavingShowChanges] = useState(false);
  const active = new Set((vehicle.products ?? []).map((p) => p.product_type));

  async function handleToggleShowChanges() {
    setSavingShowChanges(true);
    try {
      await onToggleShowProductChanges(vehicle.id, !vehicle.show_product_changes);
    } finally {
      setSavingShowChanges(false);
    }
  }

  return (
    <div className="vehicle-row">
      <span className="vehicle-row-name">{vehicle.name}</span>
      <div className="vehicle-row-products">
        {!hideProducts && (
          <input
            type="checkbox"
            className="product-changes-checkbox"
            checked={vehicle.show_product_changes}
            disabled={savingShowChanges}
            onChange={handleToggleShowChanges}
            title={
              vehicle.show_product_changes
                ? "Product Changes box shown on Slides — click to hide it and exclude it from the total"
                : "Product Changes box hidden on Slides and excluded from the total — click to show it"
            }
          />
        )}
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
