import { Handle, Position, type NodeProps } from "@xyflow/react";
import "./nodes.css";

export interface BrandNodeData {
  [key: string]: unknown;
  name: string;
  logoPath: string | null;
  vehicleCount: number;
  ticketCount: number;
  expanded: boolean;
  isEditMode: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onAddVehicle: () => void;
}

export default function BrandNode({ data }: NodeProps) {
  const d = data as BrandNodeData;
  return (
    <div className={`mm-node mm-node-brand${d.expanded ? " expanded" : ""}`}>
      <Handle type="target" position={Position.Left} isConnectable={false} style={{ opacity: 0 }} />
      <button className="mm-node-body" onClick={d.onToggle} title={d.expanded ? "Collapse" : `Show ${d.vehicleCount} vehicle(s)`}>
        <div className="mm-brand-logo">
          {d.logoPath ? (
            <img src={d.logoPath} alt={d.name} />
          ) : (
            <span>{d.name.slice(0, 2).toUpperCase()}</span>
          )}
        </div>
        <div className="mm-brand-info">
          <span className="mm-brand-name">{d.name}</span>
          <span className="mm-brand-meta">
            {d.vehicleCount} vehicle{d.vehicleCount === 1 ? "" : "s"}
            {d.ticketCount > 0 && ` · ${d.ticketCount} open`}
          </span>
        </div>
        <span className={`mm-chevron${d.expanded ? " open" : ""}`}>›</span>
      </button>

      {d.isEditMode && (
        <div className="mm-node-actions">
          <button className="icon-btn" title="Edit customer" onClick={d.onEdit}>
            ✎
          </button>
          <button className="icon-btn" title="Add vehicle" onClick={d.onAddVehicle}>
            +
          </button>
        </div>
      )}

      <Handle type="source" position={Position.Right} isConnectable={false} style={{ opacity: 0 }} />
    </div>
  );
}
