import { useEffect, useState } from "react";
import { api, ApiError } from "../../api/client";
import type { NoteHighlight } from "../../api/types";
import { KindBadge, PriorityBadge } from "../common/Badges";
import { SparkIcon } from "../common/Icons";
import "./KeyNotesStrip.css";

const CATEGORY_COLOR: Record<NoteHighlight["category"], string> = {
  Margin: "var(--cat-margin)",
  Quality: "var(--cat-quality)",
  Portfolio: "var(--cat-portfolio)",
};

function relativeDay(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

interface KeyNotesStripProps {
  onSelectVehicle: (vehicleId: string) => void;
  refreshKey: number;
}

export default function KeyNotesStrip({ onSelectVehicle, refreshKey }: KeyNotesStripProps) {
  const [highlights, setHighlights] = useState<NoteHighlight[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getNoteHighlights(7, 10)
      .then(setHighlights)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load this week's topics."));
  }, [refreshKey]);

  if (error || (highlights && highlights.length === 0)) return null;

  return (
    <div className="key-notes-band">
      <div className="key-notes container">
        <div className="key-notes-head">
          <SparkIcon width={15} height={15} />
          <h2>This week's key topics</h2>
          <span className="key-notes-sub">Most important activity across every brand, last 7 days</span>
        </div>
        <div className="key-notes-row">
          {!highlights &&
            [0, 1, 2, 3].map((i) => <div key={i} className="key-note-card key-note-skeleton" />)}
          {highlights?.map((n) => (
            <button
              key={n.id}
              className="key-note-card"
              style={{ borderTopColor: CATEGORY_COLOR[n.category] }}
              onClick={() => onSelectVehicle(n.vehicle_id)}
            >
              <span className="key-note-vehicle">
                {n.brand_name} · {n.vehicle_name}
              </span>
              <span className="key-note-title">{n.title}</span>
              <div className="key-note-badges">
                <KindBadge kind={n.kind} />
                {n.priority && <PriorityBadge priority={n.priority} />}
              </div>
              <span className="key-note-time">{relativeDay(n.created_at)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
