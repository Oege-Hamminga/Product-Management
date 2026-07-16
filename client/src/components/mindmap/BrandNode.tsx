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

function hashSeed(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  return h;
}

export default function BrandNode({ data, id }: NodeProps) {
  const d = data as BrandNodeData;
  const size = d.radius * 2;
  const seed = hashSeed(id);
  const floatDuration = 5.5 + (seed % 30) / 10; // 5.5s - 8.4s
  const floatDelay = -((seed >> 3) % 50) / 10; // negative delay desyncs each bubble
  const showMeta = d.radius >= 46;
  const logoSize = Math.max(26, Math.min(56, d.radius * 0.62));

  return (
    <div
      className={`mm-node mm-bubble${d.expanded ? " expanded" : ""}`}
      style={{ width: size, height: size }}
    >
      <div
        className="mm-bubble-float"
        style={{ animationDuration: `${floatDuration}s`, animationDelay: `${floatDelay}s` }}
      >
        <button
          className="mm-bubble-body"
          onClick={d.onToggle}
          title={d.expanded ? "Collapse" : `Show ${d.vehicleCount} vehicle(s)`}
        >
          <div className="mm-bubble-logo" style={{ width: logoSize, height: logoSize }}>
            {d.logoPath ? (
              <img src={d.logoPath} alt={d.name} />
            ) : (
              <span>{d.name.slice(0, 2).toUpperCase()}</span>
            )}
          </div>
          <span className="mm-bubble-name">{d.name}</span>
          {showMeta && (
            <span className="mm-bubble-meta">
              {d.vehicleCount} vehicle{d.vehicleCount === 1 ? "" : "s"}
              {d.noteCount > 0 && ` · ${d.noteCount} topic${d.noteCount === 1 ? "" : "s"}`}
            </span>
          )}
        </button>
      </div>

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
