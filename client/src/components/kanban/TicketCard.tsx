import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Ticket } from "../../api/types";
import { PriorityBadge, PhaseBadge } from "../common/Badges";
import { CloseIcon, PencilIcon } from "../common/Icons";
import "./Kanban.css";

interface TicketCardProps {
  ticket: Ticket;
  isEditMode: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

export default function TicketCard({ ticket, isEditMode, onEdit, onDelete }: TicketCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: ticket.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="ticket-card"
      {...(isEditMode ? attributes : {})}
      {...(isEditMode ? listeners : {})}
    >
      <div className="ticket-card-top">
        <span className="ticket-code">{ticket.bt_code}</span>
        {isEditMode && (
          <button
            className="icon-btn"
            title="Delete ticket"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <CloseIcon width={12} height={12} />
          </button>
        )}
      </div>
      {ticket.bt_description && <p className="ticket-desc">{ticket.bt_description}</p>}
      <div className="ticket-card-bottom">
        <PhaseBadge phase={ticket.phase} />
        <PriorityBadge priority={ticket.priority} />
      </div>
      {isEditMode && (
        <button
          className="btn btn-ghost btn-sm ticket-edit-btn"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
        >
          <PencilIcon width={11} height={11} /> Edit details
        </button>
      )}
    </div>
  );
}
