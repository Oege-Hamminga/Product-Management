import type { NodeProps } from "@xyflow/react";
import { PencilIcon, PlusIcon } from "../common/Icons";
import "./nodes.css";

// Every brand box is the same fixed size — simple, uniform squares/plates
// laid out next to each other, no longer scaled by topic count. Exported so
// the canvas packing math reserves a footprint that matches what renders.
export const BRAND_BOX_WIDTH = 190;
export const BRAND_BOX_HEIGHT = 92;

export interface BrandNodeData {
  [key: string]: unknown;
  name: string;
  logoPath: string | null;
  vehicleCount: number;
  noteCount: number;
  isEditMode: boolean;
  onEdit: () => void;
  onAddTopic: () => void;
}

export default function BrandNode({ data }: NodeProps) {
  const d = data as BrandNodeData;
  const metaLabel = `${d.vehicleCount} vehicle${d.vehicleCount === 1 ? "" : "s"}${
    d.noteCount > 0 ? ` · ${d.noteCount} topic${d.noteCount === 1 ? "" : "s"}` : ""
  }`;

  return (
    <div className="mm-node mm-bubble" style={{ width: BRAND_BOX_WIDTH, height: BRAND_BOX_HEIGHT }}>
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
    </div>
  );
}
