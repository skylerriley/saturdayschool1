// =============================================================
// Supabase Edge Function: post-event-calibration
// =============================================================
//
// Saved to the repo 2026-07-16 for version control + diagnosis. It writes
// per-event calibration metrics to model_calibration_log (idempotent upsert,
// onConflict: event_id) and optionally nudges the form/hcp weights.
//
// It USED to also be the sole writer of player_stats_cache.brier_score_ewma via
// a per-player SELECT/UPDATE loop; that loop was the 67,727-write N+1 in
// pg_stat_statements and was REMOVED 2026-07-16 (see the note where it lived,
// near the end, and docs/brier-ewma-phase2-report.md RESOLUTION). No DB trigger
// or pg_cron writes this column -- this function was the only writer.
//
// DEPLOY NOTE: this file is the source of truth in the repo but takes effect
// only when deployed (`supabase functions deploy post-event-calibration`). The
// live function keeps the old EWMA loop until then.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function spearman(pred: number[], actual: number[]): number {
  const n = pred.length;
  if (n < 2) return 0;
  const rank = (arr: number[]): number[] => {
    const sorted = [...arr].map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
    const ranks = new Array(n);
    let i = 0;
    while (i < n) {
      let j = i;
      while (j < n && sorted[j].v === sorted[i].v) j++;
      const avgRank = (i + j - 1) / 2 + 1;
      for (let k = i; k < j; k++) ranks[sorted[k].i] = avgRank;
      i = j;
    }
    return ranks;
  };
  const rPred = rank(pred);
  const rActual = rank(actual);
  let dSq = 0;
  for (let i = 0; i < n; i++) dSq += (rPred[i] - rActual[i]) ** 2;
  return 1 - (6 * dSq) / (n * (n * n - 1));
}

function brierScore(probabilities: number[], outcomes: number[]): number {
  return probabilities.reduce((s, p, i) => s + (p - outcomes[i]) ** 2, 0) / probabilities.length;
}

function logLoss(probabilities: number[], outcomes: number[]): number {
  const EPS = 1e-7;
  return -outcomes.reduce((s, o, i) => {
    const p = Math.min(1 - EPS, Math.max(EPS, probabilities[i]));
    return s + o * Math.log(p) + (1 - o) * Math.log(1 - p);
  }, 0) / outcomes.length;
}

function optimiseWeights(
  logs: { spearman_pre_round: number; log_loss: number; weight_recent_form: number }[]
): { form: number; hcp: number } {
  if (logs.length < 3) return { form: 0.60, hcp: 0.40 };
  const STEPS = 60;
  let bestForm = 0.60, bestLoss = Infinity;
  for (let s = 0; s <= STEPS; s++) {
    const f = 0.30 + s * (0.60 / STEPS);
    const xs = logs.map(l => l.weight_recent_form);
    const ys = logs.map(l => l.log_loss);
    const mx = xs.reduce((a, b) => a + b) / xs.length;
    const my = ys.reduce((a, b) => a + b) / ys.length;
    const sxy = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
    const sx2 = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
    const slope = sx2 !== 0 ? sxy / sx2 : 0;
    const predLoss = slope * f + (my - slope * mx);
    if (predLoss < bestLoss) { bestLoss = predLoss; bestForm = f; }
  }
  return { form: Math.round(bestForm * 100) / 100, hcp: Math.round((1 - bestForm) * 100) / 100 };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const { event_id } = await req.json() as { event_id: number };
  if (!event_id) {
    return new Response(JSON.stringify({ error: "event_id required" }), { status: 400, headers: CORS_HEADERS });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // -- Fetch final leaderboard --------------------------------
  const { data: lbRows } = await supabase
    .from("event_leaderboard")
    .select("golfer_id, total_stableford_points, buy_in_paid")
    .eq("event_id", event_id)
    .eq("buy_in_paid", true);

  if (!lbRows?.length) {
    return new Response(JSON.stringify({ error: "no leaderboard rows" }), { status: 404, headers: CORS_HEADERS });
  }

  const sorted = [...lbRows].sort((a: any, b: any) => b.total_stableford_points - a.total_stableford_points);
  const winnerPts = sorted[0].total_stableford_points;
  const golferIds = lbRows.map((r: any) => r.golfer_id as number);

  // -- Fetch odds snapshots by snapshot_hole ------------------
  const fetchOddsAtHole = async (snapshotHole: number) => {
    const { data, error } = await supabase
      .from("event_odds")
      .select("golfer_id, win_probability, projected_final_mean")
      .eq("event_id", event_id)
      .eq("snapshot_hole", snapshotHole)
      .eq("is_snapshot", true)
      .in("golfer_id", golferIds)
      .order("computed_at", { ascending: false })
      .limit(golferIds.length * 3);

    if (error) { console.error("fetchOddsAtHole error (hole", snapshotHole, "):", error.message); return null; }
    if (!data?.length) return null;

    const latest: Record<number, any> = {};
    data.forEach((r: any) => { if (!latest[r.golfer_id]) latest[r.golfer_id] = r; });
    return latest;
  };

  const [snapPre, snap6, snap12] = await Promise.all([
    fetchOddsAtHole(0),
    fetchOddsAtHole(6),
    fetchOddsAtHole(12),
  ]);

  // -- Compute metrics ----------------------------------------
  const computeMetrics = (snap: Record<number, any> | null) => {
    if (!snap) return null;
    const players = golferIds.filter(g => snap[g]);
    if (players.length < 2) return null;

    const probs    = players.map(g => snap[g].win_probability ?? 0);
    const actPts   = players.map(g => lbRows.find((r: any) => r.golfer_id === g)?.total_stableford_points ?? 0);
    const outcomes = players.map(g => {
      const pts = lbRows.find((r: any) => r.golfer_id === g)?.total_stableford_points ?? 0;
      return pts === winnerPts ? 1 : 0;
    });
    const predRanks = players.map(g => snap[g].projected_final_mean ?? 0);

    return {
      brier:    brierScore(probs, outcomes),
      spearman: spearman(predRanks, actPts),
      logLoss:  logLoss(probs, outcomes),
    };
  };

  const mPre = computeMetrics(snapPre);
  const m6   = computeMetrics(snap6);
  const m12  = computeMetrics(snap12);

  // -- Load historical logs for weight optimisation -----------
  const { data: histLogs } = await supabase
    .from("model_calibration_log")
    .select("log_loss, weight_recent_form, spearman_pre_round")
    .not("log_loss", "is", null)
    .order("logged_at", { ascending: false })
    .limit(20);

  const FORM_WEIGHT_DEFAULT = 0.60;
  const allLogs = [
    ...(histLogs ?? []),
    ...(mPre ? [{ log_loss: mPre.logLoss, weight_recent_form: FORM_WEIGHT_DEFAULT, spearman_pre_round: mPre.spearman }] : []),
  ];
  const { form: newForm, hcp: newHcp } = optimiseWeights(allLogs);

  // -- Write calibration log (upsert -- one row per event) ----
  const logRow = {
    event_id,
    brier_score:           mPre?.brier    ?? null,
    spearman_pre_round:    mPre?.spearman ?? null,
    spearman_after_6:      m6?.spearman   ?? null,
    spearman_after_12:     m12?.spearman  ?? null,
    log_loss:              mPre?.logLoss  ?? null,
    weight_recent_form:    FORM_WEIGHT_DEFAULT,
    weight_hcp_index:      1 - FORM_WEIGHT_DEFAULT,
    suggested_form_weight: newForm,
    suggested_hcp_weight:  newHcp,
    players_in_field:      golferIds.length,
    notes: JSON.stringify({
      snap_pre_players: snapPre ? Object.keys(snapPre).length : 0,
      snap6_players:    snap6   ? Object.keys(snap6).length   : 0,
      snap12_players:   snap12  ? Object.keys(snap12).length  : 0,
      brier_6:          m6?.brier,
      brier_12:         m12?.brier,
      spearman_6:       m6?.spearman,
      spearman_12:      m12?.spearman,
    }),
  };

  const { error: upsertErr } = await supabase
    .from("model_calibration_log")
    .upsert(logRow, { onConflict: "event_id" });
  if (upsertErr) console.error("calibration upsert error:", upsertErr);

  // -- Apply suggested weights to player_stats_cache ----------
  if (allLogs.length >= 5 && Math.abs(newForm - FORM_WEIGHT_DEFAULT) > 0.02) {
    await supabase
      .from("player_stats_cache")
      .update({ weight_recent_form: newForm, weight_hcp_index: newHcp })
      .in("golfer_id", golferIds);
  }

  // -- Brier EWMA per-player write REMOVED (2026-07-16) -------
  // This block used to loop one SELECT + one UPDATE per player to fold this
  // event's FIELD-WIDE Brier (mPre.brier) into player_stats_cache.brier_score_ewma.
  // It was removed because:
  //   1. It had no event_id idempotency guard, so re-invocations (the client
  //      guard protects the calibration-log write, not this loop) re-folded the
  //      same observation -- the column drifted ~22x toward recent field Brier.
  //   2. mPre.brier is one field-wide number, so it was never a per-player Brier
  //      to begin with -- the same value was stamped on every golfer.
  //   3. NOTHING reads brier_score_ewma (the client never selects it), so the
  //      column had zero user-facing effect while generating ~all of the N+1
  //      write volume seen in pg_stat_statements (67,727 UPDATE/SELECT pairs).
  // The per-event Brier is still recorded idempotently in model_calibration_log
  // (brier_score, onConflict: event_id) above, so any future per-player or trend
  // view can be derived ON READ from that table -- no cached, drift-prone column.
  // See docs/brier-ewma-phase2-report.md (RESOLUTION section).

  return new Response(JSON.stringify({
    ok: true,
    event_id,
    snapshots_found: { pre: !!snapPre, h6: !!snap6, h12: !!snap12 },
    brier_pre_round:    mPre?.brier,
    spearman_pre_round: mPre?.spearman,
    spearman_after_6:   m6?.spearman,
    spearman_after_12:  m12?.spearman,
    suggested_weights:  { form: newForm, hcp: newHcp },
    logs_used:          allLogs.length,
  }), {
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
});
