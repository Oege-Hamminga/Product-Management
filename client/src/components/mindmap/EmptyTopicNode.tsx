import type { NodeProps } from "@xyflow/react";
import { PlusIcon } from "../common/Icons";
import "./nodes.css";

export interface EmptyTopicNodeData {
  [key: string]: unknown;
  isEditMode: boolean;
  onAdd: () => void;
}

export default function EmptyTopicNode({ data }: NodeProps) {
  const d = data as EmptyTopicNodeData;
  return (
    <div className="mm-node mm-node-empty">
      {d.isEditMode ? (
        <button className="mm-empty-body clickable" onClick={d.onAdd}>
          <PlusIcon width={13} height={13} />
          Add first topic
        </button>
      ) : (
        <div className="mm-empty-body">No topics yet</div>
      )}
    </div>
  );
}
