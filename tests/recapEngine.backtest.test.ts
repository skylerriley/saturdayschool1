// Backtest for the recap detector catalog over the last 7 real hole-by-hole
// events (snapshotted read-only from production into fixtures/recapBacktest.json).
//
// Run with Node's built-in runner (no vitest in this repo; Node >=22 strips
// erasable TS syntax natively):
//
//   node --test tests/recapEngine.backtest.test.ts
//
// This is the acceptance gate for recap variety: it prints each event's beat
// list and asserts angle variety, no repeating skeleton, spotlight rotation,
// grammar sanity, and seed-stable determinism of the selection+phrasing layer.
// (The Monte Carlo series itself is intentionally random; it is built once per
// event here and frozen in the RoundContext, exactly like the sessionStorage
// cache freezes it in the app.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildWinProbSeries,
  buildRoundContext,
  composeBeats,
  buildPlayerHistories,
  type DataBeat,
  type BeatHistoryRow,
  type BeatStandingRow,
  type SelectBeatsInput,
} from "../src/lib/recapEngine.ts";

const fx = JSON.parse(readFileSync(new URL("./fixtures/recapBacktest.json", import.meta.url), "utf8"));

const golferName = (gid: number) => fx.golfers[gid] || `Golfer ${gid}`;
const shortName = (full: string) => {
  const parts = full.trim().split(" ").filter(Boolean);
  return parts.length < 2 ? full : parts[0] + " " + parts[parts.length - 1][0];
};

function buildStandings(entries: any[]): BeatStandingRow[] {
  const sorted = [...entries].sort((a, b) => b.total - a.total);
  const rows: BeatStandingRow[] = [];
  let pos = 0, prevPts: number | null = null, prevPos = 0;
  sorted.forEach((e) => {
    pos += 1;
    const isTie = prevPts != null && e.total === prevPts;
    const effPos = isTie ? prevPos : pos;
    prevPos = effPos;
    prevPts = e.total;
    rows.push({ pos: String(effPos), name: shortName(golferName(e.golfer_id)), pts: e.total });
  });
  const counts: Record<string, number> = {};
  rows.forEach((r) => { counts[r.pos] = (counts[r.pos] || 0) + 1; });
  rows.forEach((r) => { if (counts[r.pos] > 1) r.pos = "T" + r.pos; });
  return rows;
}

interface EventRun {
  event_id: number;
  date: string;
  winnerGid: number;
  beats: DataBeat[];
  beatsRepeat: DataBeat[]; // second compose over the same frozen series
}

// Replay the season slice chronologically, feeding each event's surfaced
// beats forward as story_beats_history so the recency penalties operate the
// way they will in production.
function runBacktest(): EventRun[] {
  const runs: EventRun[] = [];
  const historyLog: BeatHistoryRow[] = [];

  fx.events.forEach((ev: any, k: number) => {
    const players = ev.entries.map((e: any) => ({ golferId: e.golfer_id, name: golferName(e.golfer_id) }));
    const sumToGid: Record<number, number> = {};
    ev.entries.forEach((e: any) => { sumToGid[e.summary_id] = e.golfer_id; });
    const scores = ev.hole_scores
      .filter((h: any) => h.pts != null)
      .map((h: any) => ({ golferId: sumToGid[h.summary_id], hole: h.hole, stableford: h.pts, gross: h.gross ?? null }));

    // Tier-2 fuel: totals from the whole season, per-hole gross from the
    // fixture events that precede this one.
    const priorHoleRows: any[] = [];
    fx.events.slice(0, k).forEach((prev: any) => {
      const prevMap: Record<number, number> = {};
      prev.entries.forEach((e: any) => { prevMap[e.summary_id] = e.golfer_id; });
      prev.hole_scores.forEach((h: any) => {
        if (h.gross != null) priorHoleRows.push({ golfer_id: prevMap[h.summary_id], event_id: prev.event_id, hole: h.hole, gross: h.gross });
      });
    });
    const playerHistory = buildPlayerHistories({
      eventId: ev.event_id,
      playerIds: players.map((p: any) => p.golferId),
      allEvents: fx.all_events,
      allTotals: fx.all_totals,
      priorHoleRows,
    });

    const standings = buildStandings(ev.entries);
    const recentIds = fx.events.slice(Math.max(0, k - 4), k).map((e: any) => e.event_id);
    const input: SelectBeatsInput = {
      eventId: ev.event_id,
      players,
      scores,
      holePars: ev.hole_pars,
      finalStandings: standings.slice(0, 5),
      winnerName: golferName(ev.entries.slice().sort((a: any, b: any) => b.total - a.total)[0].golfer_id),
      eventLabel: `Week ${ev.event_number}`,
      history: historyLog.filter((h) => recentIds.includes(h.event_id)),
      prevEventId: k > 0 ? fx.events[k - 1].event_id : null,
      playerHistory,
    };

    const maxHole = Math.max(...scores.map((s: any) => s.hole));
    const series = buildWinProbSeries(players, scores, maxHole); // built ONCE, frozen
    const ctx = buildRoundContext(input, series);
    const beats = composeBeats(ctx, input);
    const beatsRepeat = composeBeats(ctx, input);

    beats.forEach((b) => historyLog.push({ event_id: ev.event_id, angle_type: b.angle, protagonist_id: b.protagonistId }));

    const winnerGid = ev.entries.slice().sort((a: any, b: any) => b.total - a.total)[0].golfer_id;
    runs.push({ event_id: ev.event_id, date: ev.date, winnerGid, beats, beatsRepeat });
  });
  return runs;
}

const runs = runBacktest();

// Human-readable dump -- the real acceptance artifact.
console.log("\n===== RECAP BACKTEST: last 7 hole-by-hole events =====");
runs.forEach((r) => {
  console.log(`\n${r.date}  (event ${r.event_id})  winner: ${firstOf(golferName(r.winnerGid))}`);
  r.beats.forEach((b) => {
    const who = b.protagonistName ? firstOf(b.protagonistName) : "(field)";
    console.log(`  [${b.angle.padEnd(16)}] ${String(b.hole ?? "-").padStart(2)}  ${who.padEnd(9)} "${b.title}"`);
  });
});
console.log("");

function firstOf(name: string) { return name.split(" ")[0]; }
function captionText(b: DataBeat) { return b.caption.map((p) => p.t).join(""); }

test("angle variety: >= 6 distinct angle types across the 7 events", () => {
  const angles = new Set(runs.flatMap((r) => r.beats.map((b) => b.angle)));
  console.log("distinct angles:", [...angles].sort().join(", "));
  assert.ok(angles.size >= 6, `only ${angles.size}: ${[...angles].join(",")}`);
});

test("no repeating skeleton: no 3 consecutive events share an ordered angle sequence", () => {
  const seqs = runs.map((r) => r.beats.map((b) => b.angle).join(">"));
  for (let i = 0; i + 2 < seqs.length; i++) {
    assert.ok(!(seqs[i] === seqs[i + 1] && seqs[i + 1] === seqs[i + 2]),
      `events ${i}..${i + 2} all use skeleton: ${seqs[i]}`);
  }
});

test("spotlight rotation: winner is the primary protagonist in <= half the events", () => {
  let winnerPrimary = 0;
  runs.forEach((r) => {
    const mids = r.beats.filter((b) => b.protagonistId != null);
    if (mids.length === 0) return;
    const counts: Record<number, number> = {};
    mids.forEach((b) => { counts[b.protagonistId!] = (counts[b.protagonistId!] || 0) + 1; });
    const primary = Number(Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]);
    if (primary === r.winnerGid) winnerPrimary++;
  });
  console.log(`winner is primary protagonist in ${winnerPrimary}/${runs.length} events`);
  assert.ok(winnerPrimary <= runs.length / 2, `winner stars in ${winnerPrimary}/${runs.length}`);
});

test("grammar: captions have verbs, terminal punctuation, no broken possessive fragment", () => {
  const VERB = /\b(is|are|was|were|has|have|had|leads?|led|takes?|took|wins?|won|drops?|climbs?|jumps?|falls?|finish(es)?|finds?|play(s|ed)?|posts?|beats?|beat|flips?|lands?|sits?|runs?|running|eats?|shows?|share|pounces|dipped|decided|proved|traced|turned|g[eo]ts?|c[oa]mes?|makes?|made|holds?|held|answers?|refuses?|rides?|brings?|settles?|averaged|caps?|sets?|grabs?|leaves?|goes|torches|shakes?|solves?|blinks?|stalls?|bites)\b/i;
  const BROKEN = /\b[A-Za-z]+'s \w+ the\b(?! (turning|last))/; // "X's 15 the hole ..." style fragment
  runs.forEach((r) => r.beats.forEach((b) => {
    const text = captionText(b).trim();
    assert.ok(/[.!?]$/.test(text), `caption lacks terminal punctuation [${b.angle}]: "${text}"`);
    assert.ok(VERB.test(text), `caption lacks a verb [${b.angle}]: "${text}"`);
    assert.ok(!BROKEN.test(text), `broken possessive fragment [${b.angle}]: "${text}"`);
    assert.ok(b.title.length > 3, `empty title [${b.angle}]`);
  }));
});

test("no gendered pronouns in any title or caption", () => {
  const GENDERED = /\b(his|her|hers|him|he|she)\b/i;
  runs.forEach((r) => r.beats.forEach((b) => {
    assert.ok(!GENDERED.test(b.title), `gendered title [${b.angle}]: "${b.title}"`);
    assert.ok(!GENDERED.test(captionText(b)), `gendered caption [${b.angle}]: "${captionText(b)}"`);
  }));
});

test("determinism: composing twice over the same frozen series is identical", () => {
  runs.forEach((r) => {
    assert.equal(JSON.stringify(r.beats), JSON.stringify(r.beatsRepeat), `event ${r.event_id} not seed-stable`);
  });
});

test("shape: opening first, final last, 3-5 beats, middles hole-ascending", () => {
  runs.forEach((r) => {
    assert.ok(r.beats.length >= 3 && r.beats.length <= 5, `event ${r.event_id}: ${r.beats.length} beats`);
    assert.ok(r.beats[0].throughHole != null, `event ${r.event_id}: first beat is not an opening`);
    assert.equal(r.beats[r.beats.length - 1].angle, "final");
    const mids = r.beats.slice(1, -1).map((b) => b.hole ?? 99);
    for (let i = 1; i < mids.length; i++) assert.ok(mids[i] >= mids[i - 1], `event ${r.event_id}: middles out of order`);
  });
});
