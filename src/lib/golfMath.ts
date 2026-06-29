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

// Builds a map of how many times each pair of golfers has played together.
// Pass all historical signups (not just the current event).
// Returns: Record<"idA-idB", count> where idA < idB always.
export function buildPairingFrequencyMap(signups: { event_id: number; golfer_id: number; assigned_tee_time: string | null; attending: string }[]): Record<string, number> {
  // Group by event+tee_time to find who played together
  const groups: Record<string, number[]> = {};
  signups.forEach(s => {
    if (s.attending !== "Yes" || !s.assigned_tee_time) return;
    const key = `${s.event_id}::${s.assigned_tee_time}`;
    (groups[key] = groups[key] || []).push(s.golfer_id);
  });
  const freq: Record<string, number> = {};
  Object.values(groups).forEach(ids => {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = Math.min(ids[i], ids[j]);
        const b = Math.max(ids[i], ids[j]);
        const k = `${a}-${b}`;
        freq[k] = (freq[k] || 0) + 1;
      }
    }
  });
  return freq;
}

function pairKey(a: number, b: number) {
  return `${Math.min(a, b)}-${Math.max(a, b)}`;
}

// Score a candidate group assignment: sum of pairing frequencies for all pairs in the group.
// Lower = less repeated, which is what we want.
function groupRepeatScore(group: number[], freq: Record<string, number>): number {
  let score = 0;
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      score += freq[pairKey(group[i], group[j])] || 0;
    }
  }
  return score;
}

export function runPairingEngine(
  attendees: { golfer_id: number; sponsor_golfer_id: number | null; early_tee_request?: boolean }[],
  teeTimes: string[],
  priorPairings?: Record<string, number>
) {
  const freq = priorPairings || {};
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

  // If we have history, use a greedy variety-maximizing sort instead of pure random.
  // We assign seeds one at a time, always picking the next seed that minimizes repeat
  // pairings with whoever is already in the current group-in-progress.
  let pool: number[];
  if (Object.keys(freq).length > 0) {
    const remaining = [...seeds];
    const ordered: number[][] = [];
    const N = seeds.length;
    const G = Math.min(Math.ceil(seeds.flat().length / 4), teeTimes.length || Math.ceil(seeds.flat().length / 4));
    const groupSize = Math.ceil(N / G);

    while (remaining.length > 0) {
      const currentGroup: number[] = [];
      // Fill one group worth of seeds
      while (currentGroup.length < groupSize && remaining.length > 0) {
        if (currentGroup.length === 0) {
          // Pick the seed with the highest total repeat score (most "overdue" to move)
          // so the players most commonly together get separated first
          let worstIdx = 0, worstScore = -1;
          remaining.forEach((seed, i) => {
            const s = seed.reduce((acc, id) => {
              return acc + Object.entries(freq).filter(([k]) => k.startsWith(`${id}-`) || k.endsWith(`-${id}`)).reduce((sum, [, v]) => sum + v, 0);
            }, 0);
            if (s > worstScore) { worstScore = s; worstIdx = i; }
          });
          currentGroup.push(...remaining.splice(worstIdx, 1)[0]);
        } else {
          // Pick the seed that adds the fewest new repeat pairings with currentGroup
          let bestIdx = 0, bestScore = Infinity;
          remaining.forEach((seed, i) => {
            const candidate = [...currentGroup, ...seed];
            const score = groupRepeatScore(candidate, freq);
            if (score < bestScore) { bestScore = score; bestIdx = i; }
          });
          currentGroup.push(...remaining.splice(bestIdx, 1)[0]);
        }
      }
      ordered.push(currentGroup);
    }

    // Separate early-tee players to the front group
    const earlyGroup: number[] = [];
    const others: number[][] = [];
    ordered.forEach(grp => {
      if (grp.some(id => earlySet.has(id))) earlyGroup.push(...grp);
      else others.push(grp);
    });
    pool = earlyGroup.length > 0 ? [...earlyGroup, ...others.flat()] : ordered.flat();
  } else {
    // No history: original random shuffle
    const shuffled = [...seeds].sort(() => Math.random() - 0.5);
    const earlyFirst = shuffled.sort((a, b) => {
      const aEarly = a.some(id => earlySet.has(id)) ? 0 : 1;
      const bEarly = b.some(id => earlySet.has(id)) ? 0 : 1;
      return aEarly - bEarly;
    });
    pool = earlyFirst.flat();
  }

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
