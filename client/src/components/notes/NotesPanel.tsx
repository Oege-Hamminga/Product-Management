import { useState } from "react";
import { api } from "../../api/client";
import type { Note, NoteCategory } from "../../api/types";
import NoteCard from "./NoteCard";
import NoteFormModal from "./NoteFormModal";
import ConfirmDialog from "../common/ConfirmDialog";
import { PlusIcon } from "../common/Icons";
import "./notes.css";

const SECTIONS: { category: NoteCategory; blurb: string }[] = [
  { category: "Margin", blurb: "Cost & pricing impact" },
  { category: "Quality", blurb: "Fit, finish & reliability" },
  { category: "Portfolio", blurb: "Range & fitment strategy" },
  { category: "Other", blurb: "Everything else" },
];

interface NotesPanelProps {
  vehicleId: string;
  notes: Note[];
  isEditMode: boolean;
  onChanged: () => void;
}

export default function NotesPanel({ vehicleId, notes, isEditMode, onChanged }: NotesPanelProps) {
  const [formState, setFormState] = useState<{ category: NoteCategory; note?: Note } | null>(null);
  const [deleting, setDeleting] = useState<Note | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  async function handleDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api.deleteNote(deleting.id);
      setDeleting(null);
      onChanged();
    } finally {
      setDeleteBusy(false);
    }
  }

  async function handleToggleComplete(note: Note) {
    await api.updateNote(note.id, { completed: !note.completed });
    onChanged();
  }

  return (
    <div className="notes-panel">
      {SECTIONS.map(({ category, blurb }) => {
        const sectionNotes = [...notes]
          .filter((n) => n.category === category)
          .sort((a, b) => Number(a.completed) - Number(b.completed));
        const openCount = sectionNotes.filter((n) => !n.completed).length;
        return (
          <div key={category} className="notes-section">
            <div className="notes-section-head" style={{ borderTopColor: `var(--cat-${category.toLowerCase()})` }}>
              <div>
                <h3>
                  {category}
                  <span className="notes-section-count">{openCount}</span>
                </h3>
                <span className="notes-section-blurb">{blurb}</span>
              </div>
              {isEditMode && (
                <button className="icon-btn" title={`Add ${category} note`} onClick={() => setFormState({ category })}>
                  <PlusIcon width={13} height={13} />
                </button>
              )}
            </div>
            <div className="notes-section-body">
              {sectionNotes.map((note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  isEditMode={isEditMode}
                  onEdit={() => setFormState({ category: note.category, note })}
                  onDelete={() => setDeleting(note)}
                  onToggleComplete={() => handleToggleComplete(note)}
                />
              ))}
              {sectionNotes.length === 0 && <div className="notes-empty">No notes</div>}
            </div>
          </div>
        );
      })}

      {formState && (
        <NoteFormModal
          vehicleId={vehicleId}
          category={formState.category}
          note={formState.note}
          onClose={() => setFormState(null)}
          onSaved={onChanged}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title={`Delete "${deleting.title}"?`}
          message="This note will be permanently removed."
          busy={deleteBusy}
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
