// =============================================================
// Supabase Edge Function: calculate-live-odds  (Snapshot v2)
// Deploy: Supabase Dashboard → Edge Functions → calculate-live-odds
// =============================================================
// Snapshot model:
//   snapshot_hole=0  → pre-round (written once when pairings confirmed)
//   snapshot_hole=6  → frozen after hole 6 completed by all players
//   snapshot_hole=12 → frozen after hole 12 completed by all players
//
// Each snapshot is NEVER overwritten — it is the historical record
// used by post-event-calibration to measure model accuracy.
//
// Body params:
//   { event_id: number, snapshot_hole?: 0|6|12, force?: boolean }
//   force=true bypasses the "already written" guard (admin use)
// =============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// ── Types ────────────────────────────────────────────────────

interface HoleBaseline {
  mean: number;
  sd:   number;
  skew: number;
}

interface PlayerCache {
  golfer_id:          number;
  projected_score:    number;
  score_sd:           number;
  trend_slope:        number;
  hole_baselines:     HoleBaseline[];
  weight_recent_form: number;
  weight_hcp_index:   number;
  glicko_rating:      number;
  glicko_rd:          number;
  glicko_volatility:  number;
}

interface PlayerState {
  golfer_id:  number;
  summary_id: number;
  holesDone:  number;
  ptsSoFar:   number;
  holePoints: number[];
}

// ── Math ─────────────────────────────────────────────────────

function randNorm(mean: number, sd: number): number {
  const u = 1 - Math.random(), v = Math.random();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function skewNorm(mean: number, sd: number, skew: number): number {
  const z = randNorm(0, 1);
  const adj = skew !== 0 ? z + (skew / 6) * (z * z - 1) : z;
  return Math.max(0, mean + sd * adj);
}

function calcHeaterMag(holePoints: number[], holesDone: number, baselines: HoleBaseline[]): number {
  if (holesDone < 3 || baselines.length < 18) return 0;
  let sumA = 0, sumE = 0, sumV = 0;
  for (let i = 0; i < holesDone; i++) {
    const p = holePoints[i]; const b = baselines[i];
    if (isNaN(p) || !b) continue;
    sumA += p; sumE += b.mean; sumV += b.sd * b.sd;
  }
  const sd = Math.sqrt(sumV);
  return sd === 0 ? 0 : (sumA - sumE) / sd;
}

function runSimulation(
  players: PlayerCache[], states: PlayerState[], trials: number,
  strokeIndices: number[]
) {
  const n = players.length;
  const winC = new Float64Array(n), top3C = new Float64Array(n),
        top5C = new Float64Array(n), sumF = new Float64Array(n),
        sumF2 = new Float64Array(n);
  const RES = 200;
  const reservoirs = Array.from({ length: n }, () => new Float32Array(RES));
  const resIdx = new Int32Array(n);
  const heaterMags = players.map((_, i) => calcHeaterMag(states[i].holePoints, states[i].holesDone, players[i].hole_baselines));
  const heaterFlags = heaterMags.map(m => m >= 1.5);
  const draws = new Float64Array(n);

  for (let t = 0; t < trials; t++) {
    for (let i = 0; i < n; i++) {
      const p = players[i], st = states[i];
      let proj = st.ptsSoFar;
      for (let h = st.holesDone; h < 18; h++) {
        const b = p.hole_baselines[h];
        if (!b) { proj += Math.max(0, randNorm(p.projected_score / 18, p.score_sd / Math.sqrt(18))); continue; }
        let mean = b.mean, sd = b.sd;
        if (heaterFlags[i] && (h - st.holesDone) < 3) { mean *= (1 + Math.min(0.35, heaterMags[i] * 0.12)); sd *= 1.1; }
        proj += skewNorm(mean, sd, b.skew);
      }
      draws[i] = proj; sumF[i] += proj; sumF2[i] += proj * proj;
      const ri = resIdx[i];
      if (ri < RES) { reservoirs[i][ri] = proj; resIdx[i]++; }
      else { const j = Math.floor(Math.random() * (t + 1)); if (j < RES) reservoirs[i][j] = proj; }
    }
    const order = Array.from({ length: n }, (_, i) => i);
    for (let i = 1; i < n; i++) {
      const key = order[i]; let j = i - 1;
      while (j >= 0 && draws[order[j]] < draws[key]) { order[j+1] = order[j]; j--; }
      order[j+1] = key;
    }
    const topScore = draws[order[0]]; let tieC = 0;
    while (tieC < n && draws[order[tieC]] === topScore) tieC++;
    for (let k = 0; k < tieC; k++) winC[order[k]] += 1 / tieC;
    const c3 = Math.min(3, n), s3 = draws[order[c3-1]]; let t3 = c3-1;
    while (t3+1 < n && draws[order[t3+1]] === s3) t3++;
    for (let k = 0; k <= t3; k++) top3C[order[k]] += c3 / (t3+1);
    const c5 = Math.min(5, n), s5 = draws[order[c5-1]]; let t5 = c5-1;
    while (t5+1 < n && draws[order[t5+1]] === s5) t5++;
    for (let k = 0; k <= t5; k++) top5C[order[k]] += c5 / (t5+1);
  }

  const p10 = new Float64Array(n), p90 = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const res = reservoirs[i].slice(0, resIdx[i]).sort();
    const len = res.length;
    p10[i] = len ? res[Math.floor(len * 0.10)] : 0;
    p90[i] = len ? res[Math.floor(len * 0.90)] : 0;
  }
  return { winC, top3C, top5C, sumF, p10, p90, heaterFlags, heaterMags };
}

function toAmerican(p: number): string {
  if (p <= 0) return "N/A";
  if (p >= 1) return "-10000";
  if (p >= 0.5) return String(Math.round(-(p / (1 - p)) * 100));
  return "+" + Math.round(((1 - p) / p) * 100);
}

// ── CORS + response helper ────────────────────────────────────

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });

// ── Main ─────────────────────────────────────────────────────

const VIG = 0.03;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  try {
    const body = await req.json() as { event_id: number; snapshot_hole?: number; force?: boolean };
    const { event_id, force = false } = body;
    // snapshot_hole: 0=pre-round (default), 6=after H6, 12=after H12
    const snapshot_hole: number = body.snapshot_hole ?? 0;

    if (!event_id) return json({ error: "event_id required" }, 400);
    if (![0, 6, 12, 99].includes(snapshot_hole)) return json({ error: "snapshot_hole must be 0, 6, 12, or 99" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Guard: don't overwrite a frozen snapshot unless forced ──
    if (!force) {
      const { data: existing } = await supabase
        .from("event_odds")
        .select("id")
        .eq("event_id", event_id)
        .eq("snapshot_hole", snapshot_hole)
        .eq("is_snapshot", true)
        .limit(1);
      if (existing?.length) {
        return json({ skipped: `snapshot_hole=${snapshot_hole} already frozen for event ${event_id}` });
      }
    }

    // ── Fetch event + course ──────────────────────────────────
    const { data: ev } = await supabase
      .from("events").select("*").eq("event_id", event_id).single();
    if (!ev) return json({ error: "event not found" }, 404);

    const { data: course } = await supabase
      .from("courses").select("hole_stroke_indices, hole_pars, par")
      .eq("course_name", ev.course_name).limit(1).single();
    const strokeIndices: number[] = course?.hole_stroke_indices ?? Array.from({ length: 18 }, (_, i) => i + 1);

    // ── Get all players (signups + any leaderboard entries) ───
    const [{ data: signups }, { data: lbAll }] = await Promise.all([
      supabase.from("event_signups").select("golfer_id")
        .eq("event_id", event_id).eq("attending", "Yes"),
      supabase.from("event_leaderboard").select("golfer_id")
        .eq("event_id", event_id),
    ]);

    const allGolferIds: number[] = [
      ...new Set([
        ...(signups ?? []).map((s: any) => s.golfer_id as number),
        ...(lbAll   ?? []).map((r: any) => r.golfer_id as number),
      ])
    ];
    if (!allGolferIds.length) return json({ skipped: "no players for this event" });

    // ── Fetch caches ──────────────────────────────────────────
    const { data: caches } = await supabase
      .from("player_stats_cache").select("*").in("golfer_id", allGolferIds);
    const cacheMap: Record<number, PlayerCache> = {};
    (caches ?? []).forEach((c: any) => { cacheMap[c.golfer_id] = c; });

    // ── Fetch live scores ─────────────────────────────────────
    const { data: lbRows } = await supabase
      .from("event_leaderboard").select("summary_id, golfer_id, total_stableford_points")
      .eq("event_id", event_id).in("golfer_id", allGolferIds);
    const summaryIds = (lbRows ?? []).map((r: any) => r.summary_id);

    const { data: liveRows } = summaryIds.length
      ? await supabase.from("hole_scores")
          .select("summary_id, hole_number, stableford_points").in("summary_id", summaryIds)
      : { data: [] };

    // ── Build player states ───────────────────────────────────
    // For non-zero snapshots, cap holesDone at snapshot_hole so the
    // simulation projects from that exact point (not further ahead).
    const players: PlayerCache[] = [];
    const states: PlayerState[] = [];

    for (const gid of allGolferIds) {
      const cache = cacheMap[gid];
      if (!cache) continue;

      const lb = (lbRows ?? []).find((r: any) => r.golfer_id === gid);
      const holePoints = new Array(18).fill(NaN);
      let ptsSoFar = 0;

      if (lb) {
        const scored = (liveRows ?? []).filter((r: any) => r.summary_id === lb.summary_id);
        scored.forEach((r: any) => {
          const idx = r.hole_number - 1;
          if (idx >= 0 && idx < 18) {
            holePoints[idx] = r.stableford_points ?? 0;
            ptsSoFar += r.stableford_points ?? 0;
          }
        });
      }

      // holesDone = consecutive completed holes
      let holesDone = 0;
      for (let h = 0; h < 18; h++) {
        if (!isNaN(holePoints[h])) holesDone = h + 1;
        else break;
      }
      // Pre-round (0): pure projection, no actual scores
      if (snapshot_hole === 0) holesDone = 0;
      // Frozen snapshots (6/12): cap at that hole for calibration accuracy
      else if (snapshot_hole === 6 || snapshot_hole === 12) holesDone = Math.min(holesDone, snapshot_hole);
      // Live (99): use all actual scores — this is the real-time display row

      // Recompute ptsSoFar to match capped holesDone
      ptsSoFar = 0;
      for (let h = 0; h < holesDone; h++) {
        if (!isNaN(holePoints[h])) ptsSoFar += holePoints[h];
      }

      players.push(cache);
      states.push({ golfer_id: gid, summary_id: lb?.summary_id ?? 0, holesDone, ptsSoFar, holePoints });
    }

    if (players.length < 2) return json({ skipped: "insufficient players with cache" });

    // ── Simulation ────────────────────────────────────────────
    // Pre-round: 10k trials | H6/H12 frozen: 7.5k | Live display (99): 5k
    const trials = snapshot_hole === 0 ? 10_000 : snapshot_hole === 99 ? 5_000 : 7_500;
    const sim = runSimulation(players, states, trials, strokeIndices);

    // ── Build payload ─────────────────────────────────────────
    const rawWins = Array.from(sim.winC).map(w => w / trials);
    const total   = rawWins.reduce((a, b) => a + b, 0);
    const adjWins = rawWins.map(p => total > 0 ? (p / total) / (1 + VIG) : 0);
    const now = new Date().toISOString();

    const rows = players.map((p, i) => ({
      event_id,
      golfer_id:            p.golfer_id,
      snapshot_hole,
      is_snapshot:          snapshot_hole !== 99, // slot 99 is live display — always overwriteable
      computed_at:          now,
      holes_complete:       states[i].holesDone,
      simulation_type:      snapshot_hole === 0 ? "pre_round" : snapshot_hole === 99 ? "live" : "live",
      projected_final_mean: Math.round((sim.sumF[i] / trials) * 10) / 10,
      projected_final_low:  Math.round(sim.p10[i] * 10) / 10,
      projected_final_high: Math.round(sim.p90[i] * 10) / 10,
      points_so_far:        states[i].ptsSoFar,
      win_probability:      Math.round(adjWins[i] * 100000) / 100000,
      top3_probability:     Math.round((sim.top3C[i] / trials) * 100000) / 100000,
      top5_probability:     Math.round((sim.top5C[i] / trials) * 100000) / 100000,
      win_odds_american:    toAmerican(adjWins[i]),
      heater_active:        sim.heaterFlags[i],
      heater_magnitude:     Math.round((sim.heaterMags[i] ?? 0) * 1000) / 1000,
    }));

    const { error: upsertErr } = await supabase
      .from("event_odds")
      .upsert(rows, { onConflict: "event_id,golfer_id,snapshot_hole" });

    if (upsertErr) return json({ error: upsertErr.message }, 500);

    // ── Prune stale rows for golfers no longer in the field ───
    // upsert only ever writes rows for the CURRENT field, so a golfer who was
    // in the field on an earlier run (e.g. RSVP'd "Yes" then switched to "No")
    // keeps a ghost row forever. That is exactly how an opted-out golfer
    // (Gary Mayer, event 306) kept surfacing in live odds.
    //
    // TWO prunes, deliberately different in scope:
    //
    // (1) CURRENT SLOT — delete anyone not in the field we just modelled.
    //     Safe to be broad here because we just rewrote this slot in full.
    const keepIds = rows.map((r) => r.golfer_id);
    const { error: pruneErr } = await supabase
      .from("event_odds")
      .delete()
      .eq("event_id", event_id)
      .eq("snapshot_hole", snapshot_hole)
      .not("golfer_id", "in", `(${keepIds.join(",")})`);
    if (pruneErr) console.error("calculate-live-odds prune error:", pruneErr.message);

    // (2) ALL OTHER SLOTS — delete only golfers who EXPLICITLY opted out
    //     (attending="No") and never posted a score. Frozen snapshots (0/6/12)
    //     are never rewritten, so slot-scoped pruning alone leaves ghosts there
    //     permanently: event 355 kept Errol Kaplan in slot 0 (computed 5 days
    //     early) and slot 6 (computed before his 9:28am scratch), which is what
    //     fed him to Tony.AI as a pick.
    //
    //     Scoped to explicit "No" + no leaderboard row ON PURPOSE. A player who
    //     actually teed off must keep their frozen snapshots — post-event
    //     calibration measures model accuracy against them, so deleting those
    //     would corrupt the calibration record. Absence from the current field
    //     is NOT sufficient grounds to delete another slot's history.
    const { data: optedOut } = await supabase
      .from("event_signups").select("golfer_id")
      .eq("event_id", event_id).eq("attending", "No");
    const scoredIds = new Set((lbAll ?? []).map((r: any) => r.golfer_id as number));
    const ghostIds = [...new Set(
      (optedOut ?? []).map((s: any) => s.golfer_id as number).filter((gid: number) => !scoredIds.has(gid)),
    )];
    if (ghostIds.length) {
      const { error: ghostErr } = await supabase
        .from("event_odds")
        .delete()
        .eq("event_id", event_id)
        .in("golfer_id", ghostIds);
      if (ghostErr) console.error("calculate-live-odds ghost-prune error:", ghostErr.message);
      else console.log(`calculate-live-odds pruned ghosts for event ${event_id}:`, ghostIds);
    }

    return json({
      ok: true, event_id, snapshot_hole,
      players: players.length, trials,
      simulation_type: snapshot_hole === 0 ? "pre_round" : "live",
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("calculate-live-odds error:", msg);
    return json({ error: msg }, 500);
  }
});