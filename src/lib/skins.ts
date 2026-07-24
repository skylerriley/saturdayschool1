// SINGLE SOURCE OF TRUTH for skins math.
//
// The skins card (LeaderboardTab, weekly + live), the recap engine, and any
// future consumer ALL call these functions -- never their own copy. The whole
// point: change a rule here (tie handling, the per-entry value, an eligibility
// rule) and every consumer changes with it. A second implementation that
// merely AGREES today is the recurring bug in this project (TONY.AI skins
// mismatch, Brier EWMA): it diverges silently the moment one copy is edited and
// nothing fails. One implementation, many consumers.
//
// The rules, as the league plays them:
//   - Only entries that paid into skins count (skins_paid).
//   - A hole's skin goes to the SOLE Stableford-points leader on that hole.
//     A tie => NO skin on that hole (no carry -- the pot is divided at the end).
//   - The pot is (skins-paid entries) * SKIN_VALUE dollars.
//   - Each skin is worth pot / (total skins won). No accumulation, no carryover.

// Dollars each skins-paying entry contributes to the pot.
export const SKIN_VALUE = 10;

// One player's Stableford points on a hole, keyed for the winner calc.
export interface SkinHoleScore {
  golferId: number;
  hole: number;
  points: number | null; // Stableford points; null holes are ignored
}

// The sole-leader winner per hole. holeWinners[hole] = golferId, present only
// for holes with exactly one Stableford-points leader (a tie is omitted).
export function computeSkinWinners(scores: SkinHoleScore[]): Record<number, number> {
  const byHole: Record<number, { golferId: number; points: number }[]> = {};
  for (const s of scores) {
    if (s.points == null) continue;
    (byHole[s.hole] ||= []).push({ golferId: s.golferId, points: s.points });
  }
  const winners: Record<number, number> = {};
  for (const [holeStr, arr] of Object.entries(byHole)) {
    if (arr.length < 1) continue;
    const maxPts = Math.max(...arr.map((x) => x.points));
    const leaders = arr.filter((x) => x.points === maxPts);
    if (leaders.length === 1) winners[Number(holeStr)] = leaders[0].golferId;
  }
  return winners;
}

// Total skins pot in dollars from the number of paying entries.
export function computeSkinPot(skinsPaidCount: number): number {
  return skinsPaidCount * SKIN_VALUE;
}

// Dollars per single skin: pot / total skins won. 0 when no skins were won.
export function computeSkinValue(skinsPaidCount: number, totalSkinsWon: number): number {
  if (totalSkinsWon <= 0) return 0;
  return computeSkinPot(skinsPaidCount) / totalSkinsWon;
}

// Per-golfer payout: each winner's skin count * the per-skin value.
export function computeSkinPayouts(scores: SkinHoleScore[], skinsPaidCount: number): Record<number, number> {
  const winners = computeSkinWinners(scores);
  const winsByGolfer: Record<number, number> = {};
  for (const gid of Object.values(winners)) winsByGolfer[gid] = (winsByGolfer[gid] || 0) + 1;
  const totalSkins = Object.values(winsByGolfer).reduce((a, b) => a + b, 0);
  const perSkin = computeSkinValue(skinsPaidCount, totalSkins);
  const payouts: Record<number, number> = {};
  for (const [gid, wins] of Object.entries(winsByGolfer)) payouts[Number(gid)] = wins * perSkin;
  return payouts;
}
