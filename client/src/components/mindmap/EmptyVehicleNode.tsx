import { Handle, Position, type NodeProps } from "@xyflow/react";
import { PlusIcon } from "../common/Icons";
import "./nodes.css";

export interface EmptyVehicleNodeData {
  [key: string]: unknown;
  isEditMode: boolean;
  onAdd: () => void;
}

export default function EmptyVehicleNode({ data }: NodeProps) {
  const d = data as EmptyVehicleNodeData;
  return (
    <div className="mm-node mm-node-empty">
      <Handle type="target" position={Position.Left} isConnectable={false} style={{ opacity: 0 }} />
      {d.isEditMode ? (
        <button className="mm-empty-body clickable" onClick={d.onAdd}>
          <PlusIcon width={13} height={13} />
          Add first vehicle
        </button>
      ) : (
        <div className="mm-empty-body">No vehicles yet</div>
      )}
    </div>
  );
}
