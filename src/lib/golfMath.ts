// ============================================================
// GOLF SCORING / HANDICAP MATH
// Pure functions — extracted verbatim from App.tsx
// ============================================================

export function calcPlayingHandicap(hcp: number, slope: number, rating: number, par: number) {
  return Math.round(hcp * (slope / 113) + (rating - par));
}

export function calcHoleNetScore(gross: number, phcp: number, si: number) {
  if (!gross || isNaN(gross) || (!phcp && phcp !== 0)) return gross;
  const b = Math.floor(phcp / 18), e = phcp % 18;
  return gross - b - (si <= e ? 1 : 0);
}

export function calcStablefordPoints(net: number, par: number) {
  const d = net - par;
  if (d <= -2) return 4;
  if (d === -1) return 3;
  if (d === 0) return 2;
  if (d === 1) return 1;
  return 0;
}

export function calcHoleScores(grossScores: any[], phcp: number, course: any) {
  return grossScores.map((g, i) => {
    const gross = g && String(g).trim() != "" ? parseInt(String(g)) : null;
    if (!gross || isNaN(gross)) return { gross: null, net: null, points: null };
    const net = calcHoleNetScore(gross, phcp, course.hole_stroke_indices[i]);
    if (isNaN(net)) return { gross, net: null, points: null };
    return { gross, net, points: calcStablefordPoints(net, course.hole_pars[i]) };
  });
}

export function runPairingEngine(
  attendees: { golfer_id: number; sponsor_golfer_id: number | null; early_tee_request?: boolean }[],
  teeTimes: string[]
) {
  const sponsorMap: Record<number, number[]> = {};
  const soloIds: number[] = [];
  const earlySet = new Set(attendees.filter(a => a.early_tee_request).map(a => a.golfer_id));
  attendees.forEach(a => {
    if (a.sponsor_golfer_id) {
      (sponsorMap[a.sponsor_golfer_id] = sponsorMap[a.sponsor_golfer_id] || []).push(a.golfer_id);
    } else {
      soloIds.push(a.golfer_id);
    }
  });
  const seeds = soloIds.map(id => [id, ...(sponsorMap[id] || [])]);
  const shuffled = [...seeds].sort(() => Math.random() - 0.5);
  // Sort early-tee-request players to the front so they land in tee time 1
  const earlyFirst = shuffled.sort((a, b) => {
    const aEarly = a.some(id => earlySet.has(id)) ? 0 : 1;
    const bEarly = b.some(id => earlySet.has(id)) ? 0 : 1;
    return aEarly - bEarly;
  });
  const pool = earlyFirst.flat();
  const N = pool.length, G = Math.min(Math.ceil(N / 4), teeTimes.length || Math.ceil(N / 4)), base = Math.floor(N / G), R = N % G;
  const groups: number[][] = [];
  let idx = 0;
  // Smallest groups first (early tee times), largest groups last
  for (let g = 0; g < G; g++) {
    const size = g >= (G - R) ? base + 1 : base;
    groups.push(pool.slice(idx, idx + size));
    idx += size;
  }
  return groups.map((players, i) => ({ teeTime: teeTimes[i] || teeTimes[teeTimes.length - 1], players }));
}

// Assigns a late-add to the tee time with the fewest players (max 4 per group).
// Returns null when all slots are full → waiting room.
export function assignLateAdd(eventSignups: any[], teeTimes: string[]): string | null {
  // Assigns to the LATEST tee time with an available spot (most-full group first).
  // This keeps early groups intact and fills later slots for pace of play.
  if (!teeTimes.length) return null;
  const MAX = 4;
  const counts: Record<string, number> = {};
  teeTimes.forEach(t => { counts[t] = 0; });
  eventSignups.filter((s: any) => s.attending === "Yes" && s.assigned_tee_time && !s.in_waiting_room)
    .forEach((s: any) => { if (counts[s.assigned_tee_time] !== undefined) counts[s.assigned_tee_time]++; });
  // Work backwards through tee times — find the latest one that has space
  // and the most players (fills groups from last tee time backwards)
  let best: string | null = null, bestCount = -1;
  // Sort by count DESC to prefer most-full, then by tee time DESC for latest
  [...teeTimes].reverse().forEach(t => {
    const c = counts[t] ?? 0;
    if (c < MAX && c > bestCount) { bestCount = c; best = t; }
  });
  return best;
}
