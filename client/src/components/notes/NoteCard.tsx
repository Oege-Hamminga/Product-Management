import type { Note } from "../../api/types";
import { KindBadge, MetaBadge, PriorityBadge } from "../common/Badges";
import { ArrowUpIcon, CheckCircleIcon, CloseIcon, PencilIcon } from "../common/Icons";
import { formatCwRange } from "../../utils/date";
import "./notes.css";

const CATEGORY_COLOR: Record<Note["category"], string> = {
  Margin: "var(--cat-margin)",
  Quality: "var(--cat-quality)",
  Portfolio: "var(--cat-portfolio)",
  Other: "var(--cat-other)",
};

interface NoteCardProps {
  note: Note;
  isEditMode: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggleComplete: () => void;
}

export default function NoteCard({ note, isEditMode, onEdit, onDelete, onToggleComplete }: NoteCardProps) {
  const color = CATEGORY_COLOR[note.category];

  return (
    <div
      className={`note-card${note.completed ? " completed" : ""}`}
      style={{ borderLeftColor: color, background: `color-mix(in srgb, ${color} 6%, var(--surface-1))` }}
    >
      <div className="note-card-top">
        <span className="note-card-title">
          {note.priority === "High" && (
            <span title="High priority" style={{ color: "var(--status-critical)", display: "inline-flex", verticalAlign: -2, marginRight: 3 }}>
              <ArrowUpIcon width={12} height={12} />
            </span>
          )}
          {note.title}
        </span>
        {isEditMode && (
          <div className="note-card-actions">
            <button
              className="icon-btn"
              title={note.completed ? "Reopen" : "Mark complete"}
              onClick={onToggleComplete}
              style={note.completed ? undefined : { color: "var(--status-good)" }}
            >
              <CheckCircleIcon width={12} height={12} />
            </button>
            <button className="icon-btn" title="Edit note" onClick={onEdit}>
              <PencilIcon width={12} height={12} />
            </button>
            <button className="icon-btn" title="Delete note" onClick={onDelete}>
              <CloseIcon width={12} height={12} />
            </button>
          </div>
        )}
      </div>
      {note.description && <p className="note-card-desc">{note.description}</p>}
      <div className="note-card-bottom">
        {note.completed && <MetaBadge label="Completed" />}
        <KindBadge kind={note.kind} />
        <PriorityBadge priority={note.priority} />
        {note.product && <MetaBadge label={note.product} />}
        {note.kind === "bt" && note.bt_code && <MetaBadge label={note.bt_code} />}
        {note.kind === "bt" && note.phase && <MetaBadge label={`Phase ${note.phase}`} />}
        {note.kind === "news" && note.cw_date && <MetaBadge label={formatCwRange(note.cw_date, note.cw_date_end)} />}
      </div>
    </div>
  );
}
