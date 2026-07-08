// ------------------------------------------------------------------
// ODDS ENGINE
// ------------------------------------------------------------------
//
// FORMULAS USED (documented here for transparency)
//
// -- Per-golfer profile ------------------------------------------
//
// 1. WEIGHTED AVERAGE (decay factor d=0.88 per round going back)
//    weightedAvg = Sum(score_i * d^i) / Sum(d^i)
//    where i=0 is the most recent round. d=0.88 means each prior
//    round is worth 88% of the next more-recent round.
//
// 2. STANDARD DEVIATION (consistency)
//    sd = sqrt( Sum(score_i - mean)^2 / n )
//    Lower sd = more consistent = lower variance in projection.
//
// 3. TREND (slope of linear regression over last N rounds)
//    Using least-squares slope: b = (nSxy - SxSy) / (nSx2 - (Sx)^2)
//    Positive slope = improving. Negative = declining.
//    Trend used to nudge weightedAvg: projectedScore += trend * 0.5
//
// 4. COURSE ADJUSTMENT
//    For each course the golfer has played, compute
//    courseAdj = golferAvgAtCourse - golferOverallAvg
//    Applied as a signed delta to projectedScore.
//    If no history at this course, adjustment = 0.
//
// 5. HCP TREND ADJUSTMENT
//    Compare average HCP from first half vs second half of signups
//    where playing_handicap is recorded. Rising HCP -> harder to score
//    -> subtract up to 1.0 pt from projection. Falling HCP -> easier.
//    hcpTrendAdj = (hcpTrendSlope * -0.3), clamped to [-1.0, +1.0]
//
// 6. PROJECTED SCORE
//    proj = weightedAvg + (trend * 0.5) + courseAdj + hcpTrendAdj
//    Clamped to [max(0, globalMin-2), globalMax+2]
//
// -- Win probability ---------------------------------------------
//
// 7. RAW WIN PROBABILITY via Monte Carlo simulation (N=5000 trials)
//    Each trial: draw a score for every playing golfer from
//    Normal(proj_i, sd_i). Winner = highest draw.
//    rawWinProb_i = wins_i / N
//
// 8. HOUSE EDGE (3% vigorish)
//    The sum of all raw win probs = 1.0 (zero-sum).
//    Vig applies ONLY to payout (American) odds, by scaling the implied
//    probability: adjProb_i = rawWinProb_i * (1 + VIG) — a ~3% book margin.
//    Displayed win PERCENTAGES stay raw so the field sums to 100%.
//
// 9. AMERICAN ODDS from probability p
//    If p >= 0.5:  odds = round(-(p / (1-p)) * 100)   -> negative (favorite)
//    If p < 0.5:   odds = round(((1-p) / p) * 100)    -> positive (underdog)
//
// -- Head-to-head ------------------------------------------------
//
// 10. H2H WIN PROBABILITY
//     When both golfers have played the same event, track who scored higher.
//     h2hRecord = { wins_A, wins_B, ties }
//     h2hAdj: weight recent matchups (d=0.85 per prior event)
//     h2hBaseProb_A = weightedH2HWins_A / (weightedH2HWins_A + weightedH2HWins_B)
//     Blend 60% Monte Carlo projection, 40% historical H2H:
//     finalProb_A = 0.60 * monteCarloProb_A + 0.40 * h2hBaseProb_A
//     (Falls back to 100% Monte Carlo if <3 shared events)
//
// 11. SPREAD (point differential projection)
//     spread = projA - projB  (positive = A favored by that margin)
//     spreadSigma = sqrt(sdA^2 + sdB^2)   (combined uncertainty)
//     Spread odds: favorite at -110, underdog at +100 (standard -10 vig line)
//     For ties/pushes: if |spread| < 0.5, display "Pick'em"
//
// ------------------------------------------------------------------

export const DECAY = 0.88;     // recency weight per round
export const H2H_DECAY = 0.85; // recency weight per shared event
export const VIG = 0.03;       // house edge (3%)
export const MC_TRIALS = 5000; // Monte Carlo sample count

// Gaussian sample via Box-Muller
export function randNorm(mean: number, sd: number): number {
  const u = 1 - Math.random(), v = Math.random();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Least-squares slope over an array (index = x, value = y)
export function lsSlope(arr: number[]): number {
  const n = arr.length; if (n < 2) return 0;
  let sx = 0, sy = 0, sxy = 0, sx2 = 0;
  arr.forEach((y, i) => { sx += i; sy += y; sxy += i * y; sx2 += i * i; });
  const denom = n * sx2 - sx * sx;
  return denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
}

// Decay-weighted average (index 0 = most recent)
export function weightedAvg(arr: number[]): number {
  if (!arr.length) return 0;
  let num = 0, den = 0;
  arr.forEach((v, i) => { const w = Math.pow(DECAY, i); num += v * w; den += w; });
  return num / den;
}

// Standard deviation
export function stdDev(arr: number[], mean: number): number {
  if (arr.length < 2) return 3.0; // fallback uncertainty
  const v = arr.reduce((s, x) => s + (x - mean) ** 2, 0) / arr.length;
  return Math.max(1.5, Math.sqrt(v)); // floor at 1.5 to prevent degenerate odds
}

// Build a golfer's scoring history from leaderboard, sorted newest-first
export function golferHistory(leaderboard: any[], events: any[], gid: number) {
  const evMap: Record<number, string> = {};
  events.forEach((e: any) => { evMap[e.event_id] = e.date; });
  const rows = leaderboard
    .filter((r: any) => r.golfer_id === gid && !r.is_guest_entry)
    .map((r: any) => ({ pts: r.total_stableford_points, eid: r.event_id, date: evMap[r.event_id] || "", course: "" }))
    .filter(r => r.date);
  // Sort newest first
  rows.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
  // Attach course name
  events.forEach((e: any) => { rows.forEach((r: any) => { if (r.eid === e.event_id) r.course = e.course_name; }); });
  return rows;
}

// Course adjustment: how does this golfer perform at this course vs overall?
export function courseAdj(history: any[], courseName: string): number {
  const all = history.map((r: any) => r.pts);
  if (!all.length) return 0;
  const overall = all.reduce((a: number, b: number) => a + b, 0) / all.length;
  const atCourse = history.filter((r: any) => r.course === courseName).map((r: any) => r.pts);
  if (atCourse.length < 2) return 0;
  const courseAvg = atCourse.reduce((a: number, b: number) => a + b, 0) / atCourse.length;
  return courseAvg - overall;
}

// HCP trend adjustment from signups: rising HCP = penalty, falling = bonus
export function hcpTrendAdj(signups: any[], events: any[], gid: number): number {
  const evMap: Record<number, string> = {};
  events.forEach((e: any) => { evMap[e.event_id] = e.date; });
  const hcpData = signups
    .filter((s: any) => s.golfer_id === gid && s.playing_handicap != null)
    .map((s: any) => ({ hcp: s.playing_handicap, date: evMap[s.event_id] || "" }))
    .filter(s => s.date)
    .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
  if (hcpData.length < 3) return 0;
  const slope = lsSlope(hcpData.map((h: any) => h.hcp));
  // Rising HCP = harder to score = negative adjustment (capped -1.0)
  return Math.max(-1.0, Math.min(1.0, -slope * 0.3));
}

// ---------------------------------------------------------------
// Guest player profile helper
// Guests rarely have enough history for a robust projection.
// Strategy: if the guest has >=2 scored rounds use their own data
// (same as a regular member). If they have <2 rounds, synthesise
// a profile from the current field's league-average with a
// GUEST_PENALTY applied. This keeps them in the field odds
// calculation with a reasonable (slightly worse-than-average)
// projection rather than being silently excluded.
// ---------------------------------------------------------------
export const GUEST_PENALTY = 1.05; // pts below field avg (tunable)

export function leagueAvgProfile(allLeaderboard: any[], allEvents: any[], fieldGolfers: any[], courseName: string) {
  // Compute field-wide weighted-average and pooled sd from all non-guest history
  const allPts: number[] = [];
  fieldGolfers.forEach((g: any) => {
    const hist = golferHistory(allLeaderboard, allEvents, g.golfer_id);
    const scored = hist.filter((r: any) => allEvents.find((e: any) => e.event_id === r.eid));
    scored.forEach((r: any) => allPts.push(r.pts));
  });
  if (!allPts.length) return { proj: 28, wAvg: 28, sd: 3.0, trend: 0, cAdj: 0, hAdj: 0 };
  const mean = allPts.reduce((a: number, b: number) => a + b, 0) / allPts.length;
  const sd = Math.max(1.5, Math.sqrt(allPts.reduce((s: number, x: number) => s + (x - mean) ** 2, 0) / allPts.length));
  return { proj: mean, wAvg: mean, sd, trend: 0, cAdj: 0, hAdj: 0 };
}

// Build a projection profile for one golfer
export function buildProfile(g: any, leaderboard: any[], events: any[], signups: any[], courseName: string, playingIds: Set<number>, allFieldGolfers?: any[]) {
  const hist = golferHistory(leaderboard, events, g.golfer_id);
  // Only use rounds when this golfer was in the paid field
  const scored = hist.filter((r: any) => {
    const ev = events.find((e: any) => e.event_id === r.eid);
    return ev != null;
  });

  // --- Guest with sparse history ---
  if (g.is_guest && scored.length < 2) {
    const fieldGolfers = (allFieldGolfers ?? []).filter((fg: any) => !fg.is_guest);
    const base = leagueAvgProfile(leaderboard, events, fieldGolfers, courseName);
    // Apply handicap-relative adjustment: if guest HCP deviates from field avg,
    // nudge projection accordingly (each handicap stroke is approx 0.4 stableford pts)
    const fieldHcps = fieldGolfers.map((fg: any) => fg.current_handicap_index).filter(Boolean);
    const avgHcp = fieldHcps.length ? fieldHcps.reduce((a: number, b: number) => a + b, 0) / fieldHcps.length : 18;
    const hcpDiff = (g.current_handicap_index ?? 18) - avgHcp;
    // Lower hcp than field avg = better golfer = higher projected score
    const hcpAdj = Math.max(-3, Math.min(3, -hcpDiff * 0.4));
    const proj = base.proj - GUEST_PENALTY + hcpAdj;
    return {
      golfer: g,
      proj: Math.round(proj * 10) / 10,
      wAvg: Math.round((base.wAvg - GUEST_PENALTY) * 10) / 10,
      sd: Math.round(base.sd * 100) / 100,
      trend: 0,
      cAdj: 0,
      hAdj: 0,
      rounds: scored.length, // could be 0 or 1
      hist: scored.slice(0, 8),
      isGuestEstimate: true,   // flag for display
    };
  }

  if (!scored.length) return null;
  const pts = scored.map((r: any) => r.pts);
  const wAvg = weightedAvg(pts);
  const mean = pts.reduce((a: number, b: number) => a + b, 0) / pts.length;
  const sd = stdDev(pts, mean);
  const trend = lsSlope([...pts].reverse()); // oldest-first for slope
  const cAdj = courseAdj(scored, courseName);
  const hAdj = hcpTrendAdj(signups, events, g.golfer_id);
  const proj = wAvg + (trend * 0.5) + cAdj + hAdj;
  return {
    golfer: g,
    proj: Math.round(proj * 10) / 10,
    wAvg: Math.round(wAvg * 10) / 10,
    sd: Math.round(sd * 100) / 100,
    trend: Math.round(trend * 100) / 100,
    cAdj: Math.round(cAdj * 10) / 10,
    hAdj: Math.round(hAdj * 10) / 10,
    rounds: pts.length,
    hist: scored.slice(0, 8) // last 8 for display
  };
}

// House edge for payout odds: inflate the implied probability so the book
// keeps a ~3% margin (dividing would lengthen odds and pay MORE than fair).
// Only feed the result into toAmericanOdds — never display it as a Win %.
export const applyVig = (p: number) => Math.min(0.99, p * (1 + VIG));

// American odds string from probability
export function toAmericanOdds(p: number): string {
  if (p <= 0 || p >= 1) return "N/A";
  if (p >= 0.5) return String(Math.round(-(p / (1 - p)) * 100));
  return "+" + Math.round(((1 - p) / p) * 100);
}

// Full field Monte Carlo win probability
export function calcFieldOdds(profiles: any[]) {
  if (!profiles.length) return [];
  const wins = new Array(profiles.length).fill(0);
  for (let t = 0; t < MC_TRIALS; t++) {
    const draws = profiles.map(p => randNorm(p.proj, p.sd));
    const max = Math.max(...draws);
    // Ties: all winners share
    const winIdx = draws.map((d, i) => d === max ? i : -1).filter(i => i >= 0);
    winIdx.forEach(i => { wins[i] += 1 / winIdx.length; });
  }
  // Raw (fair) probabilities — they sum to 1. Callers apply the vig via
  // applyVig() only when converting to American payout odds.
  return wins.map(w => w / MC_TRIALS);
}

// H2H shared event history (newest-first weighted)
export function h2hHistory(leaderboard: any[], events: any[], gidA: number, gidB: number) {
  const evMap: Record<number, string> = {};
  events.forEach((e: any) => { evMap[e.event_id] = e.date; });
  const sharedEids = [...new Set(
    leaderboard.filter((r: any) => r.golfer_id === gidA || r.golfer_id === gidB).map((r: any) => r.event_id)
  )].filter(eid => {
    const hasA = leaderboard.some((r: any) => r.event_id === eid && r.golfer_id === gidA);
    const hasB = leaderboard.some((r: any) => r.event_id === eid && r.golfer_id === gidB);
    return hasA && hasB;
  });
  return sharedEids
    .map(eid => {
      const rA = leaderboard.filter((r: any) => r.event_id === eid && r.golfer_id === gidA).sort((a: any, b: any) => b.total_stableford_points - a.total_stableford_points)[0];
      const rB = leaderboard.filter((r: any) => r.event_id === eid && r.golfer_id === gidB).sort((a: any, b: any) => b.total_stableford_points - a.total_stableford_points)[0];
      return { eid, date: evMap[eid] || "", ptsA: rA?.total_stableford_points, ptsB: rB?.total_stableford_points };
    })
    .filter(r => r.ptsA != null && r.ptsB != null)
    .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function h2hWinProb(shared: any[], projProbA: number) {
  if (shared.length < 3) return projProbA; // not enough H2H -- use projection only
  let wA = 0, wB = 0;
  shared.forEach((r: any, i: number) => {
    const w = Math.pow(H2H_DECAY, i);
    if (r.ptsA > r.ptsB) wA += w;
    else if (r.ptsB > r.ptsA) wB += w;
    else { wA += w / 2; wB += w / 2; }
  });
  const h2hProb = wA / (wA + wB);
  // 60% Monte Carlo, 40% H2H record
  return 0.60 * projProbA + 0.40 * h2hProb;
}

// -- H2H Hole-by-Hole helpers ----------------------------------

// Estimate per-hole Stableford pts from a total when no HxH data exists.
// Uses difficulty weighting: stroke index determines stroke allocation,
// which drives how many pts each hole is likely worth.
export function estimateHolePts(totalPts: number, course: any): number[] {
  if (!course || !course.hole_stroke_indices || !course.hole_pars)
    return Array(18).fill(totalPts / 18);
  const si: number[] = course.hole_stroke_indices;
  // Weight = ease factor: lower stroke index = harder = likely fewer pts,
  // so SI=1 (hardest) gets weight 1 and SI=18 (easiest) gets weight 18.
  const weights = si.map((s: number) => s);
  const wSum = weights.reduce((a: number, b: number) => a + b, 0);
  const raw = weights.map((w: number) => totalPts * (w / wSum));
  // Round preserving total: greedy rounding
  const floored = raw.map(Math.floor);
  let remainder = totalPts - floored.reduce((a: number, b: number) => a + b, 0);
  const diffs = raw.map((r: number, i: number) => r - floored[i]);
  const order = [...diffs.map((_: number, i: number) => i)].sort((a: number, b: number) => diffs[b] - diffs[a]);
  order.forEach((i: number) => { if (remainder > 0) { floored[i]++; remainder--; } });
  return floored;
}

// Build per-hole history for one golfer across a list of shared events.
// Returns array of 18 arrays, each containing {pts, weight} objects.
export function buildHoleHistory(
  gid: number,
  sharedEvents: any[], // [{eid, date}] sorted newest-first
  leaderboard: any[],
  holeScores: any[],
  courses: any[],
  events: any[]
): { pts: number, weight: number }[][] {
  const perHole: Array<{ pts: number, weight: number }[]> = Array.from({ length: 18 }, () => []);
  sharedEvents.forEach((ev: any, idx: number) => {
    const weight = Math.pow(0.85, idx);
    const entry = leaderboard.filter((r: any) => r.event_id === ev.eid && r.golfer_id === gid)
      .sort((a: any, b: any) => b.total_stableford_points - a.total_stableford_points)[0];
    if (!entry) return;
    // Try actual hole scores first
    const hs = holeScores.filter((h: any) => h.summary_id === entry.summary_id)
      .sort((a: any, b: any) => a.hole_number - b.hole_number);
    if (hs.length >= 18) {
      hs.slice(0, 18).forEach((h: any, i: number) => {
        perHole[i].push({ pts: h.stableford_points ?? 0, weight });
      });
    } else {
      // Fall back to estimation using course for this event
      const evObj = events.find((e: any) => e.event_id === ev.eid);
      // Find the course this golfer played (use any tee of the event course)
      const eventCourse = evObj ? courses.find((c: any) => c.course_name === evObj.course_name) : null;
      if (!eventCourse) return;
      const est = estimateHolePts(entry.total_stableford_points, eventCourse);
      est.forEach((p: number, i: number) => { perHole[i].push({ pts: p, weight }); });
    }
  });
  return perHole;
}

// Compute weighted average per hole
export function holeWeightedAvg(holePts: { pts: number, weight: number }[]): number {
  if (!holePts.length) return 0;
  const num = holePts.reduce((s, x) => s + x.pts * x.weight, 0);
  const den = holePts.reduce((s, x) => s + x.weight, 0);
  return den > 0 ? num / den : 0;
}

// Auto-select the most interesting H2H from the field:
// finds the pair with the smallest probability gap among top-4 golfers.
// Computes real 1v1 odds using the same H2H MC + history blend as the H2H tab,
// so Tony's matchup odds match what users see in the Head-to-Head tab.
export function pickBestH2H(
  ranked: any[],
  leaderboard: any[],
  events: any[],
  signups: any[],
  golfers: any[],
  courseName: string,
): { nameA: string, oddsA: string, nameB: string, oddsB: string, spread: string, probA: number, probB: number } | null {
  if (ranked.length < 2) return null;
  const top = ranked.slice(0, Math.min(4, ranked.length));
  let best: { i: number, j: number, gap: number } = { i: 0, j: 1, gap: 999 };
  for (let i = 0; i < top.length - 1; i++) {
    for (let j = i + 1; j < top.length; j++) {
      const gap = Math.abs(top[i].prob - top[j].prob);
      if (gap < best.gap) best = { i, j, gap };
    }
  }
  const a = top[best.i], b = top[best.j];

  // Re-compute proper 1v1 odds using the same logic as the H2H tab
  const profA = buildProfile(a.golfer, leaderboard, events, signups, courseName, new Set([a.golfer.golfer_id, b.golfer.golfer_id]));
  const profB = buildProfile(b.golfer, leaderboard, events, signups, courseName, new Set([a.golfer.golfer_id, b.golfer.golfer_id]));
  let rawH2hProbA = 0.5;
  if (profA && profB) {
    let winsA = 0;
    for (let t = 0; t < MC_TRIALS; t++) {
      const dA = randNorm(profA.proj, profA.sd);
      const dB = randNorm(profB.proj, profB.sd);
      if (dA > dB) winsA++;
      else if (dA === dB) winsA += 0.5;
    }
    rawH2hProbA = winsA / MC_TRIALS;
  }
  const shared = h2hHistory(leaderboard, events, a.golfer.golfer_id, b.golfer.golfer_id);
  const finalProbA = profA && profB ? h2hWinProb(shared, rawH2hProbA) : 0.5;
  const finalProbB = 1 - finalProbA;

  const spreadVal = profA && profB ? parseFloat((profA.proj - profB.proj).toFixed(1)) : 0;
  const spreadStr = Math.abs(spreadVal) < 0.3 ? "Pick'em" :
    (spreadVal > 0 ? a.golfer.first_name + " -" + Math.abs(spreadVal) : b.golfer.first_name + " -" + Math.abs(spreadVal)) + " pts";
  return {
    nameA: a.golfer.first_name + " " + a.golfer.last_name,
    oddsA: toAmericanOdds(applyVig(finalProbA)),
    nameB: b.golfer.first_name + " " + b.golfer.last_name,
    oddsB: toAmericanOdds(applyVig(finalProbB)),
    spread: spreadStr,
    probA: finalProbA,
    probB: finalProbB,
  };
}
