import { useState, type FormEvent } from "react";
import { api, ApiError } from "../../api/client";
import type { Ticket, TicketCategory, TicketPriority } from "../../api/types";

interface TicketFormModalProps {
  vehicleId: string;
  category: TicketCategory;
  ticket?: Ticket;
  onClose: () => void;
  onSaved: () => void;
}

const PRIORITIES: TicketPriority[] = ["Low", "Medium", "High", "Critical"];

export default function TicketFormModal({ vehicleId, category, ticket, onClose, onSaved }: TicketFormModalProps) {
  const isEdit = Boolean(ticket);
  const [btCode, setBtCode] = useState(ticket?.bt_code ?? "");
  const [description, setDescription] = useState(ticket?.bt_description ?? "");
  const [phase, setPhase] = useState<number>(ticket?.phase ?? 1);
  const [priority, setPriority] = useState<TicketPriority>(ticket?.priority ?? "Medium");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!btCode.trim()) return;
    setBusy(true);
    setError(null);
    try {
      if (ticket) {
        await api.updateTicket(ticket.id, {
          bt_code: btCode.trim(),
          bt_description: description,
          phase: phase as Ticket["phase"],
          priority,
        });
      } else {
        await api.createTicket(vehicleId, {
          bt_code: btCode.trim(),
          bt_description: description,
          phase: phase as Ticket["phase"],
          priority,
          category,
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{isEdit ? "Edit bugtracker ticket" : `New ${category} ticket`}</h2>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="field">
            <label htmlFor="bt-code">BT code</label>
            <input id="bt-code" type="text" autoFocus value={btCode} onChange={(e) => setBtCode(e.target.value)} placeholder="e.g. BT-2451" />
          </div>
          <div className="field">
            <label htmlFor="bt-description">BT description</label>
            <textarea
              id="bt-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is the change request about?"
            />
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="bt-phase">Phase</label>
              <select id="bt-phase" value={phase} onChange={(e) => setPhase(Number(e.target.value))}>
                {[1, 2, 3, 4, 5].map((p) => (
                  <option key={p} value={p}>
                    Phase {p}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="bt-priority">Priority</label>
              <select id="bt-priority" value={priority} onChange={(e) => setPriority(e.target.value as TicketPriority)}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {error && <p className="error-text">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy || !btCode.trim()}>
              {busy ? "Saving…" : isEdit ? "Save changes" : "Add ticket"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
