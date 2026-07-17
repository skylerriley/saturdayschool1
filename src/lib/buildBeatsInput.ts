// Builds the recap engine's SelectBeatsInput from the app's raw tables.
//
// SHARED BY BOTH SIDES OF THE CONTRACT: the read path (HighlightsModule) and
// the sole writer (rebuildBeatHistory). They MUST construct the input
// identically -- if they drift, the beats a viewer sees stop matching the
// history rows the rebuild authored, and the anti-repeat silently decays back
// into the nondeterminism this module exists to prevent. One function, one
// definition, no duplication.
//
// Pure: no React, no Supabase calls, no clock. Callers pass the table rows.
import {
  buildPlayerHistories,
  buildFieldHoleBaseline,
  type BeatStandingRow,
  type SelectBeatsInput,
} from "./recapEngine";

// The anti-repeat look-back, in events. Single source of truth for both the
// history FETCH window (module) and the eventsAgo ranking below; the engine's
// cooldowns are defined against this same window.
export const ANTI_REPEAT_WINDOW = 6;

// sessionStorage cache version for generated beats. This is a PURE
// PERFORMANCE optimization -- beats are deterministic, so the cache only
// saves recomputation, it is not what holds the story still. BUMP IT whenever
// the engine's output could change (detector/threshold/composer edits, or a
// history rebuild), or viewers keep seeing beats from the previous engine.
export const BEATS_CACHE_VERSION = "v9";
export const beatsCacheKey = (eventId: number) => `hl_beats_${BEATS_CACHE_VERSION}_${eventId}`;

export interface BeatsInputTables {
  event: any; // the target event row (event_id, date, course_name, season)
  course: any; // courses row matched by course_name (hole_pars / hole_yards)
  courses: any[];
  signups: any[];
  golfers: any[];
  eventEntries: any[]; // event_leaderboard rows for THIS event
  holeScores: any[]; // hole_scores rows (all events; filtered by summary_id)
  leaderboard: any[]; // event_leaderboard rows (all events)
  events: any[];
  eventLabel: string;
  // story_beats_history rows for the anti-repeat window (excluding this event).
  historyRows: any[];
  // Rows for THIS event carrying admin `hidden` flags.
  hiddenRows?: any[];
  golferName: (golfers: any[], golferId: number) => string;
}

// Tie-aware standings ("1", "T2", "T2", "4"...) with full "First Last" names --
// the final board renders the ellipsising .lb-name-main cell, so no truncation.
export function buildStandings(eventEntries: any[], golfers: any[], golferName: BeatsInputTables["golferName"]): BeatStandingRow[] {
  const sorted = [...eventEntries].sort((a: any, b: any) => b.total_stableford_points - a.total_stableford_points);
  const rows: BeatStandingRow[] = [];
  let pos = 0, prevPts: number | null = null, prevPos = 0;
  sorted.forEach((e: any) => {
    pos += 1;
    const isTie = prevPts != null && e.total_stableford_points === prevPts;
    const effPos = isTie ? prevPos : pos;
    prevPos = effPos;
    prevPts = e.total_stableford_points;
    rows.push({ pos: String(effPos), name: golferName(golfers, e.golfer_id), pts: e.total_stableford_points });
  });
  const posCounts: Record<string, number> = {};
  rows.forEach((r) => { posCounts[r.pos] = (posCounts[r.pos] || 0) + 1; });
  rows.forEach((r) => { if (posCounts[r.pos] > 1) r.pos = "T" + r.pos; });
  return rows;
}

// Does this event have the hole-by-hole data the engine requires? Same
// predicate the skins card uses.
export function hasHoleByHoleData(eventEntries: any[]): boolean {
  return eventEntries.length > 0 && eventEntries.every((e: any) => e.entry_type === "Hole-by-Hole");
}

export function buildBeatsInput(t: BeatsInputTables): SelectBeatsInput {
  const eventId = t.event.event_id;
  const players = t.eventEntries
    .filter((e: any) => e.entry_type === "Hole-by-Hole")
    .map((e: any) => ({ golferId: e.golfer_id, name: t.golferName(t.golfers, e.golfer_id), summaryId: e.summary_id }));
  const summaryToGolfer: Record<number, number> = {};
  players.forEach((p: any) => { summaryToGolfer[p.summaryId] = p.golferId; });
  const scores = t.holeScores
    .filter((h: any) => summaryToGolfer[h.summary_id] != null && h.stableford_points != null)
    .map((h: any) => ({
      golferId: summaryToGolfer[h.summary_id],
      hole: h.hole_number,
      stableford: h.stableford_points,
      gross: h.gross_score ?? null,
    }));

  // Cross-event history for Tier-2 detectors (nemesis / redemption /
  // out-of-character / rivalry), built from tables the app already holds.
  const completedEvts = (t.events || [])
    .filter((e: any) => e.status === "Completed")
    .map((e: any) => ({ event_id: e.event_id, date: e.date }));
  const priorEventIds = new Set(completedEvts.filter((e: any) => e.date < t.event.date).map((e: any) => e.event_id));
  const priorSummaryInfo: Record<number, { golfer_id: number; event_id: number }> = {};
  (t.leaderboard || []).forEach((r: any) => {
    if (priorEventIds.has(r.event_id)) priorSummaryInfo[r.summary_id] = { golfer_id: r.golfer_id, event_id: r.event_id };
  });
  const priorHoleRows = t.holeScores
    .filter((h: any) => priorSummaryInfo[h.summary_id] && h.gross_score != null)
    .map((h: any) => ({
      golfer_id: priorSummaryInfo[h.summary_id].golfer_id,
      event_id: priorSummaryInfo[h.summary_id].event_id,
      hole: h.hole_number,
      gross: h.gross_score,
      points: h.stableford_points ?? null,
    }));
  // Per-hole aggregates (nemesis etc.) must only pool SAME-COURSE prior
  // events -- "hole 16" at another course is a different hole. Season points
  // baselines stay cross-course inside buildPlayerHistories.
  const holeStatsEventIds = (t.events || [])
    .filter((e: any) => e.status === "Completed" && e.date < t.event.date && e.course_name === t.event.course_name)
    .map((e: any) => e.event_id);
  const playerHistory = buildPlayerHistories({
    eventId,
    playerIds: players.map((p: any) => p.golferId),
    allEvents: completedEvts,
    allTotals: (t.leaderboard || [])
      .filter((r: any) => completedEvts.some((e: any) => e.event_id === r.event_id))
      .map((r: any) => ({ event_id: r.event_id, golfer_id: r.golfer_id, total: r.total_stableford_points })),
    priorHoleRows,
    holeStatsEventIds,
  });
  // The field's per-hole baseline on THIS course -- the yardstick that keeps
  // nemesis personal instead of a restatement of "this hole is hard".
  const fieldBaseline = buildFieldHoleBaseline({
    eventId,
    allEvents: completedEvts,
    priorHoleRows,
    holeStatsEventIds,
  });

  // Yardage for the hole meta block: each golfer's own tee
  // (event_signups.tee_box_course_id), with the event's most common tee as the
  // field-wide value and per-golfer fallback.
  const yardsOf = (courseId: any): (number | null)[] | null => {
    const row = courseId != null ? (t.courses || []).find((c: any) => c.course_id === courseId) : null;
    return Array.isArray(row?.hole_yards) ? row.hole_yards : null;
  };
  const evSignups = (t.signups || []).filter((s: any) => s.event_id === eventId && s.tee_box_course_id != null);
  const holeYardsByGolfer: Record<number, (number | null)[] | null> = {};
  evSignups.forEach((s: any) => { holeYardsByGolfer[s.golfer_id] = yardsOf(s.tee_box_course_id); });
  const teeCounts: Record<number, number> = {};
  evSignups.forEach((s: any) => { teeCounts[s.tee_box_course_id] = (teeCounts[s.tee_box_course_id] || 0) + 1; });
  const modalTee = Object.entries(teeCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
  const fieldHoleYards = yardsOf(modalTee != null ? Number(modalTee) : null)
    ?? (Array.isArray(t.course?.hole_yards) ? t.course.hole_yards : null);

  const standings = buildStandings(t.eventEntries, t.golfers, t.golferName);
  const winnerEntry = [...t.eventEntries].sort((a: any, b: any) => b.total_stableford_points - a.total_stableford_points)[0];
  const winnerFullName = winnerEntry ? t.golferName(t.golfers, winnerEntry.golfer_id) : "";

  // Recency rank per prior completed event (0 = the event immediately before
  // this one), from DATES -- never from a fetch order or a globally-newest
  // list, so a mid-season event ranks its own predecessors.
  const priorOrdered = completedEvts
    .filter((e: any) => e.date < t.event.date)
    .sort((a: any, b: any) => b.date.localeCompare(a.date)); // most recent first
  const eventsAgoOf: Record<number, number> = {};
  priorOrdered.forEach((e: any, i: number) => { eventsAgoOf[e.event_id] = i; });
  // `hole` may be absent on rows written before the 20260716_beat_hole
  // migration; the engine treats a missing hole as null.
  const antiRepeatHistory = (t.historyRows || [])
    .filter((h: any) => h.event_id !== eventId)
    .map((h: any) => ({
      event_id: h.event_id,
      angle_type: h.angle_type,
      protagonist_id: h.protagonist_id,
      hole: h.hole ?? null,
      eventsAgo: eventsAgoOf[h.event_id] ?? 99,
    }));

  return {
    eventId,
    players: players.map((p: any) => ({ golferId: p.golferId, name: p.name })),
    scores,
    holePars: t.course?.hole_pars || [],
    finalStandings: standings.slice(0, 5),
    fullStandings: standings, // whole tie-aware field for the standings board
    winnerName: winnerFullName || standings[0]?.name || "",
    eventLabel: t.eventLabel,
    history: antiRepeatHistory,
    prevEventId: priorOrdered[0]?.event_id ?? null,
    playerHistory,
    fieldBaseline,
    holeYardsByGolfer,
    fieldHoleYards,
    hiddenBeats: (t.hiddenRows || []).filter((h: any) => h.event_id === eventId && h.hidden === true),
  };
}
