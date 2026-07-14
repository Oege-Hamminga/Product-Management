import { Handle, Position, type NodeProps } from "@xyflow/react";
import "./nodes.css";

export interface VehicleNodeData {
  [key: string]: unknown;
  name: string;
  ticketCount: number;
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
        <div className="mm-vehicle-info">
          <span className="mm-vehicle-name">{d.name}</span>
          {d.ticketCount > 0 && <span className="mm-vehicle-ticket-count">{d.ticketCount} open BT</span>}
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
            ×
          </button>
        </div>
      )}
      <Handle type="source" position={Position.Right} isConnectable={false} style={{ opacity: 0 }} />
    </div>
  );
}
