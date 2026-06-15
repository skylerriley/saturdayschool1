import { buildProfile, calcFieldOdds, toAmericanOdds } from "../../lib/monteCarlo";
import { TonyInsight } from "./TonyInsight";

// Pre-event odds module: compact field-odds board + Tony.AI pick,
// used on the "Upcoming" leaderboard tab. Mirrors OddsTab's field-odds
// logic for a single fixed event (no event selector, no exclude toggles).
export function PreEventOddsModule({ golfers, leaderboard, events, signups, courses, holeScores, event, eventOdds, oddsLoading, oddsLastUpdated, onTriggerOdds }: any) {
  const courseName = event?.course_name || "";
  const eventSignupIds = new Set(
    signups.filter((s: any) => s.event_id === event?.event_id && s.attending === "Yes").map((s: any) => s.golfer_id)
  );
  const scoredGolferIds = new Set(
    leaderboard.filter((r: any) => r.event_id === event?.event_id).map((r: any) => r.golfer_id)
  );
  const allFieldIds = new Set([...eventSignupIds, ...scoredGolferIds]);
  const members = golfers.filter((g: any) => !g.is_guest && g.status === "Active");
  const playingField = allFieldIds.size > 0 ? golfers.filter((g: any) => allFieldIds.has(g.golfer_id)) : members;
  const playingIds = new Set<number>(playingField.map((g: any) => g.golfer_id as number));

  const profiles = playingField
    .map((g: any) => buildProfile(g, leaderboard, events, signups, courseName, playingIds, playingField))
    .filter(Boolean) as any[];

  const lateAddGolferIds = (eventOdds ?? []).map((o: any) => o.golfer_id).filter((gid: number) => !allFieldIds.has(gid));
  const lateAddProfiles = lateAddGolferIds
    .map((gid: number) => golfers.find((g: any) => g.golfer_id === gid))
    .filter(Boolean)
    .map((g: any) => buildProfile(g, leaderboard, events, signups, courseName, playingIds, playingField))
    .filter(Boolean) as any[];
  const allProfiles = [...profiles, ...lateAddProfiles];

  const backendMap: Record<number, any> = {};
  (eventOdds ?? []).forEach((o: any) => {
    const ex = backendMap[o.golfer_id];
    if (!ex) { backendMap[o.golfer_id] = o; return; }
    const rowIsLive = o.simulation_type === "live";
    const exIsLive = ex.simulation_type === "live";
    if (rowIsLive && !exIsLive) { backendMap[o.golfer_id] = o; return; }
    if (rowIsLive === exIsLive && new Date(o.computed_at) > new Date(ex.computed_at)) backendMap[o.golfer_id] = o;
  });

  const fieldConfirmed = event?.status === "Pairings Set" || event?.status === "In-Progress";
  const hasBackend = fieldConfirmed && allProfiles.some((p: any) => backendMap[p.golfer.golfer_id]);

  const ranked = (() => {
    if (hasBackend) {
      const allMcProbs = allProfiles.length >= 2 ? calcFieldOdds(allProfiles) : allProfiles.map(() => 1 / allProfiles.length);
      return [...allProfiles.map((p: any, i: number) => {
        const bk = backendMap[p.golfer.golfer_id];
        if (bk) {
          return { ...p, prob: bk.win_probability ?? 0, projMean: bk.projected_final_mean, projLow: bk.projected_final_low, projHigh: bk.projected_final_high,
            oddsAmerican: bk.win_odds_american, heaterActive: bk.heater_active ?? false, heaterMag: bk.heater_magnitude, oddsSource: "backend" };
        }
        const mcProb = allMcProbs[i] ?? 0;
        return { ...p, prob: mcProb, projMean: p.proj, projLow: null, projHigh: null, oddsAmerican: toAmericanOdds(mcProb), heaterActive: false, heaterMag: null, oddsSource: "client" };
      })].sort((a: any, b: any) => b.prob - a.prob);
    }
    const adjProbs = allProfiles.length >= 2 ? calcFieldOdds(allProfiles) : allProfiles.map(() => 1 / allProfiles.length);
    return [...allProfiles.map((p: any, i: number) => ({ ...p, prob: adjProbs[i], oddsAmerican: toAmericanOdds(adjProbs[i]), oddsSource: "client" }))].sort((a: any, b: any) => b.prob - a.prob);
  })();

  if (allProfiles.length < 2) return null;

  return (
    <div style={{ marginTop: 14 }}>
      <div className="card-title" style={{ marginBottom: 6 }}>Pre-Event Odds</div>
      <div style={{ background: "var(--green-900)", borderRadius: "var(--radius-md)", overflow: "hidden", marginBottom: 4 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 60px 65px 60px", padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--gold-300)", letterSpacing: "0.07em", textTransform: "uppercase" }}>Golfer</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--gold-300)", letterSpacing: "0.07em", textTransform: "uppercase", textAlign: "center" }}>Proj</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--gold-300)", letterSpacing: "0.07em", textTransform: "uppercase", textAlign: "center" }}>Win %</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--gold-300)", letterSpacing: "0.07em", textTransform: "uppercase", textAlign: "right" }}>Odds</div>
        </div>
        {ranked.map((r: any, i: number) => {
          const rawOdds = r.oddsAmerican ?? toAmericanOdds(r.prob);
          const odds = (r.prob === 0 || rawOdds === "N/A" || rawOdds === "EVEN") ? "N/A" : rawOdds;
          const isFav = i === 0;
          return (
            <div key={r.golfer.golfer_id} style={{ display: "grid", gridTemplateColumns: "1fr 60px 65px 60px", padding: "11px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: isFav ? "rgba(196,120,0,0.12)" : "transparent", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: isFav ? 700 : 500, color: isFav ? "var(--gold-300)" : "rgba(255,255,255,0.88)" }}>
                  {r.golfer.first_name} {r.golfer.last_name}{isFav ? " 🏆" : ""}
                  {r.golfer.is_guest && <span style={{ fontSize: 10, fontWeight: 700, background: "rgba(196,120,0,0.25)", color: "var(--gold-300)", borderRadius: 4, padding: "1px 5px", marginLeft: 5 }}>guest</span>}
                </div>
                {r.projLow != null && r.projHigh != null && (
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 1 }}>{r.projLow}–{r.projHigh} pts</div>
                )}
              </div>
              <div style={{ textAlign: "center", fontSize: 17, fontWeight: 700, color: "var(--green-300)" }}>{r.projMean ?? r.proj}</div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>{(r.prob * 100).toFixed(1)}%</div>
                <div style={{ height: 4, background: "rgba(255,255,255,0.15)", borderRadius: 2, marginTop: 3 }}>
                  <div style={{ height: 4, borderRadius: 2, background: "var(--gold-400)", width: (r.prob * 100) + "%" }} />
                </div>
              </div>
              <div style={{ textAlign: "right", fontSize: 15, fontWeight: 700, color: parseFloat(odds) < 0 ? "var(--gold-300)" : "var(--green-300)" }}>{odds}</div>
            </div>
          );
        })}
      </div>

      <TonyInsight ranked={ranked} selEventId={String(event?.event_id)} selEvent={event} fieldConfirmed={fieldConfirmed} hasBackend={hasBackend}
        leaderboard={leaderboard} events={events} signups={signups} golfers={golfers} courseName={courseName} hideRecord />
    </div>
  );
}
