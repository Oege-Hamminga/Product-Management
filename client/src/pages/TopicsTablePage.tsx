import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../api/client";
import type { BrandOverview, Note, ProductType } from "../api/types";
import { useAuth } from "../context/AuthContext";
import { CheckCircleIcon, PlusIcon, TrashIcon } from "../components/common/Icons";
import { currentIsoWeek, formatCwDate } from "../utils/date";
import "./TopicsTablePage.css";

const PRODUCTS: ProductType[] = ["CC", "FC", "PW"];

interface TopicRow {
  note: Note;
  vehicleId: string;
  vehicleName: string;
  brandName: string;
}

export default function TopicsTablePage() {
  const { isEditMode } = useAuth();
  const [overview, setOverview] = useState<BrandOverview[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const ov = await api.getOverview();
      setOverview(ov);
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
  const colCount = isEditMode ? 7 : 6;

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
                  <th>News topic</th>
                  <th>Calendar week</th>
                  <th>Long term</th>
                  {isEditMode && <th></th>}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ note, vehicleName, brandName }) => (
                  <TopicRowView
                    key={note.id}
                    note={note}
                    vehicleName={vehicleName}
                    brandName={brandName}
                    isEditMode={isEditMode}
                    isDeleting={deletingId === note.id}
                    onChange={(payload) => handleFieldChange(note.id, payload)}
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

        {brands.length > 0 && <AddTopicRow overview={brands} onAdded={load} />}
        {overview && brands.length === 0 && (
          <p className="empty-state">No models yet — add a brand and model on the Settings tab first, then you can log topics for them here.</p>
        )}
      </div>
    </div>
  );
}

function TopicRowView({
  note,
  vehicleName,
  brandName,
  isEditMode,
  isDeleting,
  onChange,
  onComplete,
  onDelete,
}: {
  note: Note;
  vehicleName: string;
  brandName: string;
  isEditMode: boolean;
  isDeleting: boolean;
  onChange: (payload: Partial<Note>) => void;
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

// Models and their products are managed on the Settings tab now — this row
// only picks from what already exists, it never creates a brand, model or
// product on the fly.
function AddTopicRow({ overview, onAdded }: { overview: BrandOverview[]; onAdded: () => void }) {
  const brandsWithVehicles = overview.filter((b) => b.vehicles.length > 0);
  const [brandId, setBrandId] = useState(brandsWithVehicles[0]?.id ?? "");
  const brand = brandsWithVehicles.find((b) => b.id === brandId);
  const [vehicleId, setVehicleId] = useState(brand?.vehicles[0]?.id ?? "");
  const vehicle = brand?.vehicles.find((v) => v.id === vehicleId);
  // The reserved "Overall News" pseudo-model isn't a real vehicle, so it
  // never has CC/FC/PW products to pick from.
  const isOverallNews = brand?.name === "Overall News" && vehicle?.name === "Overall News";
  const [product, setProduct] = useState<ProductType | "">("");
  const [title, setTitle] = useState("");
  const [longTerm, setLongTerm] = useState(false);
  const [cwDate, setCwDate] = useState(currentIsoWeek());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setVehicleId(brand?.vehicles[0]?.id ?? "");
  }, [brandId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setProduct("");
  }, [vehicleId]);

  async function handleAdd() {
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

  if (brandsWithVehicles.length === 0) {
    return (
      <p className="empty-state">No models yet — add a brand and model on the Settings tab first, then you can log topics for them here.</p>
    );
  }

  return (
    <div className="topics-add-row">
      <span className="topics-add-row-label">Add a topic</span>
      <div className="topics-add-row-fields">
        <select value={brandId} onChange={(e) => setBrandId(e.target.value)}>
          {brandsWithVehicles.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
          {(brand?.vehicles ?? []).map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        {!isOverallNews && (
          <select value={product} onChange={(e) => setProduct(e.target.value as ProductType | "")}>
            <option value="">Product —</option>
            {(vehicle?.products ?? []).map((p) => (
              <option key={p.product_type} value={p.product_type}>
                {p.product_type}
              </option>
            ))}
          </select>
        )}
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
          disabled={busy || !title.trim() || !vehicleId}
          onClick={handleAdd}
        >
          <PlusIcon width={12} height={12} /> {busy ? "Adding…" : "Add"}
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
