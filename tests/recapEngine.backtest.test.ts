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
    // Skins pot basis (all fixture entries are skins_paid in the real events).
    skinsPaidCount: ev.entries.filter((e: any) => e.skins_paid).length,
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
    const res = b.angle === "final" ? "fin" : String(resHole(b) ?? "-");
    console.log(`  [${b.angle.padEnd(16)}] res ${res.padStart(3)}  hole ${String(b.hole ?? "-").padStart(2)}  ${who.padEnd(9)} ${("[" + b.heroLabel + "]").padEnd(18)} "${b.eyebrow}"`);
    console.log(`      ${captionText(b)}`);
  });
});

// The resolution hole the composer sorts on: explicit resolutionHole, else the
// opening's throughHole, else hole. Mirrors HighlightsModule's sort key.
function resHole(b: DataBeat): number | null {
  return b.resolutionHole ?? b.throughHole ?? b.hole ?? null;
}
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
console.log("\nper-angle frequency across the fixture:");
ALL_ANGLES.forEach((a) => {
  const n = angleFreq[a] || 0;
  console.log(`  ${a.padEnd(17)} ${"#".repeat(n).padEnd(7)} ${n}${n === 0 ? "   <-- DEAD" : ""}`);
});
console.log("");

function firstOf(name: string) { return name.split(" ")[0]; }
function captionText(b: DataBeat) { return b.caption.map((p) => p.t).join(""); }
function allText(b: DataBeat) { return [b.eyebrow, b.title, b.heroLabel, b.preview, captionText(b)].join(" | "); }

test("angle variety: >= 6 distinct angle types across the fixture events", () => {
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

// ---- caption architecture (Handoff #9 1, 2d, 6) ------------------------------

// Field-wide angles have no protagonist; their caption is self-contained by
// naming the hole / field fact instead of a person.
const FIELD_ANGLES = new Set(["three_way", "the_turn", "tough_hole", "final"]);

test("caption self-contained: EVERY beat with a protagonist names them (Handoff #10 5b)", () => {
  // Strengthened: this is the assert that would have caught out_of_character
  // failing to name its golfer. It applies to ALL angles with a non-null
  // protagonist, field angles excluded (they have no protagonist to name).
  runs.forEach((r) => r.beats.forEach((b) => {
    if (b.protagonistId == null) return;
    const first = (b.protagonistName || "").split(" ")[0];
    assert.ok(first, `beat has a protagonistId but no name [${b.angle}, event ${r.event_id}]`);
    const text = captionText(b);
    assert.ok(text.includes(first), `caption does not name ${first}, leans on eyebrow [${b.angle}, event ${r.event_id}]: "${text}"`);
  }));
});

test("caption char budget: every caption's plain text is <= 160 chars", () => {
  // 140 is the copy target; the final beat appends a decider clause, so the
  // hard ceiling the layout must survive is a little higher.
  runs.forEach((r) => r.beats.forEach((b) => {
    const len = captionText(b).length;
    assert.ok(len <= 160, `caption ${len} chars, over budget [${b.angle}, event ${r.event_id}]: "${captionText(b)}"`);
  }));
});

test("caption variety across events: an angle firing in >=2 events is not always the same caption shape", () => {
  // Shape = the caption with names/numbers stripped, so we detect a fixed
  // SENTENCE STRUCTURE repeating, not just different nouns.
  const shapeOf = (t: string) => t.replace(/[A-Z][a-z]+/g, "N").replace(/\d+/g, "#").replace(/\s+/g, " ").trim();
  const byAngle: Record<string, string[]> = {};
  runs.forEach((r) => r.beats.forEach((b) => {
    (byAngle[b.angle] ||= []).push(shapeOf(captionText(b)));
  }));
  Object.entries(byAngle).forEach(([angle, shapes]) => {
    if (shapes.length <= 2) return; // need a few firings to judge variety
    const distinct = new Set(shapes).size;
    assert.ok(distinct >= 2, `angle ${angle} uses one fixed caption shape across ${shapes.length} events`);
  });
});

// ---- standings truth (Handoff #10 1) -----------------------------------------

// Cumulative points per golfer through hole N, from the fixture's per-hole pts.
function cumThrough(r: typeof runs[number], gids: number[], throughHole: number): Record<number, number> {
  const out: Record<number, number> = {};
  gids.forEach((g) => {
    let s = 0;
    for (let h = 1; h <= throughHole; h++) s += r.pointsAt[g + "|" + h] ?? 0;
    out[g] = s;
  });
  return out;
}

test("standings truth: a checkpoint board shows cumulative-through-N, not the final board relabelled", () => {
  runs.forEach((r) => {
    const ev = fx.events.find((e: any) => e.event_id === r.event_id);
    const gids: number[] = ev.entries.map((e: any) => e.golfer_id);
    const nameOf = (g: number) => golferName(g);
    const maxHole = Math.max(...ev.hole_scores.filter((h: any) => h.pts != null).map((h: any) => h.hole));
    const finalCum = cumThrough(r, gids, maxHole);

    r.beats.forEach((b) => {
      const sb = (b as any).standings;
      if (!sb || sb.isFinal) return; // final legitimately shows final totals
      const thru = Number(sb.thru);
      assert.ok(Number.isFinite(thru) && thru >= 1 && thru < maxHole, `checkpoint thru ${sb.thru} out of range [${b.angle}, event ${r.event_id}]`);
      const cum = cumThrough(r, gids, thru);
      // 1) every row's points equal cumulative-through-thru for that golfer.
      sb.rows.forEach((row: any) => {
        const g = gids.find((x) => nameOf(x) === row.name);
        assert.ok(g != null, `standings row name ${row.name} not in field [event ${r.event_id}]`);
        assert.equal(row.points, cum[g!], `row ${row.name} shows ${row.points}, cumulative through ${thru} is ${cum[g!]} [${b.angle}, event ${r.event_id}]`);
      });
      // 2) it is NOT the final board relabelled -- at least one golfer's
      //    checkpoint total differs from their final total.
      const anyDiffers = sb.rows.some((row: any) => {
        const g = gids.find((x) => nameOf(x) === row.name)!;
        return cum[g] !== finalCum[g];
      });
      assert.ok(anyDiffers, `checkpoint board at ${thru} is identical to the final totals -- it is the finishing order relabelled [${b.angle}, event ${r.event_id}]`);
      // 3) positions derive from THESE totals: rows are points-descending and
      //    equal points share a position (tie-aware from the same series).
      for (let i = 1; i < sb.rows.length; i++) {
        assert.ok(sb.rows[i].points <= sb.rows[i - 1].points, `standings not points-ordered [${b.angle}, event ${r.event_id}]`);
        if (sb.rows[i].points === sb.rows[i - 1].points) {
          const a = String(sb.rows[i].pos).replace(/^T/, ""), c = String(sb.rows[i - 1].pos).replace(/^T/, "");
          assert.equal(a, c, `equal points but different positions [${b.angle}, event ${r.event_id}]: ${sb.rows[i-1].name}=${sb.rows[i-1].pos} ${sb.rows[i].name}=${sb.rows[i].pos}`);
        }
      }
    });
  });
});

// ---- tough_hole bars (Handoff #10 2) -----------------------------------------

test("tough_hole bars: fieldBars values are finite and produce > 0 proportional widths", () => {
  runs.forEach((r) => r.beats.forEach((b) => {
    if (b.angle !== "tough_hole" || !b.fieldBars) return;
    const vals = b.fieldBars.map((x: any) => x.value);
    vals.forEach((v: any, i: number) => {
      assert.ok(Number.isFinite(v), `fieldBars[${i}].value not finite [event ${r.event_id}]: ${v}`);
      assert.ok(v >= 0, `fieldBars[${i}].value negative [event ${r.event_id}]`);
    });
    const max = Math.max(1, ...vals);
    assert.ok(Number.isFinite(max) && max > 0, `fieldBars max not positive-finite [event ${r.event_id}]`);
    // The renderer computes width = round(value/max*100)%; assert it is finite
    // and > 0 for any non-zero count, and proportional (bigger count => wider).
    const widths = vals.map((v: any) => Math.round((v / max) * 100));
    widths.forEach((w: number, i: number) => {
      assert.ok(Number.isFinite(w), `width NaN [event ${r.event_id}, bar ${i}]`);
      if (vals[i] > 0) assert.ok(w > 0, `non-zero count ${vals[i]} produced 0 width [event ${r.event_id}, bar ${i}]`);
    });
    // Keys are the spec shape { label, value, color }, not { l, v, c }.
    b.fieldBars.forEach((x: any) => {
      assert.ok("label" in x && "value" in x && "color" in x, `fieldBars wrong key shape [event ${r.event_id}]: ${JSON.stringify(x)}`);
    });
  }));
});

// ---- event identity: no "Week N" in user-facing copy (Handoff #10 6) ---------

test("no week numbers: no user-facing string matches /Week \\d/", () => {
  const WEEK = /Week\s*\d/i;
  runs.forEach((r) => r.beats.forEach((b) => {
    assert.ok(!WEEK.test(allText(b)), `"Week N" leaked to UI [${b.angle}, event ${r.event_id}]: "${allText(b)}"`);
  }));
});

test("grammar: captions have verbs, terminal punctuation, no broken possessive fragment", () => {
  const VERB = /\b(is|are|was|were|has|have|had|leads?|led|takes?|took|wins?|won|drops?|climbs?|jumps?|falls?|fell|finish(es)?|finds?|play(s|ed)?|posts?|beats?|beat|flips?|lands?|sits?|runs?|running|eats?|shows?|shares?|share|pounces|dipped|decided|proved|traced|turned|g[eo]ts?|c[oa]mes?|makes?|made|holds?|held|answers?|refuses?|rides?|brings?|settles?|averaged|caps?|sets?|grabs?|leaves?|goes|torches|shakes?|solves?|blinks?|stalls?|bites|nets?|netted|moves?|keeps?|closes?|pulls?|banks?|stays?|hangs?|vanished|slams?|shrinks?|shrank|strings?|rattles?|strokes|puts?|slid|slides?|fades?|opens?|sort|yields?|walks?|swaps?|towers?|cards?|controls?|breaks?|averages?|gives?|pushes|comes?)\b/i;
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
// Cards that are ADDITIVE / companions -- they take a slot ON TOP of the arc
// and must be discounted from the 3-5 arc-beat budget. Fireworks and skins are
// additive certainties (+1 each); duel_tape is the duel's inseparable lead-in
// (the pair counts as one against the budget, so its extra card is +1 too).
const ADDITIVE = new Set(["ace", "albatross", "eagle", "skins", "duel_tape"]);

test("shape: final last, 3-5 beats (+1 per fireworks/skins/tape), body sorted by resolution hole", () => {
  runs.forEach((r) => {
    // Additive cards (fireworks up to FIREWORKS_MAX=2, one skins, one duel_tape)
    // take guaranteed slots on top of the arc, so the ceiling grows by their
    // count.
    const extra = r.beats.filter((b) => ADDITIVE.has(b.angle)).length;
    assert.ok(r.beats.length >= 3 && r.beats.length <= 5 + extra, `event ${r.event_id}: ${r.beats.length} beats (+${extra} additive)`);
    // Chronology (Handoff #8): the opening is NO LONGER pinned first. The body
    // (everything but the final) is ordered by resolution hole, non-decreasing.
    assert.equal(r.beats[r.beats.length - 1].angle, "final");
    const body = r.beats.slice(0, -1).map((b) => resHole(b) ?? 99);
    for (let i = 1; i < body.length; i++) {
      assert.ok(body[i] >= body[i - 1], `event ${r.event_id}: body out of resolution-hole order (${body.join(",")})`);
    }
  });
});

// ---- distribution properties (the late-round bias regression suite) ----------

test("opening variety: no single hole opens more than half the events", () => {
  const counts: Record<number, number> = {};
  // The opening no longer sits at index 0 (Handoff #8) -- find it by throughHole.
  const openingOf = (r: typeof runs[number]) => r.beats.find((b) => b.throughHole != null);
  runs.forEach((r) => { const o = openingOf(r); if (o) { const h = o.throughHole!; counts[h] = (counts[h] || 0) + 1; } });
  console.log("opening holes:", runs.map((r) => openingOf(r)?.throughHole ?? "-").join(", "));
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

test("dead zone: holes 7-13 host at least one beat across the fixture events", () => {
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

test("angle rotation: no single angle type dominates more than ~60% of events", () => {
  const eventsWith: Record<string, number> = {};
  runs.forEach((r) => {
    const angles = new Set(r.beats.map((b) => b.angle));
    angles.forEach((a) => { eventsWith[a] = (eventsWith[a] || 0) + 1; });
  });
  // Fireworks (ace/albatross/eagle) are exempt: a golfer who eagles the same
  // hole three weeks running is three stories, not repetition. skins is the
  // same kind of additive certainty (a gross-birdie skin is a real event, not
  // a repeated narrative angle) and is exempt from the rotation cap by design
  // (Handoff #12 2e); duel_tape only ever rides with a duel. three_way is the
  // DEFAULT race-state opening (the fallback so the slot is never empty), so it
  // reflects "most weeks had a bunched top" -- honest, not a stuck angle;
  // exempt it from the rotation cap (its repetition is the field's shape, not
  // a template). Ratio-scaled cap (~60%) so this holds at any fixture size.
  const ROTATION_EXEMPT = new Set(["final", "skins", "duel_tape", "three_way", ...FIREWORKS]);
  const cap = Math.ceil(runs.length * 0.6);
  const over = Object.entries(eventsWith).filter(([a, n]) => !ROTATION_EXEMPT.has(a) && n > cap);
  assert.equal(over.length, 0, `over-frequent angles (cap ${cap}): ${JSON.stringify(over)}`);
});

test("detector liveness: every registered detector fires in at least 1 event", () => {
  // final is emitted unconditionally; the_turn is a starvation filler that
  // legitimately may not surface when middles are healthy. Fireworks
  // (ace/albatross/eagle) fire only when someone cards a gross eagle-or-better
  // -- a fixture with none is not a dead detector. duel is NOT exempt: it is a
  // threshold detector (Handoff #5 -- a detector that never fires is dead
  // code), and its threshold is now calibrated to fire on the real two-horse
  // races in this fixture. All exempt.
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

// ---- chronological ordering (Handoff #8) -------------------------------------

const RACE_STATE = new Set(["three_way", "duel", "pace_setter", "wire_to_wire"]);

test("chronology: hole-bearing beats are in non-decreasing resolution-hole order, final last", () => {
  runs.forEach((r) => {
    assert.equal(r.beats[r.beats.length - 1].angle, "final", `event ${r.event_id}: final not last`);
    const body = r.beats.slice(0, -1);
    let prev = -Infinity;
    body.forEach((b) => {
      const h = resHole(b);
      assert.ok(h != null, `event ${r.event_id}: body beat [${b.angle}] has no resolution hole`);
      assert.ok(h! >= prev, `event ${r.event_id}: story jumps backwards at [${b.angle}] (res ${h} after ${prev}) -- ${r.beats.map((x) => x.angle + "@" + resHole(x)).join(" ")}`);
      prev = h!;
    });
  });
});

test("span resolution: charge/run, fast_start, and whole-round beats resolve at their end hole", () => {
  runs.forEach((r) => {
    r.beats.forEach((b) => {
      if (b.angle === "charge") {
        // A run/charge resolves at the END of its stretch, which is >= its
        // anchor hole; the subtext names "Holes S-E" for the run presentation.
        const m = /Holes (\d+)-(\d+)/.exec(b.subtext || "");
        if (m) assert.equal(resHole(b), Number(m[2]), `event ${r.event_id}: charge resolves at ${resHole(b)}, not stretch end ${m[2]}`);
        else assert.ok(resHole(b)! >= (b.hole ?? 0), `event ${r.event_id}: charge resolution before its anchor`);
      }
      // fade / grinder / wildcard / rivalry / redemption / out_of_character are
      // whole-round (hole == null) -> must resolve at the finish, not float away.
      if (b.hole == null && b.angle !== "final" && !RACE_STATE.has(b.angle) && b.throughHole == null) {
        const maxHole = Math.max(...Object.keys(r.pointsAt).map((k) => Number(k.split("|")[1])));
        assert.equal(resHole(b), maxHole, `event ${r.event_id}: whole-round [${b.angle}] resolves at ${resHole(b)}, not finish ${maxHole}`);
      }
    });
  });
});

test("opening guaranteed: every event still emits exactly one opening-slot context beat", () => {
  // The guaranteed context beat is the one filling the OPENING slot -- it
  // carries throughHole ("Through N"). duel was reclassified to a MIDDLE beat
  // in Handoff #6 (a sustained two-horse race is a mid-round shape, hole:null,
  // no throughHole), so an event may hold both a three_way opening AND a duel
  // middle -- that is 2 race-state angles but still exactly 1 opening.
  runs.forEach((r) => {
    const openings = r.beats.filter((b) => b.throughHole != null);
    assert.equal(openings.length, 1, `event ${r.event_id}: ${openings.length} opening-slot beats (${openings.map((b) => b.angle).join(",")}), expected exactly 1`);
    assert.ok(RACE_STATE.has(openings[0].angle), `event ${r.event_id}: opening [${openings[0].angle}] is not a race-state angle`);
  });
});

test("label truth: 'The Opening' only when chronologically first; no earliness copy off the front", () => {
  const EARLY = /\b(takes shape|out of the gate|from the start|opens with|early|opening stretch|from the jump|finding its footing|sets the (early )?pace|sets the tone)\b/i;
  runs.forEach((r) => {
    const body = r.beats.slice(0, -1);
    // Additive certainties (fireworks/skins) are highlights on top of the arc,
    // not arc position -- a skin on hole 1 does not make the opening "not
    // first". Mirror the composer: "first" is among the ARC beats.
    const firstHoleBearing = body.find((b) => resHole(b) != null && !ADDITIVE.has(b.angle));
    body.forEach((b, i) => {
      const isFirst = b === firstHoleBearing;
      if (b.heroLabel === "The Opening") {
        assert.ok(isFirst, `event ${r.event_id}: [${b.angle}] labelled "The Opening" but is not chronologically first (index ${i})`);
      }
      // A race-state beat that is NOT first must not assert earliness in its
      // hero label or caption. (pace_setter/wire_to_wire earliness lives in
      // the ANGLE meaning, not the copy -- their labels are neutral, and their
      // captions describe the lead, not "the opening".)
      if (RACE_STATE.has(b.angle) && !isFirst) {
        const text = (b.heroLabel + " | " + b.eyebrow + " | " + captionText(b));
        assert.ok(!EARLY.test(text), `event ${r.event_id}: [${b.angle}] off-front but asserts earliness: "${text}"`);
      }
    });
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
  skinsPaidCount?: number;
  preRoundOdds?: Record<number, { projectedFinal: number | null; winPct: number | null }>;
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
    skinsPaidCount: opts.skinsPaidCount,
    preRoundOdds: opts.preRoundOdds,
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

// ================= Handoff #12: skins / duel unit / bounce_back ==============

// The authoritative skin winner per hole = the SOLE Stableford-points leader
// among the field (ties => no skin), same rule as the skins card. Recomputed
// here from the fixture so an emitted skins beat can be checked against truth.
function truthSkinWinner(ev: any): Record<number, number | null> {
  const s2g: Record<number, number> = {};
  ev.entries.forEach((e: any) => { s2g[e.summary_id] = e.golfer_id; });
  const byHole: Record<number, { gid: number; pts: number }[]> = {};
  ev.hole_scores.forEach((h: any) => {
    if (h.pts == null) return;
    (byHole[h.hole] ||= []).push({ gid: s2g[h.summary_id], pts: h.pts });
  });
  const winners: Record<number, number | null> = {};
  Object.entries(byHole).forEach(([hStr, arr]) => {
    const max = Math.max(...arr.map((x) => x.pts));
    const leaders = arr.filter((x) => x.pts === max);
    winners[Number(hStr)] = leaders.length === 1 ? leaders[0].gid : null;
  });
  return winners;
}
const gidByEvent: Record<number, Record<number, number>> = {};
fx.events.forEach((ev: any) => {
  const m: Record<number, number> = {};
  ev.entries.forEach((e: any) => { m[e.summary_id] = e.golfer_id; });
  gidByEvent[ev.event_id] = m;
});
// gross(gid, hole) for a fixture event.
function fxGross(ev: any, gid: number, hole: number): number | null {
  const g2s: Record<number, number> = {};
  Object.entries(gidByEvent[ev.event_id]).forEach(([s, g]) => { g2s[g as number] = Number(s); });
  const row = ev.hole_scores.find((h: any) => h.summary_id === g2s[gid] && h.hole === hole);
  return row ? row.gross ?? null : null;
}
const eventById: Record<number, any> = {};
fx.events.forEach((ev: any) => { eventById[ev.event_id] = ev; });

test("skins qualification: every skins beat is a gross birdie+ and matches the stored skin winner", () => {
  runs.forEach((r) => {
    const ev = eventById[r.event_id];
    const truth = truthSkinWinner(ev);
    const pars = ev.hole_pars;
    r.beats.filter((b) => b.angle === "skins").forEach((b) => {
      const hole = b.hole!;
      // Winner matches the authoritative (points-leader) skin winner.
      assert.equal(b.protagonistId, truth[hole], `skins winner mismatch on hole ${hole} [event ${r.event_id}]`);
      // Gross birdie or better.
      const gross = fxGross(ev, b.protagonistId!, hole);
      assert.ok(gross != null && gross - pars[hole - 1] <= -1, `skins beat on hole ${hole} is not a gross birdie+ (gross ${gross}, par ${pars[hole - 1]}) [event ${r.event_id}]`);
    });
  });
});

test("skins cap: at most one skins beat per event", () => {
  runs.forEach((r) => {
    const n = r.beats.filter((b) => b.angle === "skins").length;
    assert.ok(n <= 1, `event ${r.event_id}: ${n} skins beats, cap is 1`);
  });
});

test("fireworks trumps skins: an event with any ace/albatross/eagle emits zero skins beats", () => {
  runs.forEach((r) => {
    const hasFw = r.beats.some((b) => FIREWORKS.has(b.angle));
    if (!hasFw) return;
    const nSkins = r.beats.filter((b) => b.angle === "skins").length;
    assert.equal(nSkins, 0, `event ${r.event_id} has fireworks but also ${nSkins} skins beat(s)`);
  });
  // Synthetic proof: a round with BOTH a gross-birdie skin and an eagle emits
  // the eagle and NO skin.
  const a = evenCard(STD_PARS);
  a.gross[11] = STD_PARS[11] - 1; a.pts[11] = 3; // gross birdie hole 12, sole leader
  const b = evenCard(STD_PARS);
  b.gross[3] = 3; b.pts[3] = 4; // eagle hole 4 (par 5)
  const beats = selectDataBeats(syntheticInput({
    eventId: 3001, pars: STD_PARS,
    players: [
      { gid: 1, name: "Joe Alpha", gross: a.gross, pts: a.pts },
      { gid: 2, name: "Sam Beta", gross: b.gross, pts: b.pts },
    ],
    skinsPaidCount: 2,
  }));
  assert.ok(beats.some((x) => x.angle === "eagle"), "synthetic eagle did not fire");
  assert.ok(!beats.some((x) => x.angle === "skins"), "skins fired alongside fireworks -- fireworks must trump");
});

test("skins determinism: two full runs pick the identical skin", () => {
  // A round with THREE qualifying gross-birdie skins -> the seeded pick must be
  // stable across runs.
  const mk = () => {
    const a = evenCard(STD_PARS);
    // Golfer 1 sole gross birdie on 2, 6, 14.
    [1, 5, 13].forEach((i) => { a.gross[i] = STD_PARS[i] - 1; a.pts[i] = 3; });
    return syntheticInput({
      eventId: 3002, pars: STD_PARS,
      players: [
        { gid: 1, name: "Joe Alpha", gross: a.gross, pts: a.pts },
        { gid: 2, name: "Sam Beta", ...evenCard(STD_PARS) },
      ],
      skinsPaidCount: 2,
    });
  };
  const s1 = selectDataBeats(mk()).find((x) => x.angle === "skins");
  const s2 = selectDataBeats(mk()).find((x) => x.angle === "skins");
  assert.ok(s1 && s2, "skins beat did not fire in the determinism fixture");
  assert.equal(s1!.hole, s2!.hole, "skins pick is not deterministic (hole differs)");
  assert.equal(s1!.protagonistId, s2!.protagonistId, "skins pick is not deterministic (protagonist differs)");
});

test("skins no carryover language: no skins caption implies accumulation", () => {
  const CARRY = /\b(carry|carried over|carryover|finally broken|accumulat)/i;
  runs.forEach((r) => r.beats.filter((b) => b.angle === "skins").forEach((b) => {
    assert.ok(!CARRY.test(captionText(b)), `skins caption implies carryover [event ${r.event_id}]: "${captionText(b)}"`);
  }));
});

test("skins additive: the arc beats are byte-identical with the skins detector on vs off", () => {
  // Same round, composed with and without a qualifying skin present. The skin
  // is added on top; no ARC beat is displaced (mirrors the fireworks assert).
  const base = evenCard(STD_PARS);
  // Golfer 1 makes a clear charge (holes 6-9 net birdie) so there is a real arc.
  [5, 6, 7, 8].forEach((i) => { base.pts[i] = 3; base.gross[i] = STD_PARS[i] - 1; });
  const noSkin = syntheticInput({
    eventId: 3003, pars: STD_PARS,
    players: [
      { gid: 1, name: "Joe Alpha", gross: base.gross, pts: base.pts },
      { gid: 2, name: "Sam Beta", ...evenCard(STD_PARS) },
    ],
    skinsPaidCount: 0, // pot 0 => no skins beat
  });
  const baseArc = selectDataBeats(noSkin).filter((x) => x.angle !== "skins").map((x) => x.angle + "|" + (x.hole ?? "-"));

  const withSkin = syntheticInput({
    eventId: 3003, pars: STD_PARS,
    players: [
      { gid: 1, name: "Joe Alpha", gross: base.gross, pts: base.pts },
      { gid: 2, name: "Sam Beta", ...evenCard(STD_PARS) },
    ],
    skinsPaidCount: 2, // pot present => a qualifying gross-birdie skin fires
  });
  const all = selectDataBeats(withSkin);
  const withArc = all.filter((x) => x.angle !== "skins").map((x) => x.angle + "|" + (x.hole ?? "-"));
  assert.ok(all.some((x) => x.angle === "skins"), "skins beat did not fire in the additive test");
  assert.deepEqual(withArc, baseArc, "skins displaced an arc beat -- it must be additive");
});

test("duel unit integrity: every duel is immediately preceded by its duel_tape, counting as one beat", () => {
  // Synthetic sustained two-horse race: golfers 1 and 2 clear of the field for
  // a long stretch, tight to each other.
  const pars = STD_PARS;
  const p1 = evenCard(pars), p2 = evenCard(pars), p3 = evenCard(pars);
  // 1 and 2 each net birdie holes 4-12 (they pull clear together); 3 stays par.
  for (let i = 3; i <= 11; i++) { p1.pts[i] = 3; p1.gross[i] = pars[i] - 1; p2.pts[i] = 3; p2.gross[i] = pars[i] - 1; }
  // Break the 1-2 tie slightly so one leads (cushion over 3rd stays >=2).
  p1.pts[11] = 4; p1.gross[11] = pars[11] - 2;
  const input = syntheticInput({
    eventId: 3004, pars,
    players: [
      { gid: 1, name: "Ann Alpha", gross: p1.gross, pts: p1.pts },
      { gid: 2, name: "Bea Beta", gross: p2.gross, pts: p2.pts },
      { gid: 3, name: "Cy Gamma", gross: p3.gross, pts: p3.pts },
    ],
    skinsPaidCount: 0,
  });
  const beats = selectDataBeats(input);
  const duelIdx = beats.findIndex((b) => b.angle === "duel");
  assert.ok(duelIdx >= 0, "duel did not fire on the synthetic two-horse race");
  assert.ok(duelIdx >= 1 && beats[duelIdx - 1].angle === "duel_tape",
    `duel not immediately preceded by duel_tape (prev is ${beats[duelIdx - 1]?.angle})`);
  // Same resolution hole for the pair -> the sort can never split them.
  assert.equal(beats[duelIdx - 1].resolutionHole, beats[duelIdx].resolutionHole, "tape and duel resolve on different holes");
  // The pair counts as ONE against the budget: dropping the tape leaves an arc
  // of <= 5 (the +1 additive slots only being fireworks/skins, none here).
  const nonAdditive = beats.filter((b) => !ADDITIVE.has(b.angle));
  assert.ok(nonAdditive.length <= 6, `duel unit inflated the arc to ${nonAdditive.length} (tape must count as part of the duel)`);
});

test("no false H2H: no caption asserts a head-to-head record; shared-round phrasing only", () => {
  const FALSE_H2H = /\b(h2h|head-to-head|head to head|leads the series|leads the h2h)\b/i;
  // Real fixture beats.
  runs.forEach((r) => r.beats.forEach((b) => {
    assert.ok(!FALSE_H2H.test(captionText(b)), `false H2H claim [${b.angle}, event ${r.event_id}]: "${captionText(b)}"`);
  }));
  // The duel tape specifically must use shared-round phrasing when it makes a
  // record claim -- exercise it with cross-event history.
  const pars = STD_PARS;
  const p1 = evenCard(pars), p2 = evenCard(pars), p3 = evenCard(pars);
  for (let i = 3; i <= 11; i++) { p1.pts[i] = 3; p1.gross[i] = pars[i] - 1; p2.pts[i] = 3; p2.gross[i] = pars[i] - 1; }
  p1.pts[11] = 4; p1.gross[11] = pars[11] - 2;
  const hist = {
    1: { golferId: 1, recentPoints: [40, 38, 36, 41], recentDates: ["2026-06-01", "2026-05-25", "2026-05-18", "2026-05-11"], mean: 38.75, std: 2, holeGrossByEvent: {}, holePointsByEvent: {}, holeDatesByEvent: {}, holeAverages: {}, weeksAbsent: 0 },
    2: { golferId: 2, recentPoints: [37, 39, 35, 38], recentDates: ["2026-06-01", "2026-05-25", "2026-05-18", "2026-05-11"], mean: 37.25, std: 2, holeGrossByEvent: {}, holePointsByEvent: {}, holeDatesByEvent: {}, holeAverages: {}, weeksAbsent: 0 },
  };
  const beats = selectDataBeats(syntheticInput({
    eventId: 3005, pars,
    players: [
      { gid: 1, name: "Ann Alpha", gross: p1.gross, pts: p1.pts },
      { gid: 2, name: "Bea Beta", gross: p2.gross, pts: p2.pts },
      { gid: 3, name: "Cy Gamma", gross: p3.gross, pts: p3.pts },
    ],
    playerHistory: hist,
    skinsPaidCount: 0,
  }));
  const tape = beats.find((b) => b.angle === "duel_tape");
  assert.ok(tape, "duel_tape did not fire with cross-event history");
  const txt = captionText(tape!);
  assert.ok(!FALSE_H2H.test(txt), `tape asserts a head-to-head record: "${txt}"`);
  assert.ok(/shared rounds/.test(txt), `tape does not use shared-round phrasing: "${txt}"`);
});

test("bounce_back correctness: a 0-point hole immediately followed by a 3+-point hole, sorts at the later hole", () => {
  runs.forEach((r) => {
    const ev = eventById[r.event_id];
    const s2g = gidByEvent[r.event_id];
    // points(gid, hole) from the fixture.
    const pts = (gid: number, hole: number): number | null => {
      const g2s: Record<number, number> = {};
      Object.entries(s2g).forEach(([s, g]) => { g2s[g as number] = Number(s); });
      const row = ev.hole_scores.find((h: any) => h.summary_id === g2s[gid] && h.hole === hole);
      return row ? row.pts ?? null : null;
    };
    r.beats.filter((b) => b.angle === "bounce_back").forEach((b) => {
      const good = b.hole!;
      assert.equal(resHole(b), good, `bounce_back resolves at ${resHole(b)}, expected the good hole ${good} [event ${r.event_id}]`);
      assert.equal(pts(b.protagonistId!, good - 1), 0, `bounce_back hole ${good - 1} is not a 0-point blank [event ${r.event_id}]`);
      const gp = pts(b.protagonistId!, good);
      assert.ok(gp != null && gp >= 3, `bounce_back hole ${good} is not 3+ points (got ${gp}) [event ${r.event_id}]`);
    });
  });
});

test("bounce_back caption variety: >= 3 distinct sentence shapes are reachable (Handoff #9)", () => {
  // The fixture only fires bounce_back a couple of times, so the real-data
  // variety assert cannot judge it. Drive many synthetic bounce-backs across
  // different (eventId, goodHole) seeds and assert the templates genuinely
  // produce distinct SENTENCE SHAPES, not one fixed shape with swapped nouns.
  const shapeOf = (t: string) => t.replace(/[A-Z][a-z]+/g, "N").replace(/\d+/g, "#").replace(/\s+/g, " ").trim();
  const shapes = new Set<string>();
  // Vary the seed (eventId + goodHole) across residues -- the eventIds are
  // chosen so eventId + (blank+1) does NOT stride by a constant, or every case
  // lands in the same pick() bucket.
  for (const [ev, blank] of [[5000, 3], [5001, 3], [5002, 3], [5003, 3], [7000, 8], [8000, 14]] as [number, number][]) {
    const a = evenCard(STD_PARS);
    a.pts[blank - 1] = 0; a.gross[blank - 1] = STD_PARS[blank - 1] + 2; // blank (net double)
    a.pts[blank] = 3; a.gross[blank] = STD_PARS[blank] - 1;             // net birdie next
    const beats = selectDataBeats(syntheticInput({
      eventId: ev, pars: STD_PARS,
      players: [
        { gid: 1, name: "Joe Alpha", gross: a.gross, pts: a.pts },
        { gid: 2, name: "Sam Beta", ...evenCard(STD_PARS) },
      ],
      skinsPaidCount: 0,
    }));
    const bb = beats.find((x) => x.angle === "bounce_back");
    if (bb) shapes.add(shapeOf(bb.caption.map((p) => p.t).join("")));
  }
  assert.ok(shapes.size >= 3, `bounce_back uses only ${shapes.size} sentence shape(s): ${[...shapes].join(" || ")}`);
});

test("labels: no chart label is a 'Wk -N' offset; historical labels are dates or Today", () => {
  const OFFSET = /Wk\s*-?\d/i;
  runs.forEach((r) => r.beats.forEach((b) => {
    const labels: string[] = [];
    (b.scoreRow?.cells || []).forEach((c) => labels.push(c.label));
    (b.weekBars || []).forEach((c) => labels.push(c.label));
    // The offset ban is universal -- no "Wk -N" anywhere.
    labels.forEach((l) => assert.ok(!OFFSET.test(l), `offset label leaked to UI [${b.angle}, event ${r.event_id}]: "${l}"`));
    // The date-or-Today rule is about HISTORICAL panels (nemesis/redemption
    // week strips). The skins beat reuses scoreRow for a CURRENT-event single
    // hole cell ("Hole 9"), which is legitimately not a date -- exempt it.
    if (b.angle === "skins") return;
    labels.filter((l) => l !== "Today").forEach((l) => {
      assert.ok(/^[A-Z][a-z]{2} \d{1,2}$/.test(l) || /^Rd \d+$/.test(l), `non-date historical label [${b.angle}, event ${r.event_id}]: "${l}"`);
    });
  }));
});

// ===== Handoff #14: fade position trace + shared momentum chart ==============

// Every position-trace beat in the fixture (fade emits exactly this now).
const traceBeats = () => runs.flatMap((r) => r.beats.filter((b) => b.positionTrace).map((b) => ({ r, b })));

test("H14 fade: tie-aware rank series matches ranksAt grouping (tied golfers share a plotted rank)", () => {
  // For each traced beat, recompute the tie-aware rank at each hole from the
  // fixture's own cumulative points and assert the plotted ranks agree -- i.e.
  // golfers level on points get the same rank (no second ranking impl).
  traceBeats().forEach(({ r, b }) => {
    const t = b.positionTrace!;
    const gid = b.protagonistId!;
    const maxHole = t.ranks.length;
    const gids = [...new Set(Object.keys(r.pointsAt).map((k) => Number(k.split("|")[0])))];
    for (let h = 1; h <= maxHole; h++) {
      let cumMe = 0; for (let hh = 1; hh <= h; hh++) cumMe += r.pointsAt[gid + "|" + hh] || 0;
      const cums = gids.map((g) => { let c = 0; for (let hh = 1; hh <= h; hh++) c += r.pointsAt[g + "|" + hh] || 0; return c; });
      const sorted = [...cums].sort((a, c) => c - a);
      const expectedRank = sorted.indexOf(cumMe); // tie-aware: indexOf gives the shared rank
      assert.equal(t.ranks[h - 1], expectedRank, `rank mismatch at hole ${h} [event ${r.event_id}]: plotted ${t.ranks[h - 1]} vs ranksAt ${expectedRank}`);
    }
  });
});

test("H14 fade: peakLabel is NOT hardcoded -- a fade from 2nd reports '2nd'", () => {
  // Synthetic: the protagonist sits alone in 2nd early (never 1st), then
  // collapses. The fade detector needs a >=4-place drop, so the field has 7
  // golfers -- the protagonist falls from 2nd to last as five of them pass.
  // peakLabel must be "2nd", proving the label is not hardcoded to "1st".
  const pars = STD_PARS;
  // Leader takes a MODEST lead (a couple of early birdies) so no wire_to_wire
  // crowds the fade out; the protagonist sits clear 2nd early then bleeds to 1
  // point a hole; five chasers finish strong and pass them (2nd -> last).
  const leader = evenCard(pars); leader.pts = pars.map((_, h) => (h === 1 || h === 3 ? 3 : 2));
  const prot = evenCard(pars);   prot.pts   = pars.map((_, h) => (h < 9 ? 3 : 1)); // clear 2nd early, then bleeds
  const chaser = () => { const x = evenCard(pars); x.pts = pars.map((_, h) => (h < 9 ? 2 : 3)); return x; };
  const players = [
    { gid: 1, name: "Pat Prot", gross: prot.gross, pts: prot.pts },
    { gid: 2, name: "Lee Leader", gross: leader.gross, pts: leader.pts },
    ...[3, 4, 5, 6, 7].map((g) => { const c = chaser(); return { gid: g, name: `Chase ${g}`, gross: c.gross, pts: c.pts }; }),
  ];
  const beats = selectDataBeats(syntheticInput({ eventId: 6100, pars, players, skinsPaidCount: 0 }));
  // The event is built so the selected fade peaked at 2nd (never 1st). We
  // assert on whichever fade the composer surfaces -- the point is the LABEL
  // machinery, which must report "2nd", proving it is not hardcoded to "1st".
  const fade = beats.find((x) => x.angle === "fade");
  assert.ok(fade && fade.positionTrace, "expected a fade beat with a position trace");
  assert.equal(fade!.positionTrace!.peakLabel, "2nd", `peakLabel should be 2nd, got "${fade!.positionTrace!.peakLabel}"`);
});

test("H14 fade: splitIndex is the LAST hole at the peak position", () => {
  traceBeats().forEach(({ r, b }) => {
    const t = b.positionTrace!;
    const peakRank = t.ranks[t.peakIndex];
    for (let i = t.peakIndex; i <= t.splitIndex; i++) {
      assert.equal(t.ranks[i], peakRank, `hole index ${i} not at peak rank ${peakRank} [event ${r.event_id}]`);
    }
    if (t.splitIndex < t.ranks.length - 1) {
      assert.notEqual(t.ranks[t.splitIndex + 1], peakRank, `splitIndex ${t.splitIndex} is not the LAST hole at the peak [event ${r.event_id}]`);
    }
  });
});

test("H14 fade: finishLabel matches the protagonist's tie-aware final position", () => {
  traceBeats().forEach(({ r, b }) => {
    const t = b.positionTrace!;
    const gid = b.protagonistId!;
    const maxHole = t.ranks.length;
    const gids = [...new Set(Object.keys(r.pointsAt).map((k) => Number(k.split("|")[0])))];
    const finalCum = (g: number) => { let c = 0; for (let hh = 1; hh <= maxHole; hh++) c += r.pointsAt[g + "|" + hh] || 0; return c; };
    const me = finalCum(gid);
    const all = gids.map(finalCum).sort((a, c) => c - a);
    const rank0 = all.indexOf(me);
    const tied = gids.filter((g) => finalCum(g) === me).length > 1;
    const n = rank0 + 1, r10 = n % 10, r100 = n % 100;
    const suf = r10 === 1 && r100 !== 11 ? "st" : r10 === 2 && r100 !== 12 ? "nd" : r10 === 3 && r100 !== 13 ? "rd" : "th";
    const expected = `${tied ? "T" : ""}${n}${suf}`;
    assert.equal(t.finishLabel, expected, `finishLabel "${t.finishLabel}" != final standing "${expected}" [event ${r.event_id}]`);
  });
});

test("H14 rivalry: crossing dots equal the flip count quoted in the caption", () => {
  const rivalries = runs.flatMap((r) => r.beats.filter((b) => b.angle === "rivalry").map((b) => ({ r, b })));
  assert.ok(rivalries.length > 0, "fixture should contain at least one rivalry to check");
  const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
  const parseCount = (w: string) => (WORDS.indexOf(w) >= 0 ? WORDS.indexOf(w) : Number(w));
  rivalries.forEach(({ r, b }) => {
    assert.ok(b.diff, `rivalry must emit the diff momentum chart, not a legacy payload [event ${r.event_id}]`);
    const text = b.caption.map((p) => p.t).join("");
    // Counts are now spelled words (Handoff #16 7b) and the phrasing rotates
    // across 3 shapes ("flips N times" / "swap the lead N times" / "N lead
    // changes"). Extract whichever the caption used.
    const m = text.match(/(?:flips|swap the lead)\s+([a-z]+|\d+)\s+times/) || text.match(/([a-z]+|\d+)\s+lead changes/);
    assert.ok(m, `rivalry caption should quote a flip count [event ${r.event_id}]: "${text}"`);
    assert.equal(b.diff!.crossIndices.length, parseCount(m![1]), `dots (${b.diff!.crossIndices.length}) != caption flips (${m![1]}) [event ${r.event_id}]`);
  });
});

test("H14 duel: diff carries crossIndices (shared momentum payload)", () => {
  const duels = runs.flatMap((r) => r.beats.filter((b) => b.angle === "duel").map((b) => ({ r, b })));
  duels.forEach(({ r, b }) => {
    assert.ok(b.diff && Array.isArray(b.diff.crossIndices), `duel diff missing crossIndices [event ${r.event_id}]`);
  });
});

test("H14 retirement: no beat emits the legacy h2h payload", () => {
  runs.forEach((r) => r.beats.forEach((b) => {
    assert.ok(!("h2h" in b) || (b as any).h2h == null, `legacy h2h payload leaked [${b.angle}, event ${r.event_id}]`);
  }));
});

test("H14 source hygiene: h2h renderer retired; one diff renderer serves duel+rivalry", () => {
  const viewer = readFileSync(new URL("../src/tabs/leaderboard/highlights/HighlightsViewer.tsx", import.meta.url), "utf8");
  assert.ok(!/beat\.h2h/.test(viewer), "viewer still references beat.h2h");
  const diffBranches = (viewer.match(/if \(beat\.diff\)/g) || []).length;
  assert.equal(diffBranches, 1, `expected exactly one beat.diff renderer, found ${diffBranches}`);
  const engine = readFileSync(new URL("../src/lib/recapEngine.ts", import.meta.url), "utf8");
  assert.ok(!/h2h\?:/.test(engine), "engine still declares the h2h payload type");
});

// ===== Handoff #16: copy pass (claims, contradictions, grammar, tense) =======

// Beats INCLUDING the duel_tape companion (extraBefore), so copy asserts see
// every rendered card, not just the primary beats.
function flatBeats(bs: DataBeat[]): DataBeat[] {
  return bs.flatMap((b) => (b.extraBefore ? [b.extraBefore, b] : [b]));
}
const allRendered = runs.flatMap((r) => flatBeats(r.beats).map((b) => ({ r, b })));

// Drive a detector's caption shapes across many seeds -- the fixture only fires
// most angles once or twice, so real-data counts cannot prove >= 3 variants.
// Returns the set of normalized SENTENCE SHAPES the caption can produce.
const shapeNorm = (t: string) => t.replace(/[A-Z][a-z]+/g, "N").replace(/\d+(\.\d+)?/g, "#").replace(/\s+/g, " ").trim();

test("H16 1 (G1): ordinals route through ordSuffix -- 1st/2nd/3rd, never 1th/2th/3th", () => {
  const BAD = /\b(\d+)(th|st|nd|rd)\b/g;
  allRendered.forEach(({ r, b }) => {
    const txt = [b.heroLabel, b.eyebrow, captionText(b)].join(" ");
    let mm: RegExpExecArray | null;
    BAD.lastIndex = 0;
    while ((mm = BAD.exec(txt))) {
      const n = Number(mm[1]), suf = mm[2], r10 = n % 10, r100 = n % 100;
      const correct = r10 === 1 && r100 !== 11 ? "st" : r10 === 2 && r100 !== 12 ? "nd" : r10 === 3 && r100 !== 13 ? "rd" : "th";
      assert.equal(suf, correct, `bad ordinal "${mm[0]}" [${b.angle}, event ${r.event_id}]: "${txt}"`);
    }
  });
  // Explicit: an ace on holes 1/2/3 renders "1st"/"2nd"/"3rd".
  const parThree = STD_PARS.map((p, h) => (h < 3 ? 3 : p)); // holes 1-3 are par 3s
  ["1st", "2nd", "3rd"].forEach((want, h) => {
    const card = evenCard(parThree); card.gross[h] = 1; card.pts[h] = 4; // ace on hole h+1
    const beats = selectDataBeats(syntheticInput({
      eventId: 6300 + h, pars: parThree,
      players: [{ gid: 1, name: "Ace Alpha", gross: card.gross, pts: card.pts }, { gid: 2, name: "Sam Beta", ...evenCard(parThree) }],
      skinsPaidCount: 0,
    }));
    const ace = beats.find((x) => x.angle === "ace");
    if (ace) assert.ok([ace.eyebrow, captionText(ace)].join(" ").includes(want), `ace on hole ${h + 1} should render "${want}": ${ace.eyebrow} | ${captionText(ace)}`);
  });
});

test("H16 2 (F2): no signed score reaches prose (no /\\+\\d/ in any caption or eyebrow)", () => {
  allRendered.forEach(({ r, b }) => {
    assert.ok(!/\+\d/.test(captionText(b)), `signed score in caption [${b.angle}, event ${r.event_id}]: "${captionText(b)}"`);
    assert.ok(!/\+\d/.test(b.eyebrow), `signed score in eyebrow [${b.angle}, event ${r.event_id}]: "${b.eyebrow}"`);
  });
  // A quadruple bogey renders its name, not "+4". Force a gross 8 on a par 4
  // and drive the collapse (gross far over par, points 0).
  const pars = STD_PARS.slice(); // hole 1 is a par 4
  const bad = evenCard(pars);
  // Build a big lead then a disaster hole so collapse anchors on hole 14 (par 4).
  bad.pts = pars.map((_, h) => (h < 13 ? 3 : h === 13 ? 0 : 2));
  bad.gross = pars.map((v, h) => (h === 13 ? v + 4 : v)); // gross 8 on the par 4 (index 13)
  const beats = selectDataBeats(syntheticInput({
    eventId: 6400, pars,
    players: [
      { gid: 1, name: "Cole Alpha", gross: bad.gross, pts: bad.pts },
      { gid: 2, name: "Sam Beta", ...evenCard(pars) },
      { gid: 3, name: "Rex Gamma", ...evenCard(pars) },
    ],
    skinsPaidCount: 0,
  }));
  const col = beats.find((x) => x.angle === "collapse");
  if (col) {
    const t = [col.eyebrow, captionText(col)].join(" ");
    assert.ok(!/\+\d/.test(t), `collapse leaked signed score: ${t}`);
    assert.ok(/quadruple bogey/i.test(t), `collapse should name the quadruple bogey: ${t}`);
  }
});

test("H16 5: no past-tense markers from the banned list in any caption", () => {
  // has posted / has finished are present-perfect standing records (allowed).
  const PAST = /\b(was|were|slid|averaged|vanished|decided|proved|traced back|turned for good|fell \w+ point|led this|came up empty)\b/i;
  allRendered.forEach(({ r, b }) => {
    assert.ok(!PAST.test(captionText(b)), `past-tense marker [${b.angle}, event ${r.event_id}]: "${captionText(b)}"`);
  });
});

test("H16 6: retired terminology never renders (blank, blanks, wipeout, came up empty)", () => {
  const BANNED = /\b(blank|blanks|wipeout)\b|came up empty/i;
  allRendered.forEach(({ r, b }) => {
    const txt = [b.heroLabel, b.eyebrow, captionText(b)].join(" ");
    assert.ok(!BANNED.test(txt), `retired term [${b.angle}, event ${r.event_id}]: "${txt}"`);
  });
});

test("H16 3b (F8): fade caption 'spots dropped' matches the position-trace rank series", () => {
  allRendered.filter(({ b }) => b.angle === "fade" && b.positionTrace).forEach(({ r, b }) => {
    const cap = captionText(b);
    const mm = cap.match(/drops (\w+) spots/);
    if (!mm) return; // only shape 3 quotes the number
    const t = b.positionTrace!;
    const traceLost = t.ranks[t.ranks.length - 1] - t.ranks[t.peakIndex];
    const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
    const spoken = WORDS.indexOf(mm[1]) >= 0 ? WORDS.indexOf(mm[1]) : Number(mm[1]);
    assert.equal(spoken, traceLost, `fade "drops ${mm[1]} spots" != trace drop ${traceLost} [event ${r.event_id}]`);
  });
});

test("H16 3a (F10): when the contender count exceeds the eyebrow cap, no number appears in the eyebrow", () => {
  // Synthetic: 7 golfers bunched within 2 points early -> caption says "seven",
  // eyebrow must NOT say "five-way" (or any numeric race).
  const pars = STD_PARS;
  const players = Array.from({ length: 7 }, (_, k) => ({ gid: k + 1, name: `P${k + 1} L${k + 1}`, ...evenCard(pars) }));
  const beats = selectDataBeats(syntheticInput({ eventId: 6500, pars, players, skinsPaidCount: 0 }));
  const tw = beats.find((x) => x.angle === "three_way");
  assert.ok(tw, "expected a three_way opening");
  const cap = captionText(tw!);
  const near = (cap.match(/(\w+) golfers sit within/) || [])[1];
  if (near) {
    const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
    const n = WORDS.indexOf(near) >= 0 ? WORDS.indexOf(near) : Number(near);
    if (n > 5) assert.ok(!/\b(\w+)-way race\b/.test(tw!.eyebrow) && !/\d/.test(tw!.eyebrow), `eyebrow shows a capped number over a "${near}" caption: "${tw!.eyebrow}"`);
  }
});

test("H16 7b: no bare integer count <= 12 in prose (excluding holes, scores, points, dates, money)", () => {
  // Heuristic: flag a standalone 2..12 that is NOT immediately preceded by a
  // hole/score/points/par context word and NOT part of a $ or date or points
  // phrase. Deliberately conservative to avoid false alarms on legit numbers.
  allRendered.forEach(({ r, b }) => {
    const cap = captionText(b);
    // Strip the allowed numeric contexts first.
    const stripped = cap
      .replace(/\$\d+/g, " ")                       // money
      .replace(/\d+ points?/g, " ")                 // points totals
      .replace(/\d+ pts/g, " ")
      .replace(/on \d+/g, " ")                      // "on 14" (hole)
      .replace(/holes? \d+( to \d+)?/gi, " ")       // "hole 8", "holes 6 to 12"
      .replace(/through \d+/gi, " ")                // "through 9"
      .replace(/after \d+/gi, " ")                  // "after 3"
      .replace(/first \d+ holes/gi, " ")
      .replace(/gross \d+/gi, " ")                  // "gross 8"
      .replace(/par \d+/gi, " ")
      .replace(/\d+(st|nd|rd|th)/g, " ")            // ordinals
      .replace(/\d+\.\d+/g, " ")                    // decimals (averages)
      .replace(/[A-Z]\d+|\d+[A-Z]/g, " ");          // player labels like P7 / L3
    const m2 = stripped.match(/\b([2-9]|1[0-2])\b/);
    assert.ok(!m2, `bare count "${m2 && m2[0]}" should use numWord [${b.angle}, event ${r.event_id}]: "${cap}"`);
  });
});

test("H16 7d (F7): a final caption has exactly one full name (the winner); all others are first names", () => {
  allRendered.filter(({ b }) => b.angle === "final").forEach(({ r, b }) => {
    const cap = captionText(b);
    // A shared title legitimately names multiple full-name champions -- skip.
    if ((b.finalStandings || []).filter((s: any) => s.pos === "T1").length > 1) return;
    const fullNames = (cap.match(/\b[A-Z][a-z]+ [A-Z][a-z]+\b/g) || []);
    assert.ok(fullNames.length <= 1, `final has ${fullNames.length} full names, expected <= 1 (winner only) [event ${r.event_id}]: "${cap}" -> ${fullNames.join(", ")}`);
  });
});

// ---- variant counts (Handoff #16 8): >= 3 distinct caption shapes ----
function shapesForSynthetic(angle: string, makeInputs: (seed: number) => any): Set<string> {
  const shapes = new Set<string>();
  for (let s = 0; s < 24; s++) {
    const inp = makeInputs(s);
    if (!inp) continue;
    const beats = selectDataBeats(inp);
    const bb = flatBeats(beats).find((x) => x.angle === angle);
    if (bb) shapes.add(shapeNorm(captionText(bb)));
  }
  return shapes;
}

test("H16 8: collapse has >= 3 distinct caption shapes (source pool + real renders)", () => {
  // collapse is gated on a Monte-Carlo win-prob swing, which flat synthetic
  // cards do not produce, so we cannot brute-force all 3 shapes via selection.
  // Instead: (a) prove the shape POOL in source has >= 3 entries chosen by a
  // deterministic seed hash (pick(openers, seed + b.h) with an array literal),
  // and (b) confirm every real-fixture collapse renders one of them cleanly.
  const engine = readFileSync(new URL("../src/lib/recapEngine.ts", import.meta.url), "utf8");
  const detBody = engine.slice(engine.indexOf("const detectCollapse"), engine.indexOf("const detectHold"));
  const openersDecl = detBody.slice(detBody.indexOf("const openers: CaptionPart[][] = ["));
  // Count the top-level shape entries by their opening "[\n" after the array.
  const nShapes = (openersDecl.slice(0, openersDecl.indexOf("];\n") + 3).match(/\n {8}\[/g) || []).length;
  assert.ok(nShapes >= 3, `collapse openers pool has ${nShapes} shapes, expected >= 3`);
  // Real renders are non-empty and terminate cleanly.
  const collapses = allRendered.filter(({ b }) => b.angle === "collapse");
  collapses.forEach(({ r, b }) => {
    const cap = captionText(b);
    assert.ok(cap.length > 0 && /[.!?]$/.test(cap.trim()), `collapse render malformed [event ${r.event_id}]: "${cap}"`);
  });
});

test("H16 8: pace_setter has >= 3 distinct caption shapes", () => {
  const shapes = shapesForSynthetic("pace_setter", (s) => {
    const pars = STD_PARS;
    // The early leader must NOT win (else it's wire_to_wire): gid1 leads holes
    // 1-6, gid2 surges late and takes it.
    const a = evenCard(pars); a.pts = pars.map((_, h) => (h < 6 ? 4 : 1));
    const w = evenCard(pars); w.pts = pars.map((_, h) => (h < 6 ? 1 : 4));
    return syntheticInput({
      eventId: 9100 + s, pars,
      players: [
        { gid: 1, name: "Pace Alpha", gross: a.gross, pts: a.pts },
        { gid: 2, name: "Win Beta", gross: w.gross, pts: w.pts },
        { gid: 3, name: "Rex Gamma", ...evenCard(pars) },
      ],
      skinsPaidCount: 0,
    });
  });
  assert.ok(shapes.size >= 3, `pace_setter: ${shapes.size} shapes: ${[...shapes].join(" || ")}`);
});

test("H16 8: tough_hole has >= 3 distinct caption shapes", () => {
  const shapes = shapesForSynthetic("tough_hole", (s) => {
    const pars = STD_PARS;
    // Make hole 5 brutal: everyone scores 0 there.
    const mk = () => { const c = evenCard(pars); c.pts[4] = 0; c.gross[4] = pars[4] + 2; return c; };
    return syntheticInput({
      eventId: 9200 + s, pars,
      players: [1, 2, 3, 4].map((g) => ({ gid: g, name: `T${g} L${g}`, ...mk() })),
      skinsPaidCount: 0,
    });
  });
  assert.ok(shapes.size >= 3, `tough_hole: ${shapes.size} shapes: ${[...shapes].join(" || ")}`);
});

test("H16 8: duel has >= 3 distinct caption shapes", () => {
  const shapes = shapesForSynthetic("duel", (s) => {
    const pars = STD_PARS;
    const a = evenCard(pars); a.pts = pars.map(() => 3);
    const b = evenCard(pars); b.pts = pars.map(() => 3);
    return syntheticInput({
      eventId: 9300 + s, pars,
      players: [
        { gid: 1, name: "Duel Alpha", gross: a.gross, pts: a.pts },
        { gid: 2, name: "Duel Beta", gross: b.gross, pts: b.pts },
        { gid: 3, name: "Rex Gamma", ...evenCard(pars) },
        { gid: 4, name: "Moe Delta", ...evenCard(pars) },
      ],
      skinsPaidCount: 0,
    });
  });
  assert.ok(shapes.size >= 3, `duel: ${shapes.size} shapes: ${[...shapes].join(" || ")}`);
});

test("H16 8: fast_start has >= 3 distinct caption shapes", () => {
  const shapes = shapesForSynthetic("fast_start", (s) => {
    const pars = STD_PARS;
    const a = evenCard(pars); a.pts = pars.map((_, h) => (h < 5 ? 3 : 2));
    return syntheticInput({
      eventId: 9400 + s, pars,
      players: [
        { gid: 1, name: "Fast Alpha", gross: a.gross, pts: a.pts },
        { gid: 2, name: "Sam Beta", ...evenCard(pars) },
        { gid: 3, name: "Rex Gamma", ...evenCard(pars) },
      ],
      skinsPaidCount: 0,
    });
  });
  assert.ok(shapes.size >= 3, `fast_start: ${shapes.size} shapes: ${[...shapes].join(" || ")}`);
});

test("H16 8/F11: out_of_character DOWN-branch has >= 3 distinct caption shapes", () => {
  // Needs history with variance so z-score fires; drive via the real fixture's
  // out_of_character renders is not enough (fires up too). Use synthetic
  // playerHistory to force a bad-outlier round.
  const shapes = new Set<string>();
  for (let s = 0; s < 24; s++) {
    const pars = STD_PARS;
    const a = evenCard(pars); a.pts = pars.map(() => 1); // ~18 pts, well below mean
    const inp = syntheticInput({
      eventId: 9500 + s, pars,
      players: [
        { gid: 1, name: "Ooc Alpha", gross: a.gross, pts: a.pts },
        { gid: 2, name: "Sam Beta", ...evenCard(pars) },
      ],
      skinsPaidCount: 0,
      playerHistory: {
        1: { golferId: 1, recentPoints: [32, 34, 30, 33, 31, 35], recentDates: ["2026-01-01", "2026-01-08", "2026-01-15", "2026-01-22", "2026-01-29", "2026-02-05"], mean: 32.5, std: 1.7, holeGrossByEvent: {}, holePointsByEvent: {}, holeDatesByEvent: {}, holeAverages: {}, weeksAbsent: 0 },
      },
    });
    const bb = selectDataBeats(inp).find((x) => x.angle === "out_of_character");
    if (bb && /below|off day|forget|average/i.test(captionText(bb))) shapes.add(shapeNorm(captionText(bb)));
  }
  assert.ok(shapes.size >= 3, `out_of_character down: ${shapes.size} shapes: ${[...shapes].join(" || ")}`);
});

test("H16 8/F6: duel_tape has >= 3 distinct eyebrow variants", () => {
  const eyebrows = new Set<string>();
  for (let s = 0; s < 24; s++) {
    const pars = STD_PARS;
    const a = evenCard(pars); a.pts = pars.map(() => 3);
    const b = evenCard(pars); b.pts = pars.map(() => 3);
    const beats = selectDataBeats(syntheticInput({
      eventId: 9600 + s, pars,
      players: [
        { gid: 1, name: "Tape Alpha", gross: a.gross, pts: a.pts },
        { gid: 2, name: "Tepe Beta", gross: b.gross, pts: b.pts },
        { gid: 3, name: "Rex Gamma", ...evenCard(pars) },
        { gid: 4, name: "Moe Delta", ...evenCard(pars) },
      ],
      skinsPaidCount: 0,
    }));
    const tp = flatBeats(beats).find((x) => x.angle === "duel_tape");
    if (tp) eyebrows.add(shapeNorm(tp.eyebrow));
  }
  assert.ok(eyebrows.size >= 3, `duel_tape eyebrow: ${eyebrows.size} variants: ${[...eyebrows].join(" || ")}`);
});

test("H16 8a: em-dash pivot is used by <= 65% of caption variants sampled across the fixture", () => {
  // Count distinct caption shapes and how many use the " -- " pivot.
  const shapes = new Map<string, boolean>();
  allRendered.forEach(({ b }) => {
    const cap = captionText(b);
    shapes.set(shapeNorm(cap), / -- /.test(cap));
  });
  const total = shapes.size;
  const dashed = [...shapes.values()].filter(Boolean).length;
  assert.ok(dashed / total <= 0.65, `em-dash pivot in ${dashed}/${total} (${Math.round(100 * dashed / total)}%) shapes, over 65%`);
});

test("H16 11: SELECTION UNCHANGED -- angle/protagonist/hole/strength identical to the pre-copy baseline", () => {
  const baseline: any[] = JSON.parse(readFileSync(new URL("./fixtures/selectionBaseline.json", import.meta.url), "utf8"));
  const now: any[] = [];
  runs.forEach((r) => flatBeats(r.beats).forEach((b, i) => {
    now.push({ ev: r.event_id, i, angle: b.angle, prot: b.protagonistId ?? null, hole: b.hole ?? null, strength: Number(b.strength.toFixed(6)) });
  }));
  assert.equal(now.length, baseline.length, `beat count changed: ${baseline.length} -> ${now.length} (copy pass must not change selection)`);
  for (let i = 0; i < baseline.length; i++) {
    const x = baseline[i], y = now[i];
    assert.deepEqual(
      { angle: y.angle, prot: y.prot, hole: y.hole, strength: y.strength },
      { angle: x.angle, prot: x.prot, hole: x.hole, strength: x.strength },
      `selection drift at row ${i} (ev${x.ev}): ${JSON.stringify(x)} -> ${JSON.stringify(y)}`,
    );
  }
});
