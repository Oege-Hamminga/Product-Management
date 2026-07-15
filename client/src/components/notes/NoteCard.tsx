import type { Note } from "../../api/types";
import { KindBadge, PhaseBadge, PriorityBadge } from "../common/Badges";
import { CloseIcon, PencilIcon } from "../common/Icons";
import "./notes.css";

const CATEGORY_COLOR: Record<Note["category"], string> = {
  Margin: "var(--cat-margin)",
  Quality: "var(--cat-quality)",
  Portfolio: "var(--cat-portfolio)",
};

interface NoteCardProps {
  note: Note;
  isEditMode: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

export default function NoteCard({ note, isEditMode, onEdit, onDelete }: NoteCardProps) {
  const color = CATEGORY_COLOR[note.category];

  return (
    <div className="note-card" style={{ borderLeftColor: color, background: `color-mix(in srgb, ${color} 6%, var(--surface-1))` }}>
      <div className="note-card-top">
        <span className="note-card-title">{note.title}</span>
        {isEditMode && (
          <div className="note-card-actions">
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
        <KindBadge kind={note.kind} />
        {note.kind === "bugtracker" && note.phase && <PhaseBadge phase={note.phase} />}
        {note.kind === "bugtracker" && note.priority && <PriorityBadge priority={note.priority} />}
      </div>
    </div>
  );
}
