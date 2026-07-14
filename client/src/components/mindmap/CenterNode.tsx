import { Handle, Position } from "@xyflow/react";
import "./nodes.css";

export default function CenterNode() {
  return (
    <div className="mm-node mm-node-center">
      <div className="mm-center-title">OEM Portfolio</div>
      <div className="mm-center-sub">CC · FC · PW</div>
      <Handle type="source" position={Position.Right} isConnectable={false} style={{ opacity: 0 }} />
    </div>
  );
}
