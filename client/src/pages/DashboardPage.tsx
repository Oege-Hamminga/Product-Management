import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { TicketSummaryRow } from "../api/types";
import "./DashboardPage.css";

const SEGMENTS: { key: keyof TicketSummaryRow; label: string; color: string }[] = [
  { key: "margin_count", label: "Margin", color: "var(--cat-margin)" },
  { key: "quality_count", label: "Quality", color: "var(--cat-quality)" },
  { key: "portfolio_count", label: "Portfolio", color: "var(--cat-portfolio)" },
];

export default function DashboardPage() {
  const [rows, setRows] = useState<TicketSummaryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getTicketSummary()
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
    return <div className="spinner-wrap">Loading overview…</div>;
  }

  const withTickets = rows.filter((r) => r.ticket_count > 0).sort((a, b) => b.ticket_count - a.ticket_count);
  const maxTotal = Math.max(1, ...withTickets.map((r) => r.ticket_count));

  return (
    <div className="container dashboard-page">
      <div className="dashboard-header">
        <h1 className="dashboard-title">Bugtracker overview</h1>
        <p className="dashboard-subtitle">
          Vehicles ranked by open change requests, split by category. Click a row to open the vehicle's board.
        </p>
      </div>

      {withTickets.length === 0 ? (
        <div className="empty-state">No bugtracker tickets have been logged yet.</div>
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
            {withTickets.map((row, i) => (
              <Link key={row.vehicle_id} to={`/vehicles/${row.vehicle_id}`} className="leaderboard-row">
                <span className="leaderboard-rank">#{i + 1}</span>
                <div className="leaderboard-labels">
                  <div className="leaderboard-vehicle">{row.vehicle_name}</div>
                  <div className="leaderboard-brand">{row.brand_name}</div>
                </div>
                <div
                  className="leaderboard-bar-track"
                  style={{ width: `${Math.max(6, (row.ticket_count / maxTotal) * 100)}%` }}
                >
                  {SEGMENTS.map((s) => {
                    const value = Number(row[s.key]) || 0;
                    if (value === 0) return null;
                    return (
                      <div
                        key={s.key}
                        className="leaderboard-bar-segment"
                        title={`${s.label}: ${value}`}
                        style={{ background: s.color, width: `${(value / row.ticket_count) * 100}%` }}
                      />
                    );
                  })}
                </div>
                <span className="leaderboard-total">{row.ticket_count}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
