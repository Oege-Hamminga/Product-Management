import type { NodeProps } from "@xyflow/react";
import type { Note, NoteCategory, ProductType } from "../../api/types";
import { CheckCircleIcon, MinusCircleIcon } from "../common/Icons";
import { formatCwDate } from "../../utils/date";
import "./nodes.css";

const NEWS_BG = "#707070";
// Four shades of red for BT topics, one per category, so ticket type reads at a glance.
const BT_CATEGORY_BG: Record<NoteCategory, string> = {
  Margin: "#e2726f",
  Portfolio: "#cf4c44",
  Quality: "#a80000",
  Other: "#7a0000",
};

function topicBg(topic: Pick<Note, "kind" | "category">): string {
  return topic.kind === "news" ? NEWS_BG : BT_CATEGORY_BG[topic.category];
}

export type ColumnTopic = Note;

export interface ColumnNodeData {
  [key: string]: unknown;
  vehicleName: string;
  product: ProductType | null;
  newsTopics: ColumnTopic[];
  btTopics: ColumnTopic[];
  isEditMode: boolean;
  onOpen: () => void;
  onOpenTopic: (topic: ColumnTopic) => void;
  onCompleteTopic: (id: string) => void;
  onDeleteTopic: (id: string) => void;
}

function TopicRow({
  topic,
  isEditMode,
  onOpen,
  onComplete,
  onDelete,
}: {
  topic: ColumnTopic;
  isEditMode: boolean;
  onOpen: () => void;
  onComplete: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`mm-column-topic${isEditMode ? " nodrag nopan" : ""}`}
      style={{ background: topicBg(topic), cursor: isEditMode ? "grab" : "pointer" }}
      draggable={isEditMode}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", topic.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={onOpen}
    >
      <div className="mm-column-topic-main">
        <span className="mm-column-topic-title">{topic.title}</span>
        <span className="mm-column-topic-meta">
          {topic.priority === "High" ? "High" : "Normal"}
          {topic.kind === "bt" && topic.bt_code ? ` · ${topic.bt_code}` : ""}
          {topic.kind === "bt" && topic.phase ? ` · Phase ${topic.phase}` : ""}
          {topic.kind === "news" && topic.cw_date ? ` · ${formatCwDate(topic.cw_date)}` : ""}
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
                onOpen={() => d.onOpenTopic(topic)}
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
                onOpen={() => d.onOpenTopic(topic)}
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
