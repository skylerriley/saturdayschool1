// Recap engine for the event-highlights story viewer.
// Pure functions only -- no React, no Supabase calls. The HighlightsModule
// feeds it event data + story_beats_history rows and persists what it returns.
//
// Selection architecture: DETECTORS -> CANDIDATE POOL -> WEIGHTED COMPOSER.
// Each detector is a pure function that inspects the round (and, for Tier-2
// detectors, cross-event player history) and emits zero or more candidates.
// The composer scores candidates (strength x surprise x recency x protagonist
// penalties) and assembles opening / middle / final slots, so the arc shape
// EMERGES from what actually happened instead of a fixed five-beat template.
//
// Win-probability replay: buildWinProbAndTotals adapts the checkpoint/simulate
// approach already written in src/WinProbabilityChart.tsx (cumulative
// Stableford totals per hole -> Monte Carlo over remaining holes). The logic
// is duplicated here rather than imported so that component stays untouched;
// keep the hole-outcome distribution in sync if it ever changes.
//
// DETERMINISM: all Monte Carlo randomness comes from a seeded PRNG
// (mulberry32, seeded on event_id), so a given event yields the same beats
// forever. The session cache is a pure optimization, and (event_id,
// angle_type) is a stable key for hide/suppression rows.
//
// VALENCE: Stableford points are the single source of truth for whether a
// hole was good or bad. The league plays with handicaps -- a gross bogey on a
// stroke hole is a NET PAR worth 2 points. gross - par must never decide
// valence or copy; it may only appear as scorecard notation (the gross
// numeral / score word for what was physically carded).
//
// COPY: no odds-speak. Win probability remains the internal selection
// mechanism, but users see points and position ("moves to 1st, two clear"),
// never percentages or moneyline figures.
//
// HARD GATE: callers must only invoke this for events where every leaderboard
// entry has entry_type === "Hole-by-Hole" (same predicate the skins card
// uses). No hole data => zero data beats.

export interface RecapPlayer {
  golferId: number;
  name: string; // full name
}

// One row per (golfer, hole) already joined through event_leaderboard.
export interface RecapHoleScore {
  golferId: number;
  hole: number;
  stableford: number;
  gross: number | null;
}

export interface BeatOddsRow {
  golferId: number;
  name: string;
  win: number; // 0-100 (internal detection only -- never rendered)
  featured: boolean;
}

export interface BeatStandingRow {
  pos: string;
  name: string;
  pts: number;
}

export interface CaptionPart {
  t: string;
  b?: boolean;
}

// Angle ids are open-ended catalog ids now (three_way, duel, wire_to_wire,
// pace_setter, charge, collapse, hold, grinder, wildcard, tough_hole,
// nemesis, redemption, out_of_character, rivalry, final). They flow into
// story_beats_history.angle_type so the recency penalty acts across the
// whole catalog -- and so hidden rows can suppress a specific angle.
export interface DataBeat {
  angle: string;
  hole: number | null; // null => FINAL or a whole-round character beat
  throughHole?: number; // opening beats only ("Through N" subtext)
  subtext?: string; // overrides the Hole X | Par Y line (whole-round beats)
  kicker: string; // legacy uppercase label (mapped from heroLabel)
  title: string; // legacy header line (mapped from eyebrow)
  heroLabel: string; // chapter name shown large: "The Charge", "Final", ...
  eyebrow: string; // small top-left line: "Joe catches fire"
  holeMeta?: { hole: number; par: number; yards: number | null } | null;
  preview: string; // short rail label, ~3 words
  protagonistId: number | null; // null => field-wide
  protagonistName?: string;
  protagonistInitials?: string;
  // Protagonist score on that hole. points is the valence; gross/par exist
  // for scorecard notation only.
  score?: { gross: number; par: number; points: number } | null;
  // DEPRECATED payloads -- kept for type compat, nothing emits them anymore
  // (they rendered raw win percentages, which is odds-speak).
  odds?: BeatOddsRow[];
  swing?: { name: string; from: number; to: number }[];
  finalStandings?: BeatStandingRow[];
  // viz payloads (a beat renders whichever it carries):
  ptsPanel?: { label: string; cols: { name: string; value: string; dir?: "up" | "dn" }[] };
  scoreRow?: {
    cells: { gross: number; par: number; points: number | null; label: string; highlight?: boolean }[];
    avgLabel: string;
    avgValue: string;
  };
  streak?: { cells: { hole: number; gross: number; par: number; points: number }[]; focusStart: number; focusCount: number };
  scorecard?: { name: string; totalPoints: number; holes: { gross: number; par: number }[] };
  fieldBars?: { label: string; value: number; color: string }[];
  weekBars?: { label: string; value: number; text?: string; highlight?: boolean }[];
  h2h?: { name: string; color: string; points: number[] }[];
  caption: CaptionPart[];
  strength: number;
  mood: "warm" | "fall" | "expo" | "cool"; // background tint in the viewer
}

export interface BeatHistoryRow {
  event_id: number;
  angle_type: string;
  protagonist_id: number | null;
  hole?: number | null; // hole the beat anchored on (null => whole-round/field)
  // Recency rank among prior events: 0 = the event immediately before this
  // one, 1 = two events back, ... Used for hard cooldowns and angle decay.
  // The caller assigns this from event ordering; when absent the composer
  // treats all rows as "1 event ago" (legacy behaviour).
  eventsAgo?: number;
}

// -- Seeded PRNG ---------------------------------------------------------------
// mulberry32: tiny, fast, good-enough distribution for a 600-trial Monte
// Carlo. Seeding on event_id makes the whole recap deterministic.
function mulberry32(seed: number): () => number {
  let a = (seed ^ 0x9e3779b9) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// -- Win-probability replay (mirrors WinProbabilityChart.simulate) -----------
const TRIALS = 600;

function simulate(currentTotals: number[], holesLeft: number, rng: () => number): number[] {
  const wins = new Array(currentTotals.length).fill(0);
  for (let t = 0; t < TRIALS; t++) {
    const finals = currentTotals.map((total) => {
      let extra = 0;
      for (let h = 0; h < holesLeft; h++) {
        const r = rng();
        extra += r < 0.12 ? 0 : r < 0.48 ? 1 : r < 0.78 ? 2 : r < 0.92 ? 3 : 4;
      }
      return total + extra;
    });
    const best = Math.max(...finals);
    const winners = finals.map((s, i) => (s === best ? i : -1)).filter((i) => i >= 0);
    winners.forEach((i) => (wins[i] += 1 / winners.length));
  }
  return wins.map((w) => Math.round((w / TRIALS) * 100));
}

// series[playerIdx][h] = win % after hole h; totalsSeries[playerIdx][h] =
// cumulative Stableford points after hole h (h = 0 .. maxHole). The totals
// are exposed from the same pass rather than recomputed elsewhere.
export function buildWinProbAndTotals(
  players: RecapPlayer[],
  scores: RecapHoleScore[],
  maxHole: number,
  seed = 1,
): { series: number[][]; totalsSeries: number[][] } {
  const rng = mulberry32(seed);
  const n = players.length;
  const byPlayerHole: Record<string, number> = {};
  scores.forEach((s) => { byPlayerHole[s.golferId + "|" + s.hole] = s.stableford; });

  const series: number[][] = Array.from({ length: n }, () => []);
  const totalsSeries: number[][] = Array.from({ length: n }, () => []);
  const totals = new Array(n).fill(0);
  for (let h = 0; h <= maxHole; h++) {
    if (h > 0) {
      players.forEach((p, i) => { totals[i] += byPlayerHole[p.golferId + "|" + h] ?? 0; });
    }
    totals.forEach((t, i) => totalsSeries[i].push(t));
    const probs = simulate(totals, 18 - h, rng);
    probs.forEach((prob, i) => series[i].push(prob));
  }
  return { series, totalsSeries };
}

// Back-compat wrapper (series only).
export function buildWinProbSeries(players: RecapPlayer[], scores: RecapHoleScore[], maxHole: number, seed = 1): number[][] {
  return buildWinProbAndTotals(players, scores, maxHole, seed).series;
}

// -- Cross-event player history (Tier-2 detector fuel) ------------------------
export interface PlayerHistoryEntry {
  golferId: number;
  recentPoints: number[]; // prior events' totals, chronological, most recent last
  recentDates: string[]; // event date per recentPoints entry (YYYY-MM-DD), parallel
  mean: number;
  std: number;
  // Per-hole aggregates are SAME-COURSE ONLY (when holeStatsEventIds is
  // provided): pooling "hole 16" across different courses is meaningless.
  // Points-level baselines above stay cross-course on purpose -- a player's
  // season form is course-independent.
  holeGrossByEvent: Record<number, number[]>; // per hole: gross by prior event, chronological
  holePointsByEvent: Record<number, (number | null)[]>; // parallel stableford points (null when unknown)
  holeDatesByEvent: Record<number, string[]>; // parallel event dates (YYYY-MM-DD)
  holeAverages: Record<number, number>; // avg gross per hole (>=3 samples only)
  weeksAbsent: number; // completed events since the player last posted a round
}

// The field's historical baseline on this course -- the yardstick that makes
// "nemesis" a personal story instead of a restatement of "this hole is hard".
export interface FieldHoleBaseline {
  // hole -> mean stableford points the FIELD scored there in prior rounds
  meanPointsAt: Record<number, number>;
  // mean stableford points per hole across ALL holes/players (the overall
  // scoring level, used to subtract out "this player is just better/worse")
  overallMeanPoints: number;
  samplesAt: Record<number, number>;
}

export function buildFieldHoleBaseline(args: {
  eventId: number;
  allEvents: { event_id: number; date: string }[];
  priorHoleRows: { golfer_id: number; event_id: number; hole: number; gross: number; points?: number | null }[];
  holeStatsEventIds?: number[];
}): FieldHoleBaseline {
  const ordered = [...args.allEvents].sort((a, b) => a.date.localeCompare(b.date));
  const eventOrder: Record<number, number> = {};
  ordered.forEach((e, i) => { eventOrder[e.event_id] = i; });
  const targetOrder = eventOrder[args.eventId];
  const eligible = args.holeStatsEventIds ? new Set(args.holeStatsEventIds) : null;
  const sums: Record<number, number> = {};
  const counts: Record<number, number> = {};
  let allSum = 0, allCount = 0;
  if (targetOrder != null) {
    args.priorHoleRows.forEach((r) => {
      if (r.points == null) return;
      if (eventOrder[r.event_id] == null || eventOrder[r.event_id] >= targetOrder) return;
      if (eligible != null && !eligible.has(r.event_id)) return;
      sums[r.hole] = (sums[r.hole] || 0) + r.points;
      counts[r.hole] = (counts[r.hole] || 0) + 1;
      allSum += r.points; allCount += 1;
    });
  }
  const meanPointsAt: Record<number, number> = {};
  Object.keys(counts).forEach((h) => { meanPointsAt[Number(h)] = sums[Number(h)] / counts[Number(h)]; });
  return { meanPointsAt, overallMeanPoints: allCount ? allSum / allCount : 0, samplesAt: counts };
}

export function buildPlayerHistories(args: {
  eventId: number;
  playerIds: number[];
  allEvents: { event_id: number; date: string }[]; // completed, any order
  allTotals: { event_id: number; golfer_id: number; total: number }[];
  priorHoleRows: { golfer_id: number; event_id: number; hole: number; gross: number; points?: number | null }[];
  // Event ids eligible for per-hole aggregates (same course as the target
  // event). Omitted => all prior events qualify (legacy behavior).
  holeStatsEventIds?: number[];
}): Record<number, PlayerHistoryEntry> {
  const ordered = [...args.allEvents].sort((a, b) => a.date.localeCompare(b.date));
  const eventOrder: Record<number, number> = {};
  const eventDate: Record<number, string> = {};
  ordered.forEach((e, i) => { eventOrder[e.event_id] = i; eventDate[e.event_id] = e.date; });
  const targetOrder = eventOrder[args.eventId];
  if (targetOrder == null) return {};
  const holeEligible = args.holeStatsEventIds ? new Set(args.holeStatsEventIds) : null;

  const out: Record<number, PlayerHistoryEntry> = {};
  for (const gid of args.playerIds) {
    const prior = args.allTotals
      .filter((t) => t.golfer_id === gid && eventOrder[t.event_id] != null && eventOrder[t.event_id] < targetOrder && t.total != null)
      .sort((a, b) => eventOrder[a.event_id] - eventOrder[b.event_id]);
    const recentPoints = prior.map((t) => t.total);
    const recentDates = prior.map((t) => eventDate[t.event_id] || "");
    const mean = recentPoints.length ? recentPoints.reduce((a, b) => a + b, 0) / recentPoints.length : 0;
    const variance = recentPoints.length > 1
      ? recentPoints.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (recentPoints.length - 1)
      : 0;
    const lastPlayedOrder = prior.length ? eventOrder[prior[prior.length - 1].event_id] : -1;
    const weeksAbsent = prior.length ? targetOrder - lastPlayedOrder - 1 : 0;

    const holeGrossByEvent: Record<number, number[]> = {};
    const holePointsByEvent: Record<number, (number | null)[]> = {};
    const holeDatesByEvent: Record<number, string[]> = {};
    args.priorHoleRows
      .filter((r) => r.golfer_id === gid
        && eventOrder[r.event_id] != null && eventOrder[r.event_id] < targetOrder
        && r.gross != null
        && (holeEligible == null || holeEligible.has(r.event_id)))
      .sort((a, b) => eventOrder[a.event_id] - eventOrder[b.event_id])
      .forEach((r) => {
        (holeGrossByEvent[r.hole] ||= []).push(r.gross);
        (holePointsByEvent[r.hole] ||= []).push(r.points ?? null);
        (holeDatesByEvent[r.hole] ||= []).push(eventDate[r.event_id] || "");
      });
    const holeAverages: Record<number, number> = {};
    Object.entries(holeGrossByEvent).forEach(([h, arr]) => {
      if (arr.length >= 3) holeAverages[Number(h)] = arr.reduce((a, b) => a + b, 0) / arr.length;
    });

    out[gid] = { golferId: gid, recentPoints, recentDates, mean, std: Math.sqrt(variance), holeGrossByEvent, holePointsByEvent, holeDatesByEvent, holeAverages, weeksAbsent };
  }
  return out;
}

// -- Phrasing ----------------------------------------------------------------
// Deterministic template variety: pick from a pool by hashing eventId+angle
// (+hole) so the same event always reads the same, but consecutive weeks
// differ. Templates consume only detector evidence -- they never re-derive.
// All phrasing is name-based; no gendered pronouns anywhere.
// SEAM: for richer phrasing, pass the selected beats (exact facts only) to the
// existing Gemini batched call (generate-event-recap pattern) and let it
// rephrase the title/caption strings ONLY -- it must never see raw data or add
// a number. Not wired in v1 (admin-only experiment).
function pick<T>(pool: T[], seed: number): T {
  return pool[Math.abs(seed) % pool.length];
}

function firstName(name: string): string {
  return (name || "").trim().split(" ")[0];
}

function initials(name: string): string {
  const parts = (name || "").trim().split(" ").filter(Boolean);
  return (parts[0]?.[0] || "") + (parts[parts.length - 1]?.[0] || "");
}

function numWord(n: number, cap = false): string {
  const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
  const out = n >= 0 && n < words.length ? words[n] : String(n);
  return cap ? out[0].toUpperCase() + out.slice(1) : out;
}

// Gross scorecard word -- notation for what was physically carded. Never use
// this to judge whether a hole was good; that is what points are for.
function scoreName(gross: number, par: number): string {
  const d = gross - par;
  if (d <= -2) return "Eagle";
  if (d === -1) return "Birdie";
  if (d === 0) return "Par";
  if (d === 1) return "Bogey";
  if (d === 2) return "Double";
  if (d === 3) return "Triple";
  return "+" + d;
}

// Net score word from Stableford points (the honest valence word).
function netName(points: number): string {
  if (points >= 4) return "eagle";
  if (points === 3) return "birdie";
  if (points === 2) return "par";
  if (points === 1) return "bogey";
  return "blow-up";
}

// "1st" / "2nd" / "3rd" ... from a 0-based rank.
function posLabel(rank0: number): string {
  const n = rank0 + 1;
  const r10 = n % 10, r100 = n % 100;
  const suf = r10 === 1 && r100 !== 11 ? "st" : r10 === 2 && r100 !== 12 ? "nd" : r10 === 3 && r100 !== 13 ? "rd" : "th";
  return n + suf;
}

function plural(n: number, word: string): string {
  return n === 1 ? word : word + "s";
}

// "2026-06-14" -> "Jun 14". Chart axis labels must be REAL event dates, not
// computed "Wk -N" offsets (an offset is derived state leaking to the UI).
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!m) return "";
  const mon = MONTHS[Number(m[2]) - 1] || "";
  return `${mon} ${Number(m[3])}`.trim();
}

// -- Round context -------------------------------------------------------------
export interface RoundContext {
  players: RecapPlayer[];
  scores: RecapHoleScore[];
  series: number[][]; // from buildWinProbAndTotals (internal selection only)
  totalsSeries: number[][]; // cumulative points per player at hole 0..maxHole
  holePars: number[];
  maxHole: number;
  finalStandings: BeatStandingRow[];
  winnerIdx: number;
  totals: number[]; // stableford total per playerIdx this event
  ranks: number[]; // 0-based finish rank per playerIdx (ties share the lower rank)
  grossAt: Record<string, number | null>; // "golferId|hole"
  pointsAt: Record<string, number>; // "golferId|hole" -> stableford points
  fieldMeanAt: number[]; // mean stableford across the field per hole (index hole-1)
  yardsFor: (golferId: number | null, hole: number) => number | null;
  history: Record<number, PlayerHistoryEntry>; // {} when unavailable
  // The field's historical per-hole baseline on this course. Lets nemesis ask
  // "is this hole hard FOR THIS PLAYER" rather than "is this hole hard".
  fieldBaseline: FieldHoleBaseline;
}

export interface BeatCandidate {
  angle: string;
  slot: "opening" | "middle" | "final";
  protagonistId: number | null;
  hole: number | null;
  strength: number; // 0..1
  surprise: number; // 0..1
  evidence: Record<string, unknown>;
  build(ctx: RoundContext, seed: number): DataBeat;
}

export type Detector = (ctx: RoundContext) => BeatCandidate[];

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// ---- GOVERNING PRINCIPLE FOR SELECTION (do not optimize this away) ----------
// Narrative weight AT THE MOMENT is not the same as contribution to the final
// result. The Round 1 leader gets airtime even though the lead rarely
// survives; a player who was the man to beat through 6 and finished 8th is
// not a non-story -- he is a DIFFERENT story with an arc. Ranking beats by
// their effect on the FINAL win probability makes such players
// mathematically invisible, and it mechanically favors late holes (a fixed
// points swing moves win probability by ~1/sqrt(holesRemaining), so hole 17
// out-scores identical golf on hole 6 by ~3.5x). Therefore:
//   - MERIT beats (charge, hold, fast_start, fade, and any scoring beat)
//     rank on FIELD-RELATIVE STABLEFORD POINTS at the moment they happened --
//     position-independent by construction.
//   - Exactly ONE odds-driven beat remains: collapse / the turning point.
//     The hole that genuinely decided it usually IS late; saying so is
//     honest. The bug was every beat inheriting that bias.
// ------------------------------------------------------------------------------

// Field-relative merit: how much better than the field's average this player
// scored on a hole. A great hole on 4 ranks identically to the same great
// hole on 16.
function holeMerit(ctx: RoundContext, playerIdx: number, hole: number): number {
  const pts = ctx.pointsAt[ctx.players[playerIdx].golferId + "|" + hole];
  if (pts == null) return 0;
  return pts - (ctx.fieldMeanAt[hole - 1] ?? 0);
}

function spanMerit(ctx: RoundContext, playerIdx: number, h1: number, h2: number): number {
  let m = 0;
  for (let h = h1; h <= h2; h++) m += holeMerit(ctx, playerIdx, h);
  return m;
}

// Maximal contiguous stretches where the player scored >= 2 points per hole.
function scoringStretches(ctx: RoundContext, playerIdx: number, from: number, to: number): { s: number; e: number }[] {
  const gid = ctx.players[playerIdx].golferId;
  const out: { s: number; e: number }[] = [];
  let s = -1;
  for (let h = from; h <= to + 1; h++) {
    const pts = h <= to ? ctx.pointsAt[gid + "|" + h] : null;
    if (pts != null && pts >= 2) {
      if (s < 0) s = h;
    } else {
      if (s > 0) out.push({ s, e: h - 1 });
      s = -1;
    }
  }
  return out;
}

// Earliest hole from which a player never trails again (points margin >= 0
// through the finish); -1 if they trail at the end.
function permanentLeadOnset(ctx: RoundContext, playerIdx: number): number {
  let onset = -1;
  for (let h = 1; h <= ctx.maxHole; h++) {
    if (marginAt(ctx, h, playerIdx) < 0) { onset = -1; continue; }
    if (onset < 0) onset = h;
  }
  return onset;
}

function biggestGainer(players: RecapPlayer[], series: number[][], hole: number, excludeIdx: number): RecapPlayer | null {
  let best = -1, bestIdx = -1;
  players.forEach((_, i) => {
    if (i === excludeIdx) return;
    const d = series[i][hole] - series[i][hole - 1];
    if (d > best) { best = d; bestIdx = i; }
  });
  return best > 0 ? players[bestIdx] : null;
}

function scoreAt(ctx: RoundContext, golferId: number, hole: number): { gross: number; par: number; points: number } | null {
  const gross = ctx.grossAt[golferId + "|" + hole];
  const par = ctx.holePars[hole - 1];
  const points = ctx.pointsAt[golferId + "|" + hole];
  return gross != null && par != null && points != null ? { gross, par, points } : null;
}

function holeMetaFor(ctx: RoundContext, hole: number, golferId: number | null): DataBeat["holeMeta"] {
  const par = ctx.holePars[hole - 1];
  if (par == null) return null;
  return { hole, par, yards: ctx.yardsFor(golferId, hole) };
}

// 0-based ranks (ties share the lower rank) from cumulative points at a hole.
function ranksAt(ctx: RoundContext, hole: number): number[] {
  const t = ctx.players.map((_, i) => ctx.totalsSeries[i][hole]);
  const sorted = [...t].sort((a, b) => b - a);
  return t.map((v) => sorted.indexOf(v));
}

// Points margin of playerIdx over the best of the rest at a hole.
function marginAt(ctx: RoundContext, hole: number, playerIdx: number): number {
  let bestOther = -Infinity;
  ctx.players.forEach((_, i) => {
    if (i !== playerIdx) bestOther = Math.max(bestOther, ctx.totalsSeries[i][hole]);
  });
  return ctx.totalsSeries[playerIdx][hole] - (bestOther === -Infinity ? 0 : bestOther);
}

// How many players SHARE playerIdx's cumulative points at a hole (>=1; 1
// means alone). "hole == null" reads final totals.
function tieGroupSizeAt(ctx: RoundContext, hole: number | null, playerIdx: number): number {
  const val = hole == null ? ctx.totals[playerIdx] : ctx.totalsSeries[playerIdx][hole];
  let n = 0;
  ctx.players.forEach((_, i) => {
    const v = hole == null ? ctx.totals[i] : ctx.totalsSeries[i][hole];
    if (v === val) n++;
  });
  return n;
}

// ---- Tie-aware position phrasing (data-honesty helper) -----------------------
// EVERY assertion of a player's position must route through this. Stating
// "XYZ has the lead" when the top is a four-way tie is a FALSE statement, not
// just awkward -- it belongs with the par-mismatch class of bug. Returns copy
// that is always true of the actual standings.
//   rank 0 solo   -> "leads" / "the lead"
//   rank 0 tied   -> "is tied for the lead with N others"
//   rank r solo   -> "sits 3rd"
//   rank r tied   -> "is tied for 3rd"
function standingPhrase(ctx: RoundContext, hole: number | null, playerIdx: number, fn: string): {
  // A complete clause: "Joe leads" / "Joe is tied for the lead with two others".
  clause: string;
  // Just the position noun for slotting: "the lead" / "a share of the lead" / "3rd".
  noun: string;
  tied: boolean;
  rank0: number;
} {
  const rank0 = hole == null ? ctx.ranks[playerIdx] : ranksAt(ctx, hole)[playerIdx];
  const others = tieGroupSizeAt(ctx, hole, playerIdx) - 1;
  const tied = others > 0;
  if (rank0 === 0) {
    if (!tied) return { clause: `${fn} leads`, noun: "the lead", tied: false, rank0 };
    return {
      clause: `${fn} is tied for the lead with ${numWord(others)} ${plural(others, "other")}`,
      noun: "a share of the lead",
      tied: true, rank0,
    };
  }
  const pl = posLabel(rank0);
  if (!tied) return { clause: `${fn} sits ${pl}`, noun: pl, tied: false, rank0 };
  return { clause: `${fn} is tied for ${pl}`, noun: `a share of ${pl}`, tied: true, rank0 };
}

// Tie-aware "leads by N" -- returns null when there is nothing true to say
// (a tie for the lead has no positive margin). Otherwise the margin phrase.
function leadByPhrase(ctx: RoundContext, hole: number, playerIdx: number, fn: string): string | null {
  const m = marginAt(ctx, hole, playerIdx);
  const rank0 = ranksAt(ctx, hole)[playerIdx];
  if (rank0 !== 0 || m < 1) return null; // not leading, or tied at the top
  return `${fn} leads by ${numWord(m)} ${plural(m, "point")}`;
}

// Standings panel at a hole: top rows by cumulative points, with any featured
// players forced in (mockup's "Thru 17" glass panel).
function ptsPanelAt(
  ctx: RoundContext,
  hole: number,
  label: string,
  feature?: { idx: number; dir?: "up" | "dn" }[],
  cap = 3,
): NonNullable<DataBeat["ptsPanel"]> {
  const all = ctx.players.map((p, i) => ({ i, name: firstName(p.name), pts: ctx.totalsSeries[i][hole] }));
  all.sort((a, b) => b.pts - a.pts);
  let rows = all.slice(0, cap);
  (feature || []).forEach((f) => {
    if (!rows.some((r) => r.i === f.idx)) {
      rows = rows.slice(0, Math.max(1, cap - 1));
      const row = all.find((r) => r.i === f.idx);
      if (row) rows.push(row);
    }
  });
  rows.sort((a, b) => b.pts - a.pts);
  const dirFor = (i: number) => (feature || []).find((f) => f.idx === i)?.dir;
  return { label, cols: rows.map((r) => ({ name: r.name, value: `${r.pts} pts`, dir: dirFor(r.i) })) };
}

// One sentence describing a hole's score honestly: gross word for notation,
// points for valence, with the stroke explained when they differ.
// "Joe strokes on 17, so a bogey nets par -- 2 points." /
// "A birdie on 13 is worth 3 points."
function scoreSentence(fn: string, hole: number, sc: { gross: number; par: number; points: number }): CaptionPart[] {
  const grossWord = scoreName(sc.gross, sc.par).toLowerCase();
  const netDiff = sc.points >= 4 ? -2 : sc.points === 3 ? -1 : sc.points === 2 ? 0 : sc.points === 1 ? 1 : 2;
  const gotStrokes = sc.gross - sc.par > netDiff;
  if (gotStrokes && sc.points >= 2) {
    return [
      { t: `${fn} strokes on ${hole}, so a ${grossWord} nets ` },
      { t: `${netName(sc.points)} -- ${sc.points} points`, b: true },
      { t: ". " },
    ];
  }
  return [
    { t: `A ${grossWord} on ${hole} is worth ` },
    { t: `${sc.points} ${plural(sc.points, "point")}`, b: true },
    { t: ". " },
  ];
}

// cumulative stableford points per hole for one player (momentum lines)
function cumulativePoints(ctx: RoundContext, playerIdx: number, throughHole: number): number[] {
  return ctx.totalsSeries[playerIdx].slice(1, throughHole + 1);
}

const H2H_COLORS = ["#eda100", "#1baf7a"];

// Shared identity fields for a beat (keeps kicker/title mapped for the legacy
// viewer until it reads heroLabel/eyebrow directly).
function beatHead(angle: string, heroLabel: string, eyebrow: string) {
  return { angle, heroLabel, eyebrow, kicker: heroLabel.toUpperCase(), title: eyebrow };
}

// ===== DETECTORS ===============================================================

// -- Tier 1: openings ----------------------------------------------------------
// The opening is DETECTED, not computed: each opening detector scans the
// early window (holes 3-9) for the hole where its story is most true, so the
// opening lands on 4 some weeks and 8 others instead of always floor(18/3).

const OPEN_LO = 3;
const openHi = (ctx: RoundContext) => Math.min(9, ctx.maxHole);

// Points leaderboard at a hole: player indices sorted by cumulative points.
function orderAt(ctx: RoundContext, hole: number): number[] {
  return ctx.players.map((_, i) => i).sort((a, b) => ctx.totalsSeries[b][hole] - ctx.totalsSeries[a][hole]);
}

const detectThreeWay: Detector = (ctx) => {
  if (ctx.players.length < 3 || ctx.maxHole < OPEN_LO) return [];
  // Pick the early hole where bunching is most NOTABLE: everyone is
  // trivially level on hole 3, so weight the bunched count by how deep into
  // the round it persists (near * h), not by raw spread.
  let open = OPEN_LO, bestInterest = -Infinity;
  for (let h = OPEN_LO; h <= openHi(ctx); h++) {
    const lead = Math.max(...ctx.players.map((_, i) => ctx.totalsSeries[i][h]));
    const nearH = ctx.players.filter((_, i) => lead - ctx.totalsSeries[i][h] <= 2).length;
    const interest = nearH * h;
    if (interest > bestInterest) { bestInterest = interest; open = h; }
  }
  const ord = orderAt(ctx, open);
  const bestSpread = ctx.totalsSeries[ord[0]][open] - ctx.totalsSeries[ord[2]][open];
  const leadPts = ctx.totalsSeries[ord[0]][open];
  const near = ctx.players.filter((_, i) => leadPts - ctx.totalsSeries[i][open] <= 2).length;
  // Fires as the tight-race opening when >=3 are bunched; also serves as the
  // low-strength fallback so the opening slot is never empty.
  const bunched = near >= 3;
  return [{
    angle: "three_way",
    slot: "opening",
    protagonistId: null,
    hole: open,
    strength: bunched ? clamp01(1 - bestSpread / 5) : 0.15,
    surprise: 0.4,
    evidence: { open, near, spread: bestSpread },
    build: (c, seed) => {
      const leaderIdx = orderAt(c, open)[0];
      const leadFn = firstName(c.players[leaderIdx].name);
      const nearPts = near - 1; // exclude the leader
      const sp = standingPhrase(c, open, leaderIdx, leadFn);
      const eyebrow = bunched
        ? pick([
            `A ${numWord(Math.min(near, 5))}-way race takes shape`,
            "Everyone is still in this one",
            "The leaderboard is a logjam early",
            "Nobody blinks through the opening stretch",
          ], seed)
        : pick(["The race takes shape", "An early feel-out round", "The field settles in"], seed + 1);
      // Tie-aware: never assert "leads" when the top is shared.
      const caption: CaptionPart[] = sp.tied
        ? [
            { t: `${sp.clause} through ${open}`, b: true },
            { t: ", with the field still finding its footing." },
          ]
        : nearPts >= 2
          ? [
              { t: `${leadFn} leads through ${open}, and ` },
              { t: `${numWord(nearPts)} golfers sit within two points`, b: true },
              { t: " of the lead." },
            ]
          : [
              { t: `${leadFn} leads through ${open}`, b: true },
              { t: ", and the field is still finding its footing." },
            ];
      return {
        ...beatHead("three_way", "The Opening", eyebrow),
        hole: open, throughHole: open,
        preview: bunched ? `${numWord(Math.min(near, 5), true)}-Way Race` : "The Opening",
        protagonistId: null,
        ptsPanel: ptsPanelAt(c, open, `Thru ${open}`),
        caption,
        strength: 0, mood: "expo",
      };
    },
  }];
};

const detectDuel: Detector = (ctx) => {
  if (ctx.players.length < 3 || ctx.maxHole < OPEN_LO) return [];
  // Pick the early hole where two players have most clearly separated from
  // the pack: tiny 1st-2nd gap, big 2nd-3rd gap (all in points).
  // Two leaders who have genuinely SEPARATED from the field.
  //
  // Probed against the real fixture, and the numbers rewrote this detector:
  //   - Over holes 3-9 the best gap-to-third (with a tight 1st-2nd gap) was
  //     [1,0,1,2,1,1,2] across 7 events -- a 3+ point gap NEVER happens early,
  //     so the old "opening duel" could only ever fire on noise.
  //   - Over the WHOLE round, a pair holding the top two with a >=3 point
  //     cushion never survives even 2 consecutive holes (max run [1,0,0,1,0,0,0]).
  //     In this league a 3-point cushion two-horse race does not exist.
  //   - At a 2-point cushion the longest runs are [2,1,0,6,1,0,2].
  //
  // So: cushion >= 2 (one hole of separation), but it must be SUSTAINED for
  // >= 4 consecutive holes. Duration is what proves the 2 points is real
  // separation rather than a single-hole blip -- a pair clear of the field
  // for six straight holes (event 302) is a duel a member would recognise;
  // the same gap for one hole is noise. Rarity here is honest.
  const DUEL_MIN_CUSHION = 2;
  const DUEL_MIN_HOLES = 4;
  let run: { s: number; aIdx: number; bIdx: number } | null = null;
  let best: { h: number; aIdx: number; bIdx: number; g23: number; len: number } | null = null;
  for (let h = OPEN_LO; h <= ctx.maxHole; h++) {
    const ord = orderAt(ctx, h);
    const t = (i: number) => ctx.totalsSeries[ord[i]][h];
    const g12 = t(0) - t(1);
    const g23 = t(1) - t(2);
    const pairOk = g12 <= 2 && g23 >= DUEL_MIN_CUSHION;
    const samePair = run && ((run.aIdx === ord[0] && run.bIdx === ord[1]) || (run.aIdx === ord[1] && run.bIdx === ord[0]));
    if (pairOk && samePair) {
      const len = h - run!.s + 1;
      if (len >= DUEL_MIN_HOLES && (!best || len > best.len)) best = { h, aIdx: ord[0], bIdx: ord[1], g23, len };
    } else if (pairOk) {
      run = { s: h, aIdx: ord[0], bIdx: ord[1] };
    } else {
      run = null;
    }
  }
  if (!best) return [];
  const b = best;
  return [{
    angle: "duel",
    // A sustained two-horse race is a shape the whole round has, not a
    // snapshot of the opening -- so it competes as a middle beat.
    slot: "middle",
    protagonistId: ctx.players[b.aIdx].golferId,
    hole: null,
    strength: clamp01(b.len / 10 + b.g23 / 12),
    surprise: 0.5,
    evidence: { a: ctx.players[b.aIdx].name, b: ctx.players[b.bIdx].name, throughHole: b.h, holes: b.len, cushion: b.g23, fromHole: b.h - b.len + 1 },
    build: (c, seed) => {
      const fa = firstName(c.players[b.aIdx].name);
      const fb = firstName(c.players[b.bIdx].name);
      const aPts = c.totalsSeries[b.aIdx][b.h];
      const bPts = c.totalsSeries[b.bIdx][b.h];
      return {
        ...beatHead("duel", "The Duel", pick([
          `${fa} and ${fb} leave the field behind`,
          `A two-horse race`,
          `${fa} vs ${fb}, and daylight behind them`,
          `Two golfers separate from the pack`,
        ], seed)),
        hole: null,
        subtext: "Head to head",
        preview: `${fa} vs ${fb}`,
        protagonistId: c.players[b.aIdx].golferId,
        protagonistName: c.players[b.aIdx].name,
        protagonistInitials: initials(c.players[b.aIdx].name),
        h2h: [
          { name: fa, color: H2H_COLORS[0], points: cumulativePoints(c, b.aIdx, c.maxHole) },
          { name: fb, color: H2H_COLORS[1], points: cumulativePoints(c, b.bIdx, c.maxHole) },
        ],
        caption: [
          { t: `From hole ${b.h - b.len + 1} to ${b.h} it is a two-player fight -- ` },
          { t: `${fa} on ${aPts} points, ${fb} on ${bPts}`, b: true },
          { t: `, with the rest of the field ${numWord(b.g23)} ${plural(b.g23, "point")} back.` },
        ],
        strength: 0, mood: "expo",
      };
    },
  }];
};

const detectWireToWire: Detector = (ctx) => {
  const w = ctx.winnerIdx;
  if (ctx.maxHole < 9) return [];
  // Points-based wire-to-wire: the winner never trails from early on and
  // wins clear. The opening lands where the permanent lead began. The
  // caption claims the lead "never gets threatened", so the late margin
  // must actually stay clear -- a lead that hit level ground is a hold
  // story, not this one.
  const onset = permanentLeadOnset(ctx, w);
  if (onset < 0 || onset > 4) return [];
  const finalM = marginAt(ctx, ctx.maxHole, w);
  if (finalM < 1) return [];
  for (let h = 10; h <= ctx.maxHole; h++) {
    if (marginAt(ctx, h, w) < 1) return [];
  }
  const open = Math.max(OPEN_LO, onset);
  return [{
    angle: "wire_to_wire",
    slot: "opening",
    protagonistId: ctx.players[w].golferId,
    hole: open,
    strength: clamp01(0.45 + finalM / 10 + (5 - onset) * 0.03),
    surprise: 0.3,
    evidence: { winner: ctx.players[w].name, onset, finalM },
    build: (c, seed) => {
      const fn = firstName(c.players[w].name);
      const lead = leadByPhrase(c, open, w, fn);
      const caption: CaptionPart[] = lead
        ? [
            { t: `${lead}`, b: true },
            { t: ` after ${open} holes, and the lead never gets threatened.` },
          ]
        : [
            { t: `${fn} shares the top spot`, b: true },
            { t: ` after ${open} holes, then pulls clear and never looks back.` },
          ];
      return {
        ...beatHead("wire_to_wire", "Wire to Wire", pick([
          `${fn} grabs this one early`,
          `${fn} is in control from the jump`,
          `${fn} leaves no doubt early`,
          `${fn} sets the tone immediately`,
        ], seed)),
        hole: open, throughHole: open,
        preview: "Wire to Wire",
        protagonistId: c.players[w].golferId,
        protagonistName: c.players[w].name,
        protagonistInitials: initials(c.players[w].name),
        ptsPanel: ptsPanelAt(c, open, `Thru ${open}`, [{ idx: w, dir: "up" }]),
        caption,
        strength: 0, mood: "expo",
      };
    },
  }];
};

const detectPaceSetter: Detector = (ctx) => {
  if (ctx.players.length < 2 || ctx.maxHole < OPEN_LO) return [];
  // Pick the early hole where a leader's points margin over the field peaked.
  let open = -1, bestM = -Infinity, leadIdx = -1;
  for (let h = OPEN_LO; h <= openHi(ctx); h++) {
    const li = orderAt(ctx, h)[0];
    const m = marginAt(ctx, h, li);
    if (m > bestM) { bestM = m; open = h; leadIdx = li; }
  }
  if (bestM < 2) return [];
  // A winner who led wire-to-wire is that story, not this one.
  if (leadIdx === ctx.winnerIdx) {
    const onset = permanentLeadOnset(ctx, leadIdx);
    if (onset >= 0 && onset <= 4 && marginAt(ctx, ctx.maxHole, leadIdx) >= 1) return [];
  }
  const li = leadIdx, oh = open, m0 = bestM;
  return [{
    angle: "pace_setter",
    slot: "opening",
    protagonistId: ctx.players[li].golferId,
    hole: oh,
    strength: clamp01(m0 / 6),
    surprise: li === ctx.winnerIdx ? 0.35 : 0.65, // a leader who does NOT win is a story
    evidence: { leader: ctx.players[li].name, margin: m0, open: oh },
    build: (c, seed) => {
      const fn = firstName(c.players[li].name);
      // pace_setter only fires with margin >= 2, so this is always a solo
      // lead; leadByPhrase keeps that guaranteed rather than assumed.
      const lead = leadByPhrase(c, oh, li, fn) || `${fn} leads the field`;
      const caption: CaptionPart[] = [
        { t: `${lead}` },
        { t: ` through ${oh} -- now the field has to respond.` },
      ];
      return {
        ...beatHead("pace_setter", "The Pace Setter", pick([
          `${fn} sets the early pace`,
          `${fn} sprints out of the gate`,
          `${fn} opens a gap on the field`,
          `The field chases ${fn} early`,
        ], seed)),
        hole: oh, throughHole: oh,
        preview: `${fn} Sets Pace`,
        protagonistId: c.players[li].golferId,
        protagonistName: c.players[li].name,
        protagonistInitials: initials(c.players[li].name),
        ptsPanel: ptsPanelAt(c, oh, `Thru ${oh}`, [{ idx: li, dir: "up" }]),
        caption,
        strength: 0, mood: "expo",
      };
    },
  }];
};

// -- Tier 1: middles -----------------------------------------------------------

const detectCharge: Detector = (ctx) => {
  // MERIT-RANKED: a charge is a scoring stretch (consecutive >=2pt holes)
  // ranked on FIELD-RELATIVE points -- a great stretch on 3-5 ranks the same
  // as the identical stretch on 15-17. Pure early bursts (ending by hole 5)
  // belong to fast_start.
  const out: BeatCandidate[] = [];
  ctx.players.forEach((p, i) => {
    let best: { s: number; e: number; m: number } | null = null;
    scoringStretches(ctx, i, 1, ctx.maxHole).forEach((st) => {
      if (st.e <= 5) return; // fast_start territory
      if (st.e - st.s + 1 < 2) return;
      const m = spanMerit(ctx, i, st.s, st.e);
      if (!best || m > best.m) best = { ...st, m };
    });
    const bst = best as { s: number; e: number; m: number } | null;
    if (!bst || bst.m < 2.5) return;
    // Anchor on the single most notable hole of the stretch.
    let meritHole = bst.s, hm = -Infinity;
    for (let h = bst.s; h <= bst.e; h++) {
      const v = holeMerit(ctx, i, h);
      if (v > hm) { hm = v; meritHole = h; }
    }
    const stretchLen = bst.e - bst.s + 1;
    const rankBefore = bst.s > 1 ? ranksAt(ctx, bst.s - 1)[i] : 0;
    out.push({
      angle: "charge",
      slot: "middle",
      protagonistId: p.golferId,
      hole: meritHole,
      strength: clamp01(bst.m / 8),
      surprise: clamp01(0.25 + rankBefore * 0.12),
      evidence: { startHole: bst.s, endHole: bst.e, meritHole, stretchLen, merit: bst.m },
      build: (c, seed) => {
        const fn = firstName(p.name);
        const sc = scoreAt(c, p.golferId, meritHole);
        const fromRank = ranksAt(c, bst.s - 1)[i];
        const toRank = ranksAt(c, bst.e)[i];
        const movement: CaptionPart[] = bst.s > 1 && toRank < fromRank
          ? [
              { t: `${fn} climbs from ${posLabel(fromRank)} to ` },
              { t: posLabel(toRank), b: true },
              { t: ` across holes ${bst.s} to ${bst.e}.` },
            ]
          : toRank === 0
            ? [{ t: `${fn} holds ` }, { t: "1st", b: true }, { t: " through the stretch." }]
            : (() => {
                const gap = -marginAt(c, bst.e, i);
                return [{ t: `The stretch keeps ${fn} within ` }, { t: `${numWord(Math.max(gap, 1))} of the lead`, b: true }, { t: "." }];
              })();

        // Run presentation: streak strip over the scoring stretch. Long runs
        // get less surrounding context so the strip stays phone-width.
        if (stretchLen >= 3) {
          const pad = stretchLen >= 8 ? 0 : stretchLen >= 6 ? 1 : 2;
          const from = Math.max(1, bst.s - pad);
          const to = Math.min(c.maxHole, bst.e + pad);
          const cells: NonNullable<DataBeat["streak"]>["cells"] = [];
          for (let h = from; h <= to; h++) {
            const cellSc = scoreAt(c, p.golferId, h);
            if (!cellSc) { cells.length = 0; break; }
            cells.push({ hole: h, ...cellSc });
          }
          if (cells.length > 0) {
            let stretchPts = 0;
            for (let h = bst.s; h <= bst.e; h++) stretchPts += c.pointsAt[p.golferId + "|" + h] ?? 0;
            return {
              ...beatHead("charge", "The Run", pick([
                `${fn}'s best stretch of the day`,
                `${fn} strings the good holes together`,
                `${fn} finds a gear nobody else has`,
                `${fn} rattles off the run of the day`,
              ], seed + bst.s)),
              hole: meritHole,
              subtext: `Holes ${bst.s}-${bst.e}`,
              preview: `${fn}'s Run`,
              protagonistId: p.golferId, protagonistName: p.name, protagonistInitials: initials(p.name),
              holeMeta: holeMetaFor(c, meritHole, p.golferId),
              score: sc,
              streak: { cells, focusStart: bst.s - from, focusCount: stretchLen },
              caption: [
                { t: `${numWord(stretchLen, true)} holes, ` },
                { t: `${stretchPts} points`, b: true },
                { t: ` -- every one a net par or better. ` },
                ...movement,
              ],
              strength: 0, mood: "warm",
            };
          }
        }

        return {
          ...beatHead("charge", "The Charge", pick([
            `${fn} makes a move`,
            `${fn} catches fire`,
            `The ${fn} charge is on`,
            `${fn} climbs into the fight`,
          ], seed + meritHole)),
          hole: meritHole,
          preview: `${fn}'s Move`,
          protagonistId: p.golferId, protagonistName: p.name, protagonistInitials: initials(p.name),
          holeMeta: holeMetaFor(c, meritHole, p.golferId),
          score: sc,
          ptsPanel: ptsPanelAt(c, bst.e, `Thru ${bst.e}`, [{ idx: i, dir: "up" }]),
          caption: [
            ...(sc ? scoreSentence(fn, meritHole, sc) : [{ t: `A hot stretch runs from holes ${bst.s} to ${bst.e}. ` }]),
            ...movement,
          ],
          strength: 0, mood: "warm",
        };
      },
    });
  });
  return out;
};

const detectCollapse: Detector = (ctx) => {
  let best: { i: number; h: number; d: number } | null = null;
  ctx.players.forEach((p, i) => {
    for (let h = 1; h <= ctx.maxHole; h++) {
      const d = ctx.series[i][h] - ctx.series[i][h - 1];
      // Only a hole the protagonist actually played badly (<= 1 point)
      // qualifies -- a win-prob drop while netting par is a rival's story.
      const pts = ctx.pointsAt[p.golferId + "|" + h];
      if (pts != null && pts >= 2) continue;
      if (d < 0 && ctx.series[i][h - 1] >= 15 && (!best || d < best.d)) best = { i, h, d };
    }
  });
  const b = best as { i: number; h: number; d: number } | null;
  if (!b || -b.d < 10) return [];
  const p = ctx.players[b.i];
  const winnerGained = ctx.series[ctx.winnerIdx][b.h] > ctx.series[ctx.winnerIdx][b.h - 1];
  return [{
    angle: "collapse",
    slot: "middle",
    protagonistId: p.golferId,
    hole: b.h,
    strength: clamp01(-b.d / 35 + (winnerGained ? 0.15 : 0)),
    surprise: 0.55,
    evidence: { hole: b.h },
    build: (c, seed) => {
      const fn = firstName(p.name);
      const sc = scoreAt(c, p.golferId, b.h);
      const grossWord = sc ? scoreName(sc.gross, sc.par).toLowerCase() : "big number";
      const ptsWord = sc ? (sc.points === 1 ? "one point" : "zero points") : "nothing";
      const gainer = biggestGainer(c.players, c.series, b.h, b.i);
      const rb = ranksAt(c, b.h - 1)[b.i];
      const ra = ranksAt(c, b.h)[b.i];
      const movement: CaptionPart[] = ra > rb
        ? [
            { t: ` ${fn} drops from ${posLabel(rb)} to ` },
            { t: posLabel(ra), b: true },
            { t: gainer ? `, and ${firstName(gainer.name)} takes advantage.` : "." },
          ]
        : rb === 0
          ? (() => {
              const ma = marginAt(c, b.h, b.i);
              return ma > 0
                ? [{ t: ` The lead shrinks to ` }, { t: `${numWord(ma)} ${plural(ma, "point")}`, b: true }, { t: "." }]
                : [{ t: ` The lead is ` }, { t: "gone", b: true }, { t: "." }];
            })()
          : [{ t: ` ${fn} hangs on to ${posLabel(ra)}, but the door is open` }, { t: gainer ? ` for ${firstName(gainer.name)}.` : "." }];
      return {
        ...beatHead("collapse", "The Turning Point", pick([
          `Hole ${b.h} bites ${fn}`,
          `A ${grossWord} stalls the ${fn} run`,
          `${fn} finds trouble on ${b.h}`,
          `The round turns on ${fn}'s ${grossWord}`,
        ], seed + b.h)),
        hole: b.h,
        preview: `${fn}'s ${sc ? scoreName(sc.gross, sc.par) : "Slip"}`,
        protagonistId: p.golferId, protagonistName: p.name, protagonistInitials: initials(p.name),
        holeMeta: holeMetaFor(c, b.h, p.golferId),
        score: sc,
        ptsPanel: ptsPanelAt(c, b.h, `Thru ${b.h}`, [
          { idx: b.i, dir: "dn" },
          ...(gainer ? [{ idx: c.players.indexOf(gainer), dir: "up" as const }] : []),
        ]),
        caption: [
          { t: `A ${grossWord} nets ${fn} ` },
          { t: ptsWord, b: true },
          { t: ` -- the biggest swing of the day.` },
          ...movement,
        ],
        strength: 0, mood: "fall",
      };
    },
  }];
};

const detectHold: Detector = (ctx) => {
  // MERIT-RANKED, no late-hole gate: the winner held a lead, was seriously
  // challenged (points lead gone), and answered with a >=2pt hole that
  // restored a clear margin. Usually still late -- but earned, not forced.
  if (ctx.maxHole < 9) return [];
  const w = ctx.winnerIdx;
  const gid = ctx.players[w].golferId;
  let minMargin = Infinity, minAt = -1;
  for (let h = 6; h <= ctx.maxHole - 1; h++) {
    const m = marginAt(ctx, h, w);
    if (m < minMargin) { minMargin = m; minAt = h; }
  }
  if (minAt < 0 || minMargin > 0) return []; // never seriously challenged
  // Pressure implies having something to defend.
  let ledBefore = false;
  for (let h = 3; h < minAt; h++) { if (marginAt(ctx, h, w) >= 1) { ledBefore = true; break; } }
  if (!ledBefore) return [];
  let crossHole = -1;
  for (let h = minAt + 1; h <= ctx.maxHole; h++) {
    const pts = ctx.pointsAt[gid + "|" + h];
    if (pts != null && pts >= 2 && marginAt(ctx, h, w) >= 1) { crossHole = h; break; }
  }
  if (crossHole < 0) return [];
  const p = ctx.players[w];
  return [{
    angle: "hold",
    slot: "middle",
    protagonistId: p.golferId,
    hole: crossHole,
    strength: clamp01(0.35 + -minMargin * 0.12 + Math.max(0, holeMerit(ctx, w, crossHole)) * 0.08),
    surprise: 0.35,
    evidence: { crossHole, minMargin, minAt },
    build: (c, seed) => {
      const fn = firstName(p.name);
      const sc = scoreAt(c, p.golferId, crossHole);
      const crossM = marginAt(c, crossHole, w);
      const left = c.maxHole - crossHole;
      const opener: CaptionPart[] = minMargin < 0
        ? [{ t: `${fn} fell ${numWord(-minMargin)} ${plural(-minMargin, "point")} behind mid-round, but answers on ${crossHole}` }]
        : [{ t: `The lead vanished mid-round, but ${fn} answers on ${crossHole}` }];
      const closer: CaptionPart[] = crossM > 0
        ? [
            { t: " -- " },
            { t: `${numWord(crossM)} clear with ${left > 0 ? `${numWord(left)} to play` : "the round done"}`, b: true },
            { t: "." },
          ]
        : [{ t: " -- " }, { t: `dead level with ${numWord(Math.max(left, 1))} to play`, b: true }, { t: "." }];
      return {
        ...beatHead("hold", "Holding On", pick([
          `${fn} holds the line`,
          `${fn} slams the door`,
          `${fn} answers every challenge`,
          `${fn} steadies the ship late`,
        ], seed + crossHole)),
        hole: crossHole,
        preview: `${fn} Holds On`,
        protagonistId: p.golferId, protagonistName: p.name, protagonistInitials: initials(p.name),
        holeMeta: holeMetaFor(c, crossHole, p.golferId),
        score: sc && sc.points >= 2 ? sc : null,
        ptsPanel: ptsPanelAt(c, crossHole, `Thru ${crossHole}`, [{ idx: w, dir: "up" }]),
        caption: [...opener, ...closer],
        strength: 0, mood: "warm",
      };
    },
  }];
};

// -- New early/middle detectors (the 1-5 and 7-13 dead zones) --------------------

const detectFastStart: Detector = (ctx) => {
  // A strong opening burst, ranked on the burst itself -- NEVER on whether
  // it lasted. The protagonist may finish anywhere.
  if (ctx.maxHole < 6) return [];
  const out: BeatCandidate[] = [];
  const check = Math.min(5, ctx.maxHole);
  ctx.players.forEach((p, i) => {
    const m = spanMerit(ctx, i, 1, check);
    if (m < 2.5) return;
    const stretches = scoringStretches(ctx, i, 1, check);
    if (stretches.length === 0) return;
    let st = stretches[0];
    stretches.forEach((x) => { if (spanMerit(ctx, i, x.s, x.e) > spanMerit(ctx, i, st.s, st.e)) st = x; });
    let anchor = st.s, hm = -Infinity;
    for (let h = st.s; h <= st.e; h++) {
      const v = holeMerit(ctx, i, h);
      if (v > hm) { hm = v; anchor = h; }
    }
    const rankAtCheck = ranksAt(ctx, check)[i];
    out.push({
      angle: "fast_start",
      slot: "middle",
      protagonistId: p.golferId,
      hole: anchor,
      strength: clamp01(m / 6),
      surprise: rankAtCheck === 0 ? 0.7 : 0.55,
      evidence: { merit: m, anchor, check, rankAtCheck },
      build: (c, seed) => {
        const fn = firstName(p.name);
        const sc = scoreAt(c, p.golferId, anchor);
        let n3 = 0;
        for (let h = 1; h <= check; h++) { if ((c.pointsAt[p.golferId + "|" + h] ?? 0) >= 3) n3++; }
        const totalPts = c.totalsSeries[i][check];
        const mAtCheck = marginAt(c, check, i);
        const opener = n3 >= 2
          ? `${numWord(n3, true)} net ${plural(n3, "birdie")} in the first ${numWord(check)} holes`
          : `${totalPts} points through the first ${numWord(check)} holes`;
        const spCheck = standingPhrase(c, check, i, fn);
        const status = rankAtCheck === 0 && mAtCheck >= 1
          ? [{ t: ` -- through ${check}, ` }, { t: `nobody is close to ${fn}`, b: true }, { t: "." }]
          : rankAtCheck === 0
            ? [{ t: ` -- ${fn} sits ` }, { t: "level at the top", b: true }, { t: ` through ${check}.` }]
            : [{ t: ` -- ${fn} sits ` }, { t: spCheck.noun, b: true }, { t: ` through ${check}.` }];
        // streak strip over holes 1..6 with the burst focused (needs gross;
        // falls back to the points panel when the card is incomplete).
        const to = Math.min(6, c.maxHole);
        const cells: NonNullable<DataBeat["streak"]>["cells"] = [];
        for (let h = 1; h <= to; h++) {
          const cellSc = scoreAt(c, p.golferId, h);
          if (!cellSc) { cells.length = 0; break; }
          cells.push({ hole: h, ...cellSc });
        }
        return {
          ...beatHead("fast_start", "The Fast Start", pick([
            `${fn} comes out swinging`,
            `${fn} wastes no time`,
            `A flying start for ${fn}`,
            `No warm-up needed for ${fn}`,
          ], seed + anchor)),
          hole: anchor,
          preview: `${fn} Starts Hot`,
          protagonistId: p.golferId, protagonistName: p.name, protagonistInitials: initials(p.name),
          holeMeta: holeMetaFor(c, anchor, p.golferId),
          score: sc && sc.points >= 2 ? sc : null,
          ...(cells.length > 0
            ? { streak: { cells, focusStart: st.s - 1, focusCount: st.e - st.s + 1 } }
            : { ptsPanel: ptsPanelAt(c, check, `Thru ${check}`, [{ idx: i, dir: "up" }]) }),
          caption: [{ t: opener }, ...status],
          strength: 0, mood: "warm",
        };
      },
    });
  });
  return out;
};

const detectFade: Detector = (ctx) => {
  // The arc beat: a player who was leading or top-2 at an early/mid
  // checkpoint and finished well outside contention. Ranked on early
  // standing x positions lost -- explicitly NOT on final-outcome impact.
  if (ctx.maxHole < 12) return [];
  const out: BeatCandidate[] = [];
  const lo = 5, hi = Math.min(12, ctx.maxHole);
  ctx.players.forEach((p, i) => {
    let bestRank = Infinity, checkHole = -1;
    for (let h = lo; h <= hi; h++) {
      const r = ranksAt(ctx, h)[i];
      if (r < bestRank) { bestRank = r; checkHole = h; }
    }
    const finalRank = ctx.ranks[i];
    const lost = finalRank - bestRank;
    if (bestRank > 1 || finalRank < 3 || lost < 4) return;
    out.push({
      angle: "fade",
      slot: "middle",
      protagonistId: p.golferId,
      hole: null,
      strength: clamp01(((2 - bestRank) / 2) * (lost / 7)),
      surprise: 0.7,
      evidence: { checkHole, bestRank, finalRank, lost },
      build: (c, seed) => {
        const fn = firstName(p.name);
        // Tie-aware: at the early checkpoint the leader may be tied. "was the
        // man to beat" would be false in a shared lead.
        const spEarly = standingPhrase(c, checkHole, i, fn);
        const spFinal = standingPhrase(c, null, i, fn);
        const phrase = bestRank === 0
          ? (spEarly.tied ? "shared the lead" : "was the man to beat")
          : (spEarly.tied ? `was tied for ${posLabel(bestRank)}` : `sat ${posLabel(bestRank)}`);
        const finalNoun = spFinal.tied ? `a share of ${posLabel(finalRank)}` : posLabel(finalRank);
        const closer = checkHole <= 9 && c.maxHole >= 16 ? "The back nine had other ideas." : "The closing stretch had other ideas.";
        const caption: CaptionPart[] = pick([
          [
            { t: `${fn} ${phrase} through ${checkHole}. ` },
            { t: closer, b: true },
          ],
          [
            { t: `${fn} ${phrase} through ${checkHole}, then slid to ` },
            { t: finalNoun, b: true },
            { t: " by the end." },
          ],
          [
            { t: `A strong start fades -- ${fn} drops ` },
            { t: `${numWord(lost)} spots`, b: true },
            { t: ` after hole ${checkHole} and finishes ${finalNoun}.` },
          ],
        ], seed + checkHole);
        return {
          ...beatHead("fade", "The Fade", pick([
            `The round gets away from ${fn}`,
            `${fn} fades late`,
            `A strong start slips away from ${fn}`,
            `${fn} runs out of steam`,
          ], seed)),
          hole: null,
          subtext: "The full round",
          preview: `${fn}'s Fade`,
          protagonistId: p.golferId, protagonistName: p.name, protagonistInitials: initials(p.name),
          ptsPanel: {
            label: `${fn} -- start to finish`,
            cols: [
              { name: `Thru ${checkHole}`, value: `${spEarly.tied ? "T" : ""}${posLabel(bestRank)} - ${c.totalsSeries[i][checkHole]} pts` },
              { name: "Final", value: `${spFinal.tied ? "T" : ""}${posLabel(finalRank)} - ${c.totals[i]} pts`, dir: "dn" },
            ],
          },
          caption,
          strength: 0, mood: "fall",
        };
      },
    });
  });
  return out;
};

const detectTheTurn: Detector = (ctx) => {
  // State of the race through 9. Low base strength: only surfaces when the
  // middle would otherwise be starved for beats.
  if (ctx.maxHole < 12) return [];
  const ord = orderAt(ctx, 9);
  const leadIdx = ord[0];
  const m = marginAt(ctx, 9, leadIdx);
  return [{
    angle: "the_turn",
    slot: "middle",
    protagonistId: null,
    hole: 9,
    strength: 0.2,
    surprise: 0.3,
    evidence: { leader: ctx.players[leadIdx].name, margin: m },
    build: (c, seed) => {
      const fa = firstName(c.players[leadIdx].name);
      const fb = firstName(c.players[ord[1]].name);
      const caption: CaptionPart[] = m >= 1
        ? [
            { t: `${fa} makes the turn in front by ` },
            { t: `${numWord(m)} ${plural(m, "point")}`, b: true },
            { t: `, with ${fb} closest behind.` },
          ]
        : [
            { t: `${fa} and ${fb} make the turn ` },
            { t: "tied at the top", b: true },
            { t: " -- nine holes to sort it out." },
          ];
      return {
        ...beatHead("the_turn", "The Turn", pick([
          "Nine down, nine to go",
          "The picture at the turn",
          "Halfway home",
        ], seed)),
        hole: 9,
        preview: "At the Turn",
        protagonistId: null,
        holeMeta: holeMetaFor(c, 9, null),
        ptsPanel: ptsPanelAt(c, 9, "Thru 9"),
        caption,
        strength: 0, mood: "expo",
      };
    },
  }];
};

const detectGrinder: Detector = (ctx) => {
  if (ctx.maxHole < 16) return [];
  const out: BeatCandidate[] = [];
  ctx.players.forEach((p, i) => {
    if (ctx.ranks[i] > 2) return;
    const holes: { hole: number; gross: number; par: number }[] = [];
    const ptsList: number[] = [];
    for (let h = 1; h <= ctx.maxHole; h++) {
      const sc = scoreAt(ctx, p.golferId, h);
      if (!sc) return; // needs a complete gross card
      holes.push({ hole: h, gross: sc.gross, par: sc.par });
      ptsList.push(sc.points);
    }
    // A grinder is LOW VARIANCE -- mostly 2s, few 0s AND few 3s. That is what
    // the word means, so measure it directly: the standard deviation of
    // per-hole points, gated on a top finish.
    //
    // History of this gate, as a warning: it originally required a
    // birdie-FREE top-3 card, which is mythical in a net-Stableford field
    // (every real top-3 card here has 7+ net birdies) -- scratch-golf
    // intuition. The first fix ("<=1 blank, birdies <= pars") made it fire but
    // still let a 7-birdie card be called "no fireworks", which reads false.
    // Probed field median stddev is ~0.88-1.01; genuine grinders sit at
    // 0.50-0.75. Requiring BOTH a clearly-below-field stddev and birdies not
    // dominating pars keeps the copy true.
    const nBlank = ptsList.filter((d) => d === 0).length;
    const nBird = ptsList.filter((d) => d >= 3).length;
    const nPar = ptsList.filter((d) => d === 2).length;
    const mean = ptsList.reduce((a, b) => a + b, 0) / ptsList.length;
    const sd = Math.sqrt(ptsList.reduce((a, b) => a + (b - mean) * (b - mean), 0) / ptsList.length);
    // Field's median per-hole stddev this event -- the relative yardstick.
    const fieldSds: number[] = [];
    ctx.players.forEach((q) => {
      const list: number[] = [];
      for (let h = 1; h <= ctx.maxHole; h++) {
        const v = ctx.pointsAt[q.golferId + "|" + h];
        if (v != null) list.push(v);
      }
      if (list.length < ctx.maxHole) return;
      const m = list.reduce((a, b) => a + b, 0) / list.length;
      fieldSds.push(Math.sqrt(list.reduce((a, b) => a + (b - m) * (b - m), 0) / list.length));
    });
    if (fieldSds.length < 3) return;
    fieldSds.sort((a, b) => a - b);
    const medianSd = fieldSds[Math.floor(fieldSds.length / 2)];
    // Meaningfully steadier than the field, and not a fireworks card.
    if (sd > medianSd * 0.8) return;
    if (nBird > nPar) return;
    if (nBlank > 1) return;
    const finishW = [1, 0.85, 0.7][ctx.ranks[i]] ?? 0.5;
    out.push({
      angle: "grinder",
      slot: "middle",
      protagonistId: p.golferId,
      hole: null,
      strength: clamp01(finishW * (0.45 + clamp01((medianSd - sd) / 0.4) * 0.4)),
      surprise: i === ctx.winnerIdx ? 0.45 : 0.65,
      evidence: { netPars: nPar, netBogeys: ptsList.filter((d) => d === 1).length, blanks: nBlank, sd, medianSd, rank: ctx.ranks[i] },
      build: (c, seed) => {
        const fn = firstName(p.name);
        const nBogs = ptsList.filter((d) => d === 1).length;
        const place = ["first", "second", "third"][ctx.ranks[i]] || "near the top";
        const wreck = nBlank === 0
          ? [{ t: "zero blowups", b: true }, { t: ` -- the steadiest card in the field, and it lands ${fn} ${place}.` }]
          : [{ t: "just one blowup", b: true }, { t: ` -- one of the steadiest cards in the field, and it lands ${fn} ${place}.` }];
        return {
          ...beatHead("grinder", "The Grinder", pick([
            `${fn} grinds out a clean card`,
            `${fn} wins the boring way`,
            `No fireworks, no mistakes for ${fn}`,
            `${fn} refuses to make a mistake`,
          ], seed)),
          hole: null,
          subtext: "The full round",
          preview: `${fn} Grinds`,
          protagonistId: p.golferId, protagonistName: p.name, protagonistInitials: initials(p.name),
          scorecard: { name: p.name, totalPoints: c.totals[i], holes: holes.map((h) => ({ gross: h.gross, par: h.par })) },
          caption: [
            { t: `${nPar} net pars, ${nBogs} net ${plural(nBogs, "bogey")}, ` },
            ...wreck,
          ],
          strength: 0, mood: "cool",
        };
      },
    });
  });
  return out;
};

const detectWildcard: Detector = (ctx) => {
  const out: BeatCandidate[] = [];
  ctx.players.forEach((p, i) => {
    const holes: { hole: number; gross: number; par: number }[] = [];
    const ptsList: number[] = [];
    for (let h = 1; h <= ctx.maxHole; h++) {
      const sc = scoreAt(ctx, p.golferId, h);
      if (sc) { holes.push({ hole: h, gross: sc.gross, par: sc.par }); ptsList.push(sc.points); }
    }
    if (holes.length < ctx.maxHole - 1) return;
    // Net rollercoaster: >= 2 net birdies AND >= 2 blanks on the same card.
    const nBird = ptsList.filter((d) => d >= 3).length;
    const nBlank = ptsList.filter((d) => d === 0).length;
    if (nBird < 2 || nBlank < 2) return;
    out.push({
      angle: "wildcard",
      slot: "middle",
      protagonistId: p.golferId,
      hole: null,
      strength: clamp01((nBird + nBlank) / 9),
      surprise: 0.55,
      evidence: { nBird, nBlank },
      build: (c, seed) => {
        const fn = firstName(p.name);
        return {
          ...beatHead("wildcard", "The Wildcard", pick([
            `${fn} rides the rollercoaster`,
            `${fn} plays 18 holes of chaos`,
            `Feast or famine for ${fn}`,
            `${fn} brings the fireworks and the wreckage`,
          ], seed)),
          hole: null,
          subtext: "The full round",
          preview: `${fn}'s Rollercoaster`,
          protagonistId: p.golferId, protagonistName: p.name, protagonistInitials: initials(p.name),
          scorecard: { name: p.name, totalPoints: c.totals[i], holes: holes.map((h) => ({ gross: h.gross, par: h.par })) },
          caption: [
            { t: `${numWord(nBird, true)} net ${plural(nBird, "birdie")} and ${numWord(nBlank)} ${plural(nBlank, "blowup")} across one scorecard`, b: true },
            { t: ` -- ${fn} never plays a boring hole.` },
          ],
          strength: 0, mood: "cool",
        };
      },
    });
  });
  return out;
};

const detectToughHole: Detector = (ctx) => {
  // Hardest hole by POINTS: lowest average Stableford across the field.
  let worst: { hole: number; avg: number; buckets: number[]; n: number } | null = null;
  for (let h = 1; h <= ctx.maxHole; h++) {
    if (ctx.holePars[h - 1] == null) continue;
    const pts: number[] = [];
    ctx.players.forEach((p) => {
      const v = ctx.pointsAt[p.golferId + "|" + h];
      if (v != null) pts.push(v);
    });
    if (pts.length < Math.max(2, Math.ceil(ctx.players.length / 2))) continue;
    const underShare = pts.filter((v) => v < 2).length / pts.length;
    if (underShare < 0.5) continue;
    const avg = pts.reduce((a, b) => a + b, 0) / pts.length;
    if (!worst || avg < worst.avg) {
      worst = {
        hole: h, avg, n: pts.length,
        buckets: [
          pts.filter((v) => v >= 3).length,
          pts.filter((v) => v === 2).length,
          pts.filter((v) => v === 1).length,
          pts.filter((v) => v === 0).length,
        ],
      };
    }
  }
  if (!worst || worst.avg > 1.1) return [];
  const w = worst;
  const barRows = [
    { label: "Birdie+", value: w.buckets[0], color: "var(--green-300)" },
    { label: "Par", value: w.buckets[1], color: "#e6e0c8" },
    { label: "Bogey", value: w.buckets[2], color: "#e4c98a" },
    { label: "Double+", value: w.buckets[3], color: "#ff8a7a" },
  ];
  return [{
    angle: "tough_hole",
    slot: "middle",
    protagonistId: null,
    hole: w.hole,
    strength: clamp01((1.6 - w.avg) / 1.3),
    surprise: 0.45,
    evidence: { hole: w.hole, avgPts: w.avg },
    build: (c, seed) => ({
      ...beatHead("tough_hole", "The Hardest Hole", pick([
        `Hole ${w.hole} eats the field alive`,
        `Nobody solves hole ${w.hole}`,
        `Hole ${w.hole} plays like a bear trap`,
        `The field runs into a wall on ${w.hole}`,
      ], seed + w.hole)),
      hole: w.hole,
      preview: `Hole ${w.hole} Bites`,
      protagonistId: null,
      holeMeta: holeMetaFor(c, w.hole, null),
      fieldBars: barRows,
      caption: [
        { t: `The field averaged just ` },
        { t: `${w.avg.toFixed(1)} points`, b: true },
        { t: ` here, and ${w.buckets[3]} of ${w.n} cards came up empty.` },
      ],
      strength: 0, mood: "cool",
    }),
  }];
};

// -- Tier 2: cross-event history ------------------------------------------------
// Per-hole aggregates in ctx.history are same-course only (the module passes
// holeStatsEventIds), so "this hole" claims below are honest.

const detectNemesis: Detector = (ctx) => {
  // PERSONAL, NOT HARD. Ranking a player's worst hole by ABSOLUTE gross
  // average just re-finds the hardest hole on the course -- it is everyone's
  // worst hole, permanently, so the same hole re-qualifies for every player
  // every week (probed: hole 14 was the "nemesis" of 2/7 players in one
  // event; 18 recurred across three). That is the scratch-golf pattern
  // again: an absolute yardstick where a relative one is meaningful.
  //
  // A nemesis is a hole where THIS PLAYER underperforms relative to how the
  // FIELD plays that hole, after subtracting out their own overall level (a
  // weaker player is worse everywhere -- that is not a nemesis):
  //
  //   deficit = (player mean pts on hole) - (field mean pts on hole)
  //           - ((player overall mean pts) - (field overall mean pts))
  //
  // Most negative deficit = the hole they specifically own least. Units are
  // POINTS (net), never gross.
  const out: BeatCandidate[] = [];
  const fb = ctx.fieldBaseline;
  if (!fb || Object.keys(fb.meanPointsAt).length === 0) return out; // no baseline => no claim
  ctx.players.forEach((p) => {
    const hist = ctx.history[p.golferId];
    if (!hist) return;
    // The player's own overall scoring level on this course, in points.
    let ownAll = 0, ownAllN = 0;
    Object.values(hist.holePointsByEvent).forEach((arr) => {
      arr.forEach((v) => { if (v != null) { ownAll += v; ownAllN += 1; } });
    });
    if (ownAllN < 18) return; // need a real sample of this player's scoring
    const ownOverallMean = ownAll / ownAllN;
    const playerEdge = ownOverallMean - fb.overallMeanPoints;

    let worstHole = -1, worstDeficit = 0, worstOwnMean = 0;
    Object.entries(hist.holePointsByEvent).forEach(([hs, arr]) => {
      const h = Number(hs);
      const known = arr.filter((v): v is number => v != null);
      if (known.length < 3) return; // minimum sample on that hole
      const fieldMean = fb.meanPointsAt[h];
      if (fieldMean == null || (fb.samplesAt[h] ?? 0) < 6) return;
      const ownMean = known.reduce((a, b) => a + b, 0) / known.length;
      const deficit = ownMean - fieldMean - playerEdge;
      if (deficit < worstDeficit) { worstDeficit = deficit; worstHole = h; worstOwnMean = ownMean; }
    });
    // Require a real personal gap: at least ~0.6 points per round worse than
    // this player's own norm relative to the field on that hole.
    if (worstHole < 0 || worstDeficit > -0.6) return;
    const sc = scoreAt(ctx, p.golferId, worstHole);
    if (!sc || sc.points < 2) return; // conquered = net par or better this week
    const pastGross = hist.holeGrossByEvent[worstHole] || [];
    const pastPts = hist.holePointsByEvent[worstHole] || [];
    const deficit = worstDeficit, ownMeanPts = worstOwnMean;
    out.push({
      angle: "nemesis",
      slot: "middle",
      protagonistId: p.golferId,
      hole: worstHole,
      strength: clamp01(-deficit / 1.5 + 0.15),
      surprise: 0.85,
      evidence: { hole: worstHole, deficit, ownMeanPts, fieldMeanPts: fb.meanPointsAt[worstHole], thisPoints: sc.points },
      build: (c, seed) => {
        const fn = firstName(p.name);
        const par = c.holePars[worstHole - 1];
        const pastDates = hist.holeDatesByEvent[worstHole] || [];
        const lastFive = pastGross.slice(-5);
        const lastFivePts = pastPts.slice(-5);
        const lastFiveDates = pastDates.slice(-5);
        const cells: NonNullable<DataBeat["scoreRow"]>["cells"] = lastFive.map((g, idx) => ({
          gross: g, par, points: lastFivePts[idx] ?? null,
          label: shortDate(lastFiveDates[idx]) || `Rd ${idx + 1}`, highlight: false,
        }));
        cells.push({ gross: sc.gross, par, points: sc.points, label: "Today", highlight: true });
        const knownPts = pastPts.filter((v): v is number => v != null);
        const avgPts = knownPts.length ? knownPts.reduce((a, b) => a + b, 0) / knownPts.length : null;
        const fieldMeanPts = c.fieldBaseline.meanPointsAt[worstHole] ?? 0;
        return {
          ...beatHead("nemesis", "Nemesis No More", pick([
            `${fn} finally beats hole ${worstHole}`,
            `${fn} slays an old demon on ${worstHole}`,
            `Hole ${worstHole} loses its grip on ${fn}`,
            `${fn} settles a score with hole ${worstHole}`,
          ], seed + worstHole)),
          hole: worstHole,
          preview: `${fn}'s Revenge`,
          protagonistId: p.golferId, protagonistName: p.name, protagonistInitials: initials(p.name),
          holeMeta: holeMetaFor(c, worstHole, p.golferId),
          score: sc,
          scoreRow: {
            cells,
            avgLabel: `${fn} here vs the field`,
            // The personal gap IS the story -- state it, not the absolute
            // gross average (which would just describe a hard hole).
            avgValue: `${avgPts != null ? avgPts.toFixed(1) : "?"} pts vs field ${fieldMeanPts.toFixed(1)}`,
          },
          caption: [
            { t: `Everyone finds this par ${par} awkward, but ` },
            { t: `${fn} loses ${Math.abs(deficit).toFixed(1)} points a round here`, b: true },
            { t: ` against the rest of the field -- more than on any other hole. Today it falls for a net ${netName(sc.points)} and ` },
            { t: `${sc.points} points`, b: true },
            { t: "." },
          ],
          strength: 0, mood: "expo",
        };
      },
    });
  });
  return out;
};

const detectRedemption: Detector = (ctx) => {
  const out: BeatCandidate[] = [];
  ctx.players.forEach((p, i) => {
    const hist = ctx.history[p.golferId];
    if (!hist || hist.recentPoints.length < 3) return;
    const thisTotal = ctx.totals[i];
    const window = hist.recentPoints.slice(-8);
    const bestRecent = Math.max(...window);
    const backFromAbsence = hist.weeksAbsent >= 3 && ctx.ranks[i] <= 2;
    const bestInWeeks = thisTotal > bestRecent && window.length >= 3;
    if (!bestInWeeks && !backFromAbsence) return;
    out.push({
      angle: "redemption",
      slot: "middle",
      protagonistId: p.golferId,
      hole: null,
      strength: clamp01((thisTotal - hist.mean) / 12 + (backFromAbsence ? 0.3 : 0)),
      surprise: 0.8,
      evidence: { thisTotal, bestRecent, weeksAbsent: hist.weeksAbsent, backFromAbsence },
      build: (c, seed) => {
        const fn = firstName(p.name);
        const dates = hist.recentDates.slice(-8);
        const win5 = window.slice(-5);
        const date5 = dates.slice(-5);
        const bars = win5.map((v, idx) => ({
          label: shortDate(date5[idx]) || `Rd ${idx + 1}`, value: v, text: String(v), highlight: false,
        }));
        bars.push({ label: "Today", value: thisTotal, text: String(thisTotal), highlight: true });
        return {
          ...beatHead("redemption", "The Comeback", backFromAbsence
            ? pick([
                `${fn} returns like ${fn} never left`,
                `${fn} shakes off the rust in a hurry`,
                `Some layoff -- ${fn} comes back firing`,
                `${fn} makes an entrance`,
              ], seed)
            : pick([
                `${fn}'s best round in weeks`,
                `${fn} finds the old form`,
                `The slump is over for ${fn}`,
                `${fn} turns the season around`,
              ], seed + 1)),
          hole: null,
          subtext: "Season form",
          preview: `${fn}'s Comeback`,
          protagonistId: p.golferId, protagonistName: p.name, protagonistInitials: initials(p.name),
          weekBars: bars,
          caption: backFromAbsence
            ? [
                { t: `First round after ${hist.weeksAbsent} weeks away, and ${fn} posts ` },
                { t: `${thisTotal} points`, b: true },
                { t: ` to land near the top of the board.` },
              ]
            : [
                { t: `${thisTotal} points`, b: true },
                { t: ` beats everything ${fn} has posted in the last ${window.length} starts.` },
              ],
          strength: 0, mood: "expo",
        };
      },
    });
  });
  return out;
};

const detectOutOfCharacter: Detector = (ctx) => {
  const out: BeatCandidate[] = [];
  ctx.players.forEach((p, i) => {
    const hist = ctx.history[p.golferId];
    if (!hist || hist.recentPoints.length < 5 || hist.std < 0.5) return;
    const thisTotal = ctx.totals[i];
    const z = (thisTotal - hist.mean) / hist.std;
    if (Math.abs(z) < 1.6) return;
    const up = z > 0;
    out.push({
      angle: "out_of_character",
      slot: "middle",
      protagonistId: p.golferId,
      hole: null,
      strength: clamp01(Math.abs(z) / 3),
      surprise: clamp01(Math.abs(z) / 3),
      evidence: { thisTotal, mean: hist.mean, z },
      build: (c, seed) => {
        const fn = firstName(p.name);
        const window = hist.recentPoints.slice(-5);
        const dates = hist.recentDates.slice(-5);
        const bars = window.map((v, idx) => ({
          label: shortDate(dates[idx]) || `Rd ${idx + 1}`, value: v, text: String(v), highlight: false,
        }));
        bars.push({ label: "Today", value: thisTotal, text: String(thisTotal), highlight: true });
        return {
          ...beatHead("out_of_character", "Out of Character", up
            ? pick([
                `${fn} plays a career day`,
                `Where did THAT come from, ${fn}?`,
                `${fn} goes way off script -- upward`,
                `${fn} torches the season average`,
              ], seed)
            : pick([
                `A day to forget for ${fn}`,
                `${fn} leaves this one at the course`,
                `Nothing goes right for ${fn}`,
                `${fn} has an off day by a mile`,
              ], seed + 1)),
          hole: null,
          subtext: "Season form",
          preview: up ? `${fn}'s Career Day` : `${fn} Off Script`,
          protagonistId: p.golferId, protagonistName: p.name, protagonistInitials: initials(p.name),
          weekBars: bars,
          caption: [
            { t: `${thisTotal} points`, b: true },
            { t: up ? ` sits miles above a season average of ` : ` sits well below a season average of ` },
            { t: hist.mean.toFixed(1), b: true },
            { t: up ? ` -- the outlier round of the year so far.` : ` -- everyone gets one of these; this was ${fn}'s.` },
          ],
          strength: 0, mood: up ? "expo" : "fall",
        };
      },
    });
  });
  return out;
};

const detectRivalry: Detector = (ctx) => {
  const out: BeatCandidate[] = [];
  for (let i = 0; i < ctx.players.length; i++) {
    for (let j = i + 1; j < ctx.players.length; j++) {
      const hi = ctx.history[ctx.players[i].golferId];
      const hj = ctx.history[ctx.players[j].golferId];
      if (!hi || !hj || hi.recentPoints.length < 4 || hj.recentPoints.length < 4) continue;
      // Loosened from 1.5 / >=3 crossings: two totals rarely re-cross once
      // separated, so the old thresholds never fired on real data.
      if (Math.abs(hi.mean - hj.mean) > 2.5) continue;
      if (Math.abs(ctx.ranks[i] - ctx.ranks[j]) !== 1) continue;
      // "The lead between them flips" must be true of POINTS, so count
      // crossings on cumulative totals, not on the Monte Carlo series.
      let crossings = 0;
      for (let h = 1; h <= ctx.maxHole; h++) {
        const before = Math.sign(ctx.totalsSeries[i][h - 1] - ctx.totalsSeries[j][h - 1]);
        const after = Math.sign(ctx.totalsSeries[i][h] - ctx.totalsSeries[j][h]);
        if (before !== 0 && after !== 0 && before !== after) crossings++;
      }
      if (crossings < 2) continue;
      const aIdx = ctx.ranks[i] < ctx.ranks[j] ? i : j;
      const bIdx = aIdx === i ? j : i;
      out.push({
        angle: "rivalry",
        slot: "middle",
        protagonistId: ctx.players[aIdx].golferId,
        hole: null,
        strength: clamp01(crossings / 5),
        surprise: 0.5,
        evidence: { a: ctx.players[aIdx].name, b: ctx.players[bIdx].name, crossings },
        build: (c, seed) => {
          const fa = firstName(c.players[aIdx].name);
          const fb = firstName(c.players[bIdx].name);
          return {
            ...beatHead("rivalry", "The Rivalry", pick([
              `${fa} and ${fb} trade punches all day`,
              `${fa} vs ${fb} goes the distance`,
              `The ${fa}-${fb} rivalry adds a chapter`,
              `${fa} edges ${fb} in a seesaw battle`,
            ], seed)),
            hole: null,
            subtext: "Head to head",
            preview: `${fa} vs ${fb}`,
            protagonistId: c.players[aIdx].golferId,
            protagonistName: c.players[aIdx].name,
            protagonistInitials: initials(c.players[aIdx].name),
            h2h: [
              { name: fa, color: H2H_COLORS[0], points: cumulativePoints(c, aIdx, c.maxHole) },
              { name: fb, color: H2H_COLORS[1], points: cumulativePoints(c, bIdx, c.maxHole) },
            ],
            caption: [
              { t: `The points lead between them flips ` },
              { t: `${crossings} times`, b: true },
              { t: ` before ${fa} finally lands the last punch.` },
            ],
            strength: 0, mood: "warm",
          };
        },
      });
    }
  }
  return out;
};

const DETECTORS: Detector[] = [
  detectThreeWay, detectDuel, detectWireToWire, detectPaceSetter,
  detectCharge, detectCollapse, detectHold, detectFastStart, detectFade, detectTheTurn,
  detectGrinder, detectWildcard, detectToughHole,
  detectNemesis, detectRedemption, detectOutOfCharacter, detectRivalry,
];

// -- Rare fireworks: gross eagle or better -------------------------------------
//
// DELIBERATE GROSS EXCEPTION -- DO NOT "fix" this to net.
// The rest of this engine treats Stableford POINTS as the sole valence unit,
// because handicaps make a gross bogey on a stroke hole a NET par worth 2
// points, and gross-based intuition ("birdie-free", tracer valence) is a
// scratch-golf assumption that does not fit this net league. A NET eagle is
// common here -- handicaps make net birdies routine -- so it is not a story.
//
// This one detector is the intentional exception. A GROSS eagle or better is
// a real golf achievement independent of handicap: two-under on a hole is
// two-under whether or not you got a stroke there, and it is what members
// actually talk about afterwards. So this detector reads gross - par (and
// gross === 1 for an ace) on purpose. A future "consistency" pass that
// converts it to net would silently delete the feature -- leave it gross.
//
// It is a CERTAINTY, not a competition: if it happened, it is always a
// highlight. The composer treats fireworks additively and exempt from every
// anti-repeat rule (rarity is self-limiting -- three eagles in three weeks is
// three stories, not repetition). See composeBeats().
export interface FireworksBeat {
  angle: "ace" | "albatross" | "eagle";
  hole: number;
  protagonistId: number;
  strength: number;
  build: (ctx: RoundContext, seed: number) => DataBeat;
}

// Highest tier first, then earliest hole. The rarest applicable label wins:
// an ace on a par 3 is also an eagle, an ace on a par 4 also an albatross --
// classify by rarity so the frequency table and history stay legible and an
// ace never sits under an eagle's cooldown.
const FIREWORKS_TIER: Record<FireworksBeat["angle"], number> = { ace: 3, albatross: 2, eagle: 1 };
// Fixed, high strength by tier -- it does not compete on merit, but a higher
// tier still sorts ahead when the per-event cap trims the list.
const FIREWORKS_STRENGTH: Record<FireworksBeat["angle"], number> = { ace: 0.99, albatross: 0.97, eagle: 0.95 };
const FIREWORKS_MAX = 2; // cap per event so a freak day cannot flood the recap

function detectFireworks(ctx: RoundContext): FireworksBeat[] {
  const hits: FireworksBeat[] = [];
  ctx.players.forEach((p) => {
    for (let h = 1; h <= ctx.maxHole; h++) {
      const gross = ctx.grossAt[p.golferId + "|" + h];
      const par = ctx.holePars[h - 1];
      if (gross == null || par == null) continue;
      const d = gross - par;
      const isAce = gross === 1;
      const isAlbatross = d === -3;
      const isEagle = d === -2;
      if (!isAce && !isAlbatross && !isEagle) continue;
      // Rarest applicable label.
      const angle: FireworksBeat["angle"] = isAce ? "ace" : isAlbatross ? "albatross" : "eagle";
      hits.push({
        angle,
        hole: h,
        protagonistId: p.golferId,
        strength: FIREWORKS_STRENGTH[angle],
        build: (c, seed) => buildFireworksBeat(c, p, h, angle, seed),
      });
    }
  });
  // Highest tier first, then earliest hole; cap so it cannot flood the recap.
  hits.sort((a, b) => (FIREWORKS_TIER[b.angle] - FIREWORKS_TIER[a.angle]) || (a.hole - b.hole));
  return hits.slice(0, FIREWORKS_MAX);
}

// Was a gross eagle-or-better ever carded on THIS hole by THIS player before?
// The only rarity claim we can PROVE from the data on hand: holeGrossByEvent
// is this player's same-course prior gross on this hole. If they have never
// gone this low here, "first ever on N" is honest; otherwise assert nothing.
// (A season-wide "first eagle this season" would need all-hole gross history
// we do not carry, so we do not estimate it -- data honesty, per the spec.)
function isFirstFireworksHere(ctx: RoundContext, golferId: number, hole: number): boolean {
  const par = ctx.holePars[hole - 1];
  const past = ctx.history[golferId]?.holeGrossByEvent[hole];
  if (par == null || !past || past.length === 0) return false; // no history => cannot claim
  return past.every((g) => g > par - 2); // none was an eagle-or-better here
}

function buildFireworksBeat(ctx: RoundContext, p: RecapPlayer, hole: number, angle: FireworksBeat["angle"], seed: number): DataBeat {
  const fn = firstName(p.name);
  const par = ctx.holePars[hole - 1];
  const sc = scoreAt(ctx, p.golferId, hole);
  const pts = sc ? sc.points : ctx.pointsAt[p.golferId + "|" + hole] ?? 0;
  const gross = sc ? sc.gross : ctx.grossAt[p.golferId + "|" + hole] ?? 0;
  const firstHere = isFirstFireworksHere(ctx, p.golferId, hole);

  // More template variety than usual: this is the one beat a member re-watches
  // and re-shares, so a canned line would wear fast.
  const heroLabel = angle === "ace" ? "Hole in One" : angle === "albatross" ? "Albatross" : "Eagle";
  const preview = angle === "ace" ? `${fn}'s Ace` : angle === "albatross" ? `${fn}'s Albatross` : `${fn}'s Eagle`;
  const mood: DataBeat["mood"] = "warm";

  // Lead with the achievement plainly. State the gross fact; points second.
  let caption: CaptionPart[];
  let eyebrow: string;
  if (angle === "ace") {
    const eyebrows = [
      `${fn} aces the ${hole}th`,
      `A hole-in-one for ${fn}`,
      `${fn} makes one disappear on ${hole}`,
      `Ace. ${fn}. Hole ${hole}.`,
      `${fn} finds the bottom of the cup on ${hole}`,
      `The tee shot of the day belongs to ${fn}`,
    ];
    eyebrow = pick(eyebrows, seed + hole);
    caption = [
      { t: `A `, b: false },
      { t: `hole-in-one`, b: true },
      { t: ` on the ${hole}${ordSuffix(hole)}` },
      ...(firstHere ? [{ t: ` -- ${fn}'s first ever here` }] : []),
      { t: `. Worth ` },
      { t: `${pts} ${plural(pts, "point")}`, b: true },
      { t: `, but nobody is talking about the points.` },
    ];
  } else if (angle === "albatross") {
    const eyebrows = [
      `${fn} makes an albatross on ${hole}`,
      `A double eagle for ${fn}`,
      `${fn} does something almost nobody does`,
      `Three-under on one hole -- ${fn} on ${hole}`,
      `${fn} pulls off the rarest card in golf`,
      `An albatross lands on hole ${hole}`,
    ];
    eyebrow = pick(eyebrows, seed + hole);
    caption = [
      { t: `${fn} makes an ` },
      { t: `albatross`, b: true },
      { t: ` on ${hole} -- gross ${gross} on a par ${par}` },
      ...(firstHere ? [{ t: `, a first ever here` }] : []),
      { t: `, worth ` },
      { t: `${pts} ${plural(pts, "point")}`, b: true },
      { t: `.` },
    ];
  } else {
    const eyebrows = [
      `${fn} eagles the ${hole}th`,
      `An eagle for ${fn} on ${hole}`,
      `${fn} goes two-under on one hole`,
      `${fn} lights up hole ${hole}`,
      `Eagle. ${fn}. Hole ${hole}.`,
      `${fn} takes a big bite out of ${hole}`,
    ];
    eyebrow = pick(eyebrows, seed + hole);
    caption = [
      { t: `${fn} makes an ` },
      { t: `eagle`, b: true },
      { t: ` on ${hole} -- gross ${gross} on a par ${par}` },
      ...(firstHere ? [{ t: `, a first ever here` }] : []),
      { t: `, worth ` },
      { t: `${pts} ${plural(pts, "point")}`, b: true },
      { t: `.` },
    ];
  }

  return {
    ...beatHead(angle, heroLabel, eyebrow),
    hole,
    preview,
    protagonistId: p.golferId,
    protagonistName: p.name,
    protagonistInitials: initials(p.name),
    holeMeta: holeMetaFor(ctx, hole, p.golferId),
    // The tracer valence is points-based and an eagle scores 4, so shot/tracer
    // already draws the best arc; a scoreRow-less score payload carries the
    // gross fact for the notation strip.
    score: sc,
    caption,
    strength: FIREWORKS_STRENGTH[angle],
    mood,
  };
}

// "1" -> "st", "2" -> "nd" ... for inline ordinals ("the 7th").
function ordSuffix(n: number): string {
  const r10 = n % 10, r100 = n % 100;
  return r10 === 1 && r100 !== 11 ? "st" : r10 === 2 && r100 !== 12 ? "nd" : r10 === 3 && r100 !== 13 ? "rd" : "th";
}

// ===== COMPOSER ================================================================

export interface SelectBeatsInput {
  eventId: number;
  players: RecapPlayer[]; // paid, deduped entries in leaderboard order
  scores: RecapHoleScore[];
  holePars: number[]; // from courses.hole_pars (may be empty)
  finalStandings: BeatStandingRow[]; // tie-aware, top 5
  winnerName: string;
  eventLabel: string; // "Week 14" style label for the final title
  history: BeatHistoryRow[]; // last ~4 events' surfaced beats
  prevEventId: number | null; // most recent completed event before this one
  playerHistory?: Record<number, PlayerHistoryEntry>; // Tier-2 fuel; {} => Tier-2 no-ops
  // Field's historical per-hole baseline on this course (nemesis yardstick).
  // Omitted => nemesis no-ops rather than guessing.
  fieldBaseline?: FieldHoleBaseline;
  // Yardage for the hole meta block. Per-golfer arrays follow each player's
  // own tee (event_signups.tee_box_course_id); the field array is the most
  // common tee, used for field-wide beats and as the per-golfer fallback.
  holeYardsByGolfer?: Record<number, (number | null)[] | null>;
  fieldHoleYards?: (number | null)[] | null;
  // Admin-hidden beats (story_beats_history rows with hidden = true). These
  // are filtered BEFORE composition so the next-best candidate fills the
  // slot and the story stays whole.
  hiddenBeats?: { angle_type: string; protagonist_id?: number | null }[];
}

export function buildRoundContext(input: SelectBeatsInput, series: number[][], totalsSeries: number[][]): RoundContext {
  const { players, scores, holePars } = input;
  const maxHole = Math.max(...scores.map((s) => s.hole));
  const grossAt: Record<string, number | null> = {};
  const pointsAt: Record<string, number> = {};
  scores.forEach((s) => {
    grossAt[s.golferId + "|" + s.hole] = s.gross;
    pointsAt[s.golferId + "|" + s.hole] = s.stableford;
  });
  const totals = players.map((p) => scores.filter((s) => s.golferId === p.golferId).reduce((a, s) => a + s.stableford, 0));
  const sortedTotals = [...totals].sort((a, b) => b - a);
  const ranks = totals.map((t) => sortedTotals.indexOf(t));
  // Field mean stableford per hole -- the baseline for field-relative merit.
  const fieldMeanAt: number[] = [];
  for (let h = 1; h <= maxHole; h++) {
    const vals: number[] = [];
    players.forEach((p) => {
      const v = pointsAt[p.golferId + "|" + h];
      if (v != null) vals.push(v);
    });
    fieldMeanAt.push(vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0);
  }
  let winnerIdx = 0;
  series.forEach((s, i) => { if (s[maxHole] > series[winnerIdx][maxHole]) winnerIdx = i; });
  const yardsFor = (golferId: number | null, hole: number): number | null => {
    const own = golferId != null ? input.holeYardsByGolfer?.[golferId]?.[hole - 1] : null;
    if (own != null && own > 0) return own;
    const fld = input.fieldHoleYards?.[hole - 1];
    return fld != null && fld > 0 ? fld : null;
  };
  return {
    players, scores, series, totalsSeries, holePars, maxHole,
    finalStandings: input.finalStandings,
    winnerIdx, totals, ranks, grossAt, pointsAt, fieldMeanAt, yardsFor,
    history: input.playerHistory || {},
    fieldBaseline: input.fieldBaseline || { meanPointsAt: {}, overallMeanPoints: 0, samplesAt: {} },
  };
}

// The composition layer is deterministic for a given input: the Monte Carlo
// series is seeded on event_id, detectors are pure, weights are arithmetic,
// and phrasing is seed-hashed -- so a given event yields the same beats on
// every device, forever.
export function composeBeats(ctx: RoundContext, input: SelectBeatsInput): DataBeat[] {
  const seed = input.eventId;

  // Admin suppression: drop hidden angles before slotting so the next-best
  // candidate fills the slot instead of leaving a gap.
  const hiddenRows = input.hiddenBeats || [];
  const isHidden = (angle: string, pid: number | null) =>
    hiddenRows.some((h) => h.angle_type === angle && (h.protagonist_id == null || h.protagonist_id === pid));

  // ---- ANTI-REPEAT from story_beats_history --------------------------------
  // The pool is thin, so soft penalties alone cannot dislodge a sticky
  // candidate (nemesis re-qualifies the same worst hole every week by
  // definition). Three layers:
  //   HARD COOLDOWNS (blocks, not multipliers):
  //     - exact identity (angle, protagonist, hole) blocked for 4 events
  //     - (angle, protagonist) blocked for 3 events
  //   STEEP ANGLE DECAY: 0.45^n over a 5-6 event window rotates angle types.
  //   PREV-PROTAGONIST soft penalty: last week's stars are less likely.
  // eventsAgo is 1-based-ish (0 = immediately-prior event). Rows without it
  // are treated as "1 event ago".
  const RECENCY_WINDOW = 6;
  const ago = (h: BeatHistoryRow) => (h.eventsAgo != null ? h.eventsAgo : 1);
  const recent = input.history.filter((h) => ago(h) <= RECENCY_WINDOW);

  const angleCount: Record<string, number> = {};
  recent.forEach((h) => { angleCount[h.angle_type] = (angleCount[h.angle_type] || 0) + 1; });
  const prevProtagonists = new Set(
    recent.filter((h) => ago(h) === 0 && h.protagonist_id != null).map((h) => h.protagonist_id),
  );

  // Hard cooldown predicates.
  const IDENTITY_COOLDOWN = 4; // (angle, protagonist, hole)
  const PROTAG_COOLDOWN = 3;   // (angle, protagonist)
  const identityBlocked = (c: BeatCandidate) => c.protagonistId != null && recent.some((h) =>
    ago(h) < IDENTITY_COOLDOWN
    && h.angle_type === c.angle
    && h.protagonist_id === c.protagonistId
    && (h.hole ?? null) === (c.hole ?? null));
  const protagBlocked = (c: BeatCandidate) => c.protagonistId != null && recent.some((h) =>
    ago(h) < PROTAG_COOLDOWN
    && h.angle_type === c.angle
    && h.protagonist_id === c.protagonistId);
  const cooldownBlocked = (c: BeatCandidate) => identityBlocked(c) || protagBlocked(c);

  const pool: BeatCandidate[] = [];
  DETECTORS.forEach((d) => {
    pool.push(...d(ctx).filter((c) => !isHidden(c.angle, c.protagonistId) && !cooldownBlocked(c)));
  });

  const weightOf = (c: BeatCandidate) =>
    c.strength
    * (0.5 + c.surprise)
    * Math.pow(0.45, angleCount[c.angle] || 0)
    * (c.protagonistId != null && prevProtagonists.has(c.protagonistId) ? 0.5 : 1);

  // Opening slot: the opening detectors compete.
  const openings = pool.filter((c) => c.slot === "opening").sort((a, b) => weightOf(b) - weightOf(a));
  const opening = openings[0] || null;

  // Blowout detection (flat or runaway curve) => a single middle beat chosen
  // from the FULL pool -- grinder / tough_hole / whatever fired strongest --
  // not forced to the winner.
  const w = ctx.winnerIdx;
  const turn = Math.min(9, ctx.maxHole);
  const runaway = ctx.maxHole >= 9 && ctx.series[w][turn] >= 85 && ctx.series[w].slice(turn).every((v) => v >= 75);
  const middlePool = pool.filter((c) => c.slot === "middle").sort((a, b) => weightOf(b) - weightOf(a));
  // Swing angles: any of these firing with real strength means the round had
  // an arc (fade and fast_start included -- a lead that evaporated is drama,
  // not a blowout).
  const SWINGY = new Set(["charge", "collapse", "hold", "fade", "fast_start"]);
  const maxSwing = middlePool.reduce((m, c) => Math.max(m, SWINGY.has(c.angle) ? c.strength : 0), 0);
  const blowout = runaway || maxSwing < 0.28;
  const capN = blowout ? 1 : 3;

  // Greedy middle pick with diversity constraints. Two passes: the first
  // prefers unseen protagonists; the second fills remaining slots. On top of
  // the angle/protagonist rules, a SPREAD constraint soft-penalizes
  // candidates in a third of the round (1-6 / 7-12 / 13-18) that already has
  // a selected beat, and candidates within 4 holes of one. Soft multipliers,
  // never hard blocks: a genuinely dominant late beat must still win -- the
  // goal is only that a brilliant front nine is ABLE to win a slot.
  const winnerGid = ctx.players[w].golferId;
  const chosen: BeatCandidate[] = [];
  const usedAngles = new Set<string>();
  const usedHoles = new Set<number>();
  const usedProtagonists = new Set<number>();
  const t1 = Math.ceil(ctx.maxHole / 3), t2 = Math.ceil((2 * ctx.maxHole) / 3);
  const thirdOf = (h: number) => (h <= t1 ? 0 : h <= t2 ? 1 : 2);
  const thirdCount = [0, 0, 0];
  let winnerBeats = 0;
  const taken = new Set<BeatCandidate>();
  // The opening's star counts against pass-1 freshness so the first middle
  // beat is not the same player's hot start told twice. (The opening's hole
  // is deliberately NOT seeded into the spread buckets -- openings are
  // always early and would penalize every front-nine middle.)
  if (opening && opening.protagonistId != null) usedProtagonists.add(opening.protagonistId);
  const distMult = (c: BeatCandidate) => {
    if (c.hole == null) return 1;
    // The turning point is EXEMPT from the spread penalty. It is the one
    // odds-ranked beat, and it names the hole that actually decided the
    // round -- which genuinely is often late. Nudging it off that hole to
    // satisfy a distribution target would make it false. Every other beat
    // spreads around it.
    if (c.angle === "collapse") return 1;
    let m = 1;
    if (thirdCount[thirdOf(c.hole)] > 0) m *= 0.55;
    for (const h of usedHoles) {
      if (Math.abs(h - c.hole) <= 4) { m *= 0.75; break; }
    }
    return m;
  };
  const eligible = (c: BeatCandidate, requireFreshProtagonist: boolean) => {
    if (taken.has(c)) return false;
    if (usedAngles.has(c.angle)) return false;
    if (c.hole != null && usedHoles.has(c.hole)) return false;
    if (c.protagonistId === winnerGid && winnerBeats >= 1) return false;
    if (requireFreshProtagonist && c.protagonistId != null && usedProtagonists.has(c.protagonistId)) return false;
    return true;
  };
  const take = (c: BeatCandidate) => {
    taken.add(c);
    chosen.push(c);
    usedAngles.add(c.angle);
    if (c.hole != null) { usedHoles.add(c.hole); thirdCount[thirdOf(c.hole)]++; }
    if (c.protagonistId != null) usedProtagonists.add(c.protagonistId);
    if (c.protagonistId === winnerGid) winnerBeats++;
  };
  // DIVERSITY FLOOR: past the first middle beat, only take a candidate whose
  // recency-decayed weight clears a floor. An angle seen last week is
  // decayed by 0.45 (twice => 0.2), so a stale repeat falls below the floor
  // and we emit FEWER beats instead -- an honest 3-beat recap beats a 5-beat
  // one that repeats last week (mirrors the blowout single-beat behaviour).
  const FLOOR = 0.05;
  const pickPass = (requireFreshProtagonist: boolean, floor: number) => {
    while (chosen.length < capN) {
      let best: BeatCandidate | null = null, bestW = -1;
      for (const c of middlePool) {
        if (!eligible(c, requireFreshProtagonist)) continue;
        const wgt = weightOf(c) * distMult(c);
        if (wgt > bestW) { bestW = wgt; best = c; }
      }
      // The first middle beat is always taken (a recap needs a middle); after
      // that the floor applies so we stop rather than pad with a stale beat.
      if (!best || (chosen.length >= 1 && bestW < floor)) break;
      take(best);
    }
  };
  pickPass(true, FLOOR);
  pickPass(false, FLOOR);

  chosen.sort((a, b) => (a.hole ?? 99) - (b.hole ?? 99));

  const beats: DataBeat[] = [];
  if (opening) {
    const b = opening.build(ctx, seed);
    b.strength = opening.strength;
    beats.push(b);
  }
  chosen.forEach((c) => {
    const b = c.build(ctx, seed);
    b.strength = c.strength;
    beats.push(b);
  });

  // RARE FIREWORKS (gross eagle or better): additive and exempt from EVERY
  // anti-repeat rule above -- it is detected outside the pool, so it never
  // saw a cooldown, the angle-decay weight, the protagonist-rotation penalty,
  // the spread/thirds constraint, or the diversity floor. Rarity is
  // self-limiting, so there is nothing for anti-repeat to protect against:
  // an eagle on the same hole two weeks running still fires. It is ADDITIVE,
  // not competitive -- it takes a guaranteed slot and does NOT displace an arc
  // middle (an event with an eagle simply emits one more beat). Admin hides
  // still apply, so a mis-scored "eagle" can be pulled.
  detectFireworks(ctx).forEach((f) => {
    if (isHidden(f.angle, f.protagonistId)) return;
    const b = f.build(ctx, seed);
    b.strength = f.strength;
    beats.push(b);
  });

  // Order middles + fireworks by hole so the arc reads chronologically; the
  // opening stays first (throughHole) and final stays last.
  const opN = opening ? 1 : 0;
  const body = beats.slice(opN).sort((a, b) => (a.hole ?? 99) - (b.hole ?? 99));
  const ordered = [...beats.slice(0, opN), ...body];

  if (!isHidden("final", null)) ordered.push(buildFinalBeat(ctx, input, chosen, blowout, seed));
  return ordered;
}

export function selectDataBeats(input: SelectBeatsInput): DataBeat[] {
  const { players, scores } = input;
  if (players.length < 2 || scores.length === 0) return [];
  const maxHole = Math.max(...scores.map((s) => s.hole));
  if (maxHole < 3) return [];
  const { series, totalsSeries } = buildWinProbAndTotals(players, scores, maxHole, input.eventId);
  const ctx = buildRoundContext(input, series, totalsSeries);
  return composeBeats(ctx, input);
}

function buildFinalBeat(ctx: RoundContext, input: SelectBeatsInput, middle: BeatCandidate[], blowout: boolean, seed: number): DataBeat {
  const winnerFirst = firstName(input.winnerName);
  const standings = input.finalStandings;
  // Tie-aware: pos strings are already T-prefixed ("T1"/"T2"). "takes second"
  // is false when second is shared, and a shared win is not a solo win.
  const winnersTied = standings.filter((s) => s.pos === "T1").length > 1;
  const runnersTied = standings.filter((s) => s.pos === "T2").length > 1;

  const caption: CaptionPart[] = winnersTied
    ? [{ t: "It ends in a " }, { t: "share of the title", b: true }, { t: " at the top." }]
    : runnersTied
      ? [{ t: "A " }, { t: "tie for second", b: true }, { t: " sits just behind." }]
      : standings[1]
        ? [{ t: standings[1].name, b: true }, { t: ` takes second with ${standings[1].pts}.` }]
        : [{ t: "The field never got close.", b: false }];

  if (blowout && !winnersTied) {
    caption.push({ t: pick([
      " It was never really in doubt.",
      ` ${winnerFirst} led this one from start to finish.`,
      " The chase pack never landed a punch.",
    ], seed + 3) });
  } else if (!winnersTied) {
    // Only a swing beat (charge/collapse/hold) can be "the hole that decided
    // it" -- a nemesis or tough-hole beat is a story, not the decider. A
    // shared title had no single decider, so skip it there.
    const SWING = new Set(["charge", "collapse", "hold"]);
    const decider = [...middle].filter((c) => c.hole != null && SWING.has(c.angle)).sort((a, b) => b.strength - a.strength)[0];
    if (decider && decider.protagonistId != null) {
      const p = ctx.players.find((x) => x.golferId === decider.protagonistId);
      const sc = p ? scoreAt(ctx, p.golferId, decider.hole!) : null;
      const fn = p ? firstName(p.name) : "";
      // Net word for a good decider hole ("net par" -- a gross bogey there
      // would mislabel a charge); gross notation for a bad one ("double").
      const scoreWord = sc
        ? (sc.points >= 2 ? `net ${netName(sc.points)}` : scoreName(sc.gross, sc.par).toLowerCase())
        : "swing";
      caption.push({ t: pick([
        ` The hole that decided it: ${fn}'s ${scoreWord} on ${decider.hole}.`,
        ` ${fn}'s ${scoreWord} on ${decider.hole} proved to be the turning point.`,
        ` It all traced back to ${fn}'s ${scoreWord} on ${decider.hole}.`,
        ` The round turned for good on ${decider.hole}.`,
      ], seed + decider.hole!) });
    }
  }

  // Tie-aware title: a shared win is not "X wins" outright.
  const title = winnersTied
    ? pick([
        `${input.winnerName} shares ${input.eventLabel}`,
        `${input.eventLabel} ends in a tie at the top`,
        `${input.winnerName} ties for ${input.eventLabel}`,
      ], seed + 7)
    : pick([
        `${input.winnerName} wins ${input.eventLabel}`,
        `${input.winnerName} takes ${input.eventLabel}`,
        `${input.eventLabel} belongs to ${input.winnerName}`,
        `${input.winnerName} closes out ${input.eventLabel}`,
      ], seed + 7);
  return {
    ...beatHead("final", "Final", title),
    hole: null,
    preview: winnersTied ? `${winnerFirst} Ties` : `${winnerFirst} Wins`,
    protagonistId: null,
    finalStandings: standings,
    caption,
    strength: 0,
    mood: "expo",
  };
}

// -- Watch-order sort ----------------------------------------------------------
// 1. pre_round humans, 2. by hole asc (data before human within a hole),
// 3. no-hole non-pre-round humans, 4. FINAL always last. created_at breaks ties.
export interface SortableCard {
  kind: "data" | "human";
  hole: number | null;
  preRound: boolean;
  isFinal: boolean;
  createdAt: string | null;
}

export function watchOrderCompare(a: SortableCard, b: SortableCard): number {
  const major = (c: SortableCard) => (c.preRound ? -1 : c.isFinal ? 1000 : c.hole == null ? 999 : c.hole);
  if (major(a) !== major(b)) return major(a) - major(b);
  const minor = (c: SortableCard) => (c.kind === "data" ? 0 : 1);
  if (minor(a) !== minor(b)) return minor(a) - minor(b);
  return (a.createdAt || "").localeCompare(b.createdAt || "");
}
