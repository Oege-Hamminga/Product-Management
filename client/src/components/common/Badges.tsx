import type { NoteCategory, NoteKind, NotePriority } from "../../api/types";

const PRIORITY_COLOR: Record<NotePriority, string> = {
  Low: "var(--status-good)",
  Medium: "var(--status-warning)",
  High: "var(--status-serious)",
  Critical: "var(--status-critical)",
};

export function PriorityBadge({ priority }: { priority: NotePriority }) {
  const color = PRIORITY_COLOR[priority];
  return (
    <span className="badge" style={{ color, background: `color-mix(in srgb, ${color} 16%, transparent)` }}>
      {priority}
    </span>
  );
}

const CATEGORY_COLOR: Record<NoteCategory, string> = {
  Margin: "var(--cat-margin)",
  Quality: "var(--cat-quality)",
  Portfolio: "var(--cat-portfolio)",
};

export function CategoryBadge({ category }: { category: NoteCategory }) {
  const color = CATEGORY_COLOR[category];
  return (
    <span className="badge" style={{ color, background: `color-mix(in srgb, ${color} 16%, transparent)` }}>
      {category}
    </span>
  );
}

export function PhaseBadge({ phase }: { phase: number }) {
  return (
    <span
      className="badge"
      style={{
        color: "var(--text-secondary)",
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
      }}
    >
      Phase {phase}
    </span>
  );
}

const KIND_LABEL: Record<NoteKind, string> = {
  bugtracker: "Bugtracker",
  research: "Research & Project",
};

export function KindBadge({ kind }: { kind: NoteKind }) {
  return (
    <span
      className="badge"
      style={{
        color: "var(--text-secondary)",
        background: "var(--surface-1)",
        border: "1px solid var(--border-strong)",
      }}
    >
      {KIND_LABEL[kind]}
    </span>
  );
}

export { CATEGORY_COLOR, PRIORITY_COLOR };
