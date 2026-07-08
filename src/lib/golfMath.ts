// ============================================================
// GOLF SCORING / HANDICAP MATH
// Pure functions — extracted verbatim from App.tsx
// ============================================================

export function calcPlayingHandicap(hcp: number, slope: number, rating: number, par: number) {
  return Math.round(hcp * (slope / 113) + (rating - par));
}

export function calcHoleNetScore(gross: number, phcp: number, si: number, holes = 18) {
  if (!gross || isNaN(gross) || (!phcp && phcp !== 0)) return gross;
  const abs = Math.abs(phcp);
  const full = Math.floor(abs / holes);
  const remainder = abs % holes;
  let strokes = full;
  if (phcp >= 0) {
    if (si <= remainder) strokes += 1;           // extra stroke on hardest holes
  } else {
    if (si > holes - remainder) strokes += 1;    // plus-hcp: stroke back on easiest holes
  }
  return gross - Math.sign(phcp) * strokes;
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
    // Partition seeds by early-tee status BEFORE greedy grouping, so early requesters
    // always land in the frontmost groups regardless of how many there are.
    const earlySeeds = seeds.filter(seed => seed.some(id => earlySet.has(id)));
    const otherSeeds = seeds.filter(seed => !seed.some(id => earlySet.has(id)));

    const greedyOrder = (seedList: number[][]): number[] => {
      const remaining = [...seedList];
      const ordered: number[][] = [];
      // Group size is measured in PLAYERS — a seed can span several players
      // (sponsor + guests), so sizing by seed count overfilled groups.
      const totalPlayers = seedList.flat().length;
      if (totalPlayers === 0) return [];
      const G = Math.max(1, Math.ceil(totalPlayers / 4));
      const groupSize = Math.ceil(totalPlayers / G); // players per group, ≤ 4

      while (remaining.length > 0) {
        const currentGroup: number[] = [];
        // Start the group with the seed carrying the highest total repeat score
        // (most "overdue" to move) so frequent flyers get separated first
        let worstIdx = 0, worstScore = -1;
        remaining.forEach((seed, i) => {
          const s = seed.reduce((acc, id) => {
            return acc + Object.entries(freq).filter(([k]) => k.startsWith(`${id}-`) || k.endsWith(`-${id}`)).reduce((sum, [, v]) => sum + v, 0);
          }, 0);
          if (s > worstScore) { worstScore = s; worstIdx = i; }
        });
        currentGroup.push(...remaining.splice(worstIdx, 1)[0]);

        // Fill with the seeds that add the fewest repeat pairings — but only
        // seeds that FIT: spilling a multi-player seed past groupSize is how
        // 5-7 player groups used to appear.
        while (remaining.length > 0 && currentGroup.length < groupSize) {
          const space = groupSize - currentGroup.length;
          let bestIdx = -1, bestScore = Infinity;
          remaining.forEach((seed, i) => {
            if (seed.length > space) return;
            const score = groupRepeatScore([...currentGroup, ...seed], freq);
            if (score < bestScore) { bestScore = score; bestIdx = i; }
          });
          if (bestIdx === -1) break; // nothing fits — close the group
          currentGroup.push(...remaining.splice(bestIdx, 1)[0]);
        }
        ordered.push(currentGroup);
      }
      return ordered.flat();
    };

    pool = [...greedyOrder(earlySeeds), ...greedyOrder(otherSeeds)];
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

  // Groups are keyed by tee time downstream (assigned_tee_time IS the group),
  // so a hard capacity of 4 players per tee time applies. Anyone beyond
  // capacity comes back in a trailing { teeTime: null } group — the caller
  // sends them to the waiting room. Capping the group COUNT instead (the old
  // behavior) silently produced 5-7 player groups when tee times ran short,
  // and those mega-groups then poisoned the pairing-frequency history.
  const capacity = teeTimes.length ? teeTimes.length * 4 : Infinity;
  const assignable = pool.slice(0, Math.min(pool.length, capacity));
  const overflowPlayers = pool.slice(assignable.length);
  const N = assignable.length, G = Math.max(1, Math.ceil(N / 4)), base = Math.floor(N / G), R = N % G;
  const groups: number[][] = [];
  let idx = 0;
  // Smallest groups first (early tee times), largest groups last
  for (let g = 0; g < G; g++) {
    const size = g >= (G - R) ? base + 1 : base;
    groups.push(assignable.slice(idx, idx + size));
    idx += size;
  }
  const result: { teeTime: string | null; players: number[] }[] =
    groups.map((players, i) => ({ teeTime: teeTimes[i] || teeTimes[teeTimes.length - 1] || null, players }));
  if (overflowPlayers.length) result.push({ teeTime: null, players: overflowPlayers });
  return result;
}

// Assigns a late-add to the LATEST tee time with an open slot (max 4 per
// group), keeping early groups intact and filling from the back for pace of
// play. Returns null when every group is full → waiting room.
// (The old version preferred the MOST-FULL group anywhere, which contradicted
// this intent and could stuff a late-add into the first group out.)
export function assignLateAdd(eventSignups: any[], teeTimes: string[]): string | null {
  if (!teeTimes.length) return null;
  const MAX = 4;
  const counts: Record<string, number> = {};
  teeTimes.forEach(t => { counts[t] = 0; });
  eventSignups.filter((s: any) => s.attending === "Yes" && s.assigned_tee_time && !s.in_waiting_room)
    .forEach((s: any) => { if (counts[s.assigned_tee_time] !== undefined) counts[s.assigned_tee_time]++; });
  // "HH:MM" strings sort chronologically — walk from the last tee time back
  const sorted = [...teeTimes].sort();
  for (let i = sorted.length - 1; i >= 0; i--) {
    if ((counts[sorted[i]] ?? 0) < MAX) return sorted[i];
  }
  return null;
}
