// ============================================================
// SIDE GAMES — Nines (3-ball) & Sixes (4-ball 2v2 skins)
// Pure calculation helpers for the Score Entry side-game lens.
// Display-only: nothing computed here is ever persisted.
// Callers pass nets already reduced to the low man's handicap
// (playing hcp − group min), recomputed per hole via
// calcHoleNetScore so strokes land on the right stroke indexes.
// ============================================================

// Nines: each hole pays a 5/3/1 pool by lowest net. Ties split the
// positions they occupy — the result is always an integer:
// two tie low → 4/4/1, two tie high → 5/2/2, all tie → 3/3/3.
export function calcNinesHolePoints(nets: (number | null)[]): (number | null)[] {
  if (nets.length !== 3 || nets.some(n => n == null || isNaN(n as number))) return nets.map(() => null);
  const pool = [5, 3, 1];
  return (nets as number[]).map(n => {
    const better = (nets as number[]).filter(m => m < n).length;
    const tied = (nets as number[]).filter(m => m === n).length;
    let sum = 0;
    for (let k = better; k < better + tied; k++) sum += pool[k];
    return sum / tied;
  });
}

export type SixesHoleResult = {
  played: boolean;        // all four nets entered for this hole
  winner: 0 | 1 | null;   // 0 = team containing player 0, 1 = the other team, null = carry/pending
  pot: number;            // skins claimed on this hole (carry + 1) when won
  carryAfter: number;     // skins riding into the next hole
  running: number[];      // each player's cumulative skins won − lost after this hole
};

// Sixes: 2v2 best-ball skins, teams rotate every 6 holes.
// partnerOfFirst[seg] = index (1–3) of player 0's partner for that segment;
// the other two players are the opposing team. Skins carry across segment
// boundaries (new teams inherit the pot); whatever still rides after 18 is
// forfeited. Holes missing any score are "pending": no skin awarded and the
// carry passes through — everything recomputes as scores fill in.
export function calcSixes(netsByPlayer: (number | null)[][], partnerOfFirst: number[]) {
  const teamsBySegment = partnerOfFirst.map(p => {
    const a = [0, p];
    const b = [1, 2, 3].filter(i => i !== p);
    return [a, b] as [number[], number[]];
  });
  let carry = 0;
  const playerSkins = [0, 0, 0, 0];
  const diff = [0, 0, 0, 0]; // skins won − skins lost, running
  const holes: SixesHoleResult[] = [];
  for (let h = 0; h < 18; h++) {
    const seg = Math.min(2, Math.floor(h / 6));
    const [a, b] = teamsBySegment[seg];
    const nets = netsByPlayer.map(p => p[h]);
    const played = nets.length === 4 && nets.every(n => n != null && !isNaN(n as number));
    if (!played) { holes.push({ played: false, winner: null, pot: 0, carryAfter: carry, running: [...diff] }); continue; }
    const netA = Math.min(...a.map(i => nets[i] as number));
    const netB = Math.min(...b.map(i => nets[i] as number));
    const pot = carry + 1;
    if (netA < netB) {
      a.forEach(i => { playerSkins[i] += pot; diff[i] += pot; });
      b.forEach(i => { diff[i] -= pot; });
      carry = 0;
      holes.push({ played: true, winner: 0, pot, carryAfter: 0, running: [...diff] });
    } else if (netB < netA) {
      b.forEach(i => { playerSkins[i] += pot; diff[i] += pot; });
      a.forEach(i => { diff[i] -= pot; });
      carry = 0;
      holes.push({ played: true, winner: 1, pot, carryAfter: 0, running: [...diff] });
    } else {
      carry = pot;
      holes.push({ played: true, winner: null, pot: 0, carryAfter: carry, running: [...diff] });
    }
  }
  return { holes, playerSkins, playerDiff: diff, forfeited: carry, teamsBySegment };
}
