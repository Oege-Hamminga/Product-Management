import { useCallback, useEffect, useState, type DragEvent } from "react";
import { api, ApiError } from "../../api/client";
import type { Note, NoteHighlight } from "../../api/types";
import { useAuth } from "../../context/AuthContext";
import { ArrowUpIcon, ChevronRightIcon, MinusCircleIcon, SparkIcon } from "../common/Icons";
import { CategoryBadge, MetaBadge } from "../common/Badges";
import ConfirmDialog from "../common/ConfirmDialog";
import TopicDetailModal from "./TopicDetailModal";
import NoteFormModal from "./NoteFormModal";
import { formatCwRange, currentIsoWeek } from "../../utils/date";
import "./TopicsSidebar.css";

const COLLAPSED_KEY = "oem_portfolio_sidebar_collapsed";
const HIGH_PRIORITY_CAP = 5;

const CATEGORY_COLOR: Record<NoteHighlight["category"], string> = {
  Margin: "var(--cat-margin)",
  Quality: "var(--cat-quality)",
  Portfolio: "var(--cat-portfolio)",
  Other: "var(--cat-other)",
};

interface TopicsSidebarProps {
  refreshKey: number;
  onChanged: () => void;
}

function TopicRow({
  note,
  isEditMode,
  onSelect,
  onRequestDelete,
}: {
  note: NoteHighlight;
  isEditMode: boolean;
  onSelect: () => void;
  onRequestDelete: () => void;
}) {
  return (
    <div className="sidebar-topic-row">
      {isEditMode && (
        <button className="sidebar-topic-remove" title="Delete topic" onClick={onRequestDelete}>
          <MinusCircleIcon width={15} height={15} />
        </button>
      )}
      <button
        className="sidebar-topic-bar"
        style={{ background: CATEGORY_COLOR[note.category] }}
        onClick={onSelect}
      >
        <span className="sidebar-topic-vehicle">
          {note.brand_name} · {note.vehicle_name}
          {note.product ? ` · ${note.product}` : ""}
        </span>
        <span className="sidebar-topic-title">
          {note.priority === "High" && (
            <span className="sidebar-topic-priority" title="High priority">
              <ArrowUpIcon width={11} height={11} />
            </span>
          )}
          {note.title}
        </span>
        <span className="sidebar-topic-meta">
          {note.category}
          {note.kind === "bt" && note.bt_code ? ` · ${note.bt_code}` : ""}
          {note.kind === "news" && note.cw_date ? ` · ${formatCwRange(note.cw_date, note.cw_date_end)}` : ""}
        </span>
      </button>
    </div>
  );
}

type DropTarget = "high" | "news" | null;

export default function TopicsSidebar({ refreshKey, onChanged }: TopicsSidebarProps) {
  const { isEditMode } = useAuth();
  const [highPriority, setHighPriority] = useState<NoteHighlight[] | null>(null);
  const [weeklyNews, setWeeklyNews] = useState<NoteHighlight[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<NoteHighlight | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [dragOver, setDragOver] = useState<DropTarget>(null);
  // Collapsed by default — expands (and remembers that choice) once the user
  // opens it, rather than always taking up space up front.
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSED_KEY) !== "0");
  const [selectedTopic, setSelectedTopic] = useState<NoteHighlight | null>(null);
  const [editingTopic, setEditingTopic] = useState<Note | null>(null);
  const [pendingEviction, setPendingEviction] = useState<{ newNoteId: string; candidates: NoteHighlight[] } | null>(
    null
  );
  const [evictionBusy, setEvictionBusy] = useState(false);

  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  const load = useCallback(() => {
    api
      .getSidebarTopics(7, HIGH_PRIORITY_CAP, 8)
      .then((data) => {
        setHighPriority(data.highPriority);
        setWeeklyNews(data.weeklyNews);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load topics."));
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  async function handleDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api.deleteNote(deleting.id);
      setDeleting(null);
      load();
      onChanged();
    } finally {
      setDeleteBusy(false);
    }
  }

  async function handleComplete(id: string) {
    await api.updateNote(id, { completed: true });
    setSelectedTopic(null);
    load();
    onChanged();
  }

  async function handleStillValid(id: string) {
    await api.updateNote(id, { cw_date: currentIsoWeek() });
    setSelectedTopic(null);
    load();
    onChanged();
  }

  async function handleDrop(target: DropTarget, e: DragEvent) {
    e.preventDefault();
    setDragOver(null);
    if (!isEditMode || !target) return;
    const noteId = e.dataTransfer.getData("text/plain");
    if (!noteId) return;

    if (target === "high") {
      await api.updateNote(noteId, { priority: "High" });
      // Keep the High Priority list capped at 5: if this drop pushes it over,
      // ask which existing topic should make way rather than picking for them.
      const check = await api.getSidebarTopics(7, HIGH_PRIORITY_CAP + 1, 1);
      if (check.highPriority.length > HIGH_PRIORITY_CAP) {
        setPendingEviction({ newNoteId: noteId, candidates: check.highPriority });
        onChanged();
        load();
        return;
      }
    } else {
      await api.updateNote(noteId, { kind: "news", cw_date: currentIsoWeek() });
    }
    load();
    onChanged();
  }

  async function resolveEviction(demoteId: string) {
    setEvictionBusy(true);
    try {
      await api.updateNote(demoteId, { priority: "Normal" });
      setPendingEviction(null);
      load();
      onChanged();
    } finally {
      setEvictionBusy(false);
    }
  }

  async function cancelEviction() {
    if (!pendingEviction) return;
    setEvictionBusy(true);
    try {
      // No pick means the drag itself doesn't happen — back to Normal it goes.
      await api.updateNote(pendingEviction.newNoteId, { priority: "Normal" });
      setPendingEviction(null);
      load();
      onChanged();
    } finally {
      setEvictionBusy(false);
    }
  }

  if (error) return null;

  return (
    <aside className={`topics-sidebar${collapsed ? " collapsed" : ""}`}>
      <button
        className="topics-sidebar-toggle"
        title={collapsed ? "Show topics panel" : "Hide topics panel"}
        onClick={() => setCollapsed((c) => !c)}
      >
        <ChevronRightIcon width={14} height={14} style={{ transform: collapsed ? "none" : "rotate(180deg)" }} />
      </button>

      {collapsed && (
        <div className="topics-sidebar-collapsed-hint">
          <SparkIcon width={13} height={13} />
        </div>
      )}

      {!collapsed && (
        <>
          <div className="topics-sidebar-section">
            <h2 className="topics-sidebar-heading">High Priority Topics</h2>
            <div
              className={`topics-sidebar-list${isEditMode && dragOver === "high" ? " drag-over" : ""}`}
              onDragOver={(e) => {
                if (!isEditMode) return;
                e.preventDefault();
                setDragOver("high");
              }}
              onDragLeave={() => setDragOver((prev) => (prev === "high" ? null : prev))}
              onDrop={(e) => handleDrop("high", e)}
            >
              {!highPriority &&
                [0, 1, 2].map((i) => <div key={i} className="sidebar-topic-row sidebar-topic-skeleton" />)}
              {highPriority?.length === 0 && <p className="topics-sidebar-empty">Nothing high priority right now.</p>}
              {highPriority?.map((n) => (
                <TopicRow
                  key={n.id}
                  note={n}
                  isEditMode={isEditMode}
                  onSelect={() => setSelectedTopic(n)}
                  onRequestDelete={() => setDeleting(n)}
                />
              ))}
            </div>
          </div>

          <div className="topics-sidebar-section">
            <h2 className="topics-sidebar-heading">
              <SparkIcon width={13} height={13} /> This Week's News
            </h2>
            <div
              className={`topics-sidebar-list${isEditMode && dragOver === "news" ? " drag-over" : ""}`}
              onDragOver={(e) => {
                if (!isEditMode) return;
                e.preventDefault();
                setDragOver("news");
              }}
              onDragLeave={() => setDragOver((prev) => (prev === "news" ? null : prev))}
              onDrop={(e) => handleDrop("news", e)}
            >
              {!weeklyNews &&
                [0, 1].map((i) => <div key={i} className="sidebar-topic-row sidebar-topic-skeleton" />)}
              {weeklyNews?.length === 0 && <p className="topics-sidebar-empty">No news logged this week.</p>}
              {weeklyNews?.map((n) => (
                <TopicRow
                  key={n.id}
                  note={n}
                  isEditMode={isEditMode}
                  onSelect={() => setSelectedTopic(n)}
                  onRequestDelete={() => setDeleting(n)}
                />
              ))}
            </div>
          </div>

          {isEditMode && (
            <p className="topics-sidebar-hint">Drag a topic here from the brand map to feature it.</p>
          )}
        </>
      )}

      {deleting && (
        <ConfirmDialog
          title={`Delete "${deleting.title}"?`}
          message="This topic will be permanently removed."
          busy={deleteBusy}
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
        />
      )}

      {selectedTopic && (
        <TopicDetailModal
          note={selectedTopic}
          vehicleName={selectedTopic.vehicle_name}
          brandName={selectedTopic.brand_name}
          isEditMode={isEditMode}
          onClose={() => setSelectedTopic(null)}
          onEdit={() => {
            setEditingTopic(selectedTopic);
            setSelectedTopic(null);
          }}
          onComplete={() => handleComplete(selectedTopic.id)}
          onDelete={() => {
            setDeleting(selectedTopic);
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
          onSaved={() => {
            load();
            onChanged();
          }}
        />
      )}

      {pendingEviction && (
        <div className="modal-backdrop" onClick={cancelEviction}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>High Priority is full</h2>
            <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>
              Pick a topic to move back to Normal priority to make room for the new one.
            </p>
            <div className="eviction-list">
              {pendingEviction.candidates.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className="eviction-candidate"
                  disabled={evictionBusy}
                  onClick={() => resolveEviction(n.id)}
                >
                  <div className="eviction-candidate-top">
                    <span className="eviction-candidate-vehicle">
                      {n.brand_name} · {n.vehicle_name}
                      {n.product ? ` · ${n.product}` : ""}
                    </span>
                    {n.id === pendingEviction.newNoteId && (
                      <span className="eviction-candidate-flag">Just added</span>
                    )}
                  </div>
                  <span className="eviction-candidate-title">{n.title}</span>
                  <div className="eviction-candidate-meta">
                    <CategoryBadge category={n.category} />
                    {n.kind === "bt" && n.bt_code && <MetaBadge label={n.bt_code} />}
                    {n.kind === "news" && n.cw_date && <MetaBadge label={formatCwRange(n.cw_date, n.cw_date_end)} />}
                  </div>
                </button>
              ))}
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={cancelEviction} disabled={evictionBusy}>
                Cancel (don't add it)
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
