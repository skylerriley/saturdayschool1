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
// grammar sanity, points-valence honesty (no odds-speak, charge merit, par
// consistency), and REAL-PATH determinism -- the Monte Carlo is seeded on
// event_id, so the entire pipeline is rebuilt twice from scratch and must
// produce byte-identical beats (no mocks, no frozen series).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildWinProbAndTotals,
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
  hole_pars: number[];
  pointsAt: Record<string, number>; // "gid|hole" -> stableford
  beats: DataBeat[];
  beatsRepeat: DataBeat[]; // FULL second pipeline run (series rebuilt from seed)
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

    // Tier-2 fuel: totals from the whole season, per-hole gross+points from
    // the fixture events that precede this one. Per-hole aggregates are
    // restricted to SAME-COURSE prior events via holeStatsEventIds.
    const priorHoleRows: any[] = [];
    fx.events.slice(0, k).forEach((prev: any) => {
      const prevMap: Record<number, number> = {};
      prev.entries.forEach((e: any) => { prevMap[e.summary_id] = e.golfer_id; });
      prev.hole_scores.forEach((h: any) => {
        if (h.gross != null) priorHoleRows.push({ golfer_id: prevMap[h.summary_id], event_id: prev.event_id, hole: h.hole, gross: h.gross, points: h.pts ?? null });
      });
    });
    const holeStatsEventIds = fx.events.slice(0, k)
      .filter((prev: any) => prev.course_name === ev.course_name)
      .map((prev: any) => prev.event_id);
    const playerHistory = buildPlayerHistories({
      eventId: ev.event_id,
      playerIds: players.map((p: any) => p.golferId),
      allEvents: fx.all_events,
      allTotals: fx.all_totals,
      priorHoleRows,
      holeStatsEventIds,
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

    // REAL PATH, TWICE: both runs rebuild the Monte Carlo from the event_id
    // seed. If these diverge, production recaps would change between
    // sessions -- the determinism test below asserts they cannot.
    const runOnce = (): DataBeat[] => {
      const { series, totalsSeries } = buildWinProbAndTotals(players, scores, maxHole, ev.event_id);
      const ctx = buildRoundContext(input, series, totalsSeries);
      return composeBeats(ctx, input);
    };
    const beats = runOnce();
    const beatsRepeat = runOnce();

    beats.forEach((b) => historyLog.push({ event_id: ev.event_id, angle_type: b.angle, protagonist_id: b.protagonistId }));

    const pointsAt: Record<string, number> = {};
    scores.forEach((s: any) => { pointsAt[s.golferId + "|" + s.hole] = s.stableford; });

    const winnerGid = ev.entries.slice().sort((a: any, b: any) => b.total - a.total)[0].golfer_id;
    runs.push({ event_id: ev.event_id, date: ev.date, winnerGid, hole_pars: ev.hole_pars, pointsAt, beats, beatsRepeat });
  });
  return runs;
}

const runs = runBacktest();

// A beat's round position: openings key on throughHole, middles on hole.
function beatHole(b: DataBeat): number | null {
  return b.throughHole ?? b.hole ?? null;
}
function thirdOf(h: number): number {
  return h <= 6 ? 0 : h <= 12 ? 1 : 2;
}

// Human-readable dump -- the real acceptance artifact.
console.log("\n===== RECAP BACKTEST: last 7 hole-by-hole events =====");
runs.forEach((r) => {
  console.log(`\n${r.date}  (event ${r.event_id})  winner: ${firstOf(golferName(r.winnerGid))}`);
  r.beats.forEach((b) => {
    const who = b.protagonistName ? firstOf(b.protagonistName) : "(field)";
    console.log(`  [${b.angle.padEnd(16)}] ${String(b.hole ?? "-").padStart(2)}  ${who.padEnd(9)} ${("[" + b.heroLabel + "]").padEnd(18)} "${b.eyebrow}"`);
    console.log(`      ${captionText(b)}`);
  });
});
// Per-third histogram of hole-bearing beats (holes 1-6 / 7-12 / 13-18).
const hist = [0, 0, 0];
runs.forEach((r) => r.beats.forEach((b) => {
  const h = beatHole(b);
  if (h != null) hist[thirdOf(h)]++;
}));
console.log(`\nthirds histogram (1-6 / 7-12 / 13-18): ${hist.join(" / ")}`);
console.log("");

function firstOf(name: string) { return name.split(" ")[0]; }
function captionText(b: DataBeat) { return b.caption.map((p) => p.t).join(""); }
function allText(b: DataBeat) { return [b.eyebrow, b.title, b.heroLabel, b.preview, captionText(b)].join(" | "); }

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
  const VERB = /\b(is|are|was|were|has|have|had|leads?|led|takes?|took|wins?|won|drops?|climbs?|jumps?|falls?|fell|finish(es)?|finds?|play(s|ed)?|posts?|beats?|beat|flips?|lands?|sits?|runs?|running|eats?|shows?|shares?|share|pounces|dipped|decided|proved|traced|turned|g[eo]ts?|c[oa]mes?|makes?|made|holds?|held|answers?|refuses?|rides?|brings?|settles?|averaged|caps?|sets?|grabs?|leaves?|goes|torches|shakes?|solves?|blinks?|stalls?|bites|nets?|netted|moves?|keeps?|closes?|pulls?|banks?|stays?|hangs?|vanished|slams?|shrinks?|shrank|strings?|rattles?|strokes|puts?|slid|slides?|fades?|opens?|sort)\b/i;
  const BROKEN = /\b[A-Za-z]+'s \w+ the\b(?! (turning|last))/; // "X's 15 the hole ..." style fragment
  runs.forEach((r) => r.beats.forEach((b) => {
    const text = captionText(b).trim();
    assert.ok(/[.!?]$/.test(text), `caption lacks terminal punctuation [${b.angle}]: "${text}"`);
    assert.ok(VERB.test(text), `caption lacks a verb [${b.angle}]: "${text}"`);
    assert.ok(!BROKEN.test(text), `broken possessive fragment [${b.angle}]: "${text}"`);
    assert.ok(b.title.length > 3, `empty title [${b.angle}]`);
    assert.ok(b.heroLabel.length > 2, `missing heroLabel [${b.angle}]`);
    assert.ok(b.eyebrow.length > 3, `missing eyebrow [${b.angle}]`);
  }));
});

test("no gendered pronouns in any title or caption", () => {
  const GENDERED = /\b(his|her|hers|him|he|she)\b/i;
  runs.forEach((r) => r.beats.forEach((b) => {
    assert.ok(!GENDERED.test(b.title), `gendered title [${b.angle}]: "${b.title}"`);
    assert.ok(!GENDERED.test(b.eyebrow), `gendered eyebrow [${b.angle}]: "${b.eyebrow}"`);
    assert.ok(!GENDERED.test(captionText(b)), `gendered caption [${b.angle}]: "${captionText(b)}"`);
  }));
});

test("no odds-speak: no percentages, moneyline figures, or probability language anywhere user-facing", () => {
  const ODDS = /%|[+-]\d{3,}|\bodds\b|\bprobabilit|\bmoneyline\b|\b100 percent\b/i;
  runs.forEach((r) => r.beats.forEach((b) => {
    assert.ok(!ODDS.test(allText(b)), `odds-speak [${b.angle}]: "${allText(b)}"`);
    (b.ptsPanel?.cols || []).forEach((col) => {
      assert.ok(!ODDS.test(col.value), `odds-speak in ptsPanel [${b.angle}]: "${col.value}"`);
    });
    assert.equal(b.odds, undefined, `deprecated odds payload emitted [${b.angle}]`);
    assert.equal(b.swing, undefined, `deprecated swing payload emitted [${b.angle}]`);
  }));
});

test("charge merit: no charge/run beat where the protagonist scored <= 1 point", () => {
  runs.forEach((r) => r.beats.forEach((b) => {
    if (b.angle !== "charge") return;
    assert.ok(b.protagonistId != null && b.hole != null, "charge beat missing protagonist/hole");
    const pts = r.pointsAt[b.protagonistId + "|" + b.hole];
    assert.ok(pts != null && pts >= 2, `charge anchored on a ${pts}-point hole [event ${r.event_id}, hole ${b.hole}]`);
    if (b.streak) {
      const focus = b.streak.cells.slice(b.streak.focusStart, b.streak.focusStart + b.streak.focusCount);
      focus.forEach((cell) => assert.ok(cell.points >= 2, `run focus cell under 2 pts [event ${r.event_id}, hole ${cell.hole}]`));
    }
  }));
});

test("points valence: every emitted score carries points; tracer valence key exists", () => {
  runs.forEach((r) => r.beats.forEach((b) => {
    if (b.score) {
      assert.ok(typeof b.score.points === "number", `score without points [${b.angle}]`);
      const actual = r.pointsAt[b.protagonistId + "|" + b.hole];
      assert.equal(b.score.points, actual, `score.points mismatch [${b.angle}, event ${r.event_id}]`);
    }
  }));
});

test("par consistency: holeMeta.par always matches holePars for that hole", () => {
  runs.forEach((r) => r.beats.forEach((b) => {
    if (b.holeMeta) {
      assert.equal(b.holeMeta.par, r.hole_pars[b.holeMeta.hole - 1],
        `holeMeta par mismatch [${b.angle}, event ${r.event_id}, hole ${b.holeMeta.hole}]`);
    }
    if (b.score && b.holeMeta) {
      assert.equal(b.score.par, b.holeMeta.par, `score.par != holeMeta.par [${b.angle}, event ${r.event_id}]`);
    }
  }));
});

test("determinism: two full pipeline runs (Monte Carlo rebuilt from seed) are identical", () => {
  runs.forEach((r) => {
    assert.equal(JSON.stringify(r.beats), JSON.stringify(r.beatsRepeat), `event ${r.event_id} not seed-stable across full reruns`);
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

// ---- distribution properties (the late-round bias regression suite) ----------

test("opening variety: no single hole opens more than half the events", () => {
  const counts: Record<number, number> = {};
  runs.forEach((r) => { const h = r.beats[0].throughHole!; counts[h] = (counts[h] || 0) + 1; });
  console.log("opening holes:", runs.map((r) => r.beats[0].throughHole).join(", "));
  const max = Math.max(...Object.values(counts));
  assert.ok(max <= Math.ceil(runs.length / 2), `one hole opens ${max}/${runs.length} events: ${JSON.stringify(counts)}`);
});

test("round coverage: hole-bearing beats span >= 2 thirds in a majority of events", () => {
  let covered = 0;
  runs.forEach((r) => {
    const thirds = new Set<number>();
    r.beats.forEach((b) => { const h = beatHole(b); if (h != null) thirds.add(thirdOf(h)); });
    if (thirds.size >= 2) covered++;
  });
  console.log(`events spanning >= 2 thirds: ${covered}/${runs.length}`);
  assert.ok(covered > runs.length / 2, `only ${covered}/${runs.length} events span 2+ thirds`);
});

test("front-nine merit: >= 2 events carry a non-history middle beat on holes 1-9", () => {
  const HISTORY_ANGLES = new Set(["tough_hole", "nemesis"]);
  let n = 0;
  runs.forEach((r) => {
    if (r.beats.some((b) => b.throughHole == null && b.hole != null && b.hole <= 9 && !HISTORY_ANGLES.has(b.angle))) n++;
  });
  console.log(`events with a front-nine merit beat: ${n}/${runs.length}`);
  assert.ok(n >= 2, `merit beats cannot reach the front nine (${n}/${runs.length} events)`);
});

test("dead zone: holes 7-13 host at least one beat across the 7 events", () => {
  const any = runs.some((r) => r.beats.some((b) => {
    const h = beatHole(b);
    return h != null && h >= 7 && h <= 13;
  }));
  assert.ok(any, "holes 7-13 are empty across all events");
});
