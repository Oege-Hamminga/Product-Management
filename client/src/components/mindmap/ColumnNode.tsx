import type { NodeProps } from "@xyflow/react";
import type { NoteCategory, NoteKind, NotePriority, ProductType } from "../../api/types";
import { CheckCircleIcon, MinusCircleIcon } from "../common/Icons";
import { formatCwDate } from "../../utils/date";
import "./nodes.css";

const NEWS_BG = "#707070";
// Light-to-dark red scale, indexed by BT phase (1 = just opened, 5 = furthest along).
const BT_PHASE_BG: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "#e2726f",
  2: "#cf4c44",
  3: "#cc0000",
  4: "#a80000",
  5: "#7a0000",
};

function topicBg(topic: Pick<ColumnTopic, "kind" | "phase">): string {
  return topic.kind === "news" ? NEWS_BG : BT_PHASE_BG[topic.phase ?? 3];
}

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
      style={{ background: topicBg(topic), cursor: isEditMode ? "grab" : undefined }}
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

  return (
    <div className="mm-node mm-node-column">
      <button className="mm-column-header" onClick={d.onOpen}>
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
    </div>
  );
}
