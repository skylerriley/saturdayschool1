import { useMemo } from "react";

interface Props {
  upEntries: any[];
  golfers: any[];
  leaderboard: any[];
  events: any[];
  season: number;
}

function computeFSI(upEntries: any[], golfers: any[], leaderboard: any[], events: any[], season: number): number | null {
  const completedEventIds = new Set(
    events.filter((e: any) => e.status === "Completed" && e.season === season).map((e: any) => e.event_id)
  );

  // Sort completed events chronologically (oldest → newest) so .slice(-3) = last 3
  const completedEventsOrdered = events
    .filter((e: any) => e.status === "Completed" && e.season === season)
    .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const orderedEventIds = completedEventsOrdered.map((e: any) => e.event_id);

  const signedUpGolferIds = new Set(upEntries.map((s: any) => s.golfer_id));

  const deltas: number[] = [];

  signedUpGolferIds.forEach((gid) => {
    const g = golfers.find((x: any) => x.golfer_id === gid);
    if (!g || g.is_guest) return;

    // Deduplicate: one entry per event, keep highest score
    const seasonEntries = leaderboard.filter(
      (r: any) => r.golfer_id === gid && completedEventIds.has(r.event_id)
    );
    const deduped: Record<number, number> = {};
    seasonEntries.forEach((r: any) => {
      if (deduped[r.event_id] == null || r.total_stableford_points > deduped[r.event_id]) {
        deduped[r.event_id] = r.total_stableford_points;
      }
    });

    // Build chronologically ordered scores
    const orderedScores = orderedEventIds
      .filter((eid: number) => deduped[eid] != null)
      .map((eid: number) => deduped[eid]);

    if (orderedScores.length < 3) return; // exclude — fewer than 3 completed rounds

    const seasonAvg = orderedScores.reduce((a: number, b: number) => a + b, 0) / orderedScores.length;
    const last3 = orderedScores.slice(-3);
    const last3Avg = last3.reduce((a: number, b: number) => a + b, 0) / 3;
    deltas.push(last3Avg - seasonAvg);
  });

  if (deltas.length === 0) return null;

  const avgDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  // Clamp to [-5, +5], map to [0, 100]
  const clamped = Math.max(-5, Math.min(5, avgDelta));
  return Math.round(((clamped + 5) / 10) * 100);
}

function descriptor(fsi: number): string {
  if (fsi <= 30) return "Field running cold";
  if (fsi <= 55) return "Right around average";
  if (fsi <= 75) return "Field in solid form";
  return "Loaded field this week";
}

function dotColor(fsi: number): string {
  if (fsi <= 30) return "var(--text-muted)";
  if (fsi <= 55) return "var(--text-secondary)";
  if (fsi <= 75) return "var(--green-400)";
  return "var(--gold-300)";
}

export function FieldStrengthMeter({ upEntries, golfers, leaderboard, events, season }: Props) {
  const fsi = useMemo(
    () => computeFSI(upEntries, golfers, leaderboard, events, season),
    [upEntries, golfers, leaderboard, events, season]
  );

  if (fsi === null) return null;

  const pct = fsi; // 0–100
  const color = dotColor(fsi);
  const desc = descriptor(fsi);

  return (
    <div style={{
      background: "var(--surface)",
      borderRadius: "var(--radius-md)",
      border: "1px solid var(--border)",
      padding: "12px 14px",
      marginBottom: 12,
      boxShadow: "var(--shadow-sm)",
    }}>
      {/* Label row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <span style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
        }}>
          Field Strength
        </span>
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          {desc}
        </span>
      </div>

      {/* Bar */}
      <div style={{ position: "relative", height: 10, borderRadius: 5, overflow: "visible", marginBottom: 6 }}>
        {/* Three zone segments */}
        <div style={{ display: "flex", height: "100%", borderRadius: 5, overflow: "hidden" }}>
          <div style={{ flex: 1, background: "var(--text-muted)", opacity: 0.3 }} />
          <div style={{ flex: 1, background: "var(--text-secondary)", opacity: 0.3 }} />
          <div style={{ flex: 1, background: "var(--gold-300)", opacity: 0.35 }} />
        </div>

        {/* Sliding dot */}
        <div style={{
          position: "absolute",
          top: "50%",
          left: `calc(${pct}% - 7px)`,
          transform: "translateY(-50%)",
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: color,
          border: "2px solid var(--surface)",
          boxShadow: "0 0 0 1px rgba(0,0,0,0.18)",
          zIndex: 1,
        }} />
      </div>

      {/* Zone labels */}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.04em" }}>QUIET</span>
        <span style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.04em" }}>AVERAGE</span>
        <span style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.04em" }}>LOADED</span>
      </div>
    </div>
  );
}
