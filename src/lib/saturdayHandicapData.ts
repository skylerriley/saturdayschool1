// saturdayHandicapData.ts
// -----------------------------------------------------------------------------
// Thin, pure adapter between the app's stored rounds and the frozen WHS engine
// in saturdayHandicap.ts. It maps a single golfer's competitive hole-by-hole
// rounds into RoundInput[], calls computeSaturdayHandicap, and augments the
// per-round trace with a "contributes" flag (gold vs green) so the chart can
// color bars without re-deriving any WHS math.
//
// No React, no DB calls: everything operates on data already loaded on the
// Analytics page (leaderboard, holeScores, courses, signups).
//
// Comments are ASCII-only to stay safe under the oxc parser.
// -----------------------------------------------------------------------------

import {
  computeSaturdayHandicap,
  type RoundInput,
  type RoundResult,
  type HandicapState,
  type TeeInfo,
} from "./saturdayHandicap";

// Documented league simplification: true PCC needs GHIN-scale field data.
const PCC = 0;

// Per-round display trace: everything the tooltip / coloring needs, joined back
// to the engine's RoundResult by chronological index.
export interface RoundTrace extends RoundResult {
  gross: number;          // raw 18-hole gross total
  courseName: string;     // e.g. "Oak Creek GC"
  teeName: string;        // e.g. "Blue" (may be "")
  courseRating: number;
  slopeRating: number;
  contributes: boolean;   // true => gold (counts toward the current index)
}

export interface SaturdayHandicapData {
  state: HandicapState;
  trace: RoundTrace[];    // chronological, aligned with state.rounds
}

// Same fewer-than-20 selection sizing the engine uses (Rule 5.2a). We only need
// the "count" (how many lowest differentials feed the index) to color bars.
// This mirrors selectionRule() in the engine WITHOUT importing its private
// internals or altering it.
function selectionCount(nScores: number): number {
  if (nScores >= 20) return 8;
  const counts: Record<number, number> = {
    3: 1, 4: 1, 5: 1, 6: 2, 7: 2, 8: 2, 9: 3, 10: 3, 11: 3,
    12: 4, 13: 4, 14: 4, 15: 5, 16: 5, 17: 6, 18: 6, 19: 7,
  };
  return counts[nScores] ?? 0;
}

// Resolve the tee actually played for a round. Prefer the signup's explicit
// tee_box_course_id (which pins a specific tee row); fall back to matching the
// course by name. Returns null if we cannot find complete rating data.
function resolveTee(
  eid: any,
  gid: any,
  courseName: string | null,
  courses: any[],
  signups: any[]
): TeeInfo | null {
  const signup = signups.find(
    (s: any) => s.event_id === eid && s.golfer_id === gid
  );
  const course = signup?.tee_box_course_id
    ? courses.find((c: any) => c.course_id === signup.tee_box_course_id)
    : courses.find((c: any) => c.course_name === courseName);
  if (!course) return null;

  const courseRating = course.tee_rating;
  const slopeRating = course.tee_slope;
  const par = course.par;
  const pars: number[] = course.hole_pars || [];
  const sis: number[] = course.hole_stroke_indices || [];

  // Require every rating field; skip (do not guess) when anything is missing.
  if (
    typeof courseRating !== "number" ||
    typeof slopeRating !== "number" ||
    typeof par !== "number" ||
    pars.length !== 18 ||
    sis.length !== 18
  ) {
    return null;
  }
  // hole_pars / hole_stroke_indices share hole_number-1 ordering (same as the
  // gross array we build below), so they are already aligned.
  const holes = pars.map((p: number, i: number) => ({
    par: p,
    strokeIndex: sis[i],
  }));
  if (holes.some((h) => typeof h.par !== "number" || typeof h.strokeIndex !== "number")) {
    return null;
  }

  return {
    courseRating,
    slopeRating,
    par,
    holes,
    _display: {
      courseName: course.course_name || courseName,
      teeName: course.tee_box_name || "",
    },
  } as TeeInfo & { _display: { courseName: string; teeName: string } };
}

// Build the golfer's all-time competitive round set and compute the handicap.
// Only complete 18-hole, Hole-by-Hole rounds with full tee ratings are included;
// anything missing required data is silently skipped (never throws).
export function computeGolferSaturdayHandicap(
  golferId: any,
  leaderboard: any[],
  holeScores: any[],
  courses: any[],
  signups: any[],
  events: any[]
): SaturdayHandicapData {
  const dateByEid: Record<number, string> = {};
  (events || []).forEach((ev: any) => {
    if (ev.event_id != null && ev.date) dateByEid[ev.event_id] = ev.date;
  });

  // One entry per (golfer, round). A golfer can appear once per event.
  const entries = (leaderboard || []).filter(
    (r: any) =>
      r.golfer_id === golferId &&
      r.entry_type === "Hole-by-Hole" &&
      r.summary_id != null
  );

  type Prepared = { input: RoundInput; gross: number; courseName: string; teeName: string };
  const prepared: Prepared[] = [];

  for (const entry of entries) {
    const date = dateByEid[entry.event_id];
    if (!date) continue; // no date => cannot order or window it

    const hs = (holeScores || [])
      .filter((h: any) => h.summary_id === entry.summary_id)
      .sort((a: any, b: any) => a.hole_number - b.hole_number);

    // Require a complete 18-hole card with every gross present.
    if (hs.length !== 18) continue;
    const grossByHole = hs.map((h: any) => h.gross_score);
    if (grossByHole.some((g: any) => typeof g !== "number")) continue;
    // Confirm holes 1..18 are all present exactly once.
    const holeNums = hs.map((h: any) => h.hole_number);
    const complete = holeNums.every((n: number, i: number) => n === i + 1);
    if (!complete) continue;

    const courseName = courseNameForEvent(entry.event_id, events);
    const tee = resolveTee(entry.event_id, golferId, courseName, courses, signups);
    if (!tee) continue;

    const display = (tee as any)._display as { courseName: string; teeName: string };

    prepared.push({
      input: { date, grossByHole, tee, pcc: PCC },
      gross: grossByHole.reduce((s: number, g: number) => s + g, 0),
      courseName: display.courseName,
      teeName: display.teeName,
    });
  }

  // Engine sorts chronologically internally; sort our display list the same way
  // so trace[i] lines up with state.rounds[i].
  prepared.sort(
    (a, b) => new Date(a.input.date).getTime() - new Date(b.input.date).getTime()
  );

  const inputs = prepared.map((p) => p.input);
  const state = computeSaturdayHandicap(inputs);

  const contributesFlags = computeContributes(state.rounds);

  const trace: RoundTrace[] = state.rounds.map((rr, i) => {
    const p = prepared[i];
    return {
      ...rr,
      gross: p.gross,
      courseName: p.courseName,
      teeName: p.teeName,
      courseRating: inputs[i].tee.courseRating,
      slopeRating: inputs[i].tee.slopeRating,
      contributes: contributesFlags[i],
    };
  });

  return { state, trace };
}

// Determine which rounds count toward the CURRENT index (gold bars). We mirror
// the engine's final step: from the most-recent-20 window of ESR-adjusted
// differentials, the lowest `count` (per Rule 5.2a) are the ones averaged.
//
// The engine keeps esrAdj privately, so we reconstruct it from the public trace
// exactly as the engine does: when a round is exceptional, its esrApplied is
// added to each of the trailing-20 entries (including itself). We then select
// the lowest-N ESR-adjusted differentials within the final window and mark the
// specific rounds chosen (by index, so equal differentials are handled the same
// way the engine's stable-ish sort resolves them: earliest kept first).
function computeContributes(rounds: RoundResult[]): boolean[] {
  const n = rounds.length;
  const flags = new Array<boolean>(n).fill(false);
  if (n < 3) return flags; // no established index -> no gold

  // Reconstruct accumulated ESR adjustment per round.
  const esrAdj = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    const applied = rounds[i].esrApplied;
    if (applied !== 0) {
      const start = Math.max(0, i + 1 - 20);
      for (let j = start; j <= i; j++) esrAdj[j] += applied;
    }
  }

  // Final most-recent-20 window.
  const windowStart = Math.max(0, n - 20);
  const windowIdx: number[] = [];
  for (let i = windowStart; i < n; i++) windowIdx.push(i);

  const count = selectionCount(windowIdx.length);
  if (count <= 0) return flags;

  // Sort window indices by ESR-adjusted differential ascending; ties resolved by
  // earliest index first (stable). Take the lowest `count`.
  const ordered = [...windowIdx].sort((a, b) => {
    const da = rounds[a].differential + esrAdj[a];
    const db = rounds[b].differential + esrAdj[b];
    if (da !== db) return da - db;
    return a - b;
  });
  for (let k = 0; k < count && k < ordered.length; k++) {
    flags[ordered[k]] = true;
  }
  return flags;
}

// Small helper: event_id -> course_name (used only to feed resolveTee's
// name-based fallback path).
function courseNameForEvent(eid: any, events: any[]): string | null {
  const ev = (events || []).find((e: any) => e.event_id === eid);
  return ev?.course_name ?? null;
}
