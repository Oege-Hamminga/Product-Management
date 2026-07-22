import type { Note } from "../../api/types";
import { CategoryBadge, KindBadge, MetaBadge, PriorityBadge } from "../common/Badges";
import { AlertTriangleIcon, ArrowUpIcon, CheckCircleIcon, PencilIcon, TrashIcon } from "../common/Icons";
import { formatCwRange, isPastNewsWeek } from "../../utils/date";

interface TopicDetailModalProps {
  note: Note;
  vehicleName: string;
  brandName: string;
  isEditMode: boolean;
  onClose: () => void;
  onEdit: () => void;
  onComplete: () => void;
  onDelete: () => void;
  onStillValid: () => void;
}

// Only ever opened by clicking a topic on the brand map, which shows open
// (not-yet-completed) topics exclusively — so there's no "reopen" case to render.
export default function TopicDetailModal({
  note,
  vehicleName,
  brandName,
  isEditMode,
  onClose,
  onEdit,
  onComplete,
  onDelete,
  onStillValid,
}: TopicDetailModalProps) {
  const stale = note.kind === "news" && !!note.cw_date && isPastNewsWeek(note.cw_date, note.cw_date_end);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
          {brandName} · {vehicleName}
          {note.product ? ` · ${note.product}` : ""}
        </p>
        <h2>
          {note.priority === "High" && (
            <span style={{ color: "var(--status-critical)", display: "inline-flex", verticalAlign: -2, marginRight: 4 }} title="High priority">
              <ArrowUpIcon width={15} height={15} />
            </span>
          )}
          {note.title}
        </h2>
        {note.description && (
          <p style={{ color: "var(--text-secondary)", fontSize: 14, marginTop: 10 }}>{note.description}</p>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 14 }}>
          <KindBadge kind={note.kind} />
          <PriorityBadge priority={note.priority} />
          <CategoryBadge category={note.category} />
          {note.kind === "bt" && note.bt_code && <MetaBadge label={note.bt_code} />}
          {note.kind === "bt" && note.phase && <MetaBadge label={`Phase ${note.phase}`} />}
          {note.kind === "news" && note.cw_date && <MetaBadge label={formatCwRange(note.cw_date, note.cw_date_end)} />}
        </div>

        {stale && isEditMode && (
          <div className="topic-stale-banner">
            <AlertTriangleIcon width={15} height={15} />
            <span>
              This news item's {note.cw_date_end ? "period" : "week"} (
              {note.cw_date && formatCwRange(note.cw_date, note.cw_date_end)}) has passed. Is it still valid?
            </span>
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
          {isEditMode && (
            <>
              <button type="button" className="btn btn-secondary" onClick={onDelete}>
                <TrashIcon width={14} height={14} /> Delete
              </button>
              {stale && (
                <button type="button" className="btn btn-secondary" onClick={onStillValid}>
                  <CheckCircleIcon width={14} height={14} /> Still valid
                </button>
              )}
              <button type="button" className="btn btn-secondary" onClick={onComplete}>
                <CheckCircleIcon width={14} height={14} /> Mark complete
              </button>
              <button type="button" className="btn btn-primary" onClick={onEdit}>
                <PencilIcon width={14} height={14} /> Edit
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
