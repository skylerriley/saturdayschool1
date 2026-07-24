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
import { computeSkinWinners, computeSkinValue, type SkinHoleScore } from "./skins.ts";

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
  // The hole where this beat's STORY RESOLVES -- the single key the composer
  // sorts on so the recap reads in chronological (hole 1 -> 18) order. Single-
  // hole beats resolve at their hole; span beats resolve at their END hole (a
  // run over 5-8 pays off at 8, a fade resolves at 18 where the player finally
  // drops out); whole-round character beats resolve at 18. FINAL has none (it
  // is always last). Set by the composer via resolutionHoleFor().
  resolutionHole?: number | null;
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
  // Shared standings-board payload (Handoff #9 §5): the WHOLE field, rendered
  // as the real .lb-* leaderboard floating over the blurred photo, with a THRU
  // column and a gentle auto-scroll. One renderer serves both the race-state /
  // the_turn "standings" beats (thru = the checkpoint hole) and the FINAL
  // (thru = "F"). label is "Thru 6" / "Final".
  standings?: {
    label: string;
    thru: string; // per-row THRU value ("6" for a checkpoint, "F" for final)
    isFinal: boolean;
    rows: { pos: string; name: string; points: number }[];
  };
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
  // Fade position trace (Handoff #14 §2): tie-aware finish position per hole,
  // plotted on an INVERTED axis (1st at the top) so the decline reads as a
  // fall. Exactly two labels (peak + finish) reveal in sync with the drawing
  // line; the slow-climb/fast-collapse split is at splitIndex. peakLabel is
  // NEVER hardcoded -- a fade from 2nd is valid and must say "2nd".
  positionTrace?: {
    ranks: number[];      // tie-aware 0-based finish position per hole, index 0 = hole 1
    peakIndex: number;    // hole index (0-based) where the peak position is first reached
    splitIndex: number;   // LAST hole index (0-based) at the peak -- climb ends, decline begins
    peakLabel: string;    // "1st" / "T2" ... from the detector's peak, not hardcoded
    finishLabel: string;  // "6th" / "T4" ... tie-aware, from final standings
  };
  // Differential momentum chart (Handoff #12 §3d, Handoff #14 §3): cumulative
  // points differential (A - B) per hole against a zero centre line. Shared by
  // duel AND rivalry. Names carry the identity (top = A, bottom = B) -- the
  // renderer must not rely on colour alone (60+ audience) and adds no other
  // labelling. `values[h]` is A_cum - B_cum after hole h+1 (index 0 = hole 1).
  // crossIndices are the lead-change hole indices from leadCrossIndices() --
  // the SAME value any caption quotes, so dots and text can never disagree.
  diff?: { nameTop: string; nameBottom: string; colorTop: string; colorBottom: string; values: number[]; crossIndices: number[]; firstHole: number };
  // Duel tale-of-the-tape (Handoff #12 §3b): a broadcast final-pairing compare
  // of the two duellists, three-to-four rows. Reuses existing stats; never a
  // false head-to-head record (see the copy layer's shared-round rule).
  tape?: { aName: string; bName: string; rows: { label: string; a: string; b: string; lead?: "a" | "b" | null }[] };
  // Multi-card unit (Handoff #12 §3a): a beat may carry an inseparable lead-in
  // card that renders IMMEDIATELY BEFORE it. The composer inserts it at the
  // same resolution hole so the sort can never split the pair, and the unit
  // counts as ONE beat against the budget. Used by duel (tape -> chart).
  extraBefore?: DataBeat;
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
//
// CAPTIONS ARE SELF-CONTAINED (Handoff #9 1). The visual hierarchy makes the
// CAPTION the primary line (~24px under the graphic) and the EYEBROW a 15px
// aside that the eye skips. So every caption MUST be a complete, standalone
// statement of what happened -- who + what + so-what -- and must NEVER depend
// on the eyebrow having been read. Acceptance test: cover the eyebrow; the
// caption alone must still convey the beat. The eyebrow is atmospheric colour
// ("Joe catches fire"), never load-bearing.
//
// CHARACTER BUDGET: keep each caption's plain text at or under ~140 chars, the
// length that still reads at 18px on a small phone. The viewer steps the font
// down for longer strings as a safety net, not a licence to run on. Being
// self-contained makes captions longer, so the budget matters more, not less.
//
// STRUCTURAL VARIETY (Handoff #9 6a): pools are 6-8 variants with genuinely
// different SENTENCE SHAPES (lead with the number / the consequence / the
// name; two-clause contrast; short declarative), not synonym swaps of one
// fixed shape. Cross-event variety comes from the eventId term in the seed.
//
// SEAM: for richer phrasing, pass the selected beats (exact facts only) to the
// existing Gemini batched call (generate-event-recap pattern) and let it
// rephrase the title/caption strings ONLY -- it must never see raw data or add
// a number. That rephrase belongs at REBUILD/GENERATION time (one batched call
// per event, TONY.AI pattern), never at read time -- reads stay pure and
// instant (Handoff #6). Not wired in v1 (admin-only experiment).
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

// Cardinal number as a word for small gross scores (used when a hole is so far
// over par that there is no scorecard name for it -- "an eight", "a nine").
const CARDINALS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
function grossNumberWord(gross: number): string {
  return gross >= 0 && gross < CARDINALS.length ? CARDINALS[gross] : String(gross);
}

// Correct indefinite article for a following word: "an" before a vowel sound.
// Scoped to the words this engine actually produces (score words + number
// words); "eight"/"eleven" take "an", "one" takes "a". Not a general NLP rule.
function articleFor(word: string): string {
  return /^(a|e|i|o|u|8|11|18|80)/i.test(word.trim()) && !/^(one\b|eu)/i.test(word.trim()) ? "an" : "a";
}

// Gross scorecard word -- notation for what was physically carded. Never use
// this to judge whether a hole was good; that is what points are for.
// NO SIGNED STRINGS may leave this function (Handoff #16 3a/F2): a "+4" leaking
// into prose reads as "A +4 nets Joe zero points". Quadruple bogey gets its
// name; anything worse is spelled as the gross number ("Eight" -> prose "an
// eight"). The article is the caller's job via articleFor().
function scoreName(gross: number, par: number): string {
  const d = gross - par;
  if (d <= -2) return "Eagle";
  if (d === -1) return "Birdie";
  if (d === 0) return "Par";
  if (d === 1) return "Bogey";
  if (d === 2) return "Double";
  if (d === 3) return "Triple";
  if (d === 4) return "Quadruple Bogey";
  // >= 5 over: no common scorecard name -- say the gross as a noun.
  const w = grossNumberWord(gross);
  return w.charAt(0).toUpperCase() + w.slice(1);
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
  // Number of entries paying into skins. The pot + per-skin value are derived
  // from this via lib/skins (computeSkinValue) -- never inlined here.
  skinsPaidCount: number;
  // Pre-round frozen odds per golfer (duel tape only; quoted, never estimated).
  preRoundOdds: Record<number, { projectedFinal: number | null; winPct: number | null }>;
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

// Shared-name-aware first name: a last initial is appended whenever another
// player in the field shares the first name ("Trevor C" vs "Trevor S" -- a
// bare duplicate reads as the same person). Used for BOTH data labels (panels)
// and PROSE (Handoff #16 7c/F5): the disambiguation exists precisely because
// first names collide, so prose that used bare firstName was ambiguous in
// exactly those cases while the panel beside it was correct. `dName` is the
// prose-facing alias; both resolve identically.
function displayName(ctx: RoundContext, idx: number): string {
  const full = ctx.players[idx].name;
  const fn = firstName(full);
  if (!ctx.players.some((p, i) => i !== idx && firstName(p.name) === fn)) return fn;
  const parts = full.trim().split(" ").filter(Boolean);
  return parts.length > 1 ? `${fn} ${parts[parts.length - 1][0]}` : fn;
}
// Prose-facing shared-name-aware first name (see displayName). Look it up by
// golferId so builders that hold a player object (not an index) can use it too.
function dName(ctx: RoundContext, idx: number): string {
  return displayName(ctx, idx);
}
function dNameOf(ctx: RoundContext, golferId: number): string {
  const idx = ctx.players.findIndex((p) => p.golferId === golferId);
  return idx >= 0 ? displayName(ctx, idx) : "";
}
// Possessive form of a name: "Joe" -> "Joe's", "Chris" -> "Chris's" (we keep
// the 's on names ending in s -- the league says the extra syllable, "Chris's").
function possess(name: string): string {
  return name + "'s";
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
  const all = ctx.players.map((_p, i) => ({ i, name: displayName(ctx, i), pts: ctx.totalsSeries[i][hole] }));
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
  const art = articleFor(grossWord); // "a"/"an" -- correct before "eight" etc.
  const netDiff = sc.points >= 4 ? -2 : sc.points === 3 ? -1 : sc.points === 2 ? 0 : sc.points === 1 ? 1 : 2;
  const gotStrokes = sc.gross - sc.par > netDiff;
  if (gotStrokes && sc.points >= 2) {
    return [
      { t: `${fn} strokes on ${hole}, so ${art} ${grossWord} nets ` },
      { t: `${netName(sc.points)} -- ${sc.points} points`, b: true },
      { t: ". " },
    ];
  }
  return [
    { t: `${art === "an" ? "An" : "A"} ${grossWord} on ${hole} is worth ` },
    { t: `${sc.points} ${plural(sc.points, "point")}`, b: true },
    { t: ". " },
  ];
}

// cumulative stableford points per hole for one player (momentum lines)
function cumulativePoints(ctx: RoundContext, playerIdx: number, throughHole: number): number[] {
  return ctx.totalsSeries[playerIdx].slice(1, throughHole + 1);
}

// Lead-change crossings between two players, on cumulative POINTS (never the
// Monte Carlo series -- Handoff #6). SINGLE SOURCE OF TRUTH: the rivalry
// caption's flip count and the momentum chart's crossing dots both derive from
// this, so the card can never contradict itself (a caption saying "flips 3
// times" over a chart showing 4 dots). Returns the 0-based hole INDICES where
// the sign of (A - B) flips between hole h-1 and hole h -- both endpoints
// non-zero (a differential that only touches zero and returns is not a flip).
// Index i corresponds to hole i+1 in the per-hole differential series.
function leadCrossIndices(ctx: RoundContext, aIdx: number, bIdx: number): number[] {
  const out: number[] = [];
  for (let h = 1; h <= ctx.maxHole; h++) {
    const before = Math.sign(ctx.totalsSeries[aIdx][h - 1] - ctx.totalsSeries[bIdx][h - 1]);
    const after = Math.sign(ctx.totalsSeries[aIdx][h] - ctx.totalsSeries[bIdx][h]);
    if (before !== 0 && after !== 0 && before !== after) out.push(h - 1);
  }
  return out;
}

// Duel differential chart palette. These are CSS custom-property references
// (design tokens), not raw hex -- the viewer resolves them. Top area = A,
// bottom area = B.
const DIFF_COLOR_TOP = "var(--gold-400)";
const DIFF_COLOR_BOTTOM = "var(--green-400)";

// HISTORICAL per-course scoring splits for the tale-of-the-tape (Handoff #13
// follow-up): NOT this event. Mirrors Analytics > Odds > Head-to-Head, which
// averages each player's stableford points per hole over PRIOR same-course
// rounds (history.holePointsByEvent is already same-course-only, built from
// holeStatsEventIds in buildBeatsInput). We aggregate those per-hole averages
// into Front 9 / Back 9 / Par 3 / Par 4 / Par 5 mean points, so the card shows
// how the two golfers stack up on THIS COURSE over their history, not a
// one-round snapshot. Returns null groups when a player has no prior same-
// course hole data (the caller drops rows both players cannot fill).
interface CourseSplits {
  front: number | null; // avg pts/hole, holes 1-9
  back: number | null;  // avg pts/hole, holes 10-18
  par3: number | null;
  par4: number | null;
  par5: number | null;
}
function historicalCourseSplits(ctx: RoundContext, golferId: number): CourseSplits {
  const h = ctx.history[golferId];
  const pars = ctx.holePars || [];
  const avg = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  // Per-hole historical mean points (same-course), for holes with samples.
  const holeMean: Record<number, number> = {};
  if (h) {
    for (let hole = 1; hole <= 18; hole++) {
      const pts = (h.holePointsByEvent[hole] || []).filter((p): p is number => p != null);
      if (pts.length) holeMean[hole] = pts.reduce((a, b) => a + b, 0) / pts.length;
    }
  }
  const meansFor = (pred: (hole: number) => boolean): number[] =>
    Object.keys(holeMean).map(Number).filter(pred).map((hole) => holeMean[hole]);
  const parIs = (want: number) => (hole: number) => pars[hole - 1] === want;
  return {
    front: avg(meansFor((hole) => hole <= 9)),
    back: avg(meansFor((hole) => hole >= 10)),
    par3: avg(meansFor(parIs(3))),
    par4: avg(meansFor(parIs(4))),
    par5: avg(meansFor(parIs(5))),
  };
}

// Shared-round record between two golfers: of the prior events BOTH played,
// how many did A finish ahead of B. HONESTY: everyone plays the same field,
// so this is NOT a head-to-head record -- it is "finished ahead in N of M
// shared rounds", which is the only true claim. Built by matching the two
// players' parallel recentDates arrays in playerHistory (same source the
// nemesis/redemption detectors read). Returns null when < 3 shared rounds.
function sharedRoundRecord(ctx: RoundContext, aId: number, bId: number): { aAhead: number; total: number } | null {
  const ha = ctx.history[aId], hb = ctx.history[bId];
  if (!ha || !hb) return null;
  const bByDate: Record<string, number> = {};
  hb.recentDates.forEach((d, i) => { bByDate[d] = hb.recentPoints[i]; });
  let aAhead = 0, total = 0;
  ha.recentDates.forEach((d, i) => {
    if (!(d in bByDate)) return;
    total++;
    if (ha.recentPoints[i] > bByDate[d]) aAhead++;
  });
  return total >= 3 ? { aAhead, total } : null;
}

// Population std dev of a player's prior round totals (season consistency).
// Mirrors the analytics tables' raw sigma (points units); lower = steadier.
// null when < 2 rounds. Kept local + tiny rather than importing monteCarlo's
// floored stdDev (that clamp is for odds stability, wrong for a display stat).
function seasonConsistency(ctx: RoundContext, golferId: number): number | null {
  const pts = ctx.history[golferId]?.recentPoints;
  if (!pts || pts.length < 2) return null;
  const mean = pts.reduce((a, b) => a + b, 0) / pts.length;
  const variance = pts.reduce((a, b) => a + (b - mean) * (b - mean), 0) / pts.length;
  return Math.sqrt(variance);
}

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
      const leadFn = dName(c, leaderIdx);
      const nearPts = near - 1; // exclude the leader
      const sp = standingPhrase(c, open, leaderIdx, leadFn);
      // F10 (Handoff #16 3a): the numeric "A {N}-way race" eyebrow may ONLY be
      // used when N is the REAL count -- the caption below prints the true
      // count ("seven golfers sit within two points"), so a capped "five-way"
      // eyebrow over a "seven" caption contradicts itself. When near > 5, drop
      // the numeric variant so a number never appears unless it is the real one.
      const numericEyebrows = near <= 5 ? [`A ${numWord(near)}-way race takes shape`] : [];
      const eyebrow = bunched
        ? pick([
            ...numericEyebrows,
            "Everyone is still in this one",
            "The leaderboard is a logjam early",
            "Nobody blinks through the opening stretch",
          ], seed)
        : pick(["The race takes shape", "An early feel-out round", "The field settles in"], seed + 1);
      // Tie-aware: never assert "leads" when the top is shared.
      const caption: CaptionPart[] = sp.tied
        ? (sp.rank0 === 0 && (tieGroupSizeAt(c, open, leaderIdx) - 1) >= 1
            // Awkward-fix (Handoff #16 6): "X and one other share the lead"
            // instead of "X is tied for the lead with one other ... with the
            // field ..." (double "with", stilted "with one other").
            ? [
                { t: `${leadFn} and ${numWord(tieGroupSizeAt(c, open, leaderIdx) - 1)} ${plural(tieGroupSizeAt(c, open, leaderIdx) - 1, "other")} share the lead through ${open}`, b: true },
                { t: ", with the field still finding its footing." },
              ]
            : [
                { t: `${sp.clause} through ${open}`, b: true },
                { t: ", with the field still finding its footing." },
              ])
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
        // Preview number is subject to the same cap -- never show a capped count.
        preview: bunched && near <= 5 ? `${numWord(near, true)}-Way Race` : "The Opening",
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
  // Probed against the real fixture (7 events), and the numbers set the
  // threshold. The pattern is: a stable top-two pair, tight to each other
  // (g12 <= 2), holding a cushion over 3rd. The longest such run per event, by
  // cushion:
  //   cushion >= 2: [2,0,0,6,0,0,2] -- only ONE event (302, len 6) qualifies,
  //     which is why cushion>=2 left the detector effectively dead.
  //   cushion >= 1: [7,5,2,6,2,3,3] -- three genuine two-horse races surface
  //     (34: Stuart/Joe len 7, 279: Joe/Mark len 5, 302: Stuart/Matt len 6),
  //     while the noise runs stay at 2-3.
  //
  // So: cushion >= 1 (the pair is clear of the field), SUSTAINED for >= 5
  // consecutive holes. Duration is what separates a real duel from a one-hole
  // blip; len 5 is the clean gap between the three real duels (5-7) and the
  // noise (2-3). A cushion of exactly 1 held for a third of the round IS a
  // two-horse race a member would recognise -- the previous >= 2 requirement
  // was calibrated to a fixture artifact, not to what a duel looks like here.
  const DUEL_MIN_CUSHION = 1;
  const DUEL_MIN_HOLES = 5;
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
    // A duel that survived 5+ holes is a genuine shape of the round -- two
    // players clear of the field for a third of the round is a race a member
    // re-tells. Strength scales off duration (the proof it was real) plus a
    // cushion bonus, from a floor that lets a LONG duel compete for a middle
    // slot on merit -- not one so high it displaces stronger beats in a week
    // where the duel is marginal. It wins when it is genuinely the story.
    strength: clamp01(0.6 + (b.len - DUEL_MIN_HOLES) * 0.05 + b.g23 / 14),
    surprise: 0.55,
    evidence: { a: ctx.players[b.aIdx].name, b: ctx.players[b.bIdx].name, throughHole: b.h, holes: b.len, cushion: b.g23, fromHole: b.h - b.len + 1 },
    build: (c, seed) => {
      const aId = c.players[b.aIdx].golferId;
      const bId = c.players[b.bIdx].golferId;
      const fa = displayName(c, b.aIdx);
      const fb = displayName(c, b.bIdx);
      const nameA = fa;
      const nameB = fb;
      const aPts = c.totalsSeries[b.aIdx][b.h];
      const bPts = c.totalsSeries[b.bIdx][b.h];

      // -- TALE OF THE TAPE (lead-in card): a broadcast final-pairing compare.
      // The stat rows are HISTORICAL per-course averages (how these two stack
      // up on THIS COURSE over their history), NOT this event -- mirrors
      // Analytics > Odds > Head-to-Head. Front 9 / Back 9 / Par 3 / Par 4 /
      // Par 5 are avg stableford points per hole; Consistency is season std
      // dev. A row is shown only when BOTH players have data for it.
      const spA = historicalCourseSplits(c, aId), spB = historicalCourseSplits(c, bId);
      const leadOf = (av: number, bv: number, higherWins = true): "a" | "b" | null =>
        av === bv ? null : (higherWins ? av > bv : av < bv) ? "a" : "b";
      const tapeRows: NonNullable<DataBeat["tape"]>["rows"] = [];
      // Higher avg points wins. One decimal (points-per-hole is a small range).
      const addAvgRow = (label: string, a: number | null, b: number | null) => {
        if (a == null || b == null) return;
        tapeRows.push({ label, a: a.toFixed(1), b: b.toFixed(1), lead: leadOf(a, b) });
      };
      addAvgRow("Front 9", spA.front, spB.front);
      addAvgRow("Back 9", spA.back, spB.back);
      // Season consistency (std dev, lower = steadier). Only when both have it.
      const consA = seasonConsistency(c, aId), consB = seasonConsistency(c, bId);
      if (consA != null && consB != null) {
        tapeRows.push({
          label: "Consistency",
          a: consA.toFixed(1),
          b: consB.toFixed(1),
          lead: leadOf(consA, consB, false), // lower sigma wins
        });
      }
      addAvgRow("Par 3", spA.par3, spB.par3);
      addAvgRow("Par 4", spA.par4, spB.par4);
      addAvgRow("Par 5", spA.par5, spB.par5);
      // HONESTY: shared-round phrasing, never a head-to-head record. Everyone
      // plays the same field, so "leads the H2H 7-3" asserts a direct contest
      // that never happened. "finished ahead in N of M shared rounds" is true.
      const rec = sharedRoundRecord(c, aId, bId);
      const nw = (n: number) => (n <= 12 ? numWord(n) : String(n));
      const tapeCaptionParts: CaptionPart[] = rec
        ? [
            // "has finished ahead" is present-perfect -- a standing record, an
            // allowed exception to the present-tense rule (Handoff #16 5).
            { t: `${fa} has finished ahead of ${fb} in ` },
            { t: `${nw(rec.aAhead)} of their last ${nw(rec.total)} shared rounds`, b: true },
            { t: `.` },
          ]
        : [
            { t: `${fa} and ${fb}, ` },
            { t: `stride for stride`, b: true },
            { t: ` at the top of the board.` },
          ];
      // duel_tape eyebrow variety (Handoff #16 8/F6): every duel week previously
      // read "{fa} vs {fb}" at the top. 4 shapes now.
      const tapeEyebrow = pick([
        `${fa} vs ${fb}`,
        `${fa} and ${fb}, side by side`,
        `The final pairing: ${fa}, ${fb}`,
        `Tale of the tape: ${fa}, ${fb}`,
      ], seed + b.h);
      const tape: DataBeat = {
        ...beatHead("duel_tape", "Tale of the Tape", tapeEyebrow),
        hole: null,
        subtext: "Final pairing",
        preview: `${fa} vs ${fb}`,
        protagonistId: aId,
        protagonistName: c.players[b.aIdx].name,
        protagonistInitials: initials(c.players[b.aIdx].name),
        tape: { aName: nameA, bName: nameB, rows: tapeRows },
        caption: tapeCaptionParts,
        strength: 0, mood: "expo",
      };

      // -- DIFFERENTIAL MOMENTUM CHART (payoff card): cumulative (A - B) per
      // hole against a zero centre line. Zero crossings are lead changes.
      // Minimal labelling by design -- names top/bottom, the crossings, nothing
      // else.
      const aCum = cumulativePoints(c, b.aIdx, c.maxHole);
      const bCum = cumulativePoints(c, b.bIdx, c.maxHole);
      const diffVals = aCum.map((v, i) => v - (bCum[i] ?? 0));
      // Crossing dots from the shared source (same rule the rivalry flip count
      // uses) so the chart never contradicts a caption's flip number.
      const duelCross = leadCrossIndices(c, b.aIdx, b.bIdx);

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
        protagonistId: aId,
        protagonistName: c.players[b.aIdx].name,
        protagonistInitials: initials(c.players[b.aIdx].name),
        diff: {
          nameTop: nameA, nameBottom: nameB,
          colorTop: DIFF_COLOR_TOP, colorBottom: DIFF_COLOR_BOTTOM,
          values: diffVals, crossIndices: duelCross, firstHole: 1,
        },
        extraBefore: tape,
        // 3 shapes (Handoff #16 8), awkward "From hole X to Y it is" removed
        // (6), rhythm varied (8a). fromHole..h is the sustained-duel window.
        caption: pick([
          [
            { t: `Holes ${b.h - b.len + 1} to ${b.h} are a two-player fight: ` },
            { t: `${fa} on ${aPts}, ${fb} on ${bPts}`, b: true },
            { t: `, the field ${numWord(b.g23)} ${plural(b.g23, "point")} back.` },
          ],
          [
            { t: `${fa} and ${fb} pull clear for ${numWord(b.len)} holes -- ` },
            { t: `${aPts} plays ${bPts}`, b: true },
            { t: `, nobody else within ${numWord(b.g23)}.` },
          ],
          [
            { t: `Two golfers break ${numWord(b.g23)} clear of the field: ` },
            { t: `${fa} sits on ${aPts} points, ${fb} on ${bPts}`, b: true },
            { t: `.` },
          ],
        ], seed),
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
      const fn = dName(c, w);
      // Softened (Handoff #16 2b): a one-point lead is not "control" and "never
      // threatened" overreaches the margin. State what happened -- led early,
      // never gave up the lead -- which is what the detector actually proves.
      const lead = leadByPhrase(c, open, w, fn);
      const caption: CaptionPart[] = lead
        ? [
            { t: `${lead}`, b: true },
            { t: ` after ${open} holes, and never gives up the lead.` },
          ]
        : [
            { t: `${fn} shares the top spot`, b: true },
            { t: ` after ${open} holes, then pulls clear and stays there.` },
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
      const fn = dName(c, li);
      // pace_setter only fires with margin >= 2, so this is always a solo
      // lead; leadByPhrase keeps that guaranteed rather than assumed.
      const lead = leadByPhrase(c, oh, li, fn) || `${fn} leads the field`;
      const marginW = numWord(m0); // m0 >= 2, always <= field size
      // 3 shapes (Handoff #16 8), rhythm varied off the em-dash (8a).
      const caption: CaptionPart[] = pick<CaptionPart[]>([
        [
          { t: `${lead}` },
          { t: ` through ${oh}. Now the field has to respond.` },
        ],
        [
          { t: `Through ${oh}, ${fn} is out front by ` },
          { t: `${marginW} ${plural(m0, "point")}`, b: true },
          { t: `, and everyone else is playing catch-up.` },
        ],
        [
          { t: `A ${marginW}-point cushion for ${fn} through ${oh}`, b: true },
          { t: ` -- the early marker is set.` },
        ],
      ], seed + oh);
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
        const fn = dName(c, i);
        const sc = scoreAt(c, p.golferId, meritHole);
        const fromRank = ranksAt(c, bst.s - 1)[i];
        const toRank = ranksAt(c, bst.e)[i];
        // Handoff #16 8b: a 10+ hole "run" is most of a round, not a run --
        // frame it as sustained control rather than a burst.
        const bigStretch = stretchLen >= 10;
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
            // Big stretch: control language + a period instead of the em-dash
            // (Handoff #16 8a/8b). Normal run: keeps the run framing.
            const runHero = bigStretch ? "In Control" : "The Run";
            const runEyebrows = bigStretch
              ? [
                  `${fn} is in control for most of the round`,
                  `${fn} controls the middle of the round`,
                  `${fn} takes over and stays there`,
                  `${fn} runs the show for a long stretch`,
                ]
              : [
                  `${possess(fn)} best stretch of the day`,
                  `${fn} strings the good holes together`,
                  `${fn} finds a gear nobody else has`,
                  `${fn} rattles off the run of the day`,
                ];
            const runCaption: CaptionPart[] = bigStretch
              ? [
                  { t: `${fn} plays ${numWord(stretchLen)} straight holes at net par or better for ` },
                  { t: `${stretchPts} points`, b: true },
                  { t: `. ` },
                  ...movement,
                ]
              : [
                  { t: `${numWord(stretchLen, true)} holes, ` },
                  { t: `${stretchPts} points`, b: true },
                  { t: ` -- every one a net par or better. ` },
                  ...movement,
                ];
            return {
              ...beatHead("charge", runHero, pick(runEyebrows, seed + bst.s)),
              hole: meritHole,
              subtext: `Holes ${bst.s}-${bst.e}`,
              preview: bigStretch ? `${fn} In Control` : `${fn}'s Run`,
              protagonistId: p.golferId, protagonistName: p.name, protagonistInitials: initials(p.name),
              holeMeta: holeMetaFor(c, meritHole, p.golferId),
              score: sc,
              streak: { cells, focusStart: bst.s - from, focusCount: stretchLen },
              caption: runCaption,
              strength: 0, mood: "warm",
            };
          }
        }

        return {
          ...beatHead("charge", "The Charge", pick([
            `${fn} makes a move`,
            `${fn} catches fire`,
            `${possess(fn)} charge is on`,
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
      const fn = dName(c, b.i);
      const sc = scoreAt(c, p.golferId, b.h);
      const grossWord = sc ? scoreName(sc.gross, sc.par).toLowerCase() : "big number";
      const grossArt = articleFor(grossWord); // "a" / "an" -- never a bare "+d"
      const ptsWord = sc ? (sc.points === 1 ? "one point" : "zero points") : "nothing";
      const gainer = biggestGainer(c.players, c.series, b.h, b.i);
      const gainerFn = gainer ? dNameOf(c, gainer.golferId) : "";
      const rb = ranksAt(c, b.h - 1)[b.i];
      const ra = ranksAt(c, b.h)[b.i];
      // Movement clause (leading space; joins onto the chosen caption shape).
      const movement: CaptionPart[] = ra > rb
        ? [
            { t: ` ${fn} drops from ${posLabel(rb)} to ` },
            { t: posLabel(ra), b: true },
            { t: gainer ? `, and ${gainerFn} takes advantage.` : "." },
          ]
        : rb === 0
          ? (() => {
              const ma = marginAt(c, b.h, b.i);
              return ma > 0
                ? [{ t: ` The lead shrinks to ` }, { t: `${numWord(ma)} ${plural(ma, "point")}`, b: true }, { t: "." }]
                : [{ t: ` The lead is ` }, { t: "gone", b: true }, { t: "." }];
            })()
          : [{ t: ` ${fn} hangs on to ${posLabel(ra)}, but the door is open` }, { t: gainer ? ` for ${gainerFn}.` : "." }];
      // Structural variety (Handoff #16 8): distinct sentence shapes, not
      // synonym swaps. Shape 1 leads with the score (em-dash), 2 leads with the
      // consequence (colon), 3 is a short two-sentence declarative (period).
      const openers: CaptionPart[][] = [
        [
          { t: `${articleFor(grossWord) === "an" ? "An" : "A"} ${grossWord} nets ${fn} ` },
          { t: ptsWord, b: true },
          { t: ` -- the biggest swing of the day.` },
        ],
        [
          { t: `The biggest swing of the day: ${fn} cards ${grossArt} ` },
          { t: `${grossWord} on ${b.h}`, b: true },
          { t: ` for ${ptsWord}.` },
        ],
        [
          { t: `${fn} runs into ${grossArt} ` },
          { t: `${grossWord} on ${b.h}`, b: true },
          { t: `. ${ptsWord === "one point" ? "One point" : "Nothing"} on the hole, and the day's biggest swing.` },
        ],
      ];
      return {
        ...beatHead("collapse", "The Turning Point", pick([
          `Hole ${b.h} bites ${fn}`,
          `${articleFor(grossWord) === "an" ? "An" : "A"} ${grossWord} stalls ${possess(fn)} run`,
          `${fn} finds trouble on ${b.h}`,
          `The round turns on ${possess(fn)} ${grossWord}`,
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
          ...pick(openers, seed + b.h),
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
      const fn = dName(c, w);
      const sc = scoreAt(c, p.golferId, crossHole);
      const crossM = marginAt(c, crossHole, w);
      const left = c.maxHole - crossHole;
      // Present tense (Handoff #16 5): "falls"/"vanishes", not "fell"/"vanished".
      const opener: CaptionPart[] = minMargin < 0
        ? [{ t: `${fn} falls ${numWord(-minMargin)} ${plural(-minMargin, "point")} behind mid-round, but answers on ${crossHole}` }]
        : [{ t: `The lead vanishes mid-round, but ${fn} answers on ${crossHole}` }];
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
      // endHole = the burst's last hole; the fast start RESOLVES there (the
      // composer sorts on it, not on the mid-burst anchor).
      evidence: { merit: m, anchor, endHole: st.e, check, rankAtCheck },
      build: (c, seed) => {
        const fn = dName(c, i);
        const sc = scoreAt(c, p.golferId, anchor);
        let n3 = 0;
        for (let h = 1; h <= check; h++) { if ((c.pointsAt[p.golferId + "|" + h] ?? 0) >= 3) n3++; }
        const totalPts = c.totalsSeries[i][check];
        const mAtCheck = marginAt(c, check, i);
        const openerText = n3 >= 2
          ? `${numWord(n3, true)} net ${plural(n3, "birdie")} in the first ${numWord(check)} holes`
          : `${totalPts} points through the first ${numWord(check)} holes`;
        const spCheck = standingPhrase(c, check, i, fn);
        // Standing clause as plain text (no leading separator) so the shapes
        // below can join it with a period, a comma, or an em-dash (Handoff #16
        // 8/8a) rather than always the same " -- " pivot.
        const statusText = rankAtCheck === 0 && mAtCheck >= 1
          ? `nobody is close to ${fn} through ${check}`
          : rankAtCheck === 0
            ? `${fn} sits level at the top through ${check}`
            : `${fn} sits ${spCheck.noun} through ${check}`;
        const statusCap = statusText.charAt(0).toUpperCase() + statusText.slice(1);
        const captions: CaptionPart[][] = [
          [{ t: `${openerText} -- ` }, { t: statusText, b: true }, { t: `.` }],
          [{ t: `${openerText}. ` }, { t: statusCap, b: true }, { t: `.` }],
          [{ t: `${statusCap}: ` }, { t: openerText, b: true }, { t: `.` }],
        ];
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
          caption: pick(captions, seed + anchor),
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
        const fn = dName(c, i);
        // Position trace (Handoff #14 §2): the SHAPE of the fade. Tie-aware
        // finish position per hole via ranksAt (the same primitive
        // standingPhrase uses -- one ranking implementation). peakIndex is the
        // detector's checkHole; splitIndex is the LAST hole still at that peak.
        // BUILT FIRST so the caption's "spots dropped" reads from THIS series
        // (Handoff #16 3b/F8): one computation, two consumers -- the number in
        // the caption can never disagree with what the chart plots.
        const ranks: number[] = [];
        for (let h = 1; h <= c.maxHole; h++) ranks.push(ranksAt(c, h)[i]);
        const peakIndex = checkHole - 1; // 0-based hole index
        let splitIndex = peakIndex;
        for (let h = checkHole; h <= c.maxHole; h++) {
          if (ranksAt(c, h)[i] === bestRank) splitIndex = h - 1; else break;
        }
        const traceLost = ranks[ranks.length - 1] - ranks[peakIndex]; // spots dropped, from the trace
        // Tie-aware: at the early checkpoint the leader may be tied. "the man
        // to beat" would be false in a shared lead. Present tense (Handoff #16
        // 5): "sits"/"slides", not "was"/"slid".
        const spEarly = standingPhrase(c, checkHole, i, fn);
        const spFinal = standingPhrase(c, null, i, fn);
        const phrase = bestRank === 0
          ? (spEarly.tied ? "shares the lead" : "is the man to beat")
          : (spEarly.tied ? `is tied for ${posLabel(bestRank)}` : `sits ${posLabel(bestRank)}`);
        const finalNoun = spFinal.tied ? `a share of ${posLabel(finalRank)}` : posLabel(finalRank);
        const closer = checkHole <= 9 && c.maxHole >= 16 ? "The back nine has other ideas." : "The closing stretch has other ideas.";
        const caption: CaptionPart[] = pick([
          [
            { t: `${fn} ${phrase} through ${checkHole}. ` },
            { t: closer, b: true },
          ],
          [
            { t: `${fn} ${phrase} through ${checkHole}, then slides to ` },
            { t: finalNoun, b: true },
            { t: " by the end." },
          ],
          [
            { t: `A strong start fades: ${fn} drops ` },
            { t: `${numWord(traceLost)} spots`, b: true },
            { t: ` after hole ${checkHole} and finishes ${finalNoun}.` },
          ],
        ], seed + checkHole);
        // Labels reuse the tie-aware phrasing already computed above -- never
        // hardcoded to "1st" (a fade from 2nd is valid), tie prefix "T".
        const peakLabel = `${spEarly.tied ? "T" : ""}${posLabel(bestRank)}`;
        const finishLabel = `${spFinal.tied ? "T" : ""}${posLabel(finalRank)}`;
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
          positionTrace: { ranks, peakIndex, splitIndex, peakLabel, finishLabel },
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
      const fa = dName(c, leadIdx);
      const fb = dName(c, ord[1]);
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
        const fn = dName(c, i);
        const nBogs = ptsList.filter((d) => d === 1).length;
        // Position as a NUMERAL (Handoff #16 7e), matching the leaderboard's POS
        // column -- "2nd", not "second". Beyond 3rd, "near the top".
        const place = ctx.ranks[i] <= 2 ? posLabel(ctx.ranks[i]) : "near the top";
        const blowupPhrase = nBlank === 0 ? "zero blowups" : "just one blowup";
        const steadiest = nBlank === 0 ? "the steadiest card in the field" : "one of the steadiest cards out there";
        // Counts <= 12 as words (Handoff #16 7b); larger stays a digit.
        const nw = (n: number) => (n <= 12 ? numWord(n) : String(n));
        const cardStat = `${nw(nPar)} net ${plural(nPar, "par")}, ${nw(nBogs)} net ${plural(nBogs, "bogey")}, ${blowupPhrase}`;
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
          caption: pick([
            [
              { t: `${cardStat}`, b: true },
              // "with" not "on" (Handoff #16 6): a card is scored WITH, not ON.
              { t: ` -- ${steadiest}, and it lands ${fn} ${place}.` },
            ],
            [
              { t: `${fn} grinds to ${place} with ${steadiest}`, b: true },
              { t: `: ${cardStat}.` },
            ],
            [
              { t: `Not a wasted hole from ${fn} -- ${cardStat}` },
              { t: `, good for ${place}.`, b: true },
            ],
          ], seed + 1),
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
        const fn = dName(c, i);
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
          caption: pick([
            [
              { t: `${numWord(nBird, true)} net ${plural(nBird, "birdie")}, ${numWord(nBlank)} ${plural(nBlank, "blowup")}`, b: true },
              { t: ` -- ${fn} never plays a boring hole.` },
            ],
            [
              { t: `${fn}'s card swings from brilliant to buried and back` },
              { t: `: ${numWord(nBird)} net ${plural(nBird, "birdie")} against ${numWord(nBlank)} ${plural(nBlank, "blowup")}.`, b: true },
            ],
            [
              { t: `Feast or famine on one scorecard for ${fn}`, b: true },
              { t: ` -- ${numWord(nBird)} net ${plural(nBird, "birdie")} and ${numWord(nBlank)} ${plural(nBlank, "blowup")}, nothing in between.` },
            ],
          ], seed),
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
    build: (c, seed) => {
      const empties = w.buckets[3]; // cards scoring zero points (blowups)
      const avgStr = w.avg.toFixed(1);
      // numWord only for counts <= 12 (Handoff #16 7b); larger stays a digit.
      const nw = (n: number) => (n <= 12 ? numWord(n) : String(n));
      // Present tense (Handoff #16 5); "blowup" replaces "came up empty"
      // (Handoff #16 7a); 3 distinct sentence shapes (Handoff #16 8), rhythm
      // varied off the em-dash (Handoff #16 8a).
      const captions: CaptionPart[][] = [
        [
          { t: `The field averages just ` },
          { t: `${avgStr} points`, b: true },
          { t: ` here, and ${nw(empties)} of ${nw(w.n)} cards are a blowup.` },
        ],
        [
          { t: `${nw(empties)} of ${nw(w.n)} cards come away with a blowup: hole ${w.hole} averages ` },
          { t: `${avgStr} points`, b: true },
          { t: `.` },
        ],
        [
          { t: `Hole ${w.hole} yields ` },
          { t: `${avgStr} points`, b: true },
          { t: ` a card. ${nw(empties).charAt(0).toUpperCase() + nw(empties).slice(1)} of ${nw(w.n)} golfers walk off with zero.` },
        ],
      ];
      return {
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
        caption: pick(captions, seed + w.hole),
        strength: 0, mood: "cool",
      };
    },
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
        const fn = dNameOf(c, p.golferId);
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
          caption: pick([
            // Structural variety, all self-contained and under budget: lead
            // with the deficit / with the name / with today's result. Present
            // tense; dramatic "owns"/"demon" language KEPT (Handoff #16 1). G4
            // (Handoff #16 4d): every clause has an explicit subject -- "{fn}
            // plays it {deficit} below the field", never a dangling "hole N ...
            // 0.7 below the field" that reads as the hole being below the field.
            [
              { t: `${fn} usually loses ${Math.abs(deficit).toFixed(1)} points a round to hole ${worstHole}`, b: true },
              { t: `, more than anywhere on the course. Today: a net ${netName(sc.points)} for ${numWord(sc.points)}.` },
            ],
            [
              { t: `Hole ${worstHole} owns ${fn} more than any other -- ${fn} plays it ${Math.abs(deficit).toFixed(1)} points below the field.`, b: true },
              { t: ` Not today: a net ${netName(sc.points)}, ${sc.points} points.` },
            ],
            [
              { t: `${fn} nets a ${netName(sc.points)} on ${worstHole} for ${sc.points} points`, b: true },
              { t: `, on the hole that costs ${fn} ${Math.abs(deficit).toFixed(1)} points a round more than the field.` },
            ],
          ], seed + worstHole),
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
        const fn = dName(c, i);
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
                // counts <= 12 through numWord (Handoff #16 7b).
                { t: `First round after ${hist.weeksAbsent <= 12 ? numWord(hist.weeksAbsent) : hist.weeksAbsent} weeks away, and ${fn} posts ` },
                { t: `${thisTotal} points`, b: true },
                { t: ` to land near the top of the board.` },
              ]
            : [
                { t: `${thisTotal} points`, b: true },
                { t: ` beats everything ${fn} has posted in the last ${window.length <= 12 ? numWord(window.length) : window.length} starts.` },
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
        const fn = dName(c, i);
        const window = hist.recentPoints.slice(-5);
        const dates = hist.recentDates.slice(-5);
        const bars = window.map((v, idx) => ({
          label: shortDate(dates[idx]) || `Rd ${idx + 1}`, value: v, text: String(v), highlight: false,
        }));
        bars.push({ label: "Today", value: thisTotal, text: String(thisTotal), highlight: true });
        const avg = hist.mean.toFixed(1);
        // Structural variety (Handoff #16 8/F11): the down-branch previously
        // closed every bad round with the identical "everyone gets one of
        // these." Both branches now have 3 distinct shapes. G2 (Handoff #16 4b):
        // "{n} points SIT" (plural verb) and "{fn}'s season average" (not the
        // orphan "a season average"). Rhythm varied (period / colon / comma),
        // not all em-dash.
        const upCaptions: CaptionPart[][] = [
          [
            { t: `${possess(fn)} ${thisTotal} points`, b: true },
            { t: ` sit well above ${possess(fn)} season average of ` },
            { t: avg, b: true },
            { t: `. This is the outlier round of ${possess(fn)} year so far.` },
          ],
          [
            { t: `${fn} averages ${avg} a round, then posts ` },
            { t: `${thisTotal}`, b: true },
            { t: `: a career day.` },
          ],
          [
            { t: `Where does that come from? ${possess(fn)} ` },
            { t: `${thisTotal} points`, b: true },
            { t: ` tower over a ${avg} average.` },
          ],
        ];
        const downCaptions: CaptionPart[][] = [
          [
            { t: `${fn} posts just ${thisTotal} points`, b: true },
            { t: `, well below ${possess(fn)} season average of ` },
            { t: avg, b: true },
            { t: `. Everyone gets one of these.` },
          ],
          [
            { t: `${possess(fn)} season average is ${avg}. Today: ` },
            { t: `${thisTotal}`, b: true },
            { t: `, and a day to forget.` },
          ],
          [
            { t: `A rare off day for ${fn} -- ` },
            { t: `${thisTotal} points`, b: true },
            { t: ` against a ${avg} average.` },
          ],
        ];
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
          // SELF-CONTAINED (Handoff #10 5): always NAME the golfer; the caption
          // must stand without the eyebrow. Both branches lead with the name.
          caption: pick(up ? upCaptions : downCaptions, seed + 2),
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
      // crossings on cumulative totals, not on the Monte Carlo series (Handoff
      // #6). SINGLE SOURCE: leadCrossIndices feeds both the caption count here
      // and the chart's dots below, so they can never disagree (Handoff #14).
      const crossIdx = leadCrossIndices(ctx, i, j);
      const crossings = crossIdx.length;
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
          const fa = displayName(c, aIdx);
          const fb = displayName(c, bIdx);
          const nFlips = crossings <= 12 ? numWord(crossings) : String(crossings);
          // 3 distinct shapes (Handoff #16 8), counts through numWord (7b),
          // rhythm varied off the em-dash (8a): declarative / colon-lead /
          // consequence-first.
          const captions: CaptionPart[][] = [
            [
              { t: `The points lead between them flips ` },
              { t: `${nFlips} times`, b: true },
              { t: ` before ${fa} lands the last punch.` },
            ],
            [
              { t: `${fa} and ${fb} swap the lead ` },
              { t: `${nFlips} times`, b: true },
              { t: `. ${fa} has it when it counts.` },
            ],
            [
              { t: `${nFlips} lead changes between ${fa} and ${fb}`, b: true },
              { t: `, and ${fa} settles it at the last.` },
            ],
          ];
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
            // Same differential momentum chart as the duel (Handoff #14 §3):
            // one renderer, two consumers. A rivalry IS the lead changing
            // hands, so zero crossings are the whole story. crossIndices come
            // from the SAME leadCrossIndices() the caption count uses -- the
            // crossIdx above is order-invariant (sign flips of i-j equal those
            // of aIdx-bIdx), so the dots and "flips N times" always match.
            diff: {
              nameTop: displayName(c, aIdx), nameBottom: displayName(c, bIdx),
              colorTop: DIFF_COLOR_TOP, colorBottom: DIFF_COLOR_BOTTOM,
              values: cumulativePoints(c, aIdx, c.maxHole).map((v, k) => v - (cumulativePoints(c, bIdx, c.maxHole)[k] ?? 0)),
              crossIndices: crossIdx, firstHole: 1,
            },
            caption: pick(captions, seed + 1),
            strength: 0, mood: "warm",
          };
        },
      });
    }
  }
  return out;
};

// -- bounce_back: a blow-up immediately answered on the very next hole --------
// A hole scoring 0 points (net double or worse) followed DIRECTLY by a hole
// scoring 3+ points (net birdie or better) by the same golfer. The recovery,
// not the blow-up, is the story -- so it resolves at the GOOD hole. Points-
// based throughout (this is a net-league merit beat, not a gross achievement).
// Competes normally: subject to all cooldowns, diversity, spread. Strength
// reflects the swing size and the merit of the answer.
const detectBounceBack: Detector = (ctx) => {
  const out: BeatCandidate[] = [];
  ctx.players.forEach((p) => {
    // Take the single best bounce-back per player (biggest combined swing), so
    // one golfer cannot flood the pool with several.
    let best: { blankHole: number; goodHole: number; goodPts: number } | null = null;
    for (let h = 1; h < ctx.maxHole; h++) {
      const p0 = ctx.pointsAt[p.golferId + "|" + h];
      const p1 = ctx.pointsAt[p.golferId + "|" + (h + 1)];
      if (p0 !== 0 || p1 == null || p1 < 3) continue;
      if (!best || p1 > best.goodPts) best = { blankHole: h, goodHole: h + 1, goodPts: p1 };
    }
    if (!best) return;
    const b = best;
    // Swing = the good hole's points (3..4) plus the 2-point hole it recovered
    // from the blank; normalized to a 0..1 strength.
    const strength = clamp01(0.4 + (b.goodPts - 3) * 0.15 + 0.15);
    out.push({
      angle: "bounce_back",
      slot: "middle",
      protagonistId: p.golferId,
      hole: b.goodHole,
      strength,
      surprise: 0.6,
      evidence: { blankHole: b.blankHole, goodHole: b.goodHole, goodPts: b.goodPts },
      build: (c, seed) => {
        const fn = dNameOf(c, p.golferId);
        const goodSc = scoreAt(c, p.golferId, b.goodHole);
        // Streak strip: the two focused holes (blank -> answer) with a hole of
        // context on each side where it exists, surrounding holes dimmed.
        const from = Math.max(1, b.blankHole - 1);
        const to = Math.min(c.maxHole, b.goodHole + 1);
        const cells: NonNullable<DataBeat["streak"]>["cells"] = [];
        for (let h = from; h <= to; h++) {
          const cellSc = scoreAt(c, p.golferId, h);
          if (!cellSc) { cells.length = 0; break; }
          cells.push({ hole: h, ...cellSc });
        }
        const netWord = b.goodPts >= 4 ? "net eagle" : "net birdie";
        const sp = standingPhrase(c, b.goodHole, c.players.findIndex((x) => x.golferId === p.golferId), fn);
        // Standing tag: only when it says something true (a lead grab). Kept
        // as a separate fragment so the caption shapes can slot it or not.
        const leadTag = sp.rank0 === 0 ? (sp.tied ? " and grabs a share of the lead" : " and takes the lead") : "";
        // Structural caption variety (Handoff #9): distinct SENTENCE SHAPES,
        // not one template with swapped nouns. Each is self-contained (names
        // the golfer) and points-based. Seeded so it is stable per event.
        const caption: CaptionPart[] = pick<CaptionPart[]>([
          // 1) zero-pointer-then-answer, standing tag inline
          [
            { t: `A zero pointer on ${b.blankHole}, then a ` },
            { t: `${netWord} on ${b.goodHole}`, b: true },
            { t: ` -- ${fn} answers immediately${leadTag}.` },
          ],
          // 2) lead with the recovery, the blowup as the setup clause
          [
            { t: `${fn} follows a blowup on ${b.blankHole} with a ` },
            { t: `${netWord} on ${b.goodHole}`, b: true },
            { t: `${leadTag}.` },
          ],
          // 3) zero-to-good framing, points spread named
          [
            { t: `Zero points on ${b.blankHole}, ${b.goodPts} on ${b.goodHole}` },
            { t: ` -- ${fn} turns it around on the very next hole`, b: true },
            { t: `${leadTag}.` },
          ],
          // 4) resilience framing, no "straight back" echo of the eyebrow
          [
            { t: `${fn} shakes off the blowout on ${b.blankHole} with a ` },
            { t: `${netWord} on ${b.goodHole}`, b: true },
            { t: `, no damage done${leadTag}.` },
          ],
        ], seed + b.goodHole);
        return {
          ...beatHead("bounce_back", "The Answer", pick([
            `${fn} answers right back`,
            `${fn} refuses to let it linger`,
            `${fn} bounces back on ${b.goodHole}`,
            `${fn} rights the ship on ${b.goodHole}`,
          ], seed + b.goodHole + 1)),
          hole: b.goodHole,
          subtext: `Holes ${b.blankHole}-${b.goodHole}`,
          preview: `${fn} Bounces Back`,
          protagonistId: p.golferId, protagonistName: p.name, protagonistInitials: initials(p.name),
          holeMeta: holeMetaFor(c, b.goodHole, p.golferId),
          score: goodSc,
          ...(cells.length > 0 ? { streak: { cells, focusStart: b.blankHole - from, focusCount: 2 } } : {}),
          caption,
          strength: 0, mood: "warm",
        };
      },
    });
  });
  return out;
};

const DETECTORS: Detector[] = [
  detectThreeWay, detectDuel, detectWireToWire, detectPaceSetter,
  detectCharge, detectCollapse, detectHold, detectFastStart, detectFade, detectTheTurn,
  detectBounceBack,
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
// gone this low here, "{fn}'s first here" is honest; otherwise assert nothing.
//
// CLAIM SCOPE (Handoff #16 2a) -- DO NOT "upgrade" this to an all-time or
// league-wide claim. Only ~8 weeks of hole-by-hole data exist, which cannot
// support "ever" or "first in league history". The copy therefore says
// "{fn}'s first here" (this golfer, this hole, this course) with NO "ever" --
// that is exactly what this query proves. A season-wide "first eagle this
// season" would need all-hole gross history we do not carry.
function isFirstFireworksHere(ctx: RoundContext, golferId: number, hole: number): boolean {
  const par = ctx.holePars[hole - 1];
  const past = ctx.history[golferId]?.holeGrossByEvent[hole];
  if (par == null || !past || past.length === 0) return false; // no history => cannot claim
  return past.every((g) => g > par - 2); // none was an eagle-or-better here
}

function buildFireworksBeat(ctx: RoundContext, p: RecapPlayer, hole: number, angle: FireworksBeat["angle"], seed: number): DataBeat {
  const fn = dNameOf(ctx, p.golferId);
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
      `${fn} aces the ${hole}${ordSuffix(hole)}`,
      `A hole-in-one for ${fn}`,
      `${fn} makes one disappear on ${hole}`,
      `Ace. ${fn}. Hole ${hole}.`,
      `${fn} finds the bottom of the cup on ${hole}`,
      `The tee shot of the day belongs to ${fn}`,
    ];
    eyebrow = pick(eyebrows, seed + hole);
    caption = [
      { t: `${pts} ${plural(pts, "point")}, but nobody is talking about the points: ${fn} makes a ` },
      { t: `hole-in-one`, b: true },
      { t: ` on the ${hole}${ordSuffix(hole)}` },
      ...(firstHere ? [{ t: `, ${fn}'s first here` }] : []),
      { t: `.` },
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
      { t: `${pts} ${plural(pts, "point")} on the card${firstHere ? `, ${fn}'s first here` : ""}, but the number that matters is ` },
      { t: `gross ${gross} on a par ${par}`, b: true },
      { t: `: ${fn} makes an ` },
      { t: `albatross`, b: true },
      { t: ` on ${hole}.` },
    ];
  } else {
    const eyebrows = [
      `${fn} eagles the ${hole}${ordSuffix(hole)}`,
      `An eagle for ${fn} on ${hole}`,
      `${fn} goes two-under on one hole`,
      `${fn} lights up hole ${hole}`,
      `Eagle. ${fn}. Hole ${hole}.`,
      `${fn} takes a big bite out of ${hole}`,
    ];
    eyebrow = pick(eyebrows, seed + hole);
    // Restructured (Handoff #16 6): the achievement CLOSES the sentence, not
    // the points. gross scope claim is "{fn}'s first here" -- see
    // isFirstFireworksHere for why "ever"/league-wide is not supported.
    caption = [
      { t: `${pts} ${plural(pts, "point")}${firstHere ? `, and ${fn}'s first here` : ""}: ${fn} goes ` },
      { t: `gross ${gross} on a par ${par}`, b: true },
      { t: ` and makes an ` },
      { t: `eagle`, b: true },
      { t: ` on ${hole}.` },
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

// -- skins beat: a skin won with a GROSS birdie or better ----------------------
//
// DELIBERATE GROSS EXCEPTION -- the SECOND after fireworks. DO NOT convert to
// net. Everywhere else in this engine points are the valence unit, because a
// gross bogey on a stroke hole is a NET par worth 2 points, and net birdies
// are ROUTINE in this handicap league (so a net birdie skin is not a story).
// But a GROSS birdie-or-better is a real golf achievement independent of
// strokes, and a skin won that way is exactly what the group talks about.
// Converting this to net would silently delete the feature -- leave it gross.
//
// SKINS SOURCE OF TRUTH: the winner per hole is the SINGLE player with the max
// Stableford POINTS among the skins-paying field (ties => no skin), identical
// to the skins card's calcSkinHoleWinnersForEvent. We recompute the WINNER
// with that exact rule (never an independent skins algorithm) so the recap can
// never disagree with the leaderboard's skins card. Payout per skin = the
// skins pot / total skins won -- NO carryover (this league divides the pot,
// there is no accumulated value).
//
// It is a CERTAINTY like fireworks: additive, exempt from anti-repeat, and
// capped at exactly ONE per event. Fireworks trumps it (see composeBeats).
export interface SkinsBeat {
  hole: number;
  protagonistId: number;
  build: (ctx: RoundContext, seed: number) => DataBeat;
}

// All skins won this event, decorated with the winner's gross/par/points on
// that hole (the recap needs the gross to classify birdie-or-better).
//
// The WINNER RULE (sole Stableford-points leader per hole, ties => no skin) is
// NOT reimplemented here -- it calls the shared computeSkinWinners in lib/skins,
// the same function the skins card uses. This function only maps the winners to
// the recap's richer shape; if the rule ever changes, it changes in one place.
function computeSkins(ctx: RoundContext): { hole: number; golferId: number; gross: number; par: number; points: number }[] {
  const scores: SkinHoleScore[] = [];
  ctx.players.forEach((p) => {
    for (let h = 1; h <= ctx.maxHole; h++) {
      const pts = ctx.pointsAt[p.golferId + "|" + h];
      if (pts != null) scores.push({ golferId: p.golferId, hole: h, points: pts });
    }
  });
  const winners = computeSkinWinners(scores);
  const out: { hole: number; golferId: number; gross: number; par: number; points: number }[] = [];
  for (const [holeStr, golferId] of Object.entries(winners)) {
    const h = Number(holeStr);
    const par = ctx.holePars[h - 1];
    const gross = ctx.grossAt[golferId + "|" + h];
    const points = ctx.pointsAt[golferId + "|" + h];
    if (par == null || gross == null || points == null) continue;
    out.push({ hole: h, golferId, gross, par, points });
  }
  out.sort((a, b) => a.hole - b.hole);
  return out;
}

// The single skins beat for this event (or none). Gross birdie-or-better only,
// seeded LRU pick among qualifiers. `historyKeyUsed` is the set of recently
// used "skins|protagonist|hole" keys for the soft freshness preference.
function detectSkins(ctx: RoundContext, seed: number, recentSkinKeys: { protagonistId: number | null; hole: number | null }[]): SkinsBeat | null {
  if (ctx.skinsPaidCount <= 0) return null;
  const skins = computeSkins(ctx);
  const totalSkins = skins.length;
  if (totalSkins === 0) return null;
  // Per-skin value from the shared calc (pot / total skins won) -- the same
  // formula the skins card uses, so the recap's $ figure can never diverge.
  const perSkin = computeSkinValue(ctx.skinsPaidCount, totalSkins);
  // Gross birdie or better only. A net-birdie / net-par skin does not qualify.
  const qualifying = skins.filter((s) => s.gross - s.par <= -1);
  if (qualifying.length === 0) return null;

  // Seeded shuffle (mulberry32 on event_id -- NEVER Math.random), then a SOFT
  // preference for the least-recently-used (protagonist, hole): stable-sort by
  // recency so ties keep the shuffled order. Recency is a preference, not a
  // block -- one qualifier always surfaces.
  const rng = mulberry32(seed ^ 0x5c1c5); // distinct stream from the series
  const shuffled = qualifying
    .map((s) => ({ s, r: rng() }))
    .sort((a, b) => a.r - b.r)
    .map((x) => x.s);
  const recencyOf = (s: { golferId: number; hole: number }): number => {
    // 0 = never seen (freshest); otherwise (window - eventsAgo)-ish rank is not
    // available here, so treat "appears in recent keys" as used (rank 1) and
    // absent as 0. Absent is preferred.
    return recentSkinKeys.some((k) => k.protagonistId === s.golferId && k.hole === s.hole) ? 1 : 0;
  };
  shuffled.sort((a, b) => recencyOf(a) - recencyOf(b)); // stable: LRU first
  const chosen = shuffled[0];

  return {
    hole: chosen.hole,
    protagonistId: chosen.golferId,
    build: (c, s2) => buildSkinsBeat(c, chosen, perSkin, totalSkins, s2),
  };
}

function buildSkinsBeat(
  ctx: RoundContext,
  skin: { hole: number; golferId: number; gross: number; par: number; points: number },
  perSkin: number,
  totalSkins: number,
  seed: number,
): DataBeat {
  const p = ctx.players.find((x) => x.golferId === skin.golferId)!;
  const fn = dNameOf(ctx, skin.golferId);
  const sc = scoreAt(ctx, skin.golferId, skin.hole);
  const grossWord = scoreName(skin.gross, skin.par); // "Birdie" / "Eagle" ...
  const payoutStr = `$${Math.round(perSkin)}`;
  // Is this the only gross-birdie-or-better skin? (True "the only one" claim.)
  const grossBirdieSkins = computeSkins(ctx).filter((s) => s.gross - s.par <= -1).length;
  const onlyOne = grossBirdieSkins === 1;

  // No carryover language anywhere -- the pot is divided, never accumulated.
  const gw = grossWord.toLowerCase();
  const art = articleFor(gw); // "an eagle" reads right; "a birdie" too.
  const eyebrow = pick([
    `${fn} takes a skin on ${skin.hole}`,
    `${art === "an" ? "An" : "A"} ${gw} banks ${fn} a skin`,
    `${fn} cashes in on ${skin.hole}`,
    `Skin money for ${fn} on ${skin.hole}`,
  ], seed + skin.hole);

  // Lead with the achievement and NAME the golfer (self-contained). Two shapes
  // for variety across weeks; NO carryover language (pot is divided).
  const onlyClause = onlyOne ? " -- the only one in the field" : "";
  const caption: CaptionPart[] = pick([
    [
      { t: `${possess(fn)} ${gw} on ${skin.hole}${onlyClause} banks a skin worth ` },
      { t: payoutStr, b: true },
      { t: `.` },
    ],
    [
      { t: `${art === "an" ? "An" : "A"} ${gw} on ${skin.hole}${onlyClause}, and ${fn} takes a skin worth ` },
      { t: payoutStr, b: true },
      { t: `.` },
    ],
  ], seed + skin.hole);

  return {
    ...beatHead("skins", "The Skin", eyebrow),
    hole: skin.hole,
    preview: `${fn}'s Skin`,
    protagonistId: skin.golferId,
    protagonistName: p.name,
    protagonistInitials: initials(p.name),
    holeMeta: holeMetaFor(ctx, skin.hole, skin.golferId),
    score: sc,
    // Glass panel: gross score in .sc-* notation + the skin value. scoreRow
    // carries one cell (the winning hole) and the payout as its avg line.
    scoreRow: {
      cells: [{ gross: skin.gross, par: skin.par, points: skin.points, label: `Hole ${skin.hole}`, highlight: true }],
      avgLabel: totalSkins === 1 ? "Skin value" : `1 of ${totalSkins} skins`,
      avgValue: payoutStr,
    },
    caption,
    strength: 0.9,
    mood: "warm",
  };
}

// ===== COMPOSER ================================================================

export interface SelectBeatsInput {
  eventId: number;
  players: RecapPlayer[]; // paid, deduped entries in leaderboard order
  scores: RecapHoleScore[];
  holePars: number[]; // from courses.hole_pars (may be empty)
  finalStandings: BeatStandingRow[]; // tie-aware, top 5
  // Tie-aware WHOLE field (Handoff #9 §5): the standings-board renderer shows
  // the full field, not an arbitrary top N. Omitted => falls back to
  // finalStandings so older callers still work.
  fullStandings?: BeatStandingRow[];
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
  // Number of entries paying into the skins pot (event_leaderboard.skins_paid
  // count). The skins pot is this * $10 (LeaderboardTab). Omitted => the skins
  // detector cannot state a payout and its detector no-ops.
  skinsPaidCount?: number;
  // Pre-round frozen odds per golfer (event_odds snapshot_hole=0, static once
  // written). Used ONLY by the duel tape card, and only quoted when present --
  // never estimated. Omitted => the tape drops the projection row.
  preRoundOdds?: Record<number, { projectedFinal: number | null; winPct: number | null }>;
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
    skinsPaidCount: input.skinsPaidCount ?? 0,
    preRoundOdds: input.preRoundOdds || {},
  };
}

// The hole where a beat's story RESOLVES -- the single key the composer sorts
// on for chronological order (Handoff #8). A candidate may carry an explicit
// span end in its evidence (charge/fast_start endHole, duel throughHole);
// otherwise a single-hole beat resolves at its hole, and a whole-round
// character beat (hole == null: fade/wildcard/grinder/rivalry/redemption/
// out_of_character) resolves at the last hole so it lands next to the finish
// it belongs to. The opening's throughHole is its resolution hole.
function resolutionHoleFor(c: BeatCandidate, ctx: RoundContext): number {
  const ev = c.evidence || {};
  const endFromEvidence = (ev.endHole ?? ev.throughHole) as number | undefined;
  if (typeof endFromEvidence === "number") return endFromEvidence;
  if (c.hole != null) return c.hole;
  return ctx.maxHole; // whole-round beat -> resolves at the finish
}

// Position-aware label/copy for the guaranteed race-state beat (Handoff #8).
// "The Opening" and any earliness phrasing are only TRUE when this beat is
// chronologically first among the hole-bearing beats. When it is not (an
// eagle or a run resolved on an earlier hole), we relabel to a position-
// neutral, angle-specific hero label and rewrite the earliness copy -- routed
// through this one helper so no template asserts earliness out of place.
//
// pace_setter / wire_to_wire bake earliness into their MEANING ("one clear
// early leader", "dominant from early and never wobbled"), and those claims
// stay true even if an eagle happened on 4 -- so their hero labels ("The Pace
// Setter" / "Wire to Wire") are already position-neutral and are left as-is.
// three_way is the only one that self-labels "The Opening" and leans on
// "takes shape / opening stretch / finding its footing", so it is the one
// that gets rewritten copy when it is not first.
function relabelRaceState(b: DataBeat, isFirst: boolean, seed: number): void {
  if (isFirst) return; // "The Opening" and early phrasing are honest here.
  if (b.angle === "three_way") {
    const through = b.throughHole ?? b.hole ?? null;
    b.heroLabel = pick(["Where It Stands", "A Three-Way Race", "The Logjam"], seed + 2);
    b.preview = "The Logjam";
    b.eyebrow = pick([
      "The leaderboard is a logjam",
      "A cluster at the top",
      "Nobody can shake the pack",
    ], seed + 3);
    // Rebuild the caption WITHOUT earliness words. It states the standing as of
    // `through` in the present tense, no "takes shape / early / footing".
    if (through != null) {
      b.caption = [
        { t: `Through ${through}, ` },
        { t: `the top of the board is bunched tight`, b: true },
        { t: `, with nobody able to break clear.` },
      ];
    }
  } else if (b.angle === "pace_setter" || b.angle === "wire_to_wire") {
    // pace_setter / wire_to_wire keep their meaningful hero LABELS (their
    // earliness lives in the angle's meaning), but their eyebrow/caption copy
    // can still say "early" / "through N" / "chases X early" -- which reads
    // false once an earlier-resolving beat (e.g. a bounce_back on hole 4)
    // sorts ahead of them. When off-front, neutralize that copy so the card
    // states the LEAD, not the opening. `through` is the beat's own checkpoint.
    const through = b.throughHole ?? b.hole ?? null;
    const fn = (b.protagonistName || "").split(" ")[0];
    b.eyebrow = fn
      ? pick([`${fn} sets the pace`, `${fn} out in front`, `${fn} leads the way`], seed + 4)
      : b.eyebrow;
    if (through != null && fn) {
      b.caption = [
        { t: `Through ${through}, ` },
        { t: `${fn} is out in front`, b: true },
        { t: `, with the field giving chase.` },
      ];
    }
  } else {
    // duel is already neutral.
    b.heroLabel = b.heroLabel === "The Opening" ? "Where It Stands" : b.heroLabel;
  }
  b.kicker = b.heroLabel.toUpperCase();
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
  // The duel is a TWO-PLAYER shape (like three_way/rivalry), not the winner's
  // individual story -- so although its protagonistId names the pair's leader
  // (often the winner), it does NOT consume the "one winner-protagonist beat"
  // slot. Without this a duel between the winner and the runner-up can never
  // be told whenever any winner-flavored beat (out_of_character, a charge) also
  // fires, which is most weeks -- the exact reason it went dead.
  const countsAsWinnerBeat = (c: BeatCandidate) => c.protagonistId === winnerGid && c.angle !== "duel";
  const eligible = (c: BeatCandidate, requireFreshProtagonist: boolean) => {
    if (taken.has(c)) return false;
    if (usedAngles.has(c.angle)) return false;
    if (c.hole != null && usedHoles.has(c.hole)) return false;
    if (countsAsWinnerBeat(c) && winnerBeats >= 1) return false;
    if (requireFreshProtagonist && c.protagonistId != null && usedProtagonists.has(c.protagonistId)) return false;
    return true;
  };
  const take = (c: BeatCandidate) => {
    taken.add(c);
    chosen.push(c);
    usedAngles.add(c.angle);
    if (c.hole != null) { usedHoles.add(c.hole); thirdCount[thirdOf(c.hole)]++; }
    if (c.protagonistId != null) usedProtagonists.add(c.protagonistId);
    if (countsAsWinnerBeat(c)) winnerBeats++;
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

  // Build every body beat (opening + chosen middles + fireworks) tagged with
  // its RESOLUTION HOLE, then sort the whole set chronologically. The opening
  // is NOT pinned to the front any more -- it goes through the same sort. A
  // race-state beat detected at hole 9 that follows an eagle on 4 is not an
  // opening, and forcing it first makes the story jump backwards (Handoff #8).
  // Standings-board angles (Handoff #9 5): render the real .lb-* leaderboard
  // over the blurred photo, THRU = the checkpoint hole. the_turn is a
  // standings snapshot; the race-state openings are too. (duel/rivalry keep
  // their h2h momentum viz, fade keeps its two-column compare -- not snapshots.)
  const STANDINGS_ANGLES = new Set(["three_way", "pace_setter", "wire_to_wire", "the_turn"]);
  const attachStandings = (b: DataBeat, res: number) => {
    if (STANDINGS_ANGLES.has(b.angle)) b.standings = buildStandingsBoard(ctx, res, false);
  };
  // sub keeps a multi-card unit's cards adjacent through the sort: the lead-in
  // (extraBefore) gets a sub of 0, its payoff 1, at the SAME resolution hole,
  // so nothing can land between them. Standalone beats use sub 2 (>=, so a
  // unit's two cards always sort as a block relative to same-hole neighbours).
  const body: { beat: DataBeat; res: number; isOpening: boolean; sub: number }[] = [];
  if (opening) {
    const b = opening.build(ctx, seed);
    b.strength = opening.strength;
    const res = resolutionHoleFor(opening, ctx);
    b.resolutionHole = res;
    attachStandings(b, res);
    body.push({ beat: b, res, isOpening: true, sub: 2 });
  }
  chosen.forEach((c) => {
    const b = c.build(ctx, seed);
    b.strength = c.strength;
    const res = resolutionHoleFor(c, ctx);
    b.resolutionHole = res;
    attachStandings(b, res);
    // MULTI-CARD UNIT: a lead-in card renders immediately before its payoff, at
    // the same resolution hole. It is pulled off the beat here so both render
    // as siblings; the pair counts as one beat (one candidate, one slot).
    const lead = b.extraBefore;
    if (lead) {
      b.extraBefore = undefined;
      lead.resolutionHole = res;
      body.push({ beat: lead, res, isOpening: false, sub: 0 });
      body.push({ beat: b, res, isOpening: false, sub: 1 });
    } else {
      body.push({ beat: b, res, isOpening: false, sub: 2 });
    }
  });

  // RARE FIREWORKS (gross eagle or better): additive and exempt from EVERY
  // anti-repeat rule above -- it is detected outside the pool, so it never
  // saw a cooldown, the angle-decay weight, the protagonist-rotation penalty,
  // the spread/thirds constraint, or the diversity floor. Rarity is
  // self-limiting, so there is nothing for anti-repeat to protect against:
  // an eagle on the same hole two weeks running still fires. It is ADDITIVE,
  // not competitive -- it takes a guaranteed slot and does NOT displace an arc
  // middle (an event with an eagle simply emits one more beat). Admin hides
  // still apply, so a mis-scored "eagle" can be pulled. Fireworks are always
  // single-hole, so they resolve at that hole.
  let anyFireworks = false;
  detectFireworks(ctx).forEach((f) => {
    if (isHidden(f.angle, f.protagonistId)) return;
    const b = f.build(ctx, seed);
    b.strength = f.strength;
    b.resolutionHole = f.hole;
    body.push({ beat: b, res: f.hole, isOpening: false, sub: 2 });
    anyFireworks = true;
  });

  // SKINS (gross birdie-or-better skin): the SECOND additive certainty. Same
  // treatment as fireworks -- exempt from the angle-decay weight, the
  // protagonist-rotation penalty, the spread/thirds constraint and the
  // diversity floor; it takes a guaranteed slot ON TOP of the arc and does NOT
  // displace a middle. Two extra rules:
  //   FIREWORKS TRUMPS SKINS (hard): if any ace/albatross/eagle fired for this
  //   event, emit NO skins beat -- the rare thing owns the week.
  //   SEEDED LRU: the chosen skin is stable forever (event_id seed) and prefers
  //   the least-recently-used (protagonist, hole) as a soft tiebreak.
  // Admin hides still apply (a mis-scored skin can be pulled).
  if (!anyFireworks) {
    const recentSkinKeys = recent
      .filter((h) => h.angle_type === "skins")
      .map((h) => ({ protagonistId: h.protagonist_id ?? null, hole: h.hole ?? null }));
    const sk = detectSkins(ctx, seed, recentSkinKeys);
    if (sk && !isHidden("skins", sk.protagonistId)) {
      const b = sk.build(ctx, seed);
      b.resolutionHole = sk.hole;
      body.push({ beat: b, res: sk.hole, isOpening: false, sub: 2 });
    }
  }

  // Chronological sort on the resolution hole. Ties keep a stable order:
  // data beats already have no created_at here, so the viewer's
  // watchOrderCompare handles data-before-human; within the composer we only
  // need hole order, with the opening breaking ties earlier (a race-state
  // "through N" reads before an event that happened ON N).
  body.sort((a, b) => (a.res - b.res) || ((a.isOpening ? 0 : 1) - (b.isOpening ? 0 : 1)) || (a.sub - b.sub));

  // POSITION-AWARE OPENING LABEL: "The Opening" is only true if the race-state
  // beat is chronologically first among the ARC beats. Additive certainties
  // (fireworks, skins) are highlights layered on top of the arc, not arc
  // position -- a skin on hole 1 or an eagle on hole 4 does NOT demote the
  // opening. So they are ignored when deciding "is the opening first".
  const ADDITIVE_ANGLES = new Set(["ace", "albatross", "eagle", "skins"]);
  const firstOpening = body.findIndex((x) => x.isOpening);
  if (firstOpening >= 0) {
    const firstArc = body.findIndex((x) => !ADDITIVE_ANGLES.has(x.beat.angle));
    relabelRaceState(body[firstOpening].beat, firstOpening === firstArc, seed);
  }

  const ordered: DataBeat[] = body.map((x) => x.beat);
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

// Full-field standings board payload (Handoff #9 5c). One shape serves the
// race-state / the_turn checkpoint beats (thru = the hole number) and the
// FINAL (thru = "F"). The renderer caps + scrolls; the engine passes the whole
// tie-aware field so no arbitrary top-N is baked in here.
// STANDINGS TRUTH (Handoff #10 1). A checkpoint standings beat must show the
// race AT THAT MOMENT, not the finishing order relabelled. So the board is
// built from the CUMULATIVE totals at the checkpoint hole (ctx.totalsSeries[
// i][hole]) with tie-aware positions derived from THOSE SAME totals -- never
// from input.fullStandings (which is the final board, the bug this fixes).
// The FINAL beat is the one case that reads final totals (ctx.totals).
function buildStandingsBoard(ctx: RoundContext, thruHole: number | null, isFinal: boolean): NonNullable<DataBeat["standings"]> {
  // Points per player at this checkpoint (or final).
  const scored = ctx.players.map((p, i) => ({
    name: p.name,
    points: isFinal ? ctx.totals[i] : (ctx.totalsSeries[i][thruHole ?? ctx.maxHole] ?? 0),
  }));
  scored.sort((a, b) => b.points - a.points);
  // Tie-aware positions FROM THESE totals: equal points share the lower rank,
  // then a "T" prefix marks the shared positions (same rule as buildStandings).
  const rows: { pos: string; name: string; points: number }[] = [];
  let pos = 0, prevPts: number | null = null, prevPos = 0;
  scored.forEach((s) => {
    pos += 1;
    const isTie = prevPts != null && s.points === prevPts;
    const effPos = isTie ? prevPos : pos;
    prevPos = effPos; prevPts = s.points;
    rows.push({ pos: String(effPos), name: s.name, points: s.points });
  });
  const counts: Record<string, number> = {};
  rows.forEach((r) => { counts[r.pos] = (counts[r.pos] || 0) + 1; });
  rows.forEach((r) => { if (counts[r.pos] > 1) r.pos = "T" + r.pos; });
  return {
    label: isFinal ? "Final" : `Thru ${thruHole}`,
    thru: isFinal ? "F" : String(thruHole ?? ""),
    isFinal,
    rows,
  };
}

function buildFinalBeat(ctx: RoundContext, input: SelectBeatsInput, middle: BeatCandidate[], blowout: boolean, seed: number): DataBeat {
  const winnerFirst = firstName(input.winnerName);
  const standings = input.finalStandings;
  // Tie-aware: pos strings are already T-prefixed ("T1"/"T2"). "takes second"
  // is false when second is shared, and a shared win is not a solo win.
  const winnersTied = standings.filter((s) => s.pos === "T1").length > 1;
  const runnersTied = standings.filter((s) => s.pos === "T2").length > 1;

  // SELF-CONTAINED (Handoff #9 1): the caption alone -- eyebrow hidden -- must
  // say who won and by how much. It never leans on the title line. So it always
  // NAMES the champion and the margin, then the runner-up situation.
  const champ = standings[0];
  const champName = champ ? champ.name : input.winnerName;
  const champPts = champ ? champ.pts : 0;
  const secondPts = standings[1] ? standings[1].pts : 0;
  const margin = champPts - secondPts;
  const winnersShared = standings.filter((s) => s.pos === "T1");
  const runnersUp = standings.filter((s) => s.pos === "T2");
  const marginPhrase = margin >= 1 ? `by ${numWord(margin)} ${plural(margin, "point")}` : "in a squeaker";

  // EVENT IDENTITY (Handoff #10 6): no "Week N" in copy -- the group says the
  // date, and the beat footer carries it authoritatively. The caption names
  // the result and needs no event reference at all ("takes it by one point").
  let caption: CaptionPart[];
  if (winnersTied) {
    // A shared title: name the co-leaders and the points, no solo-win claim.
    const names = winnersShared.map((s) => s.name);
    const nameStr = names.length === 2 ? `${names[0]} and ${names[1]}` : `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
    caption = [
      { t: `${nameStr} share it`, b: true },
      { t: ` on ${champPts} points apiece.` },
    ];
  } else if (runnersTied) {
    const names = runnersUp.map((s) => firstName(s.name));
    const nameStr = names.length === 2 ? `${names[0]} and ${names[1]}` : `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
    caption = [
      { t: `${champName} wins ${marginPhrase}`, b: true },
      { t: `, with ${nameStr} tied for second on ${secondPts}.` },
    ];
  } else if (standings[1]) {
    // Structural variety: rotate how the win is framed, but every variant is a
    // complete statement of who won, by how much, over whom. NAME REGISTER
    // (Handoff #16 7d/F7): the WINNER gets a full name; everyone else a first
    // name -- the full leaderboard is on the card, so first names are
    // unambiguous and it saves the char budget.
    const secondFirst = firstName(standings[1].name);
    caption = pick([
      [
        { t: `${champName} takes it ${marginPhrase}`, b: true },
        { t: `, ahead of ${secondFirst} on ${secondPts}.` },
      ],
      [
        { t: `${champPts} points and the win for ${champName}`, b: true },
        { t: ` -- ${secondFirst} runs second on ${secondPts}.` },
      ],
      [
        { t: `${secondFirst} pushes hard but comes up ${numWord(margin || 1)} ${plural(margin || 1, "point")} short` },
        { t: `; ${champName} wins on ${champPts}.`, b: true },
      ],
    ], seed + 11);
  } else {
    caption = [{ t: `${champName} wins on ${champPts} points.`, b: true }];
  }

  if (blowout && !winnersTied) {
    // Present tense (Handoff #16 5).
    caption.push({ t: pick([
      " It is never really in doubt.",
      ` ${winnerFirst} leads this one from start to finish.`,
      " The chase pack never lands a punch.",
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
      const fn = p ? dNameOf(ctx, p.golferId) : "";
      // Net word for a good decider hole ("net par" -- a gross bogey there
      // would mislabel a charge); gross notation for a bad one ("double").
      const scoreWord = sc
        ? (sc.points >= 2 ? `net ${netName(sc.points)}` : scoreName(sc.gross, sc.par).toLowerCase())
        : "swing";
      // Present tense (Handoff #16 5): "is the turning point", "traces back",
      // "turns for good" -- not the past-tense forms.
      caption.push({ t: pick([
        ` The hole that decides it: ${possess(fn)} ${scoreWord} on ${decider.hole}.`,
        ` ${possess(fn)} ${scoreWord} on ${decider.hole} is the turning point.`,
        ` It all traces back to ${possess(fn)} ${scoreWord} on ${decider.hole}.`,
        ` The round turns for good on ${decider.hole}.`,
      ], seed + decider.hole!) });
    }
  }

  // Tie-aware title: a shared win is not "X wins" outright. No "Week N" -- the
  // footer carries the date (Handoff #10 6); the title is about who won.
  const title = winnersTied
    ? pick([
        `${input.winnerName} shares the win`,
        `It ends in a tie at the top`,
        `${input.winnerName} ties for the title`,
      ], seed + 7)
    : pick([
        `${input.winnerName} wins it`,
        `${input.winnerName} takes it`,
        `The win belongs to ${input.winnerName}`,
        `${input.winnerName} closes it out`,
      ], seed + 7);
  return {
    ...beatHead("final", "Final", title),
    hole: null,
    preview: winnersTied ? `${winnerFirst} Ties` : `${winnerFirst} Wins`,
    protagonistId: null,
    finalStandings: standings,
    standings: buildStandingsBoard(ctx, null, true),
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
