import { useState } from "react";
import type { Topic } from "../../api/types";
import ConfirmDialog from "../common/ConfirmDialog";
import "./TopicsList.css";

interface TopicsListProps {
  topics: Topic[];
  isEditMode: boolean;
  onCreate: (title: string, description: string) => Promise<void>;
  onUpdate: (id: string, title: string, description: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export default function TopicsList({ topics, isEditMode, onCreate, onUpdate, onDelete }: TopicsListProps) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  function startEdit(topic: Topic) {
    setEditingId(topic.id);
    setTitle(topic.title);
    setDescription(topic.description);
    setAdding(false);
  }

  function startAdd() {
    setAdding(true);
    setEditingId(null);
    setTitle("");
    setDescription("");
  }

  function cancelForm() {
    setAdding(false);
    setEditingId(null);
  }

  async function submitForm() {
    if (!title.trim()) return;
    setBusy(true);
    try {
      if (editingId) await onUpdate(editingId, title.trim(), description);
      else await onCreate(title.trim(), description);
      cancelForm();
    } finally {
      setBusy(false);
    }
  }

  const showForm = adding || editingId;

  return (
    <div className="topics-list">
      {topics.length === 0 && !showForm && (
        <div className="empty-state">No additional topics for this vehicle yet.</div>
      )}

      {topics.map((topic) =>
        editingId === topic.id ? (
          <div key={topic.id} className="card topic-form">
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
            />
            <div className="modal-actions" style={{ marginTop: 0 }}>
              <button className="btn btn-secondary btn-sm" onClick={cancelForm}>
                Cancel
              </button>
              <button className="btn btn-primary btn-sm" disabled={busy || !title.trim()} onClick={submitForm}>
                Save
              </button>
            </div>
          </div>
        ) : (
          <div key={topic.id} className="card topic-item">
            <div className="topic-item-body">
              <div className="topic-item-title">{topic.title}</div>
              {topic.description && <div className="topic-item-desc">{topic.description}</div>}
            </div>
            {isEditMode && (
              <div className="topic-item-actions">
                <button className="icon-btn" title="Edit topic" onClick={() => startEdit(topic)}>
                  ✎
                </button>
                <button className="icon-btn" title="Delete topic" onClick={() => setDeletingId(topic.id)}>
                  ×
                </button>
              </div>
            )}
          </div>
        )
      )}

      {adding && (
        <div className="card topic-form">
          <input
            type="text"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
          />
          <div className="modal-actions" style={{ marginTop: 0 }}>
            <button className="btn btn-secondary btn-sm" onClick={cancelForm}>
              Cancel
            </button>
            <button className="btn btn-primary btn-sm" disabled={busy || !title.trim()} onClick={submitForm}>
              Add topic
            </button>
          </div>
        </div>
      )}

      {isEditMode && !showForm && (
        <button className="btn btn-secondary btn-sm" style={{ alignSelf: "flex-start" }} onClick={startAdd}>
          + Add topic
        </button>
      )}

      {deletingId && (
        <ConfirmDialog
          title="Delete topic?"
          message="This cannot be undone."
          onCancel={() => setDeletingId(null)}
          onConfirm={async () => {
            await onDelete(deletingId);
            setDeletingId(null);
          }}
        />
      )}
    </div>
  );
}
