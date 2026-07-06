// saturdayHandicap.ts
// -----------------------------------------------------------------------------
// "Saturday Handicap" engine: a WHS Handicap Index computed from competitive
// 18-hole gross scores. Pure and dependency-free so it can be dropped into
// lib/ and unit-tested in isolation.
//
// Verified against the CURRENT World Handicap System (2024 revision). This is
// NOT the pre-2020 USGA system: there is no 0.96 multiplier, no "10 of 20", and
// no Equitable Stroke Control. Rules implemented:
//   - Rule 3.1  Adjusted Gross Score via net double bogey (par + 5 before an
//               index is established)
//   - Rule 5.2a Fewer-than-20 selection table + adjustments
//   - Rule 5.3  Maximum Handicap Index of 54.0
//   - Rule 5.8  Soft cap / hard cap (dormant until 20 scores exist)
//   - Rule 5.9  Exceptional Score Reduction (-1.0 / -2.0)
//
// Comments are intentionally ASCII-only (no multi-byte characters) to stay safe
// under the oxc parser. Uses ">=" / "x" in prose instead of unicode glyphs.
// -----------------------------------------------------------------------------

// ---------- Constants ----------

const MAX_INDEX = 54.0;        // Rule 5.3
const ESTABLISH_ROUNDS = 3;    // minimum scores before any index is shown
const LOW_HI_THRESHOLD = 20;   // scores needed before caps / Low HI activate
const DAYS_365_MS = 365 * 24 * 60 * 60 * 1000;

// Round to nearest tenth (differentials and index are stored to 0.1).
const r1 = (x: number): number => Math.round(x * 10) / 10;

// ---------- Types ----------

export interface HoleInfo {
  par: number;          // par for the hole
  strokeIndex: number;  // 1..18 handicap allocation, 1 = hardest
}

export interface TeeInfo {
  courseRating: number; // e.g. 71.8
  slopeRating: number;  // 55..155
  par: number;          // total par for the 18 holes
  holes: HoleInfo[];    // length 18, in playing order (aligned with grossByHole)
}

export interface RoundInput {
  date: string;           // ISO date; used for chronological order + 365-day window
  grossByHole: number[];  // length 18, raw gross strokes, aligned with tee.holes
  tee: TeeInfo;           // rating / slope / par / holes for the tee actually played
  pcc?: number;           // Playing Conditions Calc adjustment; default 0 (see note)
}

export interface RoundResult {
  date: string;
  adjustedGross: number;
  differential: number;           // raw Score Differential (before ESR), rounded to 0.1
  wasExceptional: boolean;
  esrApplied: number;             // -1.0 / -2.0 triggered BY this round (0 if none)
  indexInEffectBefore: number | null; // official (capped) HI going into this round
  indexAfter: number | null;      // official (capped) HI after posting this round
  capApplied: "none" | "soft" | "hard";
}

export interface HandicapState {
  handicapIndex: number | null;    // current Saturday Handicap; null if < 3 rounds
  lowHandicapIndex: number | null; // established only after 20 scores
  capApplied: "none" | "soft" | "hard";
  scoresPosted: number;
  established: boolean;             // true once >= 3 rounds
  rounds: RoundResult[];           // per-round trace, chronological
}

// ---------- Course Handicap + stroke allocation ----------

// Course Handicap = Index x (Slope / 113) + (CourseRating - Par), nearest whole.
export function courseHandicap(index: number, tee: TeeInfo): number {
  return Math.round(index * (tee.slopeRating / 113) + (tee.courseRating - tee.par));
}

// Handicap strokes received on each hole for a (possibly negative) course handicap.
//   Positive CH: 1 stroke per hole in stroke-index order (SI 1 first), wrapping
//                for a 2nd/3rd stroke when CH > number of holes.
//   Negative CH (plus handicap): strokes given back starting at the EASIEST hole
//                (highest SI first). These come back as negative values, which
//                correctly lowers the net-double-bogey ceiling on those holes.
export function strokesByHole(courseHcp: number, holes: HoleInfo[]): number[] {
  const n = holes.length;
  const strokes = new Array<number>(n).fill(0);
  const bySiAsc = holes
    .map((h, i) => ({ i, si: h.strokeIndex }))
    .sort((a, b) => a.si - b.si);

  if (courseHcp >= 0) {
    for (let k = 0; k < courseHcp; k++) {
      strokes[bySiAsc[k % n].i] += 1;
    }
  } else {
    const bySiDesc = [...bySiAsc].reverse();
    const giveBack = -courseHcp;
    for (let k = 0; k < giveBack; k++) {
      strokes[bySiDesc[k % n].i] -= 1;
    }
  }
  return strokes;
}

// ---------- Adjusted Gross Score (Rule 3.1) ----------

// Cap each hole at net double bogey (par + 2 + strokes received). Before an index
// is established (indexInEffect === null), the ceiling is simply par + 5.
export function adjustedGross(round: RoundInput, indexInEffect: number | null): number {
  const { grossByHole, tee } = round;

  let caps: number[];
  if (indexInEffect === null) {
    caps = tee.holes.map((h) => h.par + 5);
  } else {
    const ch = courseHandicap(indexInEffect, tee);
    const strokes = strokesByHole(ch, tee.holes);
    caps = tee.holes.map((h, i) => h.par + 2 + strokes[i]);
  }

  let total = 0;
  for (let i = 0; i < grossByHole.length; i++) {
    total += Math.min(grossByHole[i], caps[i]);
  }
  return total;
}

// ---------- Score Differential ----------

// SD = (113 / Slope) x (AdjustedGross - CourseRating - PCC), rounded to 0.1.
export function scoreDifferential(adjGross: number, tee: TeeInfo, pcc = 0): number {
  return r1((113 / tee.slopeRating) * (adjGross - tee.courseRating - pcc));
}

// ---------- Rule 5.2a selection table ----------

// Number of differentials to average, and the adjustment, for a given count.
function selectionRule(nScores: number): { count: number; adjustment: number } {
  if (nScores >= 20) return { count: 8, adjustment: 0 };
  const table: Record<number, { count: number; adjustment: number }> = {
    3: { count: 1, adjustment: -2.0 },
    4: { count: 1, adjustment: -1.0 },
    5: { count: 1, adjustment: 0 },
    6: { count: 2, adjustment: -1.0 },
    7: { count: 2, adjustment: 0 },
    8: { count: 2, adjustment: 0 },
    9: { count: 3, adjustment: 0 },
    10: { count: 3, adjustment: 0 },
    11: { count: 3, adjustment: 0 },
    12: { count: 4, adjustment: 0 },
    13: { count: 4, adjustment: 0 },
    14: { count: 4, adjustment: 0 },
    15: { count: 5, adjustment: 0 },
    16: { count: 5, adjustment: 0 },
    17: { count: 6, adjustment: 0 },
    18: { count: 6, adjustment: 0 },
    19: { count: 7, adjustment: 0 },
  };
  return table[nScores];
}

// Average the lowest N (per the table) of the supplied ESR-adjusted differentials.
function indexFromDifferentials(adjustedDiffs: number[]): number | null {
  const n = adjustedDiffs.length;
  if (n < ESTABLISH_ROUNDS) return null;
  const rule = selectionRule(n);
  const lowest = [...adjustedDiffs].sort((a, b) => a - b).slice(0, rule.count);
  const avg = lowest.reduce((s, d) => s + d, 0) / lowest.length;
  let index = r1(avg + rule.adjustment);
  if (index > MAX_INDEX) index = MAX_INDEX;
  return index;
}

// ---------- Caps (Rule 5.8) ----------

// Given a freshly calculated index and the Low Handicap Index, apply soft/hard cap.
function applyCaps(
  rawIndex: number,
  lowHI: number | null
): { index: number; capApplied: "none" | "soft" | "hard" } {
  if (lowHI === null) return { index: rawIndex, capApplied: "none" };

  const diff = rawIndex - lowHI;
  if (diff <= 3.0) return { index: rawIndex, capApplied: "none" };

  // Soft cap: everything above +3.0 over Low HI is suppressed by 50%.
  const softIndex = lowHI + 3.0 + 0.5 * (diff - 3.0);

  // Hard cap: never more than +5.0 over Low HI.
  if (softIndex - lowHI > 5.0) {
    return { index: r1(lowHI + 5.0), capApplied: "hard" };
  }
  return { index: r1(softIndex), capApplied: "soft" };
}

// ---------- Chronological engine ----------

interface RecordEntry {
  date: string;
  ts: number;       // epoch millis for the 365-day window
  raw: number;      // raw Score Differential
  esrAdj: number;   // accumulated ESR adjustment glued to THIS entry (<= 0)
}

// Compute the full Saturday Handicap state from a set of rounds.
// Rounds are replayed in chronological order so that ESR and caps see the
// correct "index in effect" and Low Handicap Index at each step.
export function computeSaturdayHandicap(rounds: RoundInput[]): HandicapState {
  const sorted = [...rounds].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const record: RecordEntry[] = [];
  const history: { ts: number; index: number }[] = []; // finalized official indices
  let officialIndex: number | null = null;
  const results: RoundResult[] = [];

  for (const round of sorted) {
    const ts = new Date(round.date).getTime();
    const indexInEffect = officialIndex; // official (capped) HI going into this round

    // 1. Adjusted gross (par + 5 until an index exists, else net double bogey).
    const ags = adjustedGross(round, indexInEffect);

    // 2. Raw Score Differential.
    const raw = scoreDifferential(ags, round.tee, round.pcc ?? 0);

    // 3. Exceptional? Compare the differential to the index in effect.
    //    (USGA technically uses the unrounded differential for the trigger; the
    //    0.1 rounding here can only matter within 0.05 of the 7.0/10.0 edges.)
    let esrApplied = 0;
    let wasExceptional = false;
    if (indexInEffect !== null) {
      const better = indexInEffect - raw;
      if (better >= 10.0) {
        esrApplied = -2.0;
        wasExceptional = true;
      } else if (better >= 7.0) {
        esrApplied = -1.0;
        wasExceptional = true;
      }
    }

    // 4. Record this round.
    record.push({ date: round.date, ts, raw, esrAdj: 0 });

    // 5. If exceptional, apply the reduction to each of the most recent 20
    //    entries (all of them when fewer than 20 exist), including this one.
    //    Multiple exceptional scores accumulate.
    if (wasExceptional) {
      const start = Math.max(0, record.length - 20);
      for (let i = start; i < record.length; i++) {
        record[i].esrAdj += esrApplied;
      }
    }

    // 6. New raw index from the most recent 20 ESR-adjusted differentials.
    const window = record.slice(Math.max(0, record.length - 20));
    const adjustedDiffs = window.map((e) => e.raw + e.esrAdj);
    const rawIndex = indexFromDifferentials(adjustedDiffs);

    // 7. Caps. Low Handicap Index = lowest finalized index over the trailing 365
    //    days, and is only established once the player has 20 prior scores. That
    //    means caps cannot bite until round 21, by design.
    let capApplied: "none" | "soft" | "hard" = "none";
    let finalIndex = rawIndex;
    let lowHIForCap: number | null = null;

    if (history.length >= LOW_HI_THRESHOLD && rawIndex !== null) {
      const windowStart = ts - DAYS_365_MS;
      const eligible = history.filter((h) => h.ts >= windowStart);
      if (eligible.length > 0) {
        lowHIForCap = Math.min(...eligible.map((h) => h.index));
        const capped = applyCaps(rawIndex, lowHIForCap);
        finalIndex = capped.index;
        capApplied = capped.capApplied;
      }
    }

    // 8. Finalize and record history for future Low HI lookups.
    officialIndex = finalIndex;
    if (finalIndex !== null) history.push({ ts, index: finalIndex });

    results.push({
      date: round.date,
      adjustedGross: ags,
      differential: raw,
      wasExceptional,
      esrApplied,
      indexInEffectBefore: indexInEffect,
      indexAfter: finalIndex,
      capApplied,
    });
  }

  // Current Low HI for reporting (same trailing-365-day rule).
  let lowHINow: number | null = null;
  if (history.length >= LOW_HI_THRESHOLD) {
    const last = history[history.length - 1];
    const windowStart = last.ts - DAYS_365_MS;
    const eligible = history.filter((h) => h.ts >= windowStart);
    if (eligible.length > 0) lowHINow = Math.min(...eligible.map((h) => h.index));
  }

  const last = results[results.length - 1];
  return {
    handicapIndex: officialIndex,
    lowHandicapIndex: lowHINow,
    capApplied: last ? last.capApplied : "none",
    scoresPosted: record.length,
    established: record.length >= ESTABLISH_ROUNDS,
    rounds: results,
  };
}