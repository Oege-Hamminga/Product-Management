import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../api/client";
import type { BrandOverview, Note, ProductType, SegmentImage } from "../api/types";
import { useAuth } from "../context/AuthContext";
import { CheckCircleIcon, ImageIcon, PlusIcon, TrashIcon, UploadIcon } from "../components/common/Icons";
import { currentIsoWeek, formatCwDate } from "../utils/date";
import "./TopicsTablePage.css";

const PRODUCTS: ProductType[] = ["CC", "FC", "PW"];

interface TopicRow {
  note: Note;
  vehicleId: string;
  vehicleName: string;
  brandName: string;
}

function segmentKey(vehicleId: string, product: ProductType): string {
  return `${vehicleId}:${product}`;
}

export default function TopicsTablePage() {
  const { isEditMode } = useAuth();
  const [overview, setOverview] = useState<BrandOverview[] | null>(null);
  const [segmentImages, setSegmentImages] = useState<SegmentImage[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [ov, images] = await Promise.all([api.getOverview(), api.getSegmentImages()]);
      setOverview(ov);
      setSegmentImages(images);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Could not load topics.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // News only — Bugtracker items stay on the Board page.
  const rows: TopicRow[] = useMemo(() => {
    if (!overview) return [];
    const out: TopicRow[] = [];
    overview.forEach((b) => {
      b.vehicles.forEach((v) => {
        v.notes.forEach((n) => {
          if (n.kind !== "news") return;
          out.push({ note: n, vehicleId: v.id, vehicleName: v.name, brandName: b.name });
        });
      });
    });
    return out.sort(
      (a, b) =>
        a.brandName.localeCompare(b.brandName) ||
        a.vehicleName.localeCompare(b.vehicleName) ||
        (a.note.cw_date ?? "").localeCompare(b.note.cw_date ?? "")
    );
  }, [overview]);

  const imageMap = useMemo(() => {
    const map = new Map<string, string>();
    segmentImages.forEach((s) => map.set(segmentKey(s.vehicle_id, s.product_type), s.image_path));
    return map;
  }, [segmentImages]);

  async function handleUploadImage(vehicleId: string, product: ProductType, file: File) {
    const key = segmentKey(vehicleId, product);
    setUploadingKey(key);
    try {
      const images = await api.uploadSegmentImage(vehicleId, product, file);
      setSegmentImages(images);
    } finally {
      setUploadingKey(null);
    }
  }

  async function handleRemoveImage(vehicleId: string, product: ProductType) {
    const images = await api.deleteSegmentImage(vehicleId, product);
    setSegmentImages(images);
  }

  async function handleFieldChange(noteId: string, payload: Partial<Note>) {
    await api.updateNote(noteId, payload);
    await load();
  }

  async function handleComplete(noteId: string) {
    await api.updateNote(noteId, { completed: true });
    await load();
  }

  async function handleDelete(noteId: string) {
    setDeletingId(noteId);
    try {
      await api.deleteNote(noteId);
      await load();
    } finally {
      setDeletingId(null);
    }
  }

  const brands = overview ?? [];
  const colCount = isEditMode ? 8 : 7;

  return (
    <div className="topics-page">
      <div className="topics-hero">
        <div className="container topics-header">
          <div>
            <h1 className="topics-title">News Topics</h1>
            <p className="topics-subtitle">
              {rows.length} active topic{rows.length === 1 ? "" : "s"} · feeds the Slides page
            </p>
          </div>
        </div>
      </div>

      <div className="container topics-body">
        {loadError && <p className="error-text">{loadError}</p>}
        {!overview && !loadError && <p className="topics-loading">Loading topics…</p>}

        {overview && (
          <div className="topics-table-wrap">
            <table className="topics-table">
              <thead>
                <tr>
                  <th>Brand</th>
                  <th>Model</th>
                  <th>Product</th>
                  <th>Image</th>
                  <th>News topic</th>
                  <th>Calendar week</th>
                  <th>Long term</th>
                  {isEditMode && <th></th>}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ note, vehicleId, vehicleName, brandName }) => (
                  <TopicRowView
                    key={note.id}
                    note={note}
                    vehicleName={vehicleName}
                    brandName={brandName}
                    imagePath={note.product ? imageMap.get(segmentKey(vehicleId, note.product)) ?? null : null}
                    isEditMode={isEditMode}
                    isUploading={note.product !== null && uploadingKey === segmentKey(vehicleId, note.product)}
                    isDeleting={deletingId === note.id}
                    onChange={(payload) => handleFieldChange(note.id, payload)}
                    onUploadImage={(file) => note.product && handleUploadImage(vehicleId, note.product, file)}
                    onRemoveImage={() => note.product && handleRemoveImage(vehicleId, note.product)}
                    onComplete={() => handleComplete(note.id)}
                    onDelete={() => handleDelete(note.id)}
                  />
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={colCount} className="topics-empty">
                      No active News topics yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {isEditMode && brands.length > 0 && <AddTopicRow overview={brands} onAdded={load} />}
        {isEditMode && overview && brands.length === 0 && (
          <p className="empty-state">Add a customer on the Board page first, then you can log topics for it here.</p>
        )}
      </div>
    </div>
  );
}

function TopicRowView({
  note,
  vehicleName,
  brandName,
  imagePath,
  isEditMode,
  isUploading,
  isDeleting,
  onChange,
  onUploadImage,
  onRemoveImage,
  onComplete,
  onDelete,
}: {
  note: Note;
  vehicleName: string;
  brandName: string;
  imagePath: string | null;
  isEditMode: boolean;
  isUploading: boolean;
  isDeleting: boolean;
  onChange: (payload: Partial<Note>) => void;
  onUploadImage: (file: File) => void;
  onRemoveImage: () => void;
  onComplete: () => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(note.title);
  useEffect(() => setTitle(note.title), [note.title]);

  function commitTitle() {
    const trimmed = title.trim();
    if (trimmed && trimmed !== note.title) onChange({ title: trimmed });
    else setTitle(note.title);
  }

  return (
    <tr className={note.long_term ? "topics-row-long-term" : ""}>
      <td className="topics-cell-brand">{brandName}</td>
      <td className="topics-cell-model">{vehicleName}</td>
      <td>
        {isEditMode ? (
          <select
            value={note.product ?? ""}
            onChange={(e) => onChange({ product: (e.target.value || null) as ProductType | null })}
          >
            <option value="">—</option>
            {PRODUCTS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        ) : (
          note.product ?? "—"
        )}
      </td>
      <td>
        {note.product ? (
          <div className="topics-image-cell">
            <div
              className="topics-image-thumb"
              style={imagePath ? { backgroundImage: `url(${imagePath})` } : undefined}
            >
              {!imagePath && <ImageIcon width={14} height={14} />}
            </div>
            {isEditMode && (
              <div className="topics-image-actions">
                <label className="icon-btn" title={imagePath ? "Replace image" : "Upload image"}>
                  <UploadIcon width={12} height={12} />
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onUploadImage(f);
                      e.target.value = "";
                    }}
                  />
                </label>
                {imagePath && (
                  <button type="button" className="icon-btn" title="Remove image" onClick={onRemoveImage}>
                    <TrashIcon width={12} height={12} />
                  </button>
                )}
              </div>
            )}
            {isUploading && <span className="topics-image-uploading">…</span>}
          </div>
        ) : (
          <span className="topics-muted">Set product</span>
        )}
      </td>
      <td className="topics-cell-title">
        {isEditMode ? (
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
          />
        ) : (
          note.title
        )}
      </td>
      <td>
        {note.long_term ? (
          <span className="topics-long-term-badge">Long term</span>
        ) : isEditMode ? (
          <input type="week" value={note.cw_date ?? ""} onChange={(e) => onChange({ cw_date: e.target.value || null })} />
        ) : note.cw_date ? (
          formatCwDate(note.cw_date)
        ) : (
          "—"
        )}
      </td>
      <td className="topics-cell-checkbox">
        <input
          type="checkbox"
          checked={note.long_term}
          disabled={!isEditMode}
          onChange={(e) =>
            onChange({
              long_term: e.target.checked,
              cw_date: e.target.checked ? null : note.cw_date ?? currentIsoWeek(),
            })
          }
        />
      </td>
      {isEditMode && (
        <td className="topics-cell-actions">
          <button type="button" className="icon-btn" title="Mark complete" onClick={onComplete}>
            <CheckCircleIcon width={14} height={14} />
          </button>
          <button type="button" className="icon-btn" title="Delete" disabled={isDeleting} onClick={onDelete}>
            <TrashIcon width={14} height={14} />
          </button>
        </td>
      )}
    </tr>
  );
}

function AddTopicRow({ overview, onAdded }: { overview: BrandOverview[]; onAdded: () => void }) {
  const [brandId, setBrandId] = useState(overview[0]?.id ?? "");
  const [vehicleName, setVehicleName] = useState("");
  const [product, setProduct] = useState<ProductType | "">("");
  const [title, setTitle] = useState("");
  const [longTerm, setLongTerm] = useState(false);
  const [cwDate, setCwDate] = useState(currentIsoWeek());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const brand = overview.find((b) => b.id === brandId);

  async function handleAdd() {
    const name = vehicleName.trim();
    if (!title.trim() || !name || !brandId) return;
    setBusy(true);
    setError(null);
    try {
      const existing = brand?.vehicles.find((v) => v.name.trim().toLowerCase() === name.toLowerCase());
      const vehicleId = existing ? existing.id : (await api.createVehicle(brandId, name)).id;
      await api.createNote(vehicleId, {
        kind: "news",
        title: title.trim(),
        category: "Other",
        product: product || null,
        priority: "Normal",
        cw_date: longTerm ? null : cwDate,
        long_term: longTerm,
      });
      setVehicleName("");
      setTitle("");
      setProduct("");
      setLongTerm(false);
      setCwDate(currentIsoWeek());
      onAdded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add topic.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="topics-add-row">
      <span className="topics-add-row-label">Add a topic</span>
      <div className="topics-add-row-fields">
        <select
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
        <input
          type="text"
          list="topics-add-vehicle-suggestions"
          placeholder="Model (new or existing)"
          value={vehicleName}
          onChange={(e) => setVehicleName(e.target.value)}
        />
        <datalist id="topics-add-vehicle-suggestions">
          {brand?.vehicles.map((v) => (
            <option key={v.id} value={v.name} />
          ))}
        </datalist>
        <select value={product} onChange={(e) => setProduct(e.target.value as ProductType | "")}>
          <option value="">Product —</option>
          {PRODUCTS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <input type="text" placeholder="News topic" value={title} onChange={(e) => setTitle(e.target.value)} />
        {longTerm ? (
          <span className="topics-long-term-badge">Long term</span>
        ) : (
          <input type="week" value={cwDate} onChange={(e) => setCwDate(e.target.value)} />
        )}
        <label className="topics-add-row-checkbox">
          <input type="checkbox" checked={longTerm} onChange={(e) => setLongTerm(e.target.checked)} />
          Long term
        </label>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy || !title.trim() || !vehicleName.trim()}
          onClick={handleAdd}
        >
          <PlusIcon width={12} height={12} /> {busy ? "Adding…" : "Add"}
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
