import { useCallback, useEffect, useState, type DragEvent } from "react";
import { api, ApiError } from "../../api/client";
import type { NoteHighlight } from "../../api/types";
import { useAuth } from "../../context/AuthContext";
import { MinusCircleIcon, SparkIcon } from "../common/Icons";
import ConfirmDialog from "../common/ConfirmDialog";
import { formatCwDate, currentIsoWeek } from "../../utils/date";
import "./TopicsSidebar.css";

const CATEGORY_COLOR: Record<NoteHighlight["category"], string> = {
  Margin: "var(--cat-margin)",
  Quality: "var(--cat-quality)",
  Portfolio: "var(--cat-portfolio)",
  Other: "var(--cat-other)",
};

interface TopicsSidebarProps {
  onSelectVehicle: (vehicleId: string) => void;
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
        </span>
        <span className="sidebar-topic-title">{note.title}</span>
        {note.kind === "bt" && note.bt_code && <span className="sidebar-topic-meta">{note.bt_code}</span>}
        {note.kind === "news" && note.cw_date && <span className="sidebar-topic-meta">{formatCwDate(note.cw_date)}</span>}
      </button>
    </div>
  );
}

type DropTarget = "high" | "news" | null;

export default function TopicsSidebar({ onSelectVehicle, refreshKey, onChanged }: TopicsSidebarProps) {
  const { isEditMode } = useAuth();
  const [highPriority, setHighPriority] = useState<NoteHighlight[] | null>(null);
  const [weeklyNews, setWeeklyNews] = useState<NoteHighlight[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<NoteHighlight | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [dragOver, setDragOver] = useState<DropTarget>(null);

  const load = useCallback(() => {
    api
      .getSidebarTopics(7, 8, 8)
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

  async function handleDrop(target: DropTarget, e: DragEvent) {
    e.preventDefault();
    setDragOver(null);
    if (!isEditMode || !target) return;
    const noteId = e.dataTransfer.getData("text/plain");
    if (!noteId) return;
    const payload = target === "high" ? { priority: "High" as const } : { kind: "news" as const, cw_date: currentIsoWeek() };
    await api.updateNote(noteId, payload);
    load();
    onChanged();
  }

  if (error) return null;

  return (
    <aside className="topics-sidebar">
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
              onSelect={() => onSelectVehicle(n.vehicle_id)}
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
              onSelect={() => onSelectVehicle(n.vehicle_id)}
              onRequestDelete={() => setDeleting(n)}
            />
          ))}
        </div>
      </div>

      {isEditMode && (
        <p className="topics-sidebar-hint">Drag a topic here from the brand map to feature it.</p>
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
    </aside>
  );
}
