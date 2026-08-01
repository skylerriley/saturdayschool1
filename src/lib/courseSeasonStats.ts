// ── Season-to-date course stats ──────────────────────────────────────────────
//
// The weekly event detail's Course Overview / Hole Stats module shows ONE
// event's field averages. The Live and Upcoming views show the same layout for
// the SAME COURSE across the whole season instead — "how has this course played
// for us this year", available before a ball is struck.
//
// Scope (decided with the user 2026-07-31): completed events at this course in
// THIS season only. Not all-time — handicaps and the roster shift year to year,
// so mixing seasons would make a per-hole average that describes no real field.
// A first-ever visit to a course therefore has no data, and the caller renders
// an honest empty state rather than a fabricated baseline.
//
// Card-back rows are the CURRENT event's field only (the golfers actually
// teeing it up), each showing their own season average on that hole — so the
// flip answers "how do the guys I'm playing with handle this hole", which is
// the live/upcoming analogue of "what did everyone score here today".

import { dedupeLeaderboard } from "./seasonStats";

export type SeasonHoleStat = {
  hole: number;
  par: number;
  yards: number;
  strokeIndex: number;
  avgPts: number;
  plusMinus: number;
  count: number;      // per-hole scores in the sample (rounds x golfers)
  eagles: number;
  birdies: number;
  pars: number;
  bogeys: number;
  dblPlus: number;
};

export type SeasonPlayerHoleRow = {
  golfer_id: number;
  name: string;
  avgPts: number;
  rounds: number;     // rounds this golfer has played this hole this season
};

export type CourseSeasonStats = {
  holeStats: SeasonHoleStat[];
  rankMap: Record<number, number>;
  playerHoleData: Record<number, SeasonPlayerHoleRow[]>;
  hasYards: boolean;
  eventCount: number;      // completed events in the sample
  courseName: string;
  courseId: number;
};

// Average of the votes for a per-hole course attribute (pars/yards/SI), where
// each playing golfer votes with the tee box they played. Mirrors the weekly
// module's math so a hole's par/yardage reads identically in both places.
function voteAverage(votes: number[], fallback: number): number {
  if (!votes.length) return fallback;
  return Math.round(votes.reduce((a, b) => a + b, 0) / votes.length);
}

/**
 * Build course stats for `courseName` across every completed event at that
 * course in `season`.
 *
 * @param fieldGolferIds golfers in the upcoming/live event — the card-back list.
 *   Pass null to include every golfer with rounds at the course.
 */
export function buildCourseSeasonStats({
  courseName,
  season,
  events,
  leaderboard,
  holeScores,
  signups,
  courses,
  golfers,
  fieldGolferIds,
}: {
  courseName: string;
  season: number;
  events: any[];
  leaderboard: any[];
  holeScores: any[];
  signups: any[];
  courses: any[];
  golfers: any[];
  fieldGolferIds?: number[] | null;
}): CourseSeasonStats {
  const HOLE_COUNT = 18;
  const courseIds = courses
    .filter((c: any) => c.course_name === courseName)
    .map((c: any) => Number(c.course_id))
    .filter((n: number) => Number.isFinite(n) && n > 0);
  const courseId = courseIds.length ? Math.min(...courseIds) : 0;

  const empty: CourseSeasonStats = {
    holeStats: [], rankMap: {}, playerHoleData: {},
    hasYards: false, eventCount: 0, courseName, courseId,
  };
  if (!courseName) return empty;

  // Completed events at this course, this season. A live event in progress is
  // NOT included — its scores are partial, and half a round of holes 1-9 would
  // skew the front nine against the back.
  const sampleEvents = events.filter((e: any) =>
    e.status === "Completed" &&
    e.season === season &&
    e.course_name === courseName
  );
  if (!sampleEvents.length) return empty;

  const sampleEventIds = new Set(sampleEvents.map((e: any) => e.event_id));

  // summary_id -> golfer_id across the whole sample, deduped the same way the
  // rest of the app reads the leaderboard (a golfer can hold >1 summary row).
  const entries = dedupeLeaderboard(
    leaderboard.filter((r: any) => sampleEventIds.has(r.event_id))
  );
  const summaryToGolfer: Record<number, number> = {};
  const summaryToEvent: Record<number, number> = {};
  for (const e of entries) {
    summaryToGolfer[e.summary_id] = e.golfer_id;
    summaryToEvent[e.summary_id] = e.event_id;
  }

  const sampleScores = holeScores.filter((h: any) =>
    summaryToGolfer[h.summary_id] != null &&
    h.gross_score != null &&
    h.stableford_points != null
  );
  if (!sampleScores.length) return empty;

  // ── Per-hole course attributes, voted by the tee boxes actually played ──
  const sampleSignups = signups.filter((s: any) =>
    sampleEventIds.has(s.event_id) && s.tee_box_course_id
  );
  const parVotes: number[][] = Array.from({ length: HOLE_COUNT }, () => []);
  const yardVotes: number[][] = Array.from({ length: HOLE_COUNT }, () => []);
  const siVotes: number[][] = Array.from({ length: HOLE_COUNT }, () => []);
  let hasYards = false;
  for (const s of sampleSignups) {
    const c = courses.find((c: any) => c.course_id === s.tee_box_course_id);
    if (!c) continue;
    if (c.hole_pars) c.hole_pars.forEach((p: number, i: number) => { if (i < HOLE_COUNT) parVotes[i].push(p); });
    if (Array.isArray(c.hole_yards)) {
      hasYards = true;
      c.hole_yards.forEach((y: number, i: number) => { if (i < HOLE_COUNT && y > 0) yardVotes[i].push(y); });
    }
    if (c.hole_stroke_indices) c.hole_stroke_indices.forEach((si: number, i: number) => { if (i < HOLE_COUNT && si > 0) siVotes[i].push(si); });
  }
  // Fallback when no signup carries a tee box (older events): the course row
  // itself. Without this the whole card falls back to par 4 everywhere.
  if (!parVotes.some(v => v.length)) {
    const base = courses.find((c: any) => c.course_name === courseName && c.hole_pars);
    if (base?.hole_pars) {
      base.hole_pars.forEach((p: number, i: number) => { if (i < HOLE_COUNT) parVotes[i].push(p); });
      if (Array.isArray(base.hole_yards)) {
        hasYards = true;
        base.hole_yards.forEach((y: number, i: number) => { if (i < HOLE_COUNT && y > 0) yardVotes[i].push(y); });
      }
      if (base.hole_stroke_indices) base.hole_stroke_indices.forEach((si: number, i: number) => { if (i < HOLE_COUNT && si > 0) siVotes[i].push(si); });
    }
  }

  // ── Field averages per hole ──
  const scoresByHole: Record<number, any[]> = {};
  for (const h of sampleScores) {
    (scoresByHole[h.hole_number] ||= []).push(h);
  }

  const holeStats: SeasonHoleStat[] = [];
  for (let hNum = 1; hNum <= HOLE_COUNT; hNum++) {
    const scores = scoresByHole[hNum] || [];
    if (!scores.length) continue;
    const par = voteAverage(parVotes[hNum - 1], 4) || 4;
    const count = scores.length;
    const avgPts = scores.reduce((s: number, h: any) => s + (h.stableford_points || 0), 0) / count;
    let eagles = 0, birdies = 0, pars = 0, bogeys = 0, dblPlus = 0;
    for (const h of scores) {
      const diff = h.gross_score - par;
      if (diff <= -2) eagles++;
      else if (diff === -1) birdies++;
      else if (diff === 0) pars++;
      else if (diff === 1) bogeys++;
      else dblPlus++;
    }
    holeStats.push({
      hole: hNum,
      par,
      yards: voteAverage(yardVotes[hNum - 1], 0),
      strokeIndex: voteAverage(siVotes[hNum - 1], 0),
      avgPts,
      plusMinus: avgPts - 2,   // 2 Stableford pts = par
      count, eagles, birdies, pars, bogeys, dblPlus,
    });
  }
  if (!holeStats.length) return empty;

  // Rank 1 = hardest hole (lowest average points) — same convention as the
  // weekly module so the RANK figure means the same thing in both views.
  const rankMap: Record<number, number> = {};
  [...holeStats].sort((a, b) => a.avgPts - b.avgPts).forEach((h, i) => { rankMap[h.hole] = i + 1; });

  // ── Per-golfer season averages per hole ──
  // Rounds counted per DISTINCT event, so a golfer with two summary rows for
  // one event isn't credited with playing the hole twice.
  const fieldSet = fieldGolferIds && fieldGolferIds.length ? new Set(fieldGolferIds) : null;
  const acc: Record<number, Record<number, { total: number; n: number; events: Set<number> }>> = {};
  for (const h of sampleScores) {
    const gid = summaryToGolfer[h.summary_id];
    if (fieldSet && !fieldSet.has(gid)) continue;
    const byHole = (acc[h.hole_number] ||= {});
    const cell = (byHole[gid] ||= { total: 0, n: 0, events: new Set<number>() });
    cell.total += h.stableford_points || 0;
    cell.n++;
    const evId = summaryToEvent[h.summary_id];
    if (evId != null) cell.events.add(evId);
  }

  const playerHoleData: Record<number, SeasonPlayerHoleRow[]> = {};
  for (const h of holeStats) {
    const byGolfer = acc[h.hole] || {};
    playerHoleData[h.hole] = Object.entries(byGolfer)
      .map(([gidStr, cell]) => {
        const gid = Number(gidStr);
        const g = golfers.find((gl: any) => gl.golfer_id === gid);
        return {
          golfer_id: gid,
          name: g ? `${g.first_name} ${g.last_name}` : "Unknown",
          avgPts: cell.n > 0 ? cell.total / cell.n : 0,
          rounds: cell.events.size || cell.n,
        };
      })
      .sort((a, b) => b.avgPts - a.avgPts || a.name.localeCompare(b.name));
  }

  return {
    holeStats, rankMap, playerHoleData, hasYards,
    eventCount: sampleEvents.length, courseName, courseId,
  };
}
