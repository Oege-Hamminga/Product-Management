import { Handle, Position, type NodeProps } from "@xyflow/react";
import { CloseIcon, TruckIcon } from "../common/Icons";
import "./nodes.css";

export interface VehicleNodeData {
  [key: string]: unknown;
  name: string;
  noteCount: number;
  isEditMode: boolean;
  onOpen: () => void;
  onDelete: () => void;
}

export default function VehicleNode({ data }: NodeProps) {
  const d = data as VehicleNodeData;
  return (
    <div className="mm-node mm-node-vehicle">
      <Handle type="target" position={Position.Left} isConnectable={false} style={{ opacity: 0 }} />
      <button className="mm-node-body" onClick={d.onOpen}>
        <span className="mm-vehicle-icon">
          <TruckIcon width={14} height={14} />
        </span>
        <div className="mm-vehicle-info">
          <span className="mm-vehicle-name">{d.name}</span>
          {d.noteCount > 0 && (
            <span className="mm-vehicle-ticket-count">
              {d.noteCount} topic{d.noteCount === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </button>
      {d.isEditMode && (
        <div className="mm-node-actions">
          <button
            className="icon-btn"
            title="Delete vehicle"
            onClick={(e) => {
              e.stopPropagation();
              d.onDelete();
            }}
          >
            <CloseIcon width={12} height={12} />
          </button>
        </div>
      )}
      <Handle type="source" position={Position.Right} isConnectable={false} style={{ opacity: 0 }} />
    </div>
  );
}
