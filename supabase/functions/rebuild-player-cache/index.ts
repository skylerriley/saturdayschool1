// =============================================================
// Supabase Edge Function: rebuild-player-cache
// Deploy: supabase functions deploy rebuild-player-cache
// Schedule via Supabase Dashboard → Database → Cron Jobs:
//   0 3 * * 1   (3 AM every Monday, before the week's event)
// Also call manually after every event completes.
// =============================================================
// This function does the heavy statistical work once,
// so calculate-live-odds never has to re-crunch history.
// =============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// ── Stat helpers ──────────────────────────────────────────────

function weightedMean(values: number[], weights: number[]): number {
  let num = 0, den = 0;
  for (let i = 0; i < values.length; i++) { num += values[i] * weights[i]; den += weights[i]; }
  return den > 0 ? num / den : 0;
}

function stdDev(values: number[], mean: number): number {
  if (values.length < 2) return 3.0;
  const v = values.reduce((s, x) => s + (x - mean) ** 2, 0) / values.length;
  return Math.max(1.5, Math.sqrt(v));
}

function skewness(values: number[], mean: number, sd: number): number {
  if (values.length < 3 || sd === 0) return 0;
  const s = values.reduce((a, x) => a + ((x - mean) / sd) ** 3, 0) / values.length;
  return Math.max(-2, Math.min(2, s));  // clamp to sensible range
}

function lsSlope(arr: number[]): number {
  const n = arr.length;
  if (n < 2) return 0;
  let sx = 0, sy = 0, sxy = 0, sx2 = 0;
  arr.forEach((y, i) => { sx += i; sy += y; sxy += i * y; sx2 += i * i; });
  const denom = n * sx2 - sx * sx;
  return denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
}

// ── Glicko-2 single-period update (simplified) ────────────────
// We treat each event as a "rating period" where the golfer
// competed against the field. A win = beat median score,
// a loss = below median. Not a true Glicko tournament but
// gives a principled measure of skill + uncertainty.

const GLICKO_Q = Math.log(10) / 400;

function glickoUpdate(
  r: number, rd: number, vol: number,
  results: { opponentRating: number; opponentRd: number; score: number }[]
): { r: number; rd: number; vol: number } {
  if (!results.length) return { r, rd, vol };

  const TAU = 0.5;  // system constant (how volatile ratings are)

  // Step 1: convert to Glicko-2 scale
  const mu    = (r - 1500) / 173.7178;
  const phi   = rd / 173.7178;
  const sigma = vol;

  // Step 2: compute v (variance)
  let v = 0;
  let delta_sum = 0;

  for (const res of results) {
    const mu_j   = (res.opponentRating - 1500) / 173.7178;
    const phi_j  = res.opponentRd / 173.7178;
    const g_phi  = 1 / Math.sqrt(1 + 3 * GLICKO_Q * GLICKO_Q * phi_j * phi_j);
    const E      = 1 / (1 + Math.exp(-g_phi * (mu - mu_j)));
    v            += g_phi * g_phi * E * (1 - E);
    delta_sum    += g_phi * (res.score - E);
  }

  v = 1 / v;
  const delta = v * delta_sum;

  // Step 3: update volatility via Illinois algorithm (simplified iteration)
  const a = Math.log(sigma * sigma);
  const f = (x: number) => {
    const ex = Math.exp(x);
    const d2 = phi * phi + v + ex;
    return (ex * (delta * delta - phi * phi - v - ex)) / (2 * d2 * d2)
           - (x - a) / (TAU * TAU);
  };

  let A = a;
  let B = delta * delta > phi * phi + v
    ? Math.log(delta * delta - phi * phi - v)
    : a - TAU;
  let fA = f(A), fB = f(B);
  for (let iter = 0; iter < 100; iter++) {
    const C = A + (A - B) * fA / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) { A = B; fA = fB; } else { fA /= 2; }
    B = C; fB = fC;
    if (Math.abs(B - A) < 1e-6) break;
  }
  const new_sigma = Math.exp(A / 2);

  // Step 4: update phi and mu
  const phi_star = Math.sqrt(phi * phi + new_sigma * new_sigma);
  const new_phi  = 1 / Math.sqrt(1 / (phi_star * phi_star) + 1 / v);
  const new_mu   = mu + new_phi * new_phi * delta_sum;

  return {
    r:   173.7178 * new_mu + 1500,
    rd:  Math.min(350, 173.7178 * new_phi),
    vol: new_sigma,
  };
}

// ── Estimation helpers ────────────────────────────────────────

function estimateHolePts(totalPts: number, strokeIndices: number[]): number[] {
  const weights = strokeIndices.map(si => 19 - si);
  const wSum    = weights.reduce((a, b) => a + b, 0);
  const raw     = weights.map(w => totalPts * (w / wSum));
  const floored = raw.map(Math.floor);
  let rem       = totalPts - floored.reduce((a, b) => a + b, 0);
  const diffs   = raw.map((r, i) => r - floored[i]);
  [...diffs.map((_, i) => i)].sort((a, b) => diffs[b] - diffs[a])
    .forEach(i => { if (rem > 0) { floored[i]++; rem--; } });
  return floored;
}

// ── Main ──────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Optionally rebuild for a specific golfer only
  const body = await req.json().catch(() => ({})) as { golfer_id?: number };

  // ── Fetch all data ────────────────────────────────────────
  const [{ data: golfers }, { data: leaderboard }, { data: holeScores },
        { data: events }, { data: courses }, { data: signups }] = await Promise.all([
    supabase.from("golfers").select("golfer_id, current_handicap_index").eq("status", "Active"),
    supabase.from("event_leaderboard").select("summary_id, golfer_id, event_id, total_stableford_points, buy_in_paid"),
    supabase.from("hole_scores").select("summary_id, hole_number, stableford_points"),
    supabase.from("events").select("event_id, date, course_name, status"),
    supabase.from("courses").select("course_name, hole_stroke_indices"),
    supabase.from("event_signups").select("golfer_id, event_id, playing_handicap"),
  ]);

  const courseMap: Record<string, number[]> = {};
  (courses ?? []).forEach((c: any) => {
    if (c.hole_stroke_indices) courseMap[c.course_name] = c.hole_stroke_indices;
  });

  const evDateMap: Record<number, string> = {};
  const evCourseMap: Record<number, string> = {};
  (events ?? []).forEach((e: any) => {
    evDateMap[e.event_id]  = e.date;
    evCourseMap[e.event_id] = e.course_name;
  });

  const idsToProcess = body.golfer_id
    ? [body.golfer_id]
    : (golfers ?? []).map((g: any) => g.golfer_id as number);

  const upsertRows = [];

  for (const gid of idsToProcess) {
    // History: all paid entries, sorted newest-first
    const history = (leaderboard ?? [])
      .filter((r: any) => r.golfer_id === gid && r.buy_in_paid)
      .map((r: any) => ({
        summary_id: r.summary_id,
        event_id:   r.event_id,
        pts:        r.total_stableford_points,
        date:       evDateMap[r.event_id] ?? "1970-01-01",
        course:     evCourseMap[r.event_id] ?? "",
      }))
      .filter(r => r.date !== "1970-01-01")
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (!history.length) continue;

    // ── Global stats ──────────────────────────────────────────
    const DECAY = 0.88;
    const weights  = history.map((_, i) => Math.pow(DECAY, i));
    const pts      = history.map(h => h.pts);
    const wMean    = weightedMean(pts, weights);
    const mean     = pts.reduce((a, b) => a + b, 0) / pts.length;
    const sd       = stdDev(pts, mean);
    const trend    = lsSlope([...pts].reverse());  // oldest-first

    // ── Per-hole baselines ────────────────────────────────────
    // perHole[h] = array of {pts, weight}
    const perHole: { pts: number; weight: number }[][] = Array.from({ length: 18 }, () => []);

    history.forEach((h, idx) => {
      const w = weights[idx];
      const si = courseMap[h.course];
      const holes = (holeScores ?? []).filter((hs: any) => hs.summary_id === h.summary_id)
        .sort((a: any, b: any) => a.hole_number - b.hole_number);

      if (holes.length >= 18) {
        holes.slice(0, 18).forEach((hs: any, i: number) => {
          perHole[i].push({ pts: hs.stableford_points ?? 0, weight: w });
        });
      } else if (si) {
        const est = estimateHolePts(h.pts, si);
        est.forEach((p, i) => perHole[i].push({ pts: p, weight: w }));
      }
    });

    const hole_baselines = perHole.map(hp => {
      if (!hp.length) return { mean: wMean / 18, sd: sd / 3, skew: 0 };
      const vals = hp.map(x => x.pts);
      const wts  = hp.map(x => x.weight);
      const hm   = weightedMean(vals, wts);
      const hs   = stdDev(vals, hm);
      const hsk  = skewness(vals, hm, hs);
      return { mean: Math.round(hm * 1000) / 1000, sd: Math.round(hs * 1000) / 1000, skew: Math.round(hsk * 1000) / 1000 };
    });

    // ── Glicko update ─────────────────────────────────────────
    // Fetch existing cache to get current Glicko state
    const { data: existing } = await supabase
      .from("player_stats_cache")
      .select("glicko_rating, glicko_rd, glicko_volatility, weight_recent_form, weight_hcp_index, brier_score_ewma, rounds_tracked")
      .eq("golfer_id", gid).single();

    let gRating  = existing?.glicko_rating  ?? 1500;
    let gRd      = existing?.glicko_rd      ?? 200;
    let gVol     = existing?.glicko_volatility ?? 0.06;
    const wForm  = existing?.weight_recent_form ?? 0.60;
    const wHcp   = existing?.weight_hcp_index   ?? 0.40;
    const brier  = existing?.brier_score_ewma   ?? null;
    const tracked = existing?.rounds_tracked    ?? 0;

    // Build Glicko results from last 5 events (enough to be meaningful)
    const recent = history.slice(0, 5);
    if (recent.length >= 2) {
      const eventIds = recent.map(h => h.event_id);
      const opponents: { opponentRating: number; opponentRd: number; score: number }[] = [];

      for (const evId of eventIds) {
        const evEntries = (leaderboard ?? [])
          .filter((r: any) => r.event_id === evId && r.golfer_id !== gid && r.buy_in_paid);
        if (!evEntries.length) continue;

        const myPts = history.find(h => h.event_id === evId)?.pts ?? 0;
        const median = evEntries.map((r: any) => r.total_stableford_points).sort((a: number, b: number) => a - b);
        const medPts = median[Math.floor(median.length / 2)];

        // For Glicko we need per-opponent results; approximating with field average
        const fieldRating = 1500; // assume equal Glicko ratings for simplicity
        const fieldRd     = 200;
        const score = myPts > medPts ? 1.0 : myPts < medPts ? 0.0 : 0.5;
        opponents.push({ opponentRating: fieldRating, opponentRd: fieldRd, score });
      }

      if (opponents.length) {
        const updated = glickoUpdate(gRating, gRd, gVol, opponents);
        gRating = updated.r;
        gRd     = updated.rd;
        gVol    = updated.vol;
      }
    }

    // ── Build projection ──────────────────────────────────────
    // Blend recency-weighted mean with global mean, proportioned
    // by the calibration-tuned weights
    const globalMean = mean;
    const blended    = wForm * wMean + wHcp * globalMean;
    const projected  = blended + trend * 0.5;

    upsertRows.push({
      golfer_id:          gid,
      glicko_rating:      Math.round(gRating * 100) / 100,
      glicko_rd:          Math.round(gRd * 100) / 100,
      glicko_volatility:  Math.round(gVol * 10000000) / 10000000,
      projected_score:    Math.round(projected * 100) / 100,
      score_sd:           Math.round(sd * 1000) / 1000,
      trend_slope:        Math.round(trend * 10000) / 10000,
      hole_baselines:     hole_baselines,
      weight_recent_form: wForm,
      weight_hcp_index:   wHcp,
      brier_score_ewma:   brier,
      rounds_tracked:     tracked + recent.length,
      updated_at:         new Date().toISOString(),
    });
  }

  // Batch upsert
  if (upsertRows.length) {
    const { error } = await supabase
      .from("player_stats_cache")
      .upsert(upsertRows, { onConflict: "golfer_id" });
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
  }

  return new Response(JSON.stringify({ ok: true, rebuilt: upsertRows.length }), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
});
