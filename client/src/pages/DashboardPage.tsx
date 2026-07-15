import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { NoteSummaryRow } from "../api/types";
import Skeleton from "../components/common/Skeleton";
import "./DashboardPage.css";

const SEGMENTS: { key: keyof NoteSummaryRow; label: string; color: string }[] = [
  { key: "margin_count", label: "Margin", color: "var(--cat-margin)" },
  { key: "quality_count", label: "Quality", color: "var(--cat-quality)" },
  { key: "portfolio_count", label: "Portfolio", color: "var(--cat-portfolio)" },
];

export default function DashboardPage() {
  const [rows, setRows] = useState<NoteSummaryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getNoteSummary()
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load the overview."));
  }, []);

  if (error) {
    return (
      <div className="container dashboard-page">
        <p className="error-text">{error}</p>
      </div>
    );
  }

  if (!rows) {
    return (
      <div className="container dashboard-page">
        <div className="dashboard-header">
          <Skeleton width={220} height={22} style={{ marginBottom: 8 }} />
          <Skeleton width={380} height={13} />
        </div>
        <div className="leaderboard">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="leaderboard-row" style={{ pointerEvents: "none" }}>
              <Skeleton width={18} height={12} />
              <div className="leaderboard-labels">
                <Skeleton width={120} height={13} style={{ marginBottom: 6 }} />
                <Skeleton width={80} height={11} />
              </div>
              <Skeleton height={18} width={`${70 - i * 12}%`} />
              <Skeleton width={20} height={13} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const withNotes = rows.filter((r) => r.note_count > 0).sort((a, b) => b.note_count - a.note_count);
  const maxTotal = Math.max(1, ...withNotes.map((r) => r.note_count));

  return (
    <div className="container dashboard-page">
      <div className="dashboard-header">
        <h1 className="dashboard-title">Topics overview</h1>
        <p className="dashboard-subtitle">
          Vehicles ranked by active topics (bugtracker + research/project), split by category. Click a row to
          open the vehicle.
        </p>
      </div>

      {withNotes.length === 0 ? (
        <div className="empty-state">No topics have been logged yet.</div>
      ) : (
        <>
          <div className="dashboard-legend">
            {SEGMENTS.map((s) => (
              <div key={s.key} className="legend-item">
                <span className="legend-swatch" style={{ background: s.color }} />
                {s.label}
              </div>
            ))}
          </div>

          <div className="leaderboard">
            {withNotes.map((row, i) => (
              <Link
                key={row.vehicle_id}
                to="/"
                state={{ openVehicle: row.vehicle_id }}
                className="leaderboard-row"
              >
                <span className="leaderboard-rank">#{i + 1}</span>
                <div className="leaderboard-labels">
                  <div className="leaderboard-vehicle">{row.vehicle_name}</div>
                  <div className="leaderboard-brand">{row.brand_name}</div>
                </div>
                <div
                  className="leaderboard-bar-track"
                  style={{ width: `${Math.max(6, (row.note_count / maxTotal) * 100)}%` }}
                >
                  {SEGMENTS.map((s) => {
                    const value = Number(row[s.key]) || 0;
                    if (value === 0) return null;
                    return (
                      <div
                        key={s.key}
                        className="leaderboard-bar-segment"
                        title={`${s.label}: ${value}`}
                        style={{ background: s.color, width: `${(value / row.note_count) * 100}%` }}
                      />
                    );
                  })}
                </div>
                <span className="leaderboard-total">{row.note_count}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
