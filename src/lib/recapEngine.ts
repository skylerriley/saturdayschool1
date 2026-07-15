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
// Win-probability replay: buildWinProbSeries adapts the checkpoint/simulate
// approach already written in src/WinProbabilityChart.tsx (cumulative
// Stableford totals per hole -> Monte Carlo over remaining holes). The logic
// is duplicated here rather than imported so that component stays untouched;
// keep the hole-outcome distribution in sync if it ever changes.
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
  win: number; // 0-100
  featured: boolean;
}

export interface BeatSwingCard {
  name: string;
  from: number;
  to: number;
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
// whole catalog.
export interface DataBeat {
  angle: string;
  hole: number | null; // null => FINAL or a whole-round character beat
  throughHole?: number; // opening beats only ("Through N" subtext)
  subtext?: string; // overrides the Hole X | Par Y line (whole-round beats)
  kicker: string; // "THE CHARGE" etc.
  title: string;
  preview: string; // short rail label, ~3 words
  protagonistId: number | null; // null => field-wide
  protagonistName?: string;
  protagonistInitials?: string;
  score?: { gross: number; par: number } | null; // protagonist score on that hole
  odds?: BeatOddsRow[];
  swing?: BeatSwingCard[];
  finalStandings?: BeatStandingRow[];
  // new viz payloads (additive -- a beat renders whichever it carries):
  grind?: { hole: number; gross: number; par: number }[];
  fieldStat?: { label: string; value: number; color: string }[];
  h2h?: { name: string; color: string; points: number[] }[];
  histBars?: { label: string; value: number; text?: string; highlight?: boolean }[];
  caption: CaptionPart[];
  strength: number;
  mood: "warm" | "fall" | "expo" | "cool"; // background tint in the viewer
}

export interface BeatHistoryRow {
  event_id: number;
  angle_type: string;
  protagonist_id: number | null;
}

// -- Win-probability replay (mirrors WinProbabilityChart.simulate) -----------
const TRIALS = 600;

function simulate(currentTotals: number[], holesLeft: number): number[] {
  const wins = new Array(currentTotals.length).fill(0);
  for (let t = 0; t < TRIALS; t++) {
    const finals = currentTotals.map((total) => {
      let extra = 0;
      for (let h = 0; h < holesLeft; h++) {
        const r = Math.random();
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

// series[playerIdx][h] = win % after hole h (h = 0 .. maxHole)
export function buildWinProbSeries(players: RecapPlayer[], scores: RecapHoleScore[], maxHole: number): number[][] {
  const n = players.length;
  const byPlayerHole: Record<string, number> = {};
  scores.forEach((s) => { byPlayerHole[s.golferId + "|" + s.hole] = s.stableford; });

  const series: number[][] = Array.from({ length: n }, () => []);
  const totals = new Array(n).fill(0);
  for (let h = 0; h <= maxHole; h++) {
    if (h > 0) {
      players.forEach((p, i) => { totals[i] += byPlayerHole[p.golferId + "|" + h] ?? 0; });
    }
    const probs = simulate(totals, 18 - h);
    probs.forEach((prob, i) => series[i].push(prob));
  }
  return series;
}

// -- Cross-event player history (Tier-2 detector fuel) ------------------------
export interface PlayerHistoryEntry {
  golferId: number;
  recentPoints: number[]; // prior events' totals, chronological, most recent last
  mean: number;
  std: number;
  holeGrossByEvent: Record<number, number[]>; // per hole: gross by prior event, chronological
  holeAverages: Record<number, number>; // avg gross per hole (>=3 samples only)
  weeksAbsent: number; // completed events since the player last posted a round
}

export function buildPlayerHistories(args: {
  eventId: number;
  playerIds: number[];
  allEvents: { event_id: number; date: string }[]; // completed, any order
  allTotals: { event_id: number; golfer_id: number; total: number }[];
  priorHoleRows: { golfer_id: number; event_id: number; hole: number; gross: number }[];
}): Record<number, PlayerHistoryEntry> {
  const ordered = [...args.allEvents].sort((a, b) => a.date.localeCompare(b.date));
  const eventOrder: Record<number, number> = {};
  ordered.forEach((e, i) => { eventOrder[e.event_id] = i; });
  const targetOrder = eventOrder[args.eventId];
  if (targetOrder == null) return {};

  const out: Record<number, PlayerHistoryEntry> = {};
  for (const gid of args.playerIds) {
    const prior = args.allTotals
      .filter((t) => t.golfer_id === gid && eventOrder[t.event_id] != null && eventOrder[t.event_id] < targetOrder && t.total != null)
      .sort((a, b) => eventOrder[a.event_id] - eventOrder[b.event_id]);
    const recentPoints = prior.map((t) => t.total);
    const mean = recentPoints.length ? recentPoints.reduce((a, b) => a + b, 0) / recentPoints.length : 0;
    const variance = recentPoints.length > 1
      ? recentPoints.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (recentPoints.length - 1)
      : 0;
    const lastPlayedOrder = prior.length ? eventOrder[prior[prior.length - 1].event_id] : -1;
    const weeksAbsent = prior.length ? targetOrder - lastPlayedOrder - 1 : 0;

    const holeGrossByEvent: Record<number, number[]> = {};
    args.priorHoleRows
      .filter((r) => r.golfer_id === gid && eventOrder[r.event_id] != null && eventOrder[r.event_id] < targetOrder && r.gross != null)
      .sort((a, b) => eventOrder[a.event_id] - eventOrder[b.event_id])
      .forEach((r) => { (holeGrossByEvent[r.hole] ||= []).push(r.gross); });
    const holeAverages: Record<number, number> = {};
    Object.entries(holeGrossByEvent).forEach(([h, arr]) => {
      if (arr.length >= 3) holeAverages[Number(h)] = arr.reduce((a, b) => a + b, 0) / arr.length;
    });

    out[gid] = { golferId: gid, recentPoints, mean, std: Math.sqrt(variance), holeGrossByEvent, holeAverages, weeksAbsent };
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
  const w = ["zero", "one", "two", "three", "four", "five", "six"][Math.min(n, 6)] || String(n);
  return cap ? w[0].toUpperCase() + w.slice(1) : w;
}

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

// -- Round context -------------------------------------------------------------
export interface RoundContext {
  players: RecapPlayer[];
  scores: RecapHoleScore[];
  series: number[][]; // from buildWinProbSeries
  holePars: number[];
  maxHole: number;
  finalStandings: BeatStandingRow[];
  winnerIdx: number;
  totals: number[]; // stableford total per playerIdx this event
  ranks: number[]; // 0-based finish rank per playerIdx (ties share the lower rank)
  grossAt: Record<string, number | null>; // "golferId|hole"
  history: Record<number, PlayerHistoryEntry>; // {} when unavailable
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

function openCheckpoint(maxHole: number): number {
  return Math.max(3, Math.min(6, Math.floor(maxHole / 3)));
}

function oddsRowsAt(players: RecapPlayer[], series: number[][], hole: number, featureId: number | null): BeatOddsRow[] {
  return players
    .map((p, i) => ({ golferId: p.golferId, name: p.name, win: series[i][hole], featured: p.golferId === featureId }))
    .sort((a, b) => b.win - a.win)
    .slice(0, 3);
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

function swingCards(players: RecapPlayer[], series: number[][], hole: number, loserIdx: number): BeatSwingCard[] {
  const cards: BeatSwingCard[] = [{
    name: firstName(players[loserIdx].name),
    from: series[loserIdx][hole - 1],
    to: series[loserIdx][hole],
  }];
  const gainer = biggestGainer(players, series, hole, loserIdx);
  if (gainer) {
    const gi = players.indexOf(gainer);
    cards.push({ name: firstName(gainer.name), from: series[gi][hole - 1], to: series[gi][hole] });
  }
  return cards;
}

function scoreAt(ctx: RoundContext, golferId: number, hole: number): { gross: number; par: number } | null {
  const gross = ctx.grossAt[golferId + "|" + hole];
  const par = ctx.holePars[hole - 1];
  return gross != null && par != null ? { gross, par } : null;
}

// cumulative stableford points per hole for one player (momentum lines)
function cumulativePoints(ctx: RoundContext, playerIdx: number, throughHole: number): number[] {
  const gid = ctx.players[playerIdx].golferId;
  const byHole: Record<number, number> = {};
  ctx.scores.forEach((s) => { if (s.golferId === gid) byHole[s.hole] = s.stableford; });
  const out: number[] = [];
  let run = 0;
  for (let h = 1; h <= throughHole; h++) { run += byHole[h] ?? 0; out.push(run); }
  return out;
}

const H2H_COLORS = ["#eda100", "#1baf7a"];

// ===== DETECTORS ===============================================================

// -- Tier 1: openings ----------------------------------------------------------

const detectThreeWay: Detector = (ctx) => {
  const open = openCheckpoint(ctx.maxHole);
  const rows = oddsRowsAt(ctx.players, ctx.series, open, null);
  if (rows.length < 3) return [];
  const contenders = ctx.players.filter((_, i) => ctx.series[i][open] >= rows[0].win - 10).length;
  const spread3 = rows[0].win - rows[2].win;
  // Fires as the tight-race opening when >=3 are bunched; also serves as the
  // low-strength fallback so the opening slot is never empty.
  const bunched = contenders >= 3;
  return [{
    angle: "three_way",
    slot: "opening",
    protagonistId: null,
    hole: open,
    strength: bunched ? clamp01(1 - spread3 / 25) : 0.15,
    surprise: 0.4,
    evidence: { open, contenders, leader: rows[0].name },
    build: (c, seed) => {
      const title = bunched
        ? pick([
            `A ${numWord(Math.min(contenders, 5))}-way race takes shape`,
            "Everyone is still in this one",
            "The leaderboard is a logjam early",
            "Nobody blinks through the opening stretch",
          ], seed)
        : pick(["The race takes shape", "An early feel-out round", "The field settles in"], seed + 1);
      return {
        angle: "three_way", hole: open, throughHole: open,
        kicker: "THE OPENING", title,
        preview: bunched ? `${numWord(Math.min(contenders, 5), true)}-Way Race` : "The Opening",
        protagonistId: null,
        odds: rows.map((r, idx) => ({ ...r, featured: idx === 0 })),
        caption: [
          { t: `${firstName(rows[0].name)} leads through ${open}` },
          { t: bunched ? ` -- but ${numWord(contenders)} golfers are within striking distance.` : ", and the field is still finding its footing." },
        ],
        strength: 0, mood: "expo",
      };
    },
  }];
};

const detectDuel: Detector = (ctx) => {
  const open = openCheckpoint(ctx.maxHole);
  const rows = oddsRowsAt(ctx.players, ctx.series, open, null);
  if (rows.length < 3) return [];
  const gap12 = rows[0].win - rows[1].win;
  const gap23 = rows[1].win - rows[2].win;
  if (gap12 > 8 || gap23 < 12) return [];
  const aIdx = ctx.players.findIndex((p) => p.golferId === rows[0].golferId);
  const bIdx = ctx.players.findIndex((p) => p.golferId === rows[1].golferId);
  return [{
    angle: "duel",
    slot: "opening",
    protagonistId: rows[0].golferId,
    hole: open,
    strength: clamp01(gap23 / 25 + (8 - gap12) / 30),
    surprise: 0.5,
    evidence: { a: rows[0].name, b: rows[1].name, open },
    build: (c, seed) => ({
      angle: "duel", hole: open, throughHole: open,
      kicker: "THE DUEL",
      title: pick([
        `${firstName(rows[0].name)} and ${firstName(rows[1].name)} pull away`,
        `A two-horse race forms early`,
        `${firstName(rows[0].name)} vs ${firstName(rows[1].name)}, and daylight behind them`,
        `Two golfers separate from the pack`,
      ], seed),
      preview: "The Duel",
      protagonistId: rows[0].golferId,
      h2h: [
        { name: firstName(rows[0].name), color: H2H_COLORS[0], points: cumulativePoints(c, aIdx, open) },
        { name: firstName(rows[1].name), color: H2H_COLORS[1], points: cumulativePoints(c, bIdx, open) },
      ],
      caption: [
        { t: `Through ${open} it is already a two-player fight -- ` },
        { t: `${rows[0].win}% vs ${rows[1].win}%`, b: true },
        { t: `, with the rest of the field ${gap23} points of win odds back.` },
      ],
      strength: 0, mood: "expo",
    }),
  }];
};

const detectWireToWire: Detector = (ctx) => {
  const open = openCheckpoint(ctx.maxHole);
  const w = ctx.winnerIdx;
  const rows = oddsRowsAt(ctx.players, ctx.series, open, null);
  if (rows.length === 0 || rows[0].golferId !== ctx.players[w].golferId) return [];
  const turn = Math.min(9, ctx.maxHole);
  const runaway = ctx.maxHole >= 9 && ctx.series[w][turn] >= 85 && ctx.series[w].slice(turn).every((v) => v >= 75);
  if (!runaway || ctx.series[w][open] < 50) return [];
  return [{
    angle: "wire_to_wire",
    slot: "opening",
    protagonistId: ctx.players[w].golferId,
    hole: open,
    strength: clamp01(ctx.series[w][open] / 90),
    surprise: 0.3,
    evidence: { winner: ctx.players[w].name, open },
    build: (c, seed) => {
      const fn = firstName(c.players[w].name);
      return {
        angle: "wire_to_wire", hole: open, throughHole: open,
        kicker: "WIRE TO WIRE",
        title: pick([
          `${fn} grabs this one early`,
          `${fn} is in control from the jump`,
          `${fn} leaves no doubt early`,
          `${fn} sets the tone immediately`,
        ], seed),
        preview: "Wire to Wire",
        protagonistId: c.players[w].golferId,
        protagonistName: c.players[w].name,
        protagonistInitials: initials(c.players[w].name),
        odds: oddsRowsAt(c.players, c.series, open, c.players[w].golferId),
        caption: [
          { t: `${fn} is already at ` },
          { t: c.series[w][open] + "% to win", b: true },
          { t: ` through ${open} holes, and the lead never gets threatened.` },
        ],
        strength: 0, mood: "expo",
      };
    },
  }];
};

const detectPaceSetter: Detector = (ctx) => {
  const open = openCheckpoint(ctx.maxHole);
  const rows = oddsRowsAt(ctx.players, ctx.series, open, null);
  if (rows.length < 2) return [];
  const gap12 = rows[0].win - rows[1].win;
  if (gap12 < 12) return [];
  const leadIdx = ctx.players.findIndex((p) => p.golferId === rows[0].golferId);
  const turn = Math.min(9, ctx.maxHole);
  const runaway = ctx.maxHole >= 9 && ctx.series[leadIdx][turn] >= 85 && ctx.series[leadIdx].slice(turn).every((v) => v >= 75);
  if (runaway && leadIdx === ctx.winnerIdx) return []; // wire_to_wire owns that story
  return [{
    angle: "pace_setter",
    slot: "opening",
    protagonistId: rows[0].golferId,
    hole: open,
    strength: clamp01(gap12 / 30),
    surprise: leadIdx === ctx.winnerIdx ? 0.35 : 0.65, // a leader who does NOT win is a story
    evidence: { leader: rows[0].name, gap12, open },
    build: (c, seed) => {
      const fn = firstName(rows[0].name);
      return {
        angle: "pace_setter", hole: open, throughHole: open,
        kicker: "THE PACE SETTER",
        title: pick([
          `${fn} sets the early pace`,
          `${fn} sprints out of the gate`,
          `${fn} opens a gap on the field`,
          `The field chases ${fn} early`,
        ], seed),
        preview: `${fn} Sets Pace`,
        protagonistId: rows[0].golferId,
        protagonistName: rows[0].name,
        protagonistInitials: initials(rows[0].name),
        odds: rows.map((r, idx) => ({ ...r, featured: idx === 0 })),
        caption: [
          { t: `${fn} leads by ` },
          { t: gap12 + " points of win odds", b: true },
          { t: ` through ${open} -- now the field has to respond.` },
        ],
        strength: 0, mood: "expo",
      };
    },
  }];
};

// -- Tier 1: middles -----------------------------------------------------------

const detectCharge: Detector = (ctx) => {
  const out: BeatCandidate[] = [];
  ctx.players.forEach((p, i) => {
    let runSum = 0, runStart = 1, best = { sum: 0, start: 1, end: 1 };
    for (let h = 1; h <= ctx.maxHole; h++) {
      const d = ctx.series[i][h] - ctx.series[i][h - 1];
      if (d > 0) {
        if (runSum === 0) runStart = h;
        runSum += d;
        if (runSum > best.sum) best = { sum: runSum, start: runStart, end: h };
      } else {
        runSum = 0;
      }
    }
    if (best.sum < 15 || ctx.series[i][best.start - 1] >= 55) return;
    let peakHole = best.start, peakD = -1;
    for (let h = best.start; h <= best.end; h++) {
      const d = ctx.series[i][h] - ctx.series[i][h - 1];
      if (d > peakD) { peakD = d; peakHole = h; }
    }
    out.push({
      angle: "charge",
      slot: "middle",
      protagonistId: p.golferId,
      hole: peakHole,
      strength: clamp01(best.sum / 45),
      surprise: clamp01(1 - ctx.series[i][0] / 40),
      evidence: { from: ctx.series[i][best.start - 1], to: ctx.series[i][best.end], startHole: best.start, endHole: best.end, peakHole },
      build: (c, seed) => {
        const fn = firstName(p.name);
        const sc = scoreAt(c, p.golferId, peakHole);
        const from = c.series[i][best.start - 1];
        const to = c.series[i][best.end];
        return {
          angle: "charge", hole: peakHole,
          kicker: "THE CHARGE",
          title: pick([
            `${fn} makes a move`,
            `${fn} catches fire`,
            `The ${fn} charge is on`,
            `${fn} climbs into the fight`,
          ], seed + peakHole),
          preview: `${fn}'s Move`,
          protagonistId: p.golferId, protagonistName: p.name, protagonistInitials: initials(p.name),
          score: sc,
          odds: oddsRowsAt(c.players, c.series, best.end, p.golferId),
          caption: [
            { t: sc ? `A ${scoreName(sc.gross, sc.par).toLowerCase()} caps a run from holes ${best.start} to ${best.end}. ` : `A hot stretch runs from holes ${best.start} to ${best.end}. ` },
            { t: `Win odds climb from ${from}% to ${to}%`, b: true },
            { t: " along the way." },
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
  ctx.players.forEach((_, i) => {
    for (let h = 1; h <= ctx.maxHole; h++) {
      const d = ctx.series[i][h] - ctx.series[i][h - 1];
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
    evidence: { from: ctx.series[b.i][b.h - 1], to: ctx.series[b.i][b.h], hole: b.h },
    build: (c, seed) => {
      const fn = firstName(p.name);
      const sc = scoreAt(c, p.golferId, b.h);
      const scoreWord = sc ? scoreName(sc.gross, sc.par).toLowerCase() : "big number";
      const from = c.series[b.i][b.h - 1];
      const to = c.series[b.i][b.h];
      const gainer = biggestGainer(c.players, c.series, b.h, b.i);
      return {
        angle: "collapse", hole: b.h,
        kicker: "THE TURNING POINT",
        title: pick([
          `Hole ${b.h} bites ${fn}`,
          `A ${scoreWord} stalls the ${fn} run`,
          `${fn} finds trouble on ${b.h}`,
          `The round turns on ${fn}'s ${scoreWord}`,
        ], seed + b.h),
        preview: `${fn}'s ${sc ? scoreName(sc.gross, sc.par) : "Slip"}`,
        protagonistId: p.golferId, protagonistName: p.name, protagonistInitials: initials(p.name),
        score: sc,
        swing: swingCards(c.players, c.series, b.h, b.i),
        caption: [
          { t: `A ${scoreWord} drops ${fn} from ` },
          { t: `${from}% to ${to}%`, b: true },
          { t: gainer ? ` -- the biggest swing of the day, and ${firstName(gainer.name)} pounces on it.` : " -- the biggest swing of the day." },
        ],
        strength: 0, mood: "fall",
      };
    },
  }];
};

const detectHold: Detector = (ctx) => {
  if (ctx.maxHole < 14) return [];
  const w = ctx.winnerIdx;
  const open = openCheckpoint(ctx.maxHole);
  const mid = ctx.series[w].slice(open, Math.min(13, ctx.maxHole + 1));
  const minMid = Math.min(...mid);
  if (minMid > 45) return []; // never seriously challenged => that's wire-to-wire, not a hold
  let crossHole = -1;
  for (let h = 13; h <= ctx.maxHole; h++) {
    if (ctx.series[w][h] >= 70 && ctx.series[w][h - 1] < 70) { crossHole = h; break; }
  }
  if (crossHole < 0) return [];
  const p = ctx.players[w];
  return [{
    angle: "hold",
    slot: "middle",
    protagonistId: p.golferId,
    hole: crossHole,
    strength: clamp01((60 - minMid) / 55),
    surprise: 0.35,
    evidence: { minMid, crossHole },
    build: (c, seed) => {
      const fn = firstName(p.name);
      const sc = scoreAt(c, p.golferId, crossHole);
      const to = c.series[w][crossHole];
      return {
        angle: "hold", hole: crossHole,
        kicker: "HOLDING ON",
        title: pick([
          `${fn} holds the line`,
          `${fn} slams the door`,
          `${fn} answers every challenge`,
          `${fn} steadies the ship late`,
        ], seed + crossHole),
        preview: `${fn} Holds On`,
        protagonistId: p.golferId, protagonistName: p.name, protagonistInitials: initials(p.name),
        score: sc,
        odds: oddsRowsAt(c.players, c.series, crossHole, p.golferId),
        caption: [
          { t: `The odds dipped to ${minMid}% mid-round, but ` },
          { t: `${fn} climbs back to ${to}%`, b: true },
          { t: ` on ${crossHole} -- and the field is running out of holes.` },
        ],
        strength: 0, mood: "warm",
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
    for (let h = 1; h <= ctx.maxHole; h++) {
      const sc = scoreAt(ctx, p.golferId, h);
      if (!sc) return; // needs a complete gross card
      holes.push({ hole: h, ...sc });
    }
    const diffs = holes.map((x) => x.gross - x.par);
    if (diffs.some((d) => d < 0) || diffs.some((d) => d >= 2)) return; // pars + bogeys only
    const bogeyShare = diffs.filter((d) => d === 1).length / diffs.length;
    const consistency = 1 - 2 * bogeyShare * (1 - bogeyShare); // 1 when uniform
    const finishW = [1, 0.85, 0.7][ctx.ranks[i]] ?? 0.5;
    out.push({
      angle: "grinder",
      slot: "middle",
      protagonistId: p.golferId,
      hole: null,
      strength: clamp01(finishW * (0.55 + consistency * 0.45)),
      surprise: i === ctx.winnerIdx ? 0.45 : 0.65,
      evidence: { pars: diffs.filter((d) => d === 0).length, bogeys: diffs.filter((d) => d === 1).length, rank: ctx.ranks[i] },
      build: (c, seed) => {
        const fn = firstName(p.name);
        const pars = diffs.filter((d) => d === 0).length;
        return {
          angle: "grinder", hole: null,
          subtext: "The full round",
          kicker: "THE GRINDER",
          title: pick([
            `${fn} grinds out a clean card`,
            `${fn} wins the boring way`,
            `No fireworks, no mistakes for ${fn}`,
            `${fn} refuses to make a mistake`,
          ], seed),
          preview: `${fn} Grinds`,
          protagonistId: p.golferId, protagonistName: p.name, protagonistInitials: initials(p.name),
          grind: holes,
          caption: [
            { t: `${pars} pars, ${diffs.length - pars} bogeys, ` },
            { t: "zero blow-ups", b: true },
            { t: ` -- ${fn} finishes ${["first", "second", "third"][ctx.ranks[i]] || "near the top"} without a single birdie.` },
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
    for (let h = 1; h <= ctx.maxHole; h++) {
      const sc = scoreAt(ctx, p.golferId, h);
      if (sc) holes.push({ hole: h, ...sc });
    }
    if (holes.length < ctx.maxHole - 1) return;
    const diffs = holes.map((x) => x.gross - x.par);
    const nBird = diffs.filter((d) => d <= -1).length;
    const nDbl = diffs.filter((d) => d >= 2).length;
    if (nBird < 2 || nDbl < 2) return;
    out.push({
      angle: "wildcard",
      slot: "middle",
      protagonistId: p.golferId,
      hole: null,
      strength: clamp01((nBird + nDbl) / 9),
      surprise: 0.55,
      evidence: { nBird, nDbl },
      build: (c, seed) => {
        const fn = firstName(p.name);
        return {
          angle: "wildcard", hole: null,
          subtext: "The full round",
          kicker: "THE WILDCARD",
          title: pick([
            `${fn} rides the rollercoaster`,
            `${fn} plays 18 holes of chaos`,
            `Feast or famine for ${fn}`,
            `${fn} brings the fireworks and the wreckage`,
          ], seed),
          preview: `${fn}'s Rollercoaster`,
          protagonistId: p.golferId, protagonistName: p.name, protagonistInitials: initials(p.name),
          grind: holes,
          caption: [
            { t: `${numWord(nBird, true)} birdie${nBird !== 1 ? "s" : ""} and ${numWord(nDbl)} double${nDbl !== 1 ? "s" : ""}-or-worse share one scorecard`, b: true },
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
  let worst: { hole: number; avg: number; buckets: number[]; n: number } | null = null;
  for (let h = 1; h <= ctx.maxHole; h++) {
    const par = ctx.holePars[h - 1];
    if (par == null) continue;
    const ds: number[] = [];
    ctx.players.forEach((p) => {
      const g = ctx.grossAt[p.golferId + "|" + h];
      if (g != null) ds.push(g - par);
    });
    if (ds.length < Math.max(2, Math.ceil(ctx.players.length / 2))) continue;
    const overShare = ds.filter((d) => d > 0).length / ds.length;
    if (overShare < 0.5) continue;
    const avg = ds.reduce((a, b) => a + b, 0) / ds.length;
    if (!worst || avg > worst.avg) {
      worst = {
        hole: h, avg, n: ds.length,
        buckets: [
          ds.filter((d) => d < 0).length,
          ds.filter((d) => d === 0).length,
          ds.filter((d) => d === 1).length,
          ds.filter((d) => d >= 2).length,
        ],
      };
    }
  }
  if (!worst || worst.avg < 0.8) return [];
  const w = worst;
  return [{
    angle: "tough_hole",
    slot: "middle",
    protagonistId: null,
    hole: w.hole,
    strength: clamp01(w.avg / 1.8),
    surprise: 0.45,
    evidence: { hole: w.hole, avg: w.avg },
    build: (c, seed) => ({
      angle: "tough_hole", hole: w.hole,
      kicker: "THE HARDEST HOLE",
      title: pick([
        `Hole ${w.hole} eats the field alive`,
        `Nobody solves hole ${w.hole}`,
        `Hole ${w.hole} plays like a bear trap`,
        `The field runs into a wall on ${w.hole}`,
      ], seed + w.hole),
      preview: `Hole ${w.hole} Bites`,
      protagonistId: null,
      fieldStat: [
        { label: "Birdie+", value: w.buckets[0], color: "var(--green-300)" },
        { label: "Par", value: w.buckets[1], color: "#88e6a6" },
        { label: "Bogey", value: w.buckets[2], color: "var(--gold-300)" },
        { label: "Double+", value: w.buckets[3], color: "#ff8a7a" },
      ],
      caption: [
        { t: `The field plays it ` },
        { t: `+${w.avg.toFixed(1)} strokes on average`, b: true },
        { t: `, and ${w.buckets[3]} of ${w.n} cards show a double or worse.` },
      ],
      strength: 0, mood: "cool",
    }),
  }];
};

// -- Tier 2: cross-event history ------------------------------------------------

const detectNemesis: Detector = (ctx) => {
  const out: BeatCandidate[] = [];
  ctx.players.forEach((p) => {
    const hist = ctx.history[p.golferId];
    if (!hist) return;
    let worstHole = -1, worstAvgOver = 0;
    Object.entries(hist.holeAverages).forEach(([hs, avg]) => {
      const h = Number(hs);
      const par = ctx.holePars[h - 1];
      if (par == null) return;
      const over = avg - par;
      if (over > worstAvgOver) { worstAvgOver = over; worstHole = h; }
    });
    if (worstHole < 0 || worstAvgOver < 1.2) return;
    const sc = scoreAt(ctx, p.golferId, worstHole);
    if (!sc || sc.gross - sc.par > 0) return; // conquered = par or better this week
    const past = hist.holeGrossByEvent[worstHole] || [];
    out.push({
      angle: "nemesis",
      slot: "middle",
      protagonistId: p.golferId,
      hole: worstHole,
      strength: clamp01(worstAvgOver / 2.2 + 0.15),
      surprise: 0.85,
      evidence: { hole: worstHole, avgOver: worstAvgOver, thisGross: sc.gross },
      build: (c, seed) => {
        const fn = firstName(p.name);
        const par = c.holePars[worstHole - 1];
        const bars = past.slice(-5).map((g, idx) => ({
          label: `Wk -${past.slice(-5).length - idx}`, value: g, text: String(g), highlight: false,
        }));
        bars.push({ label: "Today", value: sc.gross, text: String(sc.gross), highlight: true });
        return {
          angle: "nemesis", hole: worstHole,
          kicker: "NEMESIS NO MORE",
          title: pick([
            `${fn} finally beats hole ${worstHole}`,
            `${fn} slays an old demon on ${worstHole}`,
            `Hole ${worstHole} loses its grip on ${fn}`,
            `${fn} settles a score with hole ${worstHole}`,
          ], seed + worstHole),
          preview: `${fn}'s Revenge`,
          protagonistId: p.golferId, protagonistName: p.name, protagonistInitials: initials(p.name),
          score: sc,
          histBars: bars,
          caption: [
            { t: `${fn} has averaged ` },
            { t: `${(par + worstAvgOver).toFixed(1)} on this par ${par}`, b: true },
            { t: ` in past rounds -- today it falls for a ${scoreName(sc.gross, sc.par).toLowerCase()}.` },
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
        const bars = window.slice(-5).map((v, idx) => ({
          label: `Wk -${window.slice(-5).length - idx}`, value: v, text: String(v), highlight: false,
        }));
        bars.push({ label: "Today", value: thisTotal, text: String(thisTotal), highlight: true });
        return {
          angle: "redemption", hole: null,
          subtext: "Season form",
          kicker: "THE COMEBACK",
          title: backFromAbsence
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
              ], seed + 1),
          preview: `${fn}'s Comeback`,
          protagonistId: p.golferId, protagonistName: p.name, protagonistInitials: initials(p.name),
          histBars: bars,
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
        const bars = window.map((v, idx) => ({
          label: `Wk -${window.length - idx}`, value: v, text: String(v), highlight: false,
        }));
        bars.push({ label: "Today", value: thisTotal, text: String(thisTotal), highlight: true });
        return {
          angle: "out_of_character", hole: null,
          subtext: "Season form",
          kicker: "OUT OF CHARACTER",
          title: up
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
              ], seed + 1),
          preview: up ? `${fn}'s Career Day` : `${fn} Off Script`,
          protagonistId: p.golferId, protagonistName: p.name, protagonistInitials: initials(p.name),
          histBars: bars,
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
      if (Math.abs(hi.mean - hj.mean) > 1.5) continue;
      if (Math.abs(ctx.ranks[i] - ctx.ranks[j]) !== 1) continue;
      let crossings = 0;
      for (let h = 1; h <= ctx.maxHole; h++) {
        const before = Math.sign(ctx.series[i][h - 1] - ctx.series[j][h - 1]);
        const after = Math.sign(ctx.series[i][h] - ctx.series[j][h]);
        if (before !== 0 && after !== 0 && before !== after) crossings++;
      }
      if (crossings < 3) continue;
      const aIdx = ctx.ranks[i] < ctx.ranks[j] ? i : j;
      const bIdx = aIdx === i ? j : i;
      out.push({
        angle: "rivalry",
        slot: "middle",
        protagonistId: ctx.players[aIdx].golferId,
        hole: null,
        strength: clamp01(crossings / 6),
        surprise: 0.5,
        evidence: { a: ctx.players[aIdx].name, b: ctx.players[bIdx].name, crossings },
        build: (c, seed) => {
          const fa = firstName(c.players[aIdx].name);
          const fb = firstName(c.players[bIdx].name);
          return {
            angle: "rivalry", hole: null,
            subtext: "Head to head",
            kicker: "THE RIVALRY",
            title: pick([
              `${fa} and ${fb} trade punches all day`,
              `${fa} vs ${fb} goes the distance`,
              `The ${fa}-${fb} rivalry adds a chapter`,
              `${fa} edges ${fb} in a seesaw battle`,
            ], seed),
            preview: `${fa} vs ${fb}`,
            protagonistId: c.players[aIdx].golferId,
            protagonistName: c.players[aIdx].name,
            protagonistInitials: initials(c.players[aIdx].name),
            h2h: [
              { name: fa, color: H2H_COLORS[0], points: cumulativePoints(c, aIdx, c.maxHole) },
              { name: fb, color: H2H_COLORS[1], points: cumulativePoints(c, bIdx, c.maxHole) },
            ],
            caption: [
              { t: `The lead between them flips ` },
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
  detectCharge, detectCollapse, detectHold, detectGrinder, detectWildcard, detectToughHole,
  detectNemesis, detectRedemption, detectOutOfCharacter, detectRivalry,
];

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
}

export function buildRoundContext(input: SelectBeatsInput, series: number[][]): RoundContext {
  const { players, scores, holePars } = input;
  const maxHole = Math.max(...scores.map((s) => s.hole));
  const grossAt: Record<string, number | null> = {};
  scores.forEach((s) => { grossAt[s.golferId + "|" + s.hole] = s.gross; });
  const totals = players.map((p) => scores.filter((s) => s.golferId === p.golferId).reduce((a, s) => a + s.stableford, 0));
  const sortedTotals = [...totals].sort((a, b) => b - a);
  const ranks = totals.map((t) => sortedTotals.indexOf(t));
  let winnerIdx = 0;
  series.forEach((s, i) => { if (s[maxHole] > series[winnerIdx][maxHole]) winnerIdx = i; });
  return {
    players, scores, series, holePars, maxHole,
    finalStandings: input.finalStandings,
    winnerIdx, totals, ranks, grossAt,
    history: input.playerHistory || {},
  };
}

// The composition layer is deterministic for a given (ctx, input): detectors
// are pure, weights are arithmetic, phrasing is seed-hashed. All randomness
// lives in the Monte Carlo series, which is built once and frozen in ctx.
export function composeBeats(ctx: RoundContext, input: SelectBeatsInput): DataBeat[] {
  const seed = input.eventId;

  // Recency + spotlight penalties from story_beats_history.
  const angleCount: Record<string, number> = {};
  input.history.forEach((h) => { angleCount[h.angle_type] = (angleCount[h.angle_type] || 0) + 1; });
  const prevProtagonists = new Set(
    input.history.filter((h) => h.event_id === input.prevEventId && h.protagonist_id != null).map((h) => h.protagonist_id),
  );

  const pool: BeatCandidate[] = [];
  DETECTORS.forEach((d) => { pool.push(...d(ctx)); });

  const weightOf = (c: BeatCandidate) =>
    c.strength
    * (0.5 + c.surprise)
    * Math.pow(0.6, angleCount[c.angle] || 0)
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
  const maxSwing = middlePool.reduce((m, c) => Math.max(m, c.angle === "charge" || c.angle === "collapse" || c.angle === "hold" ? c.strength : 0), 0);
  const blowout = runaway || maxSwing < 0.28;
  const capN = blowout ? 1 : 3;

  // Greedy middle pick with diversity constraints. Two passes: the first
  // prefers unseen protagonists; the second fills remaining slots.
  const winnerGid = ctx.players[w].golferId;
  const chosen: BeatCandidate[] = [];
  const usedAngles = new Set<string>();
  const usedHoles = new Set<number>();
  const usedProtagonists = new Set<number>();
  let winnerBeats = 0;
  const tryTake = (c: BeatCandidate, requireFreshProtagonist: boolean) => {
    if (chosen.length >= capN) return;
    if (usedAngles.has(c.angle)) return;
    if (c.hole != null && usedHoles.has(c.hole)) return;
    if (c.protagonistId === winnerGid && winnerBeats >= 1) return;
    if (requireFreshProtagonist && c.protagonistId != null && usedProtagonists.has(c.protagonistId)) return;
    chosen.push(c);
    usedAngles.add(c.angle);
    if (c.hole != null) usedHoles.add(c.hole);
    if (c.protagonistId != null) usedProtagonists.add(c.protagonistId);
    if (c.protagonistId === winnerGid) winnerBeats++;
  };
  middlePool.forEach((c) => tryTake(c, true));
  middlePool.forEach((c) => tryTake(c, false));

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
  beats.push(buildFinalBeat(ctx, input, chosen, blowout, seed));
  return beats;
}

export function selectDataBeats(input: SelectBeatsInput): DataBeat[] {
  const { players, scores } = input;
  if (players.length < 2 || scores.length === 0) return [];
  const maxHole = Math.max(...scores.map((s) => s.hole));
  if (maxHole < 3) return [];
  const series = buildWinProbSeries(players, scores, maxHole);
  const ctx = buildRoundContext(input, series);
  return composeBeats(ctx, input);
}

function buildFinalBeat(ctx: RoundContext, input: SelectBeatsInput, middle: BeatCandidate[], blowout: boolean, seed: number): DataBeat {
  const winnerFirst = firstName(input.winnerName);
  const standings = input.finalStandings;
  const runnersTied = standings.filter((s) => s.pos.startsWith("T2")).length > 1;

  const caption: CaptionPart[] = runnersTied
    ? [{ t: "A " }, { t: "tie for second", b: true }, { t: " sits just behind." }]
    : standings[1]
      ? [{ t: standings[1].name, b: true }, { t: ` takes second with ${standings[1].pts}.` }]
      : [{ t: "The field never got close.", b: false }];

  if (blowout) {
    caption.push({ t: pick([
      " It was never really in doubt.",
      ` ${winnerFirst} led this one from start to finish.`,
      " The chase pack never landed a punch.",
    ], seed + 3) });
  } else {
    const decider = [...middle].filter((c) => c.hole != null).sort((a, b) => b.strength - a.strength)[0];
    if (decider && decider.protagonistId != null) {
      const p = ctx.players.find((x) => x.golferId === decider.protagonistId);
      const sc = p ? scoreAt(ctx, p.golferId, decider.hole!) : null;
      const fn = p ? firstName(p.name) : "";
      const scoreWord = sc ? scoreName(sc.gross, sc.par).toLowerCase() : "swing";
      caption.push({ t: pick([
        ` The hole that decided it: ${fn}'s ${scoreWord} on ${decider.hole}.`,
        ` ${fn}'s ${scoreWord} on ${decider.hole} proved to be the turning point.`,
        ` It all traced back to ${fn}'s ${scoreWord} on ${decider.hole}.`,
        ` The round turned for good on ${decider.hole}.`,
      ], seed + decider.hole!) });
    }
  }

  return {
    angle: "final",
    hole: null,
    kicker: "FINAL",
    title: pick([
      `${input.winnerName} wins ${input.eventLabel}`,
      `${input.winnerName} takes ${input.eventLabel}`,
      `${input.eventLabel} belongs to ${input.winnerName}`,
      `${input.winnerName} closes out ${input.eventLabel}`,
    ], seed + 7),
    preview: `${winnerFirst} Wins`,
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
