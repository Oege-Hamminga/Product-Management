import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../api/client";
import type { BrandOverview, Note } from "../api/types";
import { useAuth } from "../context/AuthContext";
import TopicDetailModal from "../components/notes/TopicDetailModal";
import NoteFormModal from "../components/notes/NoteFormModal";
import ConfirmDialog from "../components/common/ConfirmDialog";
import { CategoryBadge } from "../components/common/Badges";
import { AlertTriangleIcon } from "../components/common/Icons";
import { currentIsoWeek, formatCwDate, formatCwRange, isPastNewsWeek, isPastWeek, weeksInRange } from "../utils/date";
import "./InsightsPage.css";

interface WeeklyEntry extends Note {
  vehicleName: string;
  brandId: string;
  brandName: string;
}

function collectNews(overview: BrandOverview[]): WeeklyEntry[] {
  const out: WeeklyEntry[] = [];
  overview.forEach((b) => {
    b.vehicles.forEach((v) => {
      v.notes.forEach((n) => {
        if (n.kind === "news") out.push({ ...n, vehicleName: v.name, brandId: b.id, brandName: b.name });
      });
    });
  });
  return out;
}

export default function InsightsPage() {
  const { isEditMode } = useAuth();
  const [overview, setOverview] = useState<BrandOverview[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedTopic, setSelectedTopic] = useState<WeeklyEntry | null>(null);
  const [editingTopic, setEditingTopic] = useState<Note | null>(null);
  const [deletingTopic, setDeletingTopic] = useState<{ id: string; title: string } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.getOverview();
      setOverview(data);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Could not load the weekly insights.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const newsEntries = useMemo(() => (overview ? collectNews(overview) : []), [overview]);

  // A period entry (cw_date_end set) counts toward every week it spans, not
  // just its first and last, so the grid shows it on each row it covers.
  const weeks = useMemo(() => {
    const set = new Set<string>([currentIsoWeek()]);
    newsEntries.forEach((n) => {
      if (!n.cw_date) return;
      weeksInRange(n.cw_date, n.cw_date_end ?? n.cw_date).forEach((w) => set.add(w));
    });
    return Array.from(set).sort().reverse();
  }, [newsEntries]);

  const staleCount = useMemo(
    () => newsEntries.filter((n) => !n.completed && n.cw_date && isPastNewsWeek(n.cw_date, n.cw_date_end)).length,
    [newsEntries]
  );

  async function handleComplete(id: string) {
    await api.updateNote(id, { completed: true });
    setSelectedTopic(null);
    load();
  }

  async function handleStillValid(id: string) {
    await api.updateNote(id, { cw_date: currentIsoWeek() });
    setSelectedTopic(null);
    load();
  }

  async function handleDelete() {
    if (!deletingTopic) return;
    setDeleteBusy(true);
    try {
      await api.deleteNote(deletingTopic.id);
      setDeletingTopic(null);
      load();
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="insights-page">
      <div className="insights-hero">
        <div className="insights-header container">
          <div>
            <h1 className="insights-title">Weekly Insights</h1>
            <p className="insights-subtitle">
              News topics grouped by calendar week, per customer
              {staleCount > 0 ? ` · ${staleCount} need review` : ""}
            </p>
          </div>
        </div>
      </div>

      <div className="container insights-body">
        {loadError && <p className="error-text">{loadError}</p>}
        {!overview && !loadError && <p className="insights-loading">Loading weekly insights…</p>}

        {overview && overview.length > 0 && (
          <div className="insights-weeks">
            {weeks.map((week) => {
              const isCurrent = week === currentIsoWeek();
              const isPast = isPastWeek(week);
              const brandsThisWeek = overview
                .map((b) => ({
                  brand: b,
                  entries: newsEntries.filter(
                    (n) => n.brandId === b.id && n.cw_date && n.cw_date <= week && week <= (n.cw_date_end ?? n.cw_date)
                  ),
                }))
                .filter((g) => g.entries.length > 0);

              return (
                <section key={week} className={`insights-week-block${isCurrent ? " is-current-week" : ""}`}>
                  <div className="insights-week-heading">
                    <span className="insights-week-label">{formatCwDate(week)}</span>
                    <span className="insights-week-tag">{isCurrent ? "This week" : isPast ? "Past" : "Upcoming"}</span>
                  </div>

                  {brandsThisWeek.length === 0 ? (
                    <p className="insights-empty-cell">No news logged.</p>
                  ) : (
                    <div className="insights-brand-grid">
                      {brandsThisWeek.map(({ brand, entries }) => (
                        <div className="insights-brand-block" key={brand.id}>
                          <h4 className="insights-brand-name">{brand.name}</h4>
                          <div className="insights-chip-list">
                            {entries.map((n) => {
                              const stale = !n.completed && n.cw_date && isPastNewsWeek(n.cw_date, n.cw_date_end);
                              return (
                                <button
                                  key={n.id}
                                  type="button"
                                  className={`insights-chip${n.completed ? " completed" : ""}${stale ? " stale" : ""}`}
                                  onClick={() => setSelectedTopic(n)}
                                  title={n.cw_date ? formatCwRange(n.cw_date, n.cw_date_end) : undefined}
                                >
                                  {stale && <AlertTriangleIcon width={11} height={11} />}
                                  <span className="insights-chip-title">{n.title}</span>
                                  <CategoryBadge category={n.category} />
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}

        {overview && overview.length === 0 && (
          <div className="empty-state">No customers yet — add one on the Brand Map.</div>
        )}
      </div>

      {selectedTopic && (
        <TopicDetailModal
          note={selectedTopic}
          vehicleName={selectedTopic.vehicleName}
          brandName={selectedTopic.brandName}
          isEditMode={isEditMode}
          onClose={() => setSelectedTopic(null)}
          onEdit={() => {
            setEditingTopic(selectedTopic);
            setSelectedTopic(null);
          }}
          onComplete={() => handleComplete(selectedTopic.id)}
          onDelete={() => {
            setDeletingTopic({ id: selectedTopic.id, title: selectedTopic.title });
            setSelectedTopic(null);
          }}
          onStillValid={() => handleStillValid(selectedTopic.id)}
        />
      )}

      {editingTopic && (
        <NoteFormModal
          vehicleId={editingTopic.vehicle_id}
          category={editingTopic.category}
          note={editingTopic}
          onClose={() => setEditingTopic(null)}
          onSaved={load}
        />
      )}

      {deletingTopic && (
        <ConfirmDialog
          title={`Delete "${deletingTopic.title}"?`}
          message="This topic will be permanently removed."
          busy={deleteBusy}
          onConfirm={handleDelete}
          onCancel={() => setDeletingTopic(null)}
        />
      )}
    </div>
  );
}
