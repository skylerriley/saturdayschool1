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
  // Snap to exactly 50 when the field is genuinely average (within ±0.35 pts)
  if (Math.abs(avgDelta) < 0.35) return 50;
  // Tight clamp [-1, +1] so even modest deltas read as clearly quiet/loaded
  const clamped = Math.max(-1, Math.min(1, avgDelta));
  return Math.round(((clamped + 1) / 2) * 100);
}

function dotColor(fsi: number): string {
  if (fsi <= 30) return "#9c7c65";
  if (fsi <= 55) return "#7b6a5a";
  if (fsi <= 75) return "#2db368";
  return "#ffc947";
}

export function FieldStrengthMeter({ upEntries, golfers, leaderboard, events, season }: Props) {
  const fsi = useMemo(
    () => computeFSI(upEntries, golfers, leaderboard, events, season),
    [upEntries, golfers, leaderboard, events, season]
  );

  if (fsi === null) return null;

  const pct = fsi; // 0–100
  const color = dotColor(fsi);

  const glowColor =
    fsi <= 30 ? "rgba(156,124,101,0.45)" :
    fsi <= 55 ? "rgba(107,82,64,0.4)" :
    fsi <= 75 ? "rgba(45,179,104,0.55)" :
    "rgba(255,201,71,0.6)";

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
      <div style={{ marginBottom: 10 }}>
        <span style={{
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
        }}>
          Field Strength
        </span>
      </div>

      {/* Bar */}
      <div style={{ position: "relative", height: 8, borderRadius: 4, marginBottom: 7 }}>
        {/* Full-width gradient track */}
        <div style={{
          position: "absolute",
          inset: 0,
          borderRadius: 4,
          background: "linear-gradient(to right, #7b6a5a 0%, #9c7c65 28%, #2db368 58%, #ffc947 100%)",
          opacity: 0.22,
        }} />

        {/* Filled portion */}
        <div style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: `${pct}%`,
          height: "100%",
          borderRadius: 4,
          background: "linear-gradient(to right, #7b6a5a 0%, #9c7c65 28%, #2db368 58%, #ffc947 100%)",
          transition: "width 0.4s ease",
        }} />

        {/* Average tick at 50% */}
        <div style={{
          position: "absolute",
          top: -2,
          left: "50%",
          transform: "translateX(-50%)",
          width: 1.5,
          height: 12,
          background: "var(--border-md, rgba(0,0,0,0.18))",
          borderRadius: 1,
          zIndex: 1,
        }} />

        {/* Indicator dot */}
        <div style={{
          position: "absolute",
          top: "50%",
          left: `${pct}%`,
          transform: "translate(-50%, -50%)",
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: color,
          border: "2.5px solid var(--surface)",
          boxShadow: `0 0 0 1px rgba(0,0,0,0.12), 0 0 8px 2px ${glowColor}`,
          zIndex: 2,
          transition: "left 0.4s ease",
        }} />
      </div>

      {/* Zone labels */}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 13, color: "var(--text-muted)", letterSpacing: "0.04em" }}>QUIET</span>
        <span style={{ fontSize: 13, color: "var(--text-muted)", letterSpacing: "0.04em" }}>AVG</span>
        <span style={{ fontSize: 13, color: "var(--text-muted)", letterSpacing: "0.04em" }}>LOADED</span>
      </div>
    </div>
  );
}
