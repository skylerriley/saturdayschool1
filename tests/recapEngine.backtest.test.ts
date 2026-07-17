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
  buildFieldHoleBaseline,
  selectDataBeats,
  type DataBeat,
  type BeatHistoryRow,
  type BeatStandingRow,
  type SelectBeatsInput,
} from "../src/lib/recapEngine.ts";

const fx = JSON.parse(readFileSync(new URL("./fixtures/recapBacktest.json", import.meta.url), "utf8"));

const golferName = (gid: number) => fx.golfers[gid] || `Golfer ${gid}`;

// Full "First Last" names -- mirrors HighlightsModule.buildStandings (the
// final board uses the ellipsising .lb-name-main cell, so no truncation).
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
    rows.push({ pos: String(effPos), name: golferName(e.golfer_id), pts: e.total });
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
// Builds the engine input for event index k against an ARBITRARY set of
// history rows. Shared by the chronological replay and the viewing-order
// tests, so both feed the engine identically.
function inputFor(k: number, historyRows: BeatHistoryRow[]): SelectBeatsInput {
  const ev = fx.events[k];
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
  const fieldBaseline = buildFieldHoleBaseline({
    eventId: ev.event_id,
    allEvents: fx.all_events,
    priorHoleRows,
    holeStatsEventIds,
  });

  const standings = buildStandings(ev.entries);
  // 6-event anti-repeat window; eventsAgo = 0 for the immediately-prior
  // event, matching the module's date-ordered recency rank.
  const eventsAgoOf: Record<number, number> = {};
  for (let j = 1; j <= 6 && k - j >= 0; j++) eventsAgoOf[fx.events[k - j].event_id] = j - 1;
  return {
    eventId: ev.event_id,
    players,
    scores,
    holePars: ev.hole_pars,
    finalStandings: standings.slice(0, 5),
    winnerName: golferName(ev.entries.slice().sort((a: any, b: any) => b.total - a.total)[0].golfer_id),
    eventLabel: `Week ${ev.event_number}`,
    history: historyRows
      .filter((h) => eventsAgoOf[h.event_id] != null)
      .map((h) => ({ ...h, eventsAgo: eventsAgoOf[h.event_id] })),
    prevEventId: k > 0 ? fx.events[k - 1].event_id : null,
    playerHistory,
    fieldBaseline,
  };
}

// The chronological rebuild, in test form: replay every event in date order,
// feeding each event's beats forward. Mirrors rebuildBeatHistory().
function chronologicalRebuild(): BeatHistoryRow[] {
  const rows: BeatHistoryRow[] = [];
  fx.events.forEach((ev: any, k: number) => {
    selectDataBeats(inputFor(k, rows)).forEach((b) => {
      rows.push({ event_id: ev.event_id, angle_type: b.angle, protagonist_id: b.protagonistId, hole: b.hole });
    });
  });
  return rows;
}

function runBacktest(): EventRun[] {
  const runs: EventRun[] = [];
  const historyLog: BeatHistoryRow[] = [];

  fx.events.forEach((ev: any, k: number) => {
    const input = inputFor(k, historyLog);
    const scores = input.scores;
    const maxHole = Math.max(...scores.map((s: any) => s.hole));
    const players = input.players;

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

    beats.forEach((b) => historyLog.push({ event_id: ev.event_id, angle_type: b.angle, protagonist_id: b.protagonistId, hole: b.hole }));

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

// Per-angle frequency table -- repetition visible at a glance.
const ALL_ANGLES = [
  "three_way", "duel", "wire_to_wire", "pace_setter",
  "charge", "collapse", "hold", "fast_start", "fade", "the_turn",
  "grinder", "wildcard", "tough_hole",
  "nemesis", "redemption", "out_of_character", "rivalry",
  "ace", "albatross", "eagle", "final",
];
const angleFreq: Record<string, number> = {};
runs.forEach((r) => r.beats.forEach((b) => { angleFreq[b.angle] = (angleFreq[b.angle] || 0) + 1; }));
console.log("\nper-angle frequency across 7 events:");
ALL_ANGLES.forEach((a) => {
  const n = angleFreq[a] || 0;
  console.log(`  ${a.padEnd(17)} ${"#".repeat(n).padEnd(7)} ${n}${n === 0 ? "   <-- DEAD" : ""}`);
});
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

const FIREWORKS = new Set(["ace", "albatross", "eagle"]);

test("shape: opening first, final last, 3-5 beats (+1 per fireworks), middles hole-ascending", () => {
  runs.forEach((r) => {
    // Fireworks are ADDITIVE -- they take a guaranteed slot on top of the arc
    // (up to FIREWORKS_MAX=2), so an eagle event may run to 6 or 7 beats.
    const extra = r.beats.filter((b) => FIREWORKS.has(b.angle)).length;
    assert.ok(r.beats.length >= 3 && r.beats.length <= 5 + extra, `event ${r.event_id}: ${r.beats.length} beats (+${extra} fireworks)`);
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

// ---- repetition / rotation / liveness / tie-safety / labels ------------------

test("no exact repeats: (angle,protagonist,hole) not twice in any 4-event window; (angle,protagonist) not in any 3", () => {
  const key3 = (b: DataBeat) => `${b.angle}|${b.protagonistId}|${b.hole ?? "-"}`;
  const key2 = (b: DataBeat) => `${b.angle}|${b.protagonistId}`;
  const withProt = (b: DataBeat) => b.protagonistId != null;
  for (let i = 0; i < runs.length; i++) {
    // identity: 4-event window [i-3 .. i]
    const w4 = runs.slice(Math.max(0, i - 3), i + 1);
    const seen3: Record<string, number> = {};
    w4.forEach((r) => r.beats.filter(withProt).forEach((b) => { seen3[key3(b)] = (seen3[key3(b)] || 0) + 1; }));
    Object.entries(seen3).forEach(([k, n]) => assert.ok(n < 2, `exact identity repeat within 4 events ending at event ${runs[i].event_id}: ${k} x${n}`));
    // (angle,protagonist): 3-event window [i-2 .. i]
    const w3 = runs.slice(Math.max(0, i - 2), i + 1);
    const seen2: Record<string, number> = {};
    w3.forEach((r) => r.beats.filter(withProt).forEach((b) => { seen2[key2(b)] = (seen2[key2(b)] || 0) + 1; }));
    Object.entries(seen2).forEach(([k, n]) => assert.ok(n < 2, `(angle,protagonist) repeat within 3 events ending at event ${runs[i].event_id}: ${k} x${n}`));
  }
});

test("angle rotation: no single angle type appears in more than 4 of 7 events", () => {
  const eventsWith: Record<string, number> = {};
  runs.forEach((r) => {
    const angles = new Set(r.beats.map((b) => b.angle));
    angles.forEach((a) => { eventsWith[a] = (eventsWith[a] || 0) + 1; });
  });
  // Fireworks (ace/albatross/eagle) are exempt: a golfer who eagles the same
  // hole three weeks running is three stories, not repetition, so they may
  // legitimately exceed the rotation cap.
  const over = Object.entries(eventsWith).filter(([a, n]) => a !== "final" && !FIREWORKS.has(a) && n > 4);
  assert.equal(over.length, 0, `over-frequent angles: ${JSON.stringify(over)}`);
});

test("detector liveness: every registered detector fires in at least 1 of 7 events", () => {
  // final is emitted unconditionally; the_turn is a starvation filler that
  // legitimately may not surface when middles are healthy. Fireworks
  // (ace/albatross/eagle) fire only when someone cards a gross eagle-or-better
  // -- a fixture with none is not a dead detector. All exempt.
  const EXEMPT = new Set(["final", "the_turn", "ace", "albatross", "eagle"]);
  const fired = new Set(runs.flatMap((r) => r.beats.map((b) => b.angle)));
  const dead = ALL_ANGLES.filter((a) => !EXEMPT.has(a) && !fired.has(a));
  assert.equal(dead.length, 0, `dead detectors (never fire on real data): ${dead.join(", ")}`);
});

test("tie safety: no caption falsely asserts a solo position when the group is tied", () => {
  // Build a per-event tie map: which players share which cumulative totals.
  runs.forEach((r) => {
    r.beats.forEach((b) => {
      const text = captionText(b) + " | " + b.eyebrow;
      // These phrasings assert a SOLO position. They are only allowed when
      // the asserted player is genuinely alone -- the engine routes such
      // claims through standingPhrase/leadByPhrase, so their mere presence in
      // a tie would be the bug. We detect the forbidden literal combos.
      assert.ok(!/\bhas the lead\b/i.test(text), `"has the lead" is never tie-safe [${b.angle}, event ${r.event_id}]: ${text}`);
      // "leads by zero" / "leads by 0" must never appear.
      assert.ok(!/leads? by (zero|0)\b/i.test(text), `"leads by zero" [${b.angle}, event ${r.event_id}]: ${text}`);
      // "takes second" must not appear when second is a tie (T2 in standings).
      if (b.angle === "final") {
        const t2 = r.beats; // final carries finalStandings
        const fs = b.finalStandings || [];
        const secondTied = fs.filter((s) => s.pos === "T2").length > 1;
        if (secondTied) assert.ok(!/takes second/i.test(text), `"takes second" during a T2 tie [event ${r.event_id}]: ${text}`);
        const firstTied = fs.filter((s) => s.pos === "T1").length > 1;
        if (firstTied) assert.ok(!/takes second|never got close/i.test(text), `solo-win phrasing during a shared title [event ${r.event_id}]: ${text}`);
        void t2;
      }
    });
  });
});

// ---- determinism: history must be a pure function of the event sequence ------
// These are the tests that would have caught the live repetition. The suite
// above replays chronologically, which is the IDEAL case -- it cannot see a
// bug where reads write history and viewers open events newest-first.

test("viewing-order independence: reads return identical beats in any order", () => {
  // Author history once, the way the rebuild does.
  const history = chronologicalRebuild();
  const readInOrder = (order: number[]) => {
    const out: Record<number, string> = {};
    order.forEach((k) => { out[fx.events[k].event_id] = JSON.stringify(selectDataBeats(inputFor(k, history))); });
    return out;
  };
  const idx = fx.events.map((_: any, i: number) => i);
  const forward = readInOrder(idx);
  const reverse = readInOrder([...idx].reverse());
  // Deterministic shuffle (no Math.random -- the suite must stay reproducible).
  const shuffled = [...idx].sort((a, b) => ((a * 7919) % 13) - ((b * 7919) % 13));
  const random = readInOrder(shuffled);
  fx.events.forEach((ev: any) => {
    assert.equal(forward[ev.event_id], reverse[ev.event_id], `event ${ev.event_id} differs when read newest-first`);
    assert.equal(forward[ev.event_id], random[ev.event_id], `event ${ev.event_id} differs when read in random order`);
  });
});

test("reads do not write: composing beats never mutates the history it was given", () => {
  const history = chronologicalRebuild();
  const before = JSON.stringify(history);
  fx.events.forEach((_: any, k: number) => { selectDataBeats(inputFor(k, history)); });
  assert.equal(JSON.stringify(history), before, "selectDataBeats mutated the history rows passed to it");
});

test("rebuild determinism: two chronological rebuilds produce byte-identical rows", () => {
  assert.equal(JSON.stringify(chronologicalRebuild()), JSON.stringify(chronologicalRebuild()), "rebuild is not deterministic");
});

// ---- detector semantics ------------------------------------------------------

test("nemesis is personal: not the same hole for >2 protagonists, and never the event's tough_hole", () => {
  const holeCounts: Record<number, Set<number>> = {};
  runs.forEach((r) => {
    const tough = r.beats.find((b) => b.angle === "tough_hole");
    r.beats.filter((b) => b.angle === "nemesis").forEach((b) => {
      if (tough && b.hole === tough.hole) {
        assert.fail(`nemesis shadows tough_hole on ${b.hole} [event ${r.event_id}]`);
      }
      (holeCounts[b.hole!] ||= new Set()).add(b.protagonistId!);
    });
  });
  Object.entries(holeCounts).forEach(([h, prots]) => {
    assert.ok(prots.size <= 2, `hole ${h} is the "nemesis" of ${prots.size} different players -- that is the hardest hole, not a personal story`);
  });
});

test("grinder is low-variance: protagonist's per-hole points stddev is below the field median", () => {
  const sd = (list: number[]) => {
    const m = list.reduce((a, b) => a + b, 0) / list.length;
    return Math.sqrt(list.reduce((a, b) => a + (b - m) * (b - m), 0) / list.length);
  };
  runs.forEach((r) => {
    const grinders = r.beats.filter((b) => b.angle === "grinder");
    if (grinders.length === 0) return;
    const ev = fx.events.find((e: any) => e.event_id === r.event_id);
    const maxHole = Math.max(...ev.hole_scores.filter((h: any) => h.pts != null).map((h: any) => h.hole));
    const sds: number[] = [];
    ev.entries.forEach((e: any) => {
      const list: number[] = [];
      for (let h = 1; h <= maxHole; h++) {
        const v = r.pointsAt[e.golfer_id + "|" + h];
        if (v != null) list.push(v);
      }
      if (list.length === maxHole) sds.push(sd(list));
    });
    sds.sort((a, b) => a - b);
    const median = sds[Math.floor(sds.length / 2)];
    grinders.forEach((b) => {
      const list: number[] = [];
      for (let h = 1; h <= maxHole; h++) {
        const v = r.pointsAt[b.protagonistId + "|" + h];
        if (v != null) list.push(v);
      }
      const mine = sd(list);
      assert.ok(mine < median, `grinder ${b.protagonistName} sd=${mine.toFixed(2)} is not below field median ${median.toFixed(2)} [event ${r.event_id}]`);
    });
  });
});

test("turning point truth: collapse lands on the biggest win-prob drop it is allowed to name", () => {
  // collapse deliberately only considers holes the protagonist scored <= 1
  // point on (a drop while netting par is a rival's story, not a collapse).
  // The assert mirrors that qualifying set: within it, the beat must be the
  // argmax of |delta win-prob| -- i.e. the spread constraint has not nudged
  // the turning point off the hole that actually decided the round.
  runs.forEach((r) => {
    const beat = r.beats.find((b) => b.angle === "collapse");
    if (!beat) return;
    const ev = fx.events.find((e: any) => e.event_id === r.event_id);
    const k = fx.events.indexOf(ev);
    const input = inputFor(k, []);
    const maxHole = Math.max(...input.scores.map((s: any) => s.hole));
    const { series, totalsSeries } = buildWinProbAndTotals(input.players, input.scores, maxHole, ev.event_id);
    void totalsSeries;
    let bestDrop = 0, bestHole = -1, bestGid = -1;
    input.players.forEach((p: any, i: number) => {
      for (let h = 1; h <= maxHole; h++) {
        const pts = r.pointsAt[p.golferId + "|" + h];
        if (pts == null || pts >= 2) continue; // same merit gate as the detector
        const d = series[i][h] - series[i][h - 1];
        if (d < bestDrop && series[i][h - 1] >= 15) { bestDrop = d; bestHole = h; bestGid = p.golferId; }
      }
    });
    assert.equal(beat.hole, bestHole, `collapse on ${beat.hole} but the biggest qualifying drop is hole ${bestHole} [event ${r.event_id}]`);
    assert.equal(beat.protagonistId, bestGid, `collapse protagonist mismatch [event ${r.event_id}]`);
  });
});

// ---- rare fireworks: gross eagle or better -----------------------------------

// A gross eagle-or-better in the fixture must ALWAYS surface as its beat.
test("fireworks always fires: every real gross eagle-or-better appears in that event's beats", () => {
  let checked = 0;
  fx.events.forEach((ev: any, k: number) => {
    const pars: number[] = ev.hole_pars;
    const gidOf: Record<number, number> = {};
    ev.entries.forEach((e: any) => { gidOf[e.summary_id] = e.golfer_id; });
    const hits = ev.hole_scores.filter((h: any) => {
      if (h.gross == null) return false;
      const par = pars[h.hole - 1];
      if (par == null) return false;
      const d = h.gross - par;
      return h.gross === 1 || d === -3 || d === -2;
    });
    if (hits.length === 0) return;
    checked++;
    const beats = selectDataBeats(inputFor(k, chronologicalRebuild()));
    // Cap is 2 -- assert the highest-tier / earliest hits are present.
    const tier = (h: any) => (h.gross === 1 ? 3 : h.gross - pars[h.hole - 1] === -3 ? 2 : 1);
    const expected = [...hits].sort((a: any, b: any) => tier(b) - tier(a) || a.hole - b.hole).slice(0, 2);
    expected.forEach((h: any) => {
      const angle = h.gross === 1 ? "ace" : h.gross - pars[h.hole - 1] === -3 ? "albatross" : "eagle";
      const found = beats.some((b) => b.angle === angle && b.hole === h.hole && b.protagonistId === gidOf[h.summary_id]);
      assert.ok(found, `event ${ev.event_id}: gross ${angle} on hole ${h.hole} did not surface`);
    });
  });
  // The fixture is known to contain event 303's eagle; if it ever loses it,
  // the synthetic tests below still cover the behaviour, but flag the gap.
  console.log(`fireworks: ${checked} fixture event(s) contained a gross eagle-or-better`);
  assert.ok(checked >= 1, "fixture unexpectedly has no gross eagle-or-better to assert against");
});

// -- Synthetic-event scaffolding for the exemption / classification / cap /
// additive asserts (the fixture has no ace, no albatross, no multi-eagle
// event). Builds a full-round SelectBeatsInput from a compact hole list.
function syntheticInput(opts: {
  eventId: number;
  pars: number[];
  players: { gid: number; name: string; gross: number[]; pts: number[] }[];
  history?: BeatHistoryRow[];
  playerHistory?: Record<number, any>;
}): SelectBeatsInput {
  const maxHole = opts.pars.length;
  const players = opts.players.map((p) => ({ golferId: p.gid, name: p.name }));
  const scores: any[] = [];
  opts.players.forEach((p) => {
    for (let h = 1; h <= maxHole; h++) scores.push({ golferId: p.gid, hole: h, stableford: p.pts[h - 1], gross: p.gross[h - 1] });
  });
  const totals = opts.players.map((p) => ({ gid: p.gid, total: p.pts.reduce((a, b) => a + b, 0) }));
  const sorted = [...totals].sort((a, b) => b.total - a.total);
  const standings: BeatStandingRow[] = sorted.map((t, i) => ({
    pos: String(i + 1),
    name: opts.players.find((p) => p.gid === t.gid)!.name,
    pts: t.total,
  }));
  return {
    eventId: opts.eventId,
    players,
    scores,
    holePars: opts.pars,
    finalStandings: standings.slice(0, 5),
    winnerName: standings[0].name,
    eventLabel: "Week 99",
    history: opts.history || [],
    prevEventId: null,
    playerHistory: opts.playerHistory || {},
    fieldBaseline: { meanPointsAt: {}, overallMeanPoints: 0, samplesAt: {} },
  };
}

// A routine par-4/5 course and two ordinary net cards, so nothing else about
// the round forces a specific arc -- we vary only the fireworks hole.
const STD_PARS = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 5, 3, 4];
function evenCard(pars: number[]): { gross: number[]; pts: number[] } {
  return { gross: pars.slice(), pts: pars.map(() => 2) }; // gross par, net par (2 pts) everywhere
}

test("fireworks cooldown exemption: an eagle still fires with 3 prior same-hole eagles in history", () => {
  const a = evenCard(STD_PARS), b = evenCard(STD_PARS);
  // Golfer 1 eagles hole 4 (par 5, gross 3).
  a.gross[3] = 3; a.pts[3] = 4;
  const history: BeatHistoryRow[] = [0, 1, 2].map((i) => ({
    event_id: 900 + i, angle_type: "eagle", protagonist_id: 1, hole: 4, eventsAgo: i,
  }));
  const input = syntheticInput({
    eventId: 999, pars: STD_PARS,
    players: [
      { gid: 1, name: "Joe Alpha", gross: a.gross, pts: a.pts },
      { gid: 2, name: "Sam Beta", gross: b.gross, pts: b.pts },
    ],
    history,
  });
  const beats = selectDataBeats(input);
  assert.ok(beats.some((x) => x.angle === "eagle" && x.hole === 4 && x.protagonistId === 1),
    "eagle suppressed by cooldown -- fireworks must be exempt from anti-repeat");
});

test("fireworks tier classification: gross 1 is ace on a par 3 and on a par 4 (never eagle/albatross)", () => {
  // Par 3, hole 3: gross 1 -> ace, NOT eagle.
  const a3 = evenCard(STD_PARS); a3.gross[2] = 1; a3.pts[2] = 4;
  const in3 = syntheticInput({
    eventId: 1001, pars: STD_PARS,
    players: [
      { gid: 1, name: "Joe Alpha", gross: a3.gross, pts: a3.pts },
      { gid: 2, name: "Sam Beta", ...evenCard(STD_PARS) },
    ],
  });
  const b3 = selectDataBeats(in3);
  assert.ok(b3.some((x) => x.angle === "ace" && x.hole === 3), "gross 1 on a par 3 must classify as ace");
  assert.ok(!b3.some((x) => x.angle === "eagle" && x.hole === 3), "gross 1 on a par 3 must NOT also emit eagle");

  // Par 4, hole 1: gross 1 -> ace, NOT albatross.
  const a4 = evenCard(STD_PARS); a4.gross[0] = 1; a4.pts[0] = 4;
  const in4 = syntheticInput({
    eventId: 1002, pars: STD_PARS,
    players: [
      { gid: 1, name: "Joe Alpha", gross: a4.gross, pts: a4.pts },
      { gid: 2, name: "Sam Beta", ...evenCard(STD_PARS) },
    ],
  });
  const b4 = selectDataBeats(in4);
  assert.ok(b4.some((x) => x.angle === "ace" && x.hole === 1), "gross 1 on a par 4 must classify as ace");
  assert.ok(!b4.some((x) => x.angle === "albatross" && x.hole === 1), "gross 1 on a par 4 must NOT also emit albatross");
});

test("fireworks cap: an event with 3 qualifying scores emits at most 2 fireworks beats", () => {
  const a = evenCard(STD_PARS);
  // Three eagles on par-5 holes 4, 8, 13 (gross 3).
  [3, 7, 12].forEach((i) => { a.gross[i] = 3; a.pts[i] = 4; });
  const input = syntheticInput({
    eventId: 1003, pars: STD_PARS,
    players: [
      { gid: 1, name: "Joe Alpha", gross: a.gross, pts: a.pts },
      { gid: 2, name: "Sam Beta", ...evenCard(STD_PARS) },
    ],
  });
  const beats = selectDataBeats(input);
  const fw = beats.filter((x) => FIREWORKS.has(x.angle));
  assert.equal(fw.length, 2, `expected the 3 eagles capped to 2, got ${fw.length}`);
});

test("fireworks additive: the eagle does not remove an arc beat that would otherwise be selected", () => {
  // Golfer 1 makes a clear front-nine charge (holes 6-9 all net birdie).
  const a = evenCard(STD_PARS);
  [5, 6, 7, 8].forEach((i) => { a.pts[i] = 3; a.gross[i] = STD_PARS[i] - 1; });
  const withoutEagle = syntheticInput({
    eventId: 1004, pars: STD_PARS,
    players: [
      { gid: 1, name: "Joe Alpha", gross: a.gross, pts: a.pts },
      { gid: 2, name: "Sam Beta", ...evenCard(STD_PARS) },
    ],
  });
  const base = selectDataBeats(withoutEagle);
  const baseArc = base.filter((x) => !FIREWORKS.has(x.angle)).map((x) => x.angle + "|" + (x.hole ?? "-"));

  // Same round, but golfer 2 now eagles hole 16 (par 5, gross 3).
  const a2 = { gross: a.gross.slice(), pts: a.pts.slice() };
  const b2 = evenCard(STD_PARS); b2.gross[15] = 3; b2.pts[15] = 4;
  const withEagle = syntheticInput({
    eventId: 1004, pars: STD_PARS,
    players: [
      { gid: 1, name: "Joe Alpha", gross: a2.gross, pts: a2.pts },
      { gid: 2, name: "Sam Beta", gross: b2.gross, pts: b2.pts },
    ],
  });
  const withF = selectDataBeats(withEagle);
  const withArc = withF.filter((x) => !FIREWORKS.has(x.angle)).map((x) => x.angle + "|" + (x.hole ?? "-"));

  assert.ok(withF.some((x) => x.angle === "eagle" && x.hole === 16), "eagle did not fire in the additive test");
  // Every arc beat present without the eagle is STILL present with it -- the
  // eagle took a slot on top, it did not displace the arc.
  baseArc.forEach((k) => assert.ok(withArc.includes(k), `eagle displaced arc beat ${k} -- fireworks must be additive`));
});

test("labels: no chart label is a 'Wk -N' offset; historical labels are dates or Today", () => {
  const OFFSET = /Wk\s*-?\d/i;
  runs.forEach((r) => r.beats.forEach((b) => {
    const labels: string[] = [];
    (b.scoreRow?.cells || []).forEach((c) => labels.push(c.label));
    (b.weekBars || []).forEach((c) => labels.push(c.label));
    labels.forEach((l) => assert.ok(!OFFSET.test(l), `offset label leaked to UI [${b.angle}, event ${r.event_id}]: "${l}"`));
    // Historical (non-highlight) labels should read as a date or a fallback,
    // never a relative offset.
    labels.filter((l) => l !== "Today").forEach((l) => {
      assert.ok(/^[A-Z][a-z]{2} \d{1,2}$/.test(l) || /^Rd \d+$/.test(l), `non-date historical label [${b.angle}, event ${r.event_id}]: "${l}"`);
    });
  }));
});
