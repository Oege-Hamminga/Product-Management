import { Handle, Position, type NodeProps } from "@xyflow/react";
import { CloseIcon, TruckIcon } from "../common/Icons";
import "./nodes.css";

const CATEGORY_BAR_COLOR: Record<string, string> = {
  Margin: "var(--cat-margin)",
  Quality: "var(--cat-quality)",
  Portfolio: "var(--cat-portfolio)",
  Other: "var(--cat-other)",
};

export interface VehicleNodeData {
  [key: string]: unknown;
  name: string;
  noteCount: number;
  categoryCounts: Record<string, number>;
  isEditMode: boolean;
  onOpen: () => void;
  onDelete: () => void;
}

export default function VehicleNode({ data }: NodeProps) {
  const d = data as VehicleNodeData;
  return (
    <div className="mm-node mm-node-vehicle">
      <Handle type="target" position={Position.Top} isConnectable={false} style={{ opacity: 0 }} />
      <button className="mm-node-body" onClick={d.onOpen}>
        <span className="mm-vehicle-icon">
          <TruckIcon width={14} height={14} />
        </span>
        <div className="mm-vehicle-info">
          <span className="mm-vehicle-name">{d.name}</span>
          {d.noteCount > 0 && (
            <>
              <span className="mm-vehicle-ticket-count">
                {d.noteCount} topic{d.noteCount === 1 ? "" : "s"}
              </span>
              <div className="mm-vehicle-bar">
                {Object.entries(d.categoryCounts)
                  .filter(([, count]) => count > 0)
                  .map(([category, count]) => (
                    <span
                      key={category}
                      className="mm-vehicle-bar-segment"
                      style={{ background: CATEGORY_BAR_COLOR[category], width: `${(count / d.noteCount) * 100}%` }}
                      title={`${category}: ${count}`}
                    />
                  ))}
              </div>
            </>
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
