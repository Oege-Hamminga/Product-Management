import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Ticket, TicketCategory } from "../../api/types";
import TicketCard from "./TicketCard";
import "./Kanban.css";

const COLUMN_META: Record<TicketCategory, { color: string; blurb: string }> = {
  Margin: { color: "var(--cat-margin)", blurb: "Cost & pricing impact" },
  Quality: { color: "var(--cat-quality)", blurb: "Fit, finish & reliability" },
  Portfolio: { color: "var(--cat-portfolio)", blurb: "Range & fitment strategy" },
};

interface KanbanColumnProps {
  category: TicketCategory;
  tickets: Ticket[];
  isEditMode: boolean;
  onAdd: () => void;
  onEditTicket: (ticket: Ticket) => void;
  onDeleteTicket: (ticket: Ticket) => void;
}

export default function KanbanColumn({
  category,
  tickets,
  isEditMode,
  onAdd,
  onEditTicket,
  onDeleteTicket,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: category });
  const meta = COLUMN_META[category];

  return (
    <div className={`kanban-column${isOver ? " drag-over" : ""}`}>
      <div className="kanban-column-header" style={{ borderTopColor: meta.color }}>
        <div>
          <h3>
            {category}
            <span className="kanban-column-count">{tickets.length}</span>
          </h3>
          <span className="kanban-column-blurb">{meta.blurb}</span>
        </div>
        {isEditMode && (
          <button className="icon-btn" title={`Add ${category} ticket`} onClick={onAdd}>
            +
          </button>
        )}
      </div>

      <div ref={setNodeRef} className="kanban-column-body">
        <SortableContext items={tickets.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tickets.map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              isEditMode={isEditMode}
              onEdit={() => onEditTicket(ticket)}
              onDelete={() => onDeleteTicket(ticket)}
            />
          ))}
        </SortableContext>
        {tickets.length === 0 && <div className="kanban-empty">No tickets</div>}
      </div>
    </div>
  );
}
