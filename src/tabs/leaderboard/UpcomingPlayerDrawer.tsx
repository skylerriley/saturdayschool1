import { useMemo } from "react";

interface Props {
  golfer: any;
  leaderboard: any[];
  events: any[];
  nextEvent: any;
  seasonPos: any; // from seasonPosMap
  onViewMore?: () => void;
}

// Mini sparkline: last N rounds as small bars
function FormBars({ pts }: { pts: number[] }) {
  const max = Math.max(...pts, 30);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 28 }}>
      {pts.map((p, i) => {
        const h = Math.max(4, Math.round((p / max) * 28));
        const isLast = i === pts.length - 1;
        const color = p >= 36 ? "var(--gold-400)" : p >= 30 ? "var(--green-400)" : p >= 24 ? "var(--green-600)" : "var(--earth-400)";
        return (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <div style={{
              width: 18, height: h, borderRadius: 3,
              background: color,
              opacity: isLast ? 1 : 0.55,
              outline: isLast ? `2px solid ${color}` : "none",
              outlineOffset: 1,
            }} />
            <span style={{ fontSize: 9, color: isLast ? "var(--text-primary)" : "var(--text-muted)", fontWeight: isLast ? 700 : 400 }}>{p}</span>
          </div>
        );
      })}
    </div>
  );
}

export function UpcomingPlayerDrawer({ golfer, leaderboard, events, nextEvent, seasonPos, onViewMore }: Props) {
  const gid = golfer.golfer_id;
  const nextMonth = nextEvent?.date ? new Date(nextEvent.date + "T00:00:00").getMonth() : -1;

  const { last3, formAvg, formTrend, monthAvg, monthRounds, seasonAvg, seasonRounds, courseAvg, courseRounds } = useMemo(() => {
    const completedEventIds = new Set(
      events.filter((e: any) => e.status === "Completed").map((e: any) => e.event_id)
    );
    const evDateMap: Record<number, string> = {};
    const evMonthMap: Record<number, number> = {};
    const evCourseMap: Record<number, string> = {};
    events.forEach((e: any) => {
      evDateMap[e.event_id] = e.date;
      evMonthMap[e.event_id] = new Date(e.date + "T00:00:00").getMonth();
      evCourseMap[e.event_id] = e.course_name || "";
    });

    // Deduplicate: one entry per event (highest pts)
    const rawEntries = leaderboard.filter((r: any) => r.golfer_id === gid && completedEventIds.has(r.event_id));
    const deduped: Record<number, any> = {};
    rawEntries.forEach((r: any) => {
      if (!deduped[r.event_id] || r.total_stableford_points > deduped[r.event_id].total_stableford_points) {
        deduped[r.event_id] = r;
      }
    });

    // Sort chronologically oldest → newest
    const sorted = Object.values(deduped).sort((a: any, b: any) =>
      new Date(evDateMap[a.event_id] + "T00:00:00").getTime() - new Date(evDateMap[b.event_id] + "T00:00:00").getTime()
    );

    // Last 3 rounds
    const last3Entries = sorted.slice(-3);
    const last3 = last3Entries.map((r: any) => r.total_stableford_points);
    const formAvg = last3.length ? last3.reduce((a, b) => a + b, 0) / last3.length : null;

    // Trend: last3 avg vs prior 3 avg
    let formTrend: "up" | "down" | "flat" | null = null;
    if (last3.length === 3 && sorted.length >= 4) {
      const prior = sorted.slice(-6, -3);
      if (prior.length >= 1) {
        const priorAvg = prior.reduce((a: number, r: any) => a + r.total_stableford_points, 0) / prior.length;
        const diff = formAvg! - priorAvg;
        formTrend = diff > 1.5 ? "up" : diff < -1.5 ? "down" : "flat";
      }
    }

    // Same-month average across all years
    const monthEntries = sorted.filter((r: any) => evMonthMap[r.event_id] === nextMonth);
    const monthAvg = monthEntries.length ? monthEntries.reduce((a: number, r: any) => a + r.total_stableford_points, 0) / monthEntries.length : null;
    const monthRounds = monthEntries.length;

    // Season avg
    const seasonEntries = sorted.filter((r: any) => {
      const ev = events.find((e: any) => e.event_id === r.event_id);
      return ev?.season === nextEvent?.season;
    });
    const seasonAvg = seasonEntries.length ? seasonEntries.reduce((a: number, r: any) => a + r.total_stableford_points, 0) / seasonEntries.length : null;
    const seasonRounds = seasonEntries.length;

    // Same course average
    const nextCourse = nextEvent?.course_name || "";
    const courseEntries = nextCourse ? sorted.filter((r: any) => evCourseMap[r.event_id] === nextCourse) : [];
    const courseAvg = courseEntries.length ? courseEntries.reduce((a: number, r: any) => a + r.total_stableford_points, 0) / courseEntries.length : null;
    const courseRounds = courseEntries.length;

    return { last3, formAvg, formTrend, monthAvg, monthRounds, seasonAvg, seasonRounds, courseAvg, courseRounds };
  }, [gid, leaderboard, events, nextEvent, nextMonth]);

  const monthName = nextMonth >= 0
    ? ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][nextMonth]
    : "";

  const trendIcon = formTrend === "up" ? "↑" : formTrend === "down" ? "↓" : formTrend === "flat" ? "→" : "";
  const trendColor = formTrend === "up" ? "var(--green-500)" : formTrend === "down" ? "var(--red-400)" : "var(--text-muted)";

  const fmt = (n: number | null) => n == null ? "—" : n.toFixed(1);

  return (
    <div style={{
      padding: "10px 14px 14px",
      background: "var(--green-50)",
      borderTop: "1px solid var(--border)",
    }}>
      {/* Form strip */}
      {last3.length > 0 && (
        <div style={{ marginBottom: 12, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 15 }}>
            Last {last3.length} rounds
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <FormBars pts={last3} />
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", lineHeight: 1 }}>
                {fmt(formAvg)}
                {trendIcon && (
                  <span style={{ fontSize: 16, fontWeight: 700, color: trendColor, marginLeft: 4 }}>{trendIcon}</span>
                )}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>avg pts</div>
            </div>
          </div>
        </div>
      )}

      {/* Stat grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {monthAvg != null && monthRounds >= 1 && (
          <StatTile
            label={`${monthName} hist. avg`}
            value={fmt(monthAvg)}
            sub={`${monthRounds} round${monthRounds !== 1 ? "s" : ""}`}
          />
        )}
        {courseAvg != null && courseRounds >= 1 && (
          <StatTile
            label="Course avg"
            value={fmt(courseAvg)}
            sub={`${courseRounds} round${courseRounds !== 1 ? "s" : ""}`}
          />
        )}
        {seasonAvg != null && seasonRounds >= 1 && (
          <StatTile
            label="Season avg"
            value={fmt(seasonAvg)}
            sub={`${seasonRounds} round${seasonRounds !== 1 ? "s" : ""}`}
          />
        )}
        {golfer.current_handicap_index != null && (
          <StatTile
            label="Handicap"
            value={Number(golfer.current_handicap_index).toFixed(1)}
            sub=""
          />
        )}
      </div>

      {onViewMore && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
          <button
            onClick={onViewMore}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "transparent",
              border: "1.5px solid var(--green-600, #2d6a4f)",
              borderRadius: 999,
              padding: "6px 18px",
              fontSize: 13, fontWeight: 700,
              color: "var(--green-600, #2d6a4f)",
              cursor: "pointer",
              letterSpacing: "0.03em",
            
              WebkitTapHighlightColor: "transparent",
            }}
          >
            View Profile
            
          </button>
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-md)",
      padding: "8px 10px",
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
