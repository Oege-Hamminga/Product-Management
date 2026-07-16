import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { NoteCategory, NoteKind, NotePriority } from "../../api/types";
import { CheckCircleIcon, MinusCircleIcon } from "../common/Icons";
import { formatCwDate } from "../../utils/date";
import "./nodes.css";

const CATEGORY_BG: Record<NoteCategory, string> = {
  Margin: "var(--cat-margin)",
  Quality: "var(--cat-quality)",
  Portfolio: "var(--cat-portfolio)",
  Other: "var(--cat-other)",
};

export interface TopicNodeData {
  [key: string]: unknown;
  vehicleName: string;
  title: string;
  kind: NoteKind;
  category: NoteCategory;
  priority: NotePriority;
  btCode: string | null;
  cwDate: string | null;
  isEditMode: boolean;
  isFiltered: boolean;
  onOpen: () => void;
  onToggleFilter: () => void;
  onComplete: () => void;
  onDelete: () => void;
}

export default function TopicNode({ data }: NodeProps) {
  const d = data as TopicNodeData;
  return (
    <div className={`mm-node mm-node-topic${d.isFiltered ? " filtered" : ""}`}>
      <Handle type="target" position={Position.Top} isConnectable={false} style={{ opacity: 0 }} />
      <button className="mm-topic-body" style={{ background: CATEGORY_BG[d.category] }} onClick={d.onOpen}>
        <span
          className="mm-topic-vehicle"
          onClick={(e) => {
            e.stopPropagation();
            d.onToggleFilter();
          }}
          title="Filter this brand's topics to this vehicle"
        >
          {d.vehicleName}
        </span>
        <span className="mm-topic-title">{d.title}</span>
        <span className="mm-topic-meta">
          {d.kind === "bt" ? "BT" : "News"}
          {d.priority === "High" ? " · High" : ""}
          {d.kind === "bt" && d.btCode ? ` · ${d.btCode}` : ""}
          {d.kind === "news" && d.cwDate ? ` · ${formatCwDate(d.cwDate)}` : ""}
        </span>
      </button>
      {d.isEditMode && (
        <div className="mm-topic-actions">
          <button
            className="mm-topic-action mm-topic-complete"
            title="Mark complete"
            onClick={(e) => {
              e.stopPropagation();
              d.onComplete();
            }}
          >
            <CheckCircleIcon width={14} height={14} />
          </button>
          <button
            className="mm-topic-action mm-topic-delete"
            title="Delete topic"
            onClick={(e) => {
              e.stopPropagation();
              d.onDelete();
            }}
          >
            <MinusCircleIcon width={14} height={14} />
          </button>
        </div>
      )}
      <Handle type="source" position={Position.Bottom} isConnectable={false} style={{ opacity: 0 }} />
    </div>
  );
}
