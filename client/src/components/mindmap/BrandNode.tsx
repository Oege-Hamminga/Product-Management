import { Handle, Position, type NodeProps } from "@xyflow/react";
import { PencilIcon, PlusIcon } from "../common/Icons";
import "./nodes.css";

// The brand box is laid out wider than tall (a title plate, not a square icon
// tile). Exported so the canvas packing math can reserve a footprint that
// matches what actually renders.
export const BRAND_BOX_WIDTH_FACTOR = 1.5;
export const BRAND_BOX_HEIGHT_FACTOR = 0.8;

export interface BrandNodeData {
  [key: string]: unknown;
  name: string;
  logoPath: string | null;
  vehicleCount: number;
  noteCount: number;
  radius: number;
  isEditMode: boolean;
  onEdit: () => void;
  onAddTopic: () => void;
}

export default function BrandNode({ data }: NodeProps) {
  const d = data as BrandNodeData;
  const width = d.radius * 2 * BRAND_BOX_WIDTH_FACTOR;
  const height = d.radius * 2 * BRAND_BOX_HEIGHT_FACTOR;
  const metaLabel = `${d.vehicleCount} vehicle${d.vehicleCount === 1 ? "" : "s"}${
    d.noteCount > 0 ? ` · ${d.noteCount} topic${d.noteCount === 1 ? "" : "s"}` : ""
  }`;

  return (
    <div className="mm-node mm-bubble" style={{ width, height }}>
      <div className="mm-bubble-body" title={`${d.name} — ${metaLabel}`}>
        {d.logoPath ? (
          <img className="mm-bubble-logo-img" src={d.logoPath} alt={d.name} />
        ) : (
          <span className="mm-bubble-name">{d.name}</span>
        )}
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
