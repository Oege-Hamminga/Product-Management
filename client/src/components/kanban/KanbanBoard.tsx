import { useEffect, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { api } from "../../api/client";
import type { Ticket, TicketCategory } from "../../api/types";
import KanbanColumn from "./KanbanColumn";
import TicketCard from "./TicketCard";
import ConfirmDialog from "../common/ConfirmDialog";
import TicketFormModal from "./TicketFormModal";
import "./Kanban.css";

const CATEGORIES: TicketCategory[] = ["Margin", "Quality", "Portfolio"];

interface KanbanBoardProps {
  vehicleId: string;
  tickets: Ticket[];
  isEditMode: boolean;
  onChanged: () => void;
}

function groupByCategory(tickets: Ticket[]): Record<TicketCategory, Ticket[]> {
  const groups: Record<TicketCategory, Ticket[]> = { Margin: [], Quality: [], Portfolio: [] };
  for (const t of [...tickets].sort((a, b) => a.position - b.position)) {
    groups[t.category].push(t);
  }
  return groups;
}

export default function KanbanBoard({ vehicleId, tickets, isEditMode, onChanged }: KanbanBoardProps) {
  const [columns, setColumns] = useState<Record<TicketCategory, Ticket[]>>(() => groupByCategory(tickets));
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  const [formState, setFormState] = useState<{ category: TicketCategory; ticket?: Ticket } | null>(null);
  const [deleting, setDeleting] = useState<Ticket | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    setColumns(groupByCategory(tickets));
  }, [tickets]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  function findColumnOf(id: string): TicketCategory | null {
    if (CATEGORIES.includes(id as TicketCategory)) return id as TicketCategory;
    for (const cat of CATEGORIES) {
      if (columns[cat].some((t) => t.id === id)) return cat;
    }
    return null;
  }

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    for (const cat of CATEGORIES) {
      const found = columns[cat].find((t) => t.id === id);
      if (found) {
        setActiveTicket(found);
        return;
      }
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveTicket(null);
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    const sourceCat = findColumnOf(activeId);
    const destCat = findColumnOf(overId);
    if (!sourceCat || !destCat) return;
    if (sourceCat === destCat && activeId === overId) return;

    const sourceItems = [...columns[sourceCat]];
    const activeIndex = sourceItems.findIndex((t) => t.id === activeId);
    if (activeIndex === -1) return;
    const [moved] = sourceItems.splice(activeIndex, 1);

    const destItems = sourceCat === destCat ? sourceItems : [...columns[destCat]];
    let destIndex = destItems.findIndex((t) => t.id === overId);
    if (destIndex === -1) destIndex = destItems.length;
    destItems.splice(destIndex, 0, { ...moved, category: destCat });

    const nextColumns: Record<TicketCategory, Ticket[]> = {
      ...columns,
      [sourceCat]: sourceItems,
      [destCat]: destItems,
    };
    setColumns(nextColumns);

    const updates = Object.entries(nextColumns).flatMap(([cat, items]) =>
      items.map((t, index) => ({ id: t.id, category: cat, position: index }))
    );
    try {
      await api.reorderTickets(updates);
      onChanged();
    } catch {
      setColumns(groupByCategory(tickets));
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api.deleteTicket(deleting.id);
      setDeleting(null);
      onChanged();
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="kanban-board">
          {CATEGORIES.map((cat) => (
            <KanbanColumn
              key={cat}
              category={cat}
              tickets={columns[cat]}
              isEditMode={isEditMode}
              onAdd={() => setFormState({ category: cat })}
              onEditTicket={(ticket) => setFormState({ category: ticket.category, ticket })}
              onDeleteTicket={(ticket) => setDeleting(ticket)}
            />
          ))}
        </div>
        <DragOverlay>
          {activeTicket ? (
            <TicketCard ticket={activeTicket} isEditMode={isEditMode} onEdit={() => {}} onDelete={() => {}} />
          ) : null}
        </DragOverlay>
      </DndContext>

      {formState && (
        <TicketFormModal
          vehicleId={vehicleId}
          category={formState.category}
          ticket={formState.ticket}
          onClose={() => setFormState(null)}
          onSaved={onChanged}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.bt_code}?`}
          message="This bugtracker ticket will be permanently removed."
          busy={deleteBusy}
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
