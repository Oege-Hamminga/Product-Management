import { Handle, Position, type NodeProps } from "@xyflow/react";
import { PencilIcon, PlusIcon } from "../common/Icons";
import "./nodes.css";

export interface BrandNodeData {
  [key: string]: unknown;
  name: string;
  logoPath: string | null;
  vehicleCount: number;
  noteCount: number;
  radius: number;
  expanded: boolean;
  isEditMode: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onAddTopic: () => void;
}

export default function BrandNode({ data }: NodeProps) {
  const d = data as BrandNodeData;
  const size = d.radius * 2;
  const metaLabel = `${d.vehicleCount} vehicle${d.vehicleCount === 1 ? "" : "s"}${
    d.noteCount > 0 ? ` · ${d.noteCount} topic${d.noteCount === 1 ? "" : "s"}` : ""
  }`;

  return (
    <div
      className={`mm-node mm-bubble${d.expanded ? " expanded" : ""}`}
      style={{ width: size, height: size }}
    >
      <button
        className="mm-bubble-body"
        onClick={d.onToggle}
        title={`${d.name} — ${metaLabel} — ${d.expanded ? "click to collapse" : "click to expand"}`}
      >
        {d.logoPath ? (
          <img className="mm-bubble-logo-img" src={d.logoPath} alt={d.name} />
        ) : (
          <span className="mm-bubble-name">{d.name}</span>
        )}
      </button>

      {d.isEditMode && (
        <div className="mm-node-actions">
          <button className="icon-btn" title="Edit customer" onClick={d.onEdit}>
            <PencilIcon width={13} height={13} />
          </button>
          <button className="icon-btn" title="Add topic" onClick={d.onAddTopic}>
            <PlusIcon width={14} height={14} />
          </button>
        </div>
      )}

      <Handle type="source" position={Position.Bottom} isConnectable={false} style={{ opacity: 0 }} />
    </div>
  );
}
