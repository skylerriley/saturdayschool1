import { useMemo } from "react";
import { X, ChevronRight, Sun } from "lucide-react";
import { formatDate } from "../../lib/formatters";
import { buildSeasonRounds, dedupeLeaderboard } from "../../lib/seasonStats";

// ── ProfileView ───────────────────────────────────────────────────────────────
// Personal season snapshot for the identified member. Two homes:
//   1. Welcome overlay right after picking your name (pass onClose)
//   2. Settings > Profile subtab (no onClose)
// Standings math mirrors LeaderboardTab exactly (buildSeasonRounds + tie
// positions; week-over-week = full standings vs standings without the most
// recent completed event).

const ordinal = (n: number) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th";
  return `${n}${s}`;
};
const posLabel = (pos: number, tied: boolean) => (tied ? `T${pos}` : ordinal(pos));

// Rank rows (already sorted desc by `key`) and pull the member's row with tie info
function memberStanding(rows: any[], memberId: number, key: string) {
  const idx = rows.findIndex((r: any) => r.golfer_id === memberId);
  if (idx < 0) return null;
  const row = rows[idx];
  const pos = rows.filter((r: any) => r[key] > row[key]).length + 1;
  const tied = rows.filter((r: any) => r[key] === row[key]).length > 1;
  return { ...row, pos, tied, rank: idx + 1 };
}

export function ProfileView({ golfer, golfers, events, leaderboard, holeScores, signups, onNavigateSeason, onNavigateTop15, onNavigateLastRound, onNavigateRsvp, onNavigateAnalytics, onClose }: any) {
  const memberId = golfer.golfer_id;

  const data = useMemo(() => {
    const completed = events.filter((e: any) => e.status === "Completed");
    const season = completed.length ? Math.max(...completed.map((e: any) => e.season)) : new Date().getFullYear();
    const completedEventIds = new Set(completed.map((e: any) => e.event_id));
    const leaderboardCompleted = leaderboard.filter((r: any) => completedEventIds.has(r.event_id));

    // ── Season Avg + Top 15 Avg standings (mirrors LeaderboardTab) ──
    const byG = buildSeasonRounds(golfers, leaderboardCompleted, season);
    const buildRows = (top15: boolean, byEventFilter?: Set<number>) => {
      const rows: any[] = [];
      Object.entries(byG).forEach(([gid, ptsAll]: any) => {
        let pts: number[] = ptsAll;
        if (byEventFilter) {
          // Re-derive per-event points so we can exclude the latest event
          pts = [];
          dedupeLeaderboard(leaderboardCompleted.filter((r: any) => r.season === season && r.golfer_id === parseInt(gid)))
            .forEach((r: any) => { if (byEventFilter.has(r.event_id)) pts.push(r.total_stableford_points); });
        }
        if (!pts.length) return;
        const use = top15 ? [...pts].sort((a, b) => b - a).slice(0, 15) : pts;
        rows.push({ golfer_id: parseInt(gid), avg: use.reduce((a, b) => a + b, 0) / use.length, rounds: pts.length });
      });
      rows.sort((a, b) => b.avg - a.avg);
      return rows;
    };

    const seasonAvg = buildRows(false);
    const top15Avg = buildRows(true);

    // Week-over-week: standings excluding the most recent completed event of the season
    const seasonEventsAsc = completed.filter((e: any) => e.season === season)
      .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let seasonDelta: number | null = null, top15Delta: number | null = null;
    if (seasonEventsAsc.length > 1) {
      const prevIds = new Set<number>(seasonEventsAsc.slice(0, -1).map((e: any) => e.event_id as number));
      const prevSa = buildRows(false, prevIds);
      const prevTa = buildRows(true, prevIds);
      const d = (cur: any[], prev: any[]) => {
        const c = cur.findIndex((r: any) => r.golfer_id === memberId);
        const p = prev.findIndex((r: any) => r.golfer_id === memberId);
        if (c < 0 || p < 0) return null;
        return p - c; // positive = moved up
      };
      seasonDelta = d(seasonAvg, prevSa);
      top15Delta = d(top15Avg, prevTa);
    }

    const seasonRow = memberStanding(seasonAvg, memberId, "avg");
    const top15Row = memberStanding(top15Avg, memberId, "avg");

    // ── Last round played (most recent completed event with a member entry) ──
    const completedDesc = [...completed].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    let lastRound: any = null;
    for (const ev of completedDesc) {
      const entries = dedupeLeaderboard(leaderboard.filter((r: any) => r.event_id === ev.event_id))
        .sort((a: any, b: any) => b.total_stableford_points - a.total_stableford_points);
      const mine = entries.find((r: any) => r.golfer_id === memberId);
      if (!mine) continue;
      const pts = mine.total_stableford_points;
      const pos = entries.filter((r: any) => r.total_stableford_points > pts).length + 1;
      const tied = entries.filter((r: any) => r.total_stableford_points === pts).length > 1;
      const myHoles = holeScores.filter((h: any) => h.summary_id === mine.summary_id && h.gross_score != null);
      const gross = myHoles.length ? myHoles.reduce((s: number, h: any) => s + h.gross_score, 0) : null;
      // Skins $ — derive from hole scores (stored skins_payout_won is always 0; same rule as LeaderboardTab)
      let skinsWon = 0;
      const skinsPaid = entries.filter((e: any) => e.skins_paid);
      if (skinsPaid.length) {
        const holeMap: Record<number, Record<number, number>> = {};
        skinsPaid.forEach((entry: any) => {
          holeScores.filter((h: any) => h.summary_id === entry.summary_id && h.stableford_points != null)
            .forEach((h: any) => {
              if (!holeMap[entry.golfer_id]) holeMap[entry.golfer_id] = {};
              holeMap[entry.golfer_id][h.hole_number] = h.stableford_points;
            });
        });
        const pids = Object.keys(holeMap).map(Number);
        const wins: Record<number, number> = {};
        let totalSkins = 0;
        for (let hN = 1; hN <= 18; hN++) {
          const scores = pids.map(id => ({ id, pts: holeMap[id]?.[hN] })).filter(x => x.pts != null);
          if (!scores.length) continue;
          const maxPts = Math.max(...scores.map(x => x.pts as number));
          const leaders = scores.filter(x => x.pts === maxPts);
          if (leaders.length === 1) { wins[leaders[0].id] = (wins[leaders[0].id] || 0) + 1; totalSkins++; }
        }
        if (totalSkins > 0) skinsWon = (wins[memberId] || 0) * ((skinsPaid.length * 10) / totalSkins);
      }
      lastRound = { event: ev, pts, pos, tied, gross, skinsWon };
      break;
    }

    // ── Next event to sign up for ──
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const nextEvent = events
      .filter((e: any) => (e.status === "Upcoming" || e.status === "Pairings Set") && new Date(e.date + "T00:00:00").getTime() >= today.getTime())
      .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())[0] || null;
    const mySignup = nextEvent
      ? signups.find((s: any) => s.event_id === nextEvent.event_id && s.golfer_id === memberId && !s.is_guest_entry)
      : null;
    // Pairings set for the member -> the card gets promoted and shows tee time + group
    const pairingsSet = !!(nextEvent && mySignup?.attending === "Yes" && mySignup?.assigned_tee_time && !mySignup?.in_waiting_room);
    const groupMates = pairingsSet
      ? signups
          .filter((s: any) => s.event_id === nextEvent.event_id && s.attending === "Yes" && !s.in_waiting_room && s.assigned_tee_time === mySignup.assigned_tee_time && s.golfer_id !== memberId)
          .map((s: any) => golfers.find((g: any) => g.golfer_id === s.golfer_id))
          .filter(Boolean)
      : [];

    return { season, seasonRow, top15Row, seasonDelta, top15Delta, lastRound, nextEvent, mySignup, pairingsSet, groupMates };
  }, [golfer, golfers, events, leaderboard, holeScores, signups, memberId]);

  const { season, seasonRow, top15Row, seasonDelta, top15Delta, lastRound, nextEvent, mySignup, pairingsSet, groupMates } = data;

  const deltaChip = (delta: number | null) => {
    if (delta == null) return <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)" }}>NEW</span>;
    if (delta === 0) return <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)" }}>&mdash;</span>;
    const up = delta > 0;
    return (
      <span style={{ fontSize: 12, fontWeight: 800, color: up ? "var(--green-600)" : "#c0392b" }}>
        {up ? "▲" : "▼"}{Math.abs(delta)} <span style={{ fontWeight: 600, color: "var(--text-muted)" }}>this week</span>
      </span>
    );
  };

  const cardStyle: any = {
    background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)",
    boxShadow: "var(--shadow-sm)", padding: "14px 16px", cursor: "pointer", textAlign: "left",
    WebkitTapHighlightColor: "transparent",
  };
  const labelStyle: any = { fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 6 };

  const attending = mySignup?.attending;
  // Filled pills matching the RSVP tab's active In/Out buttons
  const rsvpFill = attending === "Yes" ? "var(--green-700)" : attending === "No" ? "var(--red-600)" : "var(--gold-600,#b8860b)";
  const rsvpText = attending === "Yes" ? "You're in" : attending === "No" ? "You're out" : "No response yet";

  const nextEventCard = nextEvent && (
    <div style={{ ...cardStyle, marginBottom: 12 }} onClick={onNavigateRsvp} role="button">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={labelStyle}>Next Event</div>
        <ChevronRight size={15} style={{ color: "var(--text-muted)", marginTop: -4 }} />
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
        {nextEvent.course_name} <span style={{ fontWeight: 600, color: "var(--text-muted)", fontSize: 15 }}>&middot; {formatDate(nextEvent.date)}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <span style={{
          fontSize: 15, fontWeight: 800, color: "white",
          background: rsvpFill, borderRadius: 12, padding: "4px 11px",
          border: `1px solid ${rsvpFill}`,
        }}>{rsvpText}</span>
        {attending === "Yes" && mySignup?.early_tee_request && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "rgba(201,162,39,0.15)", border: "1px solid rgba(201,162,39,0.4)", borderRadius: 12, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: "#8a6b10" }}>
            <Sun size={11} strokeWidth={2.5} /> Early tee requested
          </span>
        )}
        {attending !== "Yes" && (
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Tap to sign up</span>
        )}
      </div>
      {pairingsSet && (
        <div style={{ marginTop: 12, background: "var(--surface2)", borderRadius: "var(--radius-sm)", padding: "10px 12px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: "var(--green-700)", fontVariantNumeric: "tabular-nums" }}>{String(mySignup.assigned_tee_time).slice(0, 5)}</span>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>Your tee time</span>
          </div>
          {groupMates.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {groupMates.map((g: any) => (
                <span key={g.golfer_id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "3px 10px", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                  {g.first_name} {g.last_name ? g.last_name[0] + "." : ""}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  const content = (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: onClose ? "0 18px 40px" : "0 0 8px" }}>
      {/* Greeting — overlay mode only; in Settings the tab header carries it */}
      {onClose && (
        <div style={{ textAlign: "center", margin: "10px 0 4px" }}>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 30, fontWeight: 700, color: "var(--green-800)", lineHeight: 1.15 }}>
            Welcome, {golfer.first_name}
          </div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>Your {season} season at a glance</div>
        </div>
      )}

      {/* Quick stats strip — equal grid columns so the middle stat sits dead-center */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", maxWidth: 300, margin: "14px auto 16px" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: "var(--text-primary)" }}>{golfer.current_handicap_index?.toFixed(1) ?? "--"}</div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-muted)", textTransform: "uppercase" }}>HCP</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: "var(--text-primary)" }}>{seasonRow?.rounds ?? 0}</div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-muted)", textTransform: "uppercase" }}>Rounds</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: "var(--text-primary)" }}>{lastRound ? lastRound.pts : "--"}</div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-muted)", textTransform: "uppercase" }}>Last Pts</div>
        </div>
      </div>

      {/* Pairings are set -> your tee time & group lead the page */}
      {pairingsSet && nextEventCard}

      {/* Standings — two tappable cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        <div style={cardStyle} onClick={onNavigateSeason} role="button">
          <div style={labelStyle}>Season Avg</div>
          {seasonRow ? (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: 29, fontWeight: 800, color: "var(--green-700)", lineHeight: 1 }}>{posLabel(seasonRow.pos, seasonRow.tied)}</span>
                <ChevronRight size={17} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)", marginTop: 5 }}>{seasonRow.avg.toFixed(2)} <span style={{ fontWeight: 600, color: "var(--text-muted)" }}>pts avg</span></div>
              <div style={{ marginTop: 5 }}>{deltaChip(seasonDelta)}</div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>No rounds yet</div>
          )}
        </div>
        <div style={cardStyle} onClick={onNavigateTop15} role="button">
          <div style={labelStyle}>Top 15 Avg</div>
          {top15Row ? (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: 29, fontWeight: 800, color: "var(--green-700)", lineHeight: 1 }}>{posLabel(top15Row.pos, top15Row.tied)}</span>
                <ChevronRight size={17} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)", marginTop: 5 }}>{top15Row.avg.toFixed(2)} <span style={{ fontWeight: 600, color: "var(--text-muted)" }}>pts avg</span> &middot; {top15Row.rounds} rds</div>
              <div style={{ marginTop: 5 }}>{deltaChip(top15Delta)}</div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>No rounds yet</div>
          )}
        </div>
      </div>

      {/* Last round played */}
      {lastRound && (
        <div style={{ ...cardStyle, marginBottom: 12 }} onClick={() => onNavigateLastRound(lastRound.event.event_id)} role="button">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={labelStyle}>Last Round</div>
            <ChevronRight size={15} style={{ color: "var(--text-muted)", marginTop: -4 }} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 10 }}>
            {lastRound.event.course_name} <span style={{ fontWeight: 600, color: "var(--text-muted)", fontSize: 13 }}>&middot; {formatDate(lastRound.event.date)}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6 }}>
            {[
              { v: lastRound.gross ?? "--", l: "Gross" },
              { v: lastRound.pts, l: "Pts" },
              { v: posLabel(lastRound.pos, lastRound.tied), l: "Finish" },
              { v: lastRound.skinsWon > 0 ? `$${Math.round(lastRound.skinsWon)}` : "$0", l: "Skins" },
            ].map((t, i) => (
              <div key={i} style={{ background: "var(--surface2)", borderRadius: "var(--radius-sm)", padding: "8px 4px", textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: i === 3 && lastRound.skinsWon > 0 ? "var(--gold-600,#b8860b)" : "var(--green-700)" }}>{t.v}</div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-muted)", textTransform: "uppercase", marginTop: 2 }}>{t.l}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Next event RSVP status (pre-pairings position) */}
      {!pairingsSet && nextEventCard}

      {/* Full analytics deep-link */}
      {onNavigateAnalytics && (
        <button
          className="btn btn-outline btn-full"
          style={{ fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginTop: 2 }}
          onClick={onNavigateAnalytics}
        >
          View More Stats <ChevronRight size={16} />
        </button>
      )}

      {onClose && (
        <div style={{ textAlign: "center", fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
          Find this anytime in Settings &rarr; Profile
        </div>
      )}
    </div>
  );

  // Settings-subtab mode: bare content
  if (!onClose) return content;

  // Welcome-overlay mode: full-screen sheet with a close button
  return (
    <div className="profile-welcome" style={{ position: "fixed", inset: 0, background: "var(--bg)", zIndex: 9998, overflowY: "auto", WebkitOverflowScrolling: "touch", paddingTop: "calc(env(safe-area-inset-top,0px) + 14px)", paddingBottom: "calc(env(safe-area-inset-bottom,0px) + 20px)" }}>
      <button
        onClick={onClose}
        aria-label="Close"
        style={{ position: "absolute", top: "calc(env(safe-area-inset-top,0px) + 12px)", right: 14, width: 36, height: 36, borderRadius: "50%", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-secondary)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "var(--shadow-sm)", zIndex: 2 }}
      >
        <X size={18} />
      </button>
      {content}
    </div>
  );
}
