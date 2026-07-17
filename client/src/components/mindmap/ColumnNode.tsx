import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { NoteCategory, NoteKind, NotePriority, ProductType } from "../../api/types";
import { CheckCircleIcon, MinusCircleIcon } from "../common/Icons";
import { formatCwDate } from "../../utils/date";
import "./nodes.css";

const CATEGORY_BG: Record<NoteCategory, string> = {
  Margin: "var(--cat-margin)",
  Quality: "var(--cat-quality)",
  Portfolio: "var(--cat-portfolio)",
  Other: "var(--cat-other)",
};

const PRODUCT_COLOR: Record<ProductType, string> = {
  CC: "var(--product-cc)",
  FC: "var(--product-fc)",
  PW: "var(--product-pw)",
};

export interface ColumnTopic {
  id: string;
  title: string;
  kind: NoteKind;
  category: NoteCategory;
  priority: NotePriority;
  btCode: string | null;
  cwDate: string | null;
  phase: 1 | 2 | 3 | 4 | 5 | null;
}

export interface ColumnNodeData {
  [key: string]: unknown;
  vehicleName: string;
  product: ProductType | null;
  newsTopics: ColumnTopic[];
  btTopics: ColumnTopic[];
  isEditMode: boolean;
  onOpen: () => void;
  onCompleteTopic: (id: string) => void;
  onDeleteTopic: (id: string) => void;
}

function TopicRow({
  topic,
  isEditMode,
  onComplete,
  onDelete,
}: {
  topic: ColumnTopic;
  isEditMode: boolean;
  onComplete: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`mm-column-topic${isEditMode ? " nodrag nopan" : ""}`}
      style={{ background: CATEGORY_BG[topic.category], cursor: isEditMode ? "grab" : undefined }}
      draggable={isEditMode}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", topic.id);
        e.dataTransfer.effectAllowed = "move";
      }}
    >
      <div className="mm-column-topic-main">
        <span className="mm-column-topic-title">{topic.title}</span>
        <span className="mm-column-topic-meta">
          {topic.priority === "High" ? "High" : "Normal"}
          {topic.kind === "bt" && topic.btCode ? ` · ${topic.btCode}` : ""}
          {topic.kind === "bt" && topic.phase ? ` · Phase ${topic.phase}` : ""}
          {topic.kind === "news" && topic.cwDate ? ` · ${formatCwDate(topic.cwDate)}` : ""}
        </span>
      </div>
      {isEditMode && (
        <div className="mm-column-topic-actions">
          <button
            className="mm-topic-action mm-topic-complete"
            title="Mark complete"
            onClick={(e) => {
              e.stopPropagation();
              onComplete();
            }}
          >
            <CheckCircleIcon width={13} height={13} />
          </button>
          <button
            className="mm-topic-action mm-topic-delete"
            title="Delete topic"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <MinusCircleIcon width={13} height={13} />
          </button>
        </div>
      )}
    </div>
  );
}

export default function ColumnNode({ data }: NodeProps) {
  const d = data as ColumnNodeData;
  const headerColor = d.product ? PRODUCT_COLOR[d.product] : "var(--brand-navy)";

  return (
    <div className="mm-node mm-node-column">
      <Handle type="target" position={Position.Top} isConnectable={false} style={{ opacity: 0 }} />
      <button className="mm-column-header" style={{ background: headerColor }} onClick={d.onOpen}>
        {d.vehicleName}
        {d.product ? ` ${d.product}` : ""}
      </button>

      {d.newsTopics.length > 0 && (
        <div className="mm-column-section">
          <span className="mm-column-section-label">News</span>
          <div className="mm-column-topics">
            {d.newsTopics.map((topic) => (
              <TopicRow
                key={topic.id}
                topic={topic}
                isEditMode={d.isEditMode}
                onComplete={() => d.onCompleteTopic(topic.id)}
                onDelete={() => d.onDeleteTopic(topic.id)}
              />
            ))}
          </div>
        </div>
      )}

      {d.btTopics.length > 0 && (
        <div className="mm-column-section">
          <span className="mm-column-section-label">Bugtracker</span>
          <div className="mm-column-topics">
            {d.btTopics.map((topic) => (
              <TopicRow
                key={topic.id}
                topic={topic}
                isEditMode={d.isEditMode}
                onComplete={() => d.onCompleteTopic(topic.id)}
                onDelete={() => d.onDeleteTopic(topic.id)}
              />
            ))}
          </div>
        </div>
      )}

      <Handle type="source" position={Position.Bottom} isConnectable={false} style={{ opacity: 0 }} />
    </div>
  );
}
