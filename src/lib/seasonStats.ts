// ============================================================
// HELPERS - season data builder
// All rounds now come from Supabase via the leaderboard state.
// EXTRA_ROUNDS_BY_GOLFER is no longer needed.
// ============================================================

// League-wide dedupe policy: one leaderboard row per (event_id, golfer_id),
// keeping the row with the highest total_stableford_points. EVERY payout, pot,
// tie, or aggregate computation must run on deduped rows — duplicate rows
// (e.g. from a double-fired insert) otherwise inflate pots and fabricate ties.
export function dedupeLeaderboard(rows: any[]): any[] {
  const byKey = new Map<string, any>();
  (rows || []).forEach((r: any) => {
    const key = `${r.event_id}|${r.golfer_id}`;
    const ex = byKey.get(key);
    if (!ex || r.total_stableford_points > ex.total_stableford_points) byKey.set(key, r);
  });
  return [...byKey.values()];
}

export function buildSeasonRounds(golfers: any[], leaderboard: any[], season: number) {
  const result: Record<number, number[]> = {};
  dedupeLeaderboard(leaderboard.filter((r: any) => r.season === season)).forEach((r: any) => {
    const g = golfers.find((x: any) => x.golfer_id === r.golfer_id);
    if (!g || g.is_guest) return;
    if (!result[r.golfer_id]) result[r.golfer_id] = [];
    result[r.golfer_id].push(r.total_stableford_points);
  });
  return result;
}

export function golferStats(golfers: any[], leaderboard: any[], gid: number, season: number) {
  // Dedupe the whole season ONCE so both the golfer's own entries and the
  // per-event payout fields below run on the same duplicate-free rows.
  const seasonRows = dedupeLeaderboard(leaderboard.filter((r: any) => r.season === season));
  const entries = seasonRows.filter((r: any) => r.golfer_id === gid);
  const allPts = entries.map((r: any) => r.total_stableford_points);
  // Derive wins/seconds and stableford earnings from score rankings.
  // Payout rules:
  //   - Solo 1st: 2/3 of pot to winner, 1/3 to 2nd place
  //   - Tied 1st: entire pot split evenly among all tied leaders, no 2nd payout
  let wins = 0, seconds = 0, stablefordEarned = 0;
  const eventIds = [...new Set(entries.map((r: any) => r.event_id))];
  eventIds.forEach((eid: any) => {
    const evEntries = [...seasonRows.filter((x: any) => x.event_id === eid && x.buy_in_paid)]
      .sort((a: any, b: any) => b.total_stableford_points - a.total_stableford_points);
    if (!evEntries.length) return;
    const pot = evEntries.length * 20;
    const topPts = evEntries[0].total_stableford_points;
    const tied1st = evEntries.filter((e: any) => e.total_stableford_points === topPts);
    // Only award 2nd place when there is exactly ONE player in 1st
    const secondPts = tied1st.length === 1 && evEntries.length > 1 ? evEntries[1]?.total_stableford_points : null;
    const tied2nd = secondPts != null ? evEntries.filter((e: any) => e.total_stableford_points === secondPts) : [];
    if (tied1st.some((e: any) => e.golfer_id === gid)) {
      wins++;
      if (tied1st.length === 1) {
        // Solo winner gets 2/3
        stablefordEarned += pot * (2 / 3);
      } else {
        // Tied 1st: split entire pot
        stablefordEarned += pot / tied1st.length;
      }
    } else if (tied2nd.some((e: any) => e.golfer_id === gid)) {
      seconds++;
      // 2nd place only exists when there's a solo 1st; they get 1/3
      stablefordEarned += (pot * (1 / 3)) / tied2nd.length;
    }
  });
  const netEarnings = stablefordEarned - (allPts.length * 20);
  return { rounds: allPts.length, avg: allPts.length ? allPts.reduce((a, b) => a + b, 0) / allPts.length : 0, best: allPts.length ? Math.max(...allPts) : 0, worst: allPts.length ? Math.min(...allPts) : 0, wins, seconds, stablefordEarned, netEarnings };
}

// Derive wins/earnings for analytics (same logic as golferStats but for all golfers at once)
export function calcSeasonLeaderData(golfers: any[], leaderboard: any[], events: any[], season: number) {
  const seasonEventIds = new Set(events.filter((e: any) => e.season === season).map((e: any) => e.event_id));
  const memberGolfers = golfers.filter((g: any) => !g.is_guest && g.status === "Active");

  // Deduplicate leaderboard entries: one per golfer per event
  const deduped = dedupeLeaderboard(leaderboard.filter((r: any) => seasonEventIds.has(r.event_id)));

  const stats: Record<number, { rounds: number, totalPts: number, wins: number, seconds: number, earned: number, best: number, worst: number, allPts: number[] }> = {};
  memberGolfers.forEach(g => {
    stats[g.golfer_id] = { rounds: 0, totalPts: 0, wins: 0, seconds: 0, earned: 0, best: 0, worst: 999, allPts: [] };
  });

  // Sort deduped oldest-first so allPts[0] = earliest round, allPts[last] = most recent
  // This ensures firstHalf/secondHalf splits and trend calculations are chronologically correct
  const evDateMap2: Record<number, number> = {};
  events.forEach((e: any) => { evDateMap2[e.event_id] = new Date(e.date + "T00:00:00").getTime(); });
  deduped.sort((a: any, b: any) => (evDateMap2[a.event_id] || 0) - (evDateMap2[b.event_id] || 0));

  deduped.filter((r: any) => !golfers.find((g: any) => g.golfer_id === r.golfer_id)?.is_guest).forEach((r: any) => {
    if (!stats[r.golfer_id]) return;
    const s = stats[r.golfer_id];
    s.rounds++;
    s.totalPts += r.total_stableford_points;
    s.allPts.push(r.total_stableford_points);
    if (r.total_stableford_points > s.best) s.best = r.total_stableford_points;
    if (r.total_stableford_points < s.worst) s.worst = r.total_stableford_points;
  });

  // Per-event wins/earnings
  [...seasonEventIds].forEach(eid => {
    const paidEv = deduped.filter((r: any) => r.event_id === eid && r.buy_in_paid).sort((a: any, b: any) => b.total_stableford_points - a.total_stableford_points);
    if (!paidEv.length) return;
    const pot = paidEv.length * 20;
    const topPts = paidEv[0].total_stableford_points;
    const tied1st = paidEv.filter((e: any) => e.total_stableford_points === topPts);
    const secondPts = tied1st.length === 1 && paidEv.length > 1 ? paidEv[1]?.total_stableford_points : null;
    const tied2nd = secondPts != null ? paidEv.filter((e: any) => e.total_stableford_points === secondPts) : [];
    tied1st.forEach((e: any) => {
      if (stats[e.golfer_id]) {
        stats[e.golfer_id].wins++;
        stats[e.golfer_id].earned += tied1st.length === 1 ? pot * (2 / 3) : pot / tied1st.length;
      }
    });
    tied2nd.forEach((e: any) => {
      if (stats[e.golfer_id]) { stats[e.golfer_id].seconds++; stats[e.golfer_id].earned += (pot * (1 / 3)) / tied2nd.length; }
    });
  });

  return memberGolfers.map(g => {
    const s = stats[g.golfer_id];
    if (!s || !s.rounds) return null;
    const avg = s.rounds > 0 ? s.totalPts / s.rounds : 0;
    return { golfer: g, rounds: s.rounds, avg, wins: s.wins, seconds: s.seconds, earned: s.earned, best: s.best, worst: s.worst === 999 ? 0 : s.worst, allPts: s.allPts };
  }).filter(Boolean);
}
