// ============================================================
// SCORING FINGERPRINT -- per-golfer 6-axis profile for the radar chart.
// Axes: Par 3 / Par 4 / Par 5 average Stableford points (per hole),
// Front 9 / Back 9 average points-per-hole, and Consistency (lower
// variance in per-event totals -> higher score). All axes are scaled
// to a common 0..4 range so every player's shape is directly comparable
// (4 stableford points per hole = par, the natural "ceiling" for the
// per-hole axes).
// ============================================================
import { dedupeLeaderboard } from "./seasonStats";

export function computeScoringFingerprint(gid: number, seasonEvents: any[], leaderboard: any[], holeScores: any[], courses: any[], signups: any[] = []): {
  par3: number, par4: number, par5: number, front9: number, back9: number, consistency: number, sampleSize: number
} {
  const parBuckets: Record<3 | 4 | 5, number[]> = { 3: [], 4: [], 5: [] };
  const frontPts: number[] = [];
  const backPts: number[] = [];
  const roundTotals: number[] = [];

  // League dedupe policy: one row per event, keep-highest
  const myRows = dedupeLeaderboard(leaderboard.filter((r: any) => r.golfer_id === gid));

  seasonEvents.forEach((ev: any) => {
    const entry = myRows.find((r: any) => r.event_id === ev.event_id);
    if (!entry) return;
    // Prefer the tee the golfer's signup pins; name-only lookup grabs an
    // arbitrary tee row for multi-tee courses
    const signup = signups.find((s: any) => s.event_id === ev.event_id && s.golfer_id === gid);
    const course = (signup?.tee_box_course_id
      ? courses.find((c: any) => c.course_id === signup.tee_box_course_id)
      : null) || courses.find((c: any) => c.course_name === ev.course_name);
    const pars: number[] = course?.hole_pars || [];
    const hs = holeScores.filter((h: any) => h.summary_id === entry.summary_id);
    if (hs.length === 0) return;
    roundTotals.push(entry.total_stableford_points);
    hs.forEach((h: any) => {
      if (h.stableford_points == null) return;
      const par = pars[h.hole_number - 1];
      if (par === 3 || par === 4 || par === 5) parBuckets[par as 3 | 4 | 5].push(h.stableford_points);
      if (h.hole_number <= 9) frontPts.push(h.stableford_points);
      else backPts.push(h.stableford_points);
    });
  });

  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  // Consistency: derive from std-dev of round totals, then invert and
  // scale onto the same 0..4 axis as the per-hole point averages.
  // A std-dev of 0 -> 4 (perfectly consistent); std-dev of ~8+ -> near 0.
  let consistency = 0;
  if (roundTotals.length >= 2) {
    const mean = avg(roundTotals);
    const variance = roundTotals.reduce((s, v) => s + (v - mean) ** 2, 0) / roundTotals.length;
    const sd = Math.sqrt(variance);
    consistency = Math.max(0, 4 - (sd / 2));
  }

  return {
    par3: avg(parBuckets[3]),
    par4: avg(parBuckets[4]),
    par5: avg(parBuckets[5]),
    front9: avg(frontPts),
    back9: avg(backPts),
    consistency,
    sampleSize: roundTotals.length,
  };
}
