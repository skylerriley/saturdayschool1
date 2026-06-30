import { useState } from "react";
import { ToggleGroup } from "../../components/common";
import { computeScoringFingerprint } from "../../lib/scoringFingerprint";
import { ScoringFingerprintRadar } from "../../components/charts/ScoringFingerprintRadar";
import { formatDate } from "../../lib/formatters";
import {
  MC_TRIALS, VIG,
  buildProfile, calcFieldOdds, toAmericanOdds,
  h2hHistory, h2hWinProb, randNorm,
  buildHoleHistory, holeWeightedAvg,
} from "../../lib/monteCarlo";
import { TonyInsight } from "./TonyInsight";

// ------------------------------------------------------------------
// ODDS TAB COMPONENT
// ------------------------------------------------------------------
export function OddsTab({ golfers, leaderboard, events, signups, courses, holeScores, season, eventOdds, oddsLoading, oddsLastUpdated, onTriggerOdds, refreshLiveData }: any) {
  const [oddsMode, setOddsMode] = useState<"field" | "h2h">("field");
  // Field odds state
  const completedAndUpcoming = events.filter((e: any) => e.status !== "Cancelled");
  const upcomingEvents = [...events.filter((e: any) => e.status === "Upcoming" || e.status === "Pairings Set" || e.status === "In-Progress")].sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const allEventsSorted = [...completedAndUpcoming].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const [selEventId, setSelEventId] = useState<string>(String(upcomingEvents[0]?.event_id || allEventsSorted[0]?.event_id || ""));

  // Default-exclude golfers who haven't played in the last 60 days.
  // Computed once at mount via the lazy useState initializer.
  const [excludedIds, setExcludedIds] = useState<Set<number>>(() => {
    const cutoff = Date.now() - 60 * 24 * 60 * 60 * 1000; // 60 days ago in ms
    const lastPlayed: Record<number, number> = {};
    const evDateMap: Record<number, number> = {};
    events.forEach((e: any) => { evDateMap[e.event_id] = new Date(e.date + "T00:00:00").getTime(); });
    leaderboard.forEach((r: any) => {
      const evMs = evDateMap[r.event_id];
      if (!evMs) return;
      if (!lastPlayed[r.golfer_id] || evMs > lastPlayed[r.golfer_id])
        lastPlayed[r.golfer_id] = evMs;
    });
    const inactive: Set<number> = new Set();
    golfers.filter((g: any) => !g.is_guest && g.status === "Active").forEach((g: any) => {
      const last = lastPlayed[g.golfer_id];
      if (!last || last < cutoff) inactive.add(g.golfer_id as number);
    });
    return inactive as Set<number>;
  });

  // H2H state
  const [h2hA, setH2hA] = useState("");
  const [h2hB, setH2hB] = useState("");

  const selEvent = events.find((e: any) => e.event_id === parseInt(selEventId));
  const members = golfers.filter((g: any) => !g.is_guest && g.status === "Active").sort((a: any, b: any) => a.first_name.localeCompare(b.first_name));

  // Get signups for the selected event to know default playing field
  const eventSignupIds = new Set(
    signups.filter((s: any) => s.event_id === parseInt(selEventId) && s.attending === "Yes").map((s: any) => s.golfer_id)
  );
  // Also include golfers who have leaderboard entries for this event (late adds / no signup)
  const scoredGolferIds = new Set(
    leaderboard.filter((r: any) => r.event_id === parseInt(selEventId)).map((r: any) => r.golfer_id)
  );
  const allFieldIds = new Set([...eventSignupIds, ...scoredGolferIds]);
  // If no signups AND no scored entries, treat all members as playing
  const defaultField = allFieldIds.size > 0
    ? golfers.filter((g: any) => allFieldIds.has(g.golfer_id))
    : members;

  const playingField = defaultField.filter((g: any) => !excludedIds.has(g.golfer_id));
  const playingIds = new Set<number>(playingField.map((g: any) => g.golfer_id as number));

  const courseName = selEvent?.course_name || "";

  // Build profiles for all playing golfers (pass full field so guests can use league-avg)
  const profiles = playingField
    .map((g: any) => buildProfile(g, leaderboard, events, signups, courseName, playingIds, playingField))
    .filter(Boolean) as any[];

  // Golfers in the field who have no history (can't model them)
  const noHistoryGolfers = playingField.filter((g: any) => !profiles.find((p: any) => p.golfer.golfer_id === g.golfer_id));
  // Note: lateAddProfiles are built above and merged into allProfiles

  // Late-add golfers: in eventOdds (backend computed odds for them)
  // but not in the signed-up field. Add them to display if they have odds.
  const lateAddGolferIds = (eventOdds ?? [])
    .map((o: any) => o.golfer_id)
    .filter((gid: number) => !allFieldIds.has(gid));
  const lateAddProfiles = lateAddGolferIds
    .map((gid: number) => golfers.find((g: any) => g.golfer_id === gid))
    .filter(Boolean)
    .map((g: any) => buildProfile(g, leaderboard, events, signups, courseName, playingIds, playingField))
    .filter(Boolean) as any[];
  const allProfiles = [...profiles, ...lateAddProfiles];

  // Build backend odds lookup — prefer live over pre_round, newest first
  const backendMap: Record<number, any> = {};
  (eventOdds ?? []).forEach((o: any) => {
    const ex = backendMap[o.golfer_id];
    if (!ex) { backendMap[o.golfer_id] = o; return; }
    const rowIsLive = o.simulation_type === "live";
    const exIsLive = ex.simulation_type === "live";
    if (rowIsLive && !exIsLive) { backendMap[o.golfer_id] = o; return; }
    if (rowIsLive === exIsLive && new Date(o.computed_at) > new Date(ex.computed_at)) backendMap[o.golfer_id] = o;
  });

  // Use backend odds only when field is confirmed (Pairings Set or In-Progress).
  // Upcoming events use client-side MC — field is incomplete so backend model
  // isn't meaningful yet. Backend kicks in the moment pairings are confirmed.
  const fieldConfirmed = selEvent?.status === "Pairings Set" || selEvent?.status === "In-Progress";
  const hasBackend = fieldConfirmed && allProfiles.some((p: any) => backendMap[p.golfer.golfer_id]);

  const ranked = (() => {
    if (hasBackend) {
      // Backend model odds (Pairings Set / In-Progress).
      // Guests (and any late-add without a backendMap entry) won't have backend
      // odds — the edge function only models players it has history for. For
      // those players we run a full-field client-side MC that includes everyone
      // (including guests with their synthesised profiles) so we can scale their
      // probability into the same field correctly, then use that as the fallback.
      const allMcProbs = allProfiles.length >= 2 ? calcFieldOdds(allProfiles) : allProfiles.map(() => 1 / allProfiles.length);
      return [...allProfiles.map((p: any, i: number) => {
        const bk = backendMap[p.golfer.golfer_id];
        if (bk) {
          // Player has backend odds — use them as-is
          return {
            ...p,
            prob: bk.win_probability ?? 0,
            top3Prob: bk.top3_probability ?? 0,
            top5Prob: bk.top5_probability ?? 0,
            projMean: bk.projected_final_mean,
            projLow: bk.projected_final_low,
            projHigh: bk.projected_final_high,
            oddsAmerican: bk.win_odds_american,
            heaterActive: bk.heater_active ?? false,
            heaterMag: bk.heater_magnitude,
            pointsSoFar: bk.points_so_far,
            oddsSource: "backend",
          };
        }
        // No backend entry (guest or late-add): fall back to client MC prob
        const mcProb = allMcProbs[i] ?? 0;
        return {
          ...p,
          prob: mcProb,
          top3Prob: 0,
          top5Prob: 0,
          projMean: p.proj,
          projLow: null,
          projHigh: null,
          oddsAmerican: toAmericanOdds(mcProb),
          heaterActive: false,
          heaterMag: null,
          pointsSoFar: null,
          oddsSource: "client", // mark so display can show est. badge
        };
      })].sort((a: any, b: any) => b.prob - a.prob);
    }
    // Client-side Monte Carlo (Upcoming events or no backend data yet)
    const adjProbs = allProfiles.length >= 2 ? calcFieldOdds(allProfiles) : allProfiles.map(() => 1 / allProfiles.length);
    return [...allProfiles.map((p: any, i: number) => ({
      ...p,
      prob: adjProbs[i],
      oddsAmerican: toAmericanOdds(adjProbs[i]),
      oddsSource: "client",
    }))].sort((a: any, b: any) => b.prob - a.prob);
  })();

  // Toggle exclude
  const toggleExclude = (gid: number) => {
    setExcludedIds(prev => { const n = new Set(prev); n.has(gid) ? n.delete(gid) : n.add(gid); return n; });
  };

  // H2H computation
  const gA = golfers.find((g: any) => g.golfer_id === parseInt(h2hA));
  const gB = golfers.find((g: any) => g.golfer_id === parseInt(h2hB));
  const profA = gA ? buildProfile(gA, leaderboard, events, signups, courseName, new Set<number>([gA?.golfer_id, gB?.golfer_id].filter(Boolean) as number[])) : null;
  const profB = gB ? buildProfile(gB, leaderboard, events, signups, courseName, new Set<number>([gA?.golfer_id, gB?.golfer_id].filter(Boolean) as number[])) : null;

  const h2hShared = gA && gB ? h2hHistory(leaderboard, events, gA.golfer_id, gB.golfer_id) : [];

  // H2H Hole-by-Hole: build per-hole weighted averages for each golfer
  const sharedForHoles = h2hShared.map((r: any) => ({ eid: r.eid, date: r.date }));
  const holeHistA = gA && sharedForHoles.length ? buildHoleHistory(gA.golfer_id, sharedForHoles, leaderboard, holeScores || [], courses, events) : null;
  const holeHistB = gB && sharedForHoles.length ? buildHoleHistory(gB.golfer_id, sharedForHoles, leaderboard, holeScores || [], courses, events) : null;
  // Per-hole weighted averages
  const holeAvgA = holeHistA ? holeHistA.map(holeWeightedAvg) : null;
  const holeAvgB = holeHistB ? holeHistB.map(holeWeightedAvg) : null;
  // Determine data source label: any actual hole scores used?
  const hasRealHbh = gA && gB && h2hShared.some((r: any) => {
    const eA = leaderboard.find((lb: any) => lb.event_id === r.eid && lb.golfer_id === gA.golfer_id);
    const eB = leaderboard.find((lb: any) => lb.event_id === r.eid && lb.golfer_id === gB.golfer_id);
    return (eA && (holeScores || []).filter((h: any) => h.summary_id === eA.summary_id).length >= 18) ||
           (eB && (holeScores || []).filter((h: any) => h.summary_id === eB.summary_id).length >= 18);
  });
  // Find the course for the selected event to get par info
  const h2hCourse = selEvent ? courses.find((c: any) => c.course_name === selEvent.course_name) : null;

  // H2H Monte Carlo (1v1)
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
  const finalProbA = profA && profB ? h2hWinProb(h2hShared, rawH2hProbA) : 0.5;
  const finalProbB = 1 - finalProbA;
  // Vig on H2H
  const h2hAdjA = finalProbA / (1 + VIG);
  const h2hAdjB = finalProbB / (1 + VIG);

  // Spread
  const spread = profA && profB ? Math.round((profA.proj - profB.proj) * 10) / 10 : 0;
  const spreadSigma = profA && profB ? Math.round(Math.sqrt(profA.sd ** 2 + profB.sd ** 2) * 10) / 10 : 0;

  return (
    <div>
      <div className="section-title">Odds</div>
      <div className="section-sub">Projected win probabilities · powered by Monte Carlo simulation</div>

      {/* Mode toggle */}
      <ToggleGroup
        options={[{ value: "field", label: "Field Odds" }, { value: "h2h", label: "Head-to-Head" }]}
        value={oddsMode}
        onChange={setOddsMode}
        style={{ marginBottom: 16 }}
      />

      {/* Event selector -- upcoming / pairings set / in-progress only */}
      {upcomingEvents.length === 0 ? (
        <div className="empty-state"><div className="empty-text">No upcoming events</div><div className="empty-sub">Odds will appear once an event is scheduled</div></div>
      ) : (
        <div className="form-group">
          <label className="form-label">Event</label>
          <select className="form-select" value={selEventId} onChange={e => { setSelEventId(e.target.value); setExcludedIds(new Set()); }}>
            {upcomingEvents.map((ev: any) => (
              <option key={ev.event_id} value={ev.event_id}>{formatDate(ev.date)} -- {ev.course_name}{ev.status === "In-Progress" ? " 🟢 Live" : ""}</option>
            ))}
          </select>
        </div>
      )}

      {/* ── FIELD ODDS ── */}
      {oddsMode === "field" && (
        <div>
          {/* Playing field toggle */}
          <div className="card-title" style={{ marginBottom: 6 }}>Playing Field ({playingField.length} golfers)</div>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 10 }}>Tap a name to exclude from the field. Odds recalculate instantly.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 18 }}>
            {defaultField.map((g: any) => {
              const excl = excludedIds.has(g.golfer_id);
              return (
                <button key={g.golfer_id}
                  onClick={() => toggleExclude(g.golfer_id)}
                  style={{
                    padding: "5px 11px", borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: "pointer",
                    border: "1.5px solid " + (excl ? "var(--border)" : "var(--green-600)"),
                    background: excl ? "var(--surface2)" : "var(--green-50)",
                    color: excl ? "var(--text-muted)" : "var(--green-800)",
                    textDecoration: excl ? "line-through" : "none",
                    transition: "all 0.15s"
                  }}
                >{g.first_name}</button>
              );
            })}
          </div>

          {allProfiles.length < 2 && (
            <div className="empty-state"><div className="empty-text">Need at least 2 golfers with scoring history to calculate odds.</div></div>
          )}

          {allProfiles.length >= 2 && (
            <>
              {/* Live odds status bar */}
              {selEvent?.status === "In-Progress" && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderRadius: "var(--radius-md)", background: "var(--green-50)", border: "1px solid var(--green-200)", marginBottom: 12, fontSize: 13 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--green-800)" }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--green-500)", display: "inline-block", animation: "livePulse 1.5s infinite" }} />
                    {(() => {
                      const sh_o = ranked[0]?.o?.snapshot_hole ?? ranked[0]?.oddsSource === "backend" ? 99 : 0;
                      // Prefer reading snapshot_hole from the raw backendMap
                      const bRow = Object.values(backendMap)[0] as any;
                      const sh_b = bRow?.snapshot_hole ?? 0;
                      if (sh_b === 99) return `Live odds · updated ${oddsLastUpdated ? new Date(oddsLastUpdated).toLocaleTimeString() : "…"}`;
                      if (sh_b === 12) return `H12 snapshot · updated ${oddsLastUpdated ? new Date(oddsLastUpdated).toLocaleTimeString() : "…"}`;
                      if (sh_b === 6) return `H6 snapshot · updated ${oddsLastUpdated ? new Date(oddsLastUpdated).toLocaleTimeString() : "…"}`;
                      return ranked.some((r: any) => r.oddsSource === "backend")
                        ? `Pre-round odds`
                        : "Live odds · client estimate";
                    })()}
                  </span>
                  <button
                    onClick={() => { onTriggerOdds(); if (refreshLiveData) refreshLiveData(); }}
                    disabled={oddsLoading}
                    style={{ background: "var(--green-700)", color: "white", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer", opacity: oddsLoading ? 0.6 : 1 }}
                  >
                    {oddsLoading ? "…" : "↻ Refresh"}
                  </button>
                </div>
              )}

              {/* Odds board */}
              <div style={{ background: "var(--green-900)", borderRadius: "var(--radius-md)", overflow: "hidden", marginBottom: 4 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 60px 65px 60px", padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--gold-300)", letterSpacing: "0.07em", textTransform: "uppercase" }}>Golfer</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--gold-300)", letterSpacing: "0.07em", textTransform: "uppercase", textAlign: "center" }}>Proj</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--gold-300)", letterSpacing: "0.07em", textTransform: "uppercase", textAlign: "center" }}>Win %</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--gold-300)", letterSpacing: "0.07em", textTransform: "uppercase", textAlign: "right" }}>Odds</div>
                </div>
                {ranked.map((r: any, i: number) => {
                  // Compute display odds. For backend players use the stored string;
                  // for client-MC players (guests, late-adds) derive from prob.
                  // Only show N/A when prob is genuinely zero (player excluded/no data).
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
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 1, alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                          {r.isGuestEstimate ? "est. (no history)" : r.trend > 0.05 ? "↑ hot" : r.trend < -0.05 ? "↓ cooling" : "-> steady"}{" "}
                          {r.heaterActive && (
                            <span style={{ fontSize: 10, fontWeight: 700, background: "var(--gold-100)", color: "var(--gold-800)", border: "1px solid var(--gold-300)", borderRadius: 10, padding: "1px 6px" }}>
                              🔥 {(r.heaterMag ?? 0).toFixed(1)}σ
                            </span>
                          )}
                          {r.projLow != null && r.projHigh != null && (
                            <span style={{ color: "rgba(255,255,255,0.35)" }}>
                              {" "}{r.projLow}–{r.projHigh} pts
                            </span>
                          )}
                        </div>
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

              {noHistoryGolfers.length > 0 && (
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10, padding: "8px 12px", background: "var(--surface2)", borderRadius: "var(--radius-md)" }}>
                  ⚠ No scoring history: {noHistoryGolfers.map((g: any) => g.first_name).join(", ")} -- excluded from odds calculation
                </div>
              )}



              {/* Tony.ai insight -- auto-picks best winner + matchup from field */}
              {/* Pass the real H2H computation: pickBestH2HFromField builds actual 1v1 MC odds */}
              <TonyInsight ranked={ranked} selEventId={selEventId} selEvent={selEvent} fieldConfirmed={fieldConfirmed} hasBackend={hasBackend}
                leaderboard={leaderboard} events={events} signups={signups} golfers={golfers} courseName={courseName} />

              {/* Methodology note */}
              <div style={{ marginTop: 16, padding: "12px 14px", background: "var(--surface2)", borderRadius: "var(--radius-md)", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
                <strong style={{ color: "var(--text-secondary)" }}>How odds are calculated:</strong> Projected score uses decay-weighted average (d=0.88/round), linear trend, course history, and HCP trajectory. {MC_TRIALS.toLocaleString()}-trial Monte Carlo simulation determines win probabilities. Past performance does not guarantee future results.
              </div>
            </>
          )}
        </div>
      )}

      {/* ── HEAD-TO-HEAD ── */}
      {oddsMode === "h2h" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Golfer A</label>
              <select className="form-select" value={h2hA} onChange={e => setH2hA(e.target.value)}>
                <option value="">Select…</option>
                {members.filter((g: any) => g.golfer_id !== parseInt(h2hB)).map((g: any) => (
                  <option key={g.golfer_id} value={g.golfer_id}>{g.first_name} {g.last_name}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Golfer B</label>
              <select className="form-select" value={h2hB} onChange={e => setH2hB(e.target.value)}>
                <option value="">Select…</option>
                {members.filter((g: any) => g.golfer_id !== parseInt(h2hA)).map((g: any) => (
                  <option key={g.golfer_id} value={g.golfer_id}>{g.first_name} {g.last_name}</option>
                ))}
              </select>
            </div>
          </div>

          {gA && gB && profA && profB && (() => {
            const favIsA = finalProbA >= 0.5;
            const favProb = favIsA ? h2hAdjA : h2hAdjB;
            const dogProb = favIsA ? h2hAdjB : h2hAdjA;
            const favG = favIsA ? gA : gB;
            const dogG = favIsA ? gB : gA;
            const favProf = favIsA ? profA : profB;
            const dogProf = favIsA ? profB : profA;
            const favSpread = favIsA ? spread : (-spread);
            const isPick = Math.abs(spread) < 0.5;

            return (
              <div>
                {/* H2H matchup card */}
                <div style={{ background: "var(--green-900)", borderRadius: "var(--radius-md)", overflow: "hidden", marginBottom: 16 }}>
                  <div style={{ padding: "12px 16px", textAlign: "center", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                    <div style={{ fontSize: 12, color: "var(--gold-300)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>Head-to-Head · {selEvent ? formatDate(selEvent.date) : "All Time"}</div>
                    <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>{h2hShared.length} shared events · {courseName}</div>
                  </div>

                  {/* Win probability bar */}
                  <div style={{ padding: "16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <div style={{ textAlign: "left" }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--gold-300)" }}>{gA.first_name}</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: "white" }}>{(h2hAdjA * 100).toFixed(1)}%</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: parseFloat(toAmericanOdds(h2hAdjA)) < 0 ? "var(--gold-300)" : "var(--green-300)" }}>{toAmericanOdds(h2hAdjA)}</div>
                      </div>
                      <div style={{ fontSize: 24, fontWeight: 700, color: "rgba(255,255,255,0.3)", alignSelf: "center" }}>vs</div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--gold-300)" }}>{gB.first_name}</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: "white" }}>{(h2hAdjB * 100).toFixed(1)}%</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: parseFloat(toAmericanOdds(h2hAdjB)) < 0 ? "var(--gold-300)" : "var(--green-300)" }}>{toAmericanOdds(h2hAdjB)}</div>
                      </div>
                    </div>
                    {/* Probability bar */}
                    <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,0.15)", overflow: "hidden", margin: "10px 0" }}>
                      <div style={{ height: "100%", borderRadius: 4, background: "linear-gradient(90deg,var(--gold-400),var(--green-400))", width: (h2hAdjA * 100) + "%", transition: "width 0.4s ease" }} />
                    </div>
                  </div>

                  {/* Spread */}
                  <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.1)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 4 }}>Point Spread</div>
                      {isPick ? (
                        <div style={{ fontSize: 20, fontWeight: 700, color: "var(--gold-300)" }}>Pick'em</div>
                      ) : (
                        <>
                          <div style={{ fontSize: 20, fontWeight: 700, color: "white" }}>{favG.first_name} -{favSpread}</div>
                          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>±{spreadSigma} pts uncertainty</div>
                        </>
                      )}
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 4 }}>Spread Odds</div>
                      <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 4 }}>
                        <div>
                          <div style={{ fontSize: 13, color: "var(--gold-300)", fontWeight: 600 }}>{favG.first_name}</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: "white" }}>-110</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 13, color: "var(--green-300)", fontWeight: 600 }}>{dogG.first_name}</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: "white" }}>+100</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Side-by-side stat comparison */}
                <div style={{ background: "var(--green-900)", borderRadius: "var(--radius-md)", overflow: "hidden", marginBottom: 16 }}>
                  <div style={{ fontSize: 14, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", fontWeight: 700, padding: "12px 14px 8px" }}>
                    Stat Comparison
                  </div>
                  {[
                    { label: "Projected Score", a: profA.proj, b: profB.proj, hi: "high" },
                    { label: "Weighted Avg", a: profA.wAvg, b: profB.wAvg, hi: "high" },
                    { label: "Std Dev (lower=better)", a: profA.sd, b: profB.sd, hi: "low" },
                    { label: "Trend (pts/rd)", a: profA.trend, b: profB.trend, hi: "high" },
                    { label: "Course Adj", a: profA.cAdj, b: profB.cAdj, hi: "high" },
                    { label: "HCP Trend Adj", a: profA.hAdj, b: profB.hAdj, hi: "high" },
                    { label: "Rounds Played", a: profA.rounds, b: profB.rounds, hi: "any" },
                  ].map((row: any) => {
                    const aWins = row.hi === "high" ? (row.a > row.b) : row.hi === "low" ? (row.a < row.b) : false;
                    const bWins = row.hi === "high" ? (row.b > row.a) : row.hi === "low" ? (row.b < row.a) : false;
                    // Advantage bar: proportion of A vs total. 0.5 = even.
                    const aNum = parseFloat(row.a) || 0;
                    const bNum = parseFloat(row.b) || 0;
                    const total = Math.abs(aNum) + Math.abs(bNum);
                    const favA = aWins;
                    const favB = bWins;
                    let aPct = 0.5;
                    if (row.hi !== "any" && total > 0) {
                      if (row.hi === "high") {
                        aPct = aNum / total;
                      } else {
                        aPct = bNum / total;
                      }
                      aPct = Math.min(0.9, Math.max(0.1, aPct));
                    }
                    return (
                      <div key={row.label} style={{ padding: "9px 14px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                        {/* Values row */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
                          <div style={{ fontWeight: aWins ? 700 : 400, fontSize: 18, textAlign: "left", color: aWins ? "#7dc07d" : "rgba(255,255,255,0.75)" }}>{row.a}</div>
                          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", textAlign: "center", padding: "0 8px", letterSpacing: "0.03em" }}>{row.label}</div>
                          <div style={{ fontWeight: bWins ? 700 : 400, fontSize: 18, color: bWins ? "rgba(212,168,67,0.9)" : "rgba(255,255,255,0.75)", textAlign: "right" }}>{row.b}</div>
                        </div>
                        {/* Advantage bar */}
                        {row.hi !== "any" && (
                          <div style={{ marginTop: 5, height: 5, borderRadius: 3, background: "rgba(255,255,255,0.08)", overflow: "hidden", display: "flex" }}>
                            <div style={{
                              width: `${aPct * 100}%`,
                              background: favA ? "#7dc07d" : favB ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.12)",
                              borderRadius: "3px 0 0 3px",
                              transition: "width 0.4s ease",
                            }} />
                            <div style={{
                              flex: 1,
                              background: favB ? "rgba(212,168,67,0.75)" : favA ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.12)",
                              borderRadius: "0 3px 3px 0",
                              transition: "flex 0.4s ease",
                            }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* H2H history */}
                {h2hShared.length > 0 && (
                  <>
                    <div className="card-title" style={{ marginBottom: 8 }}>Head-to-Head History</div>
                    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", overflow: "hidden", marginBottom: 12, boxShadow: "var(--shadow-sm)" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 40px 40px 40px", padding: "7px 12px", background: "var(--green-900)", gap: 4 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--gold-300)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Date</div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--gold-300)", textAlign: "center" }}>{gA.first_name}</div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--gold-300)", textAlign: "center" }}>{gB.first_name}</div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--gold-300)", textAlign: "center", letterSpacing: "0.06em", textTransform: "uppercase" }}>W</div>
                      </div>
                      {h2hShared.slice(0, 10).map((r: any, i: number) => {
                        const winner = r.ptsA > r.ptsB ? "A" : r.ptsB > r.ptsA ? "B" : "T";
                        return (
                          <div key={r.eid} style={{ display: "grid", gridTemplateColumns: "1fr 40px 40px 40px", padding: "8px 12px", borderBottom: "1px solid var(--border)", background: i === 0 ? "var(--green-50)" : "transparent", gap: 4, alignItems: "center" }}>
                            <div style={{ fontSize: 16 }}>{formatDate(r.date)}</div>
                            <div style={{ textAlign: "center", fontWeight: winner === "A" ? 700 : 400, fontSize: 16, color: winner === "A" ? "var(--green-700)" : "var(--text-muted)" }}>{r.ptsA}</div>
                            <div style={{ textAlign: "center", fontWeight: winner === "B" ? 700 : 400, fontSize: 16, color: winner === "B" ? "var(--green-700)" : "var(--text-muted)" }}>{r.ptsB}</div>
                            <div style={{ textAlign: "center", fontSize: 16, fontWeight: 600, color: winner === "T" ? "var(--text-muted)" : winner === "A" ? "var(--green-700)" : "var(--gold-700)" }}>
                              {winner === "T" ? "TIE" : winner === "A" ? (gA.first_name[0] + (gA.last_name?.[0] || "")) : (gB.first_name[0] + (gB.last_name?.[0] || ""))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {(() => {
                      let wA = 0, wB = 0, ties = 0;
                      h2hShared.forEach((r: any) => { if (r.ptsA > r.ptsB) wA++; else if (r.ptsB > r.ptsA) wB++; else ties++; });
                      return (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
                          <div className="stat-card"><div className="stat-value" style={{ color: "var(--green-700)" }}>{wA}</div><div className="stat-label">{gA.first_name} wins</div></div>
                          <div className="stat-card"><div className="stat-value" style={{ color: "var(--gold-600)" }}>{wB}</div><div className="stat-label">{gB.first_name} wins</div></div>
                          <div className="stat-card"><div className="stat-value">{ties}</div><div className="stat-label">Ties</div></div>
                        </div>
                      );
                    })()}
                  </>
                )}
                {h2hShared.length < 3 && (
                  <div style={{ fontSize: 13, color: "var(--text-muted)", padding: "10px 12px", background: "var(--surface2)", borderRadius: "var(--radius-md)", marginBottom: 12 }}>
                    ℹ️ {h2hShared.length} shared event{h2hShared.length !== 1 ? "s" : ""} on record. H2H blending activates at 3+ shared events -- using projection model only.
                  </div>
                )}

                {/* ── Hole-by-Hole Odds ── */}
                {holeAvgA && holeAvgB && holeAvgA.length === 18 && (
                  <div style={{ marginBottom: 16 }}>
                    <div className="card-title" style={{ marginBottom: 4 }}>
                      Hole-by-Hole Edge
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
                      {hasRealHbh
                        ? "Uses actual hole-by-hole scores where available, estimated from totals otherwise."
                        : "Estimated from total Stableford scores -- weighted by hole difficulty (stroke index)."
                      } Decay weight d=0.85/event, most recent first.
                    </div>

                    {/* Front 9 */}
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>Front 9</div>
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 340 }}>
                          <thead>
                            <tr style={{ background: "var(--green-900)" }}>
                              <th style={{ padding: "6px 8px", fontSize: 11, fontWeight: 700, color: "var(--gold-300)", textAlign: "left", width: 70 }}>Hole</th>
                              {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(h => (
                                <th key={h} style={{ padding: "6px 4px", fontSize: 12, fontWeight: 700, color: "var(--gold-300)", textAlign: "center", minWidth: 32 }}>
                                  {h + 1}
                                  {h2hCourse && <div style={{ fontSize: 9, opacity: 0.7, fontWeight: 400 }}>P{h2hCourse.hole_pars[h]}</div>}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {[{ label: gA?.first_name, avgs: holeAvgA, color: "var(--gold-700)" }, { label: gB?.first_name, avgs: holeAvgB, color: "var(--green-700)" }].map((row: any) => (
                              <tr key={row.label} style={{ borderBottom: "1px solid var(--border)" }}>
                                <td style={{ padding: "7px 8px", fontWeight: 700, fontSize: 13, color: row.color }}>{row.label}</td>
                                {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((h: number) => {
                                  const mine = row.avgs[h];
                                  const other = row.label === gA?.first_name ? holeAvgB[h] : holeAvgA[h];
                                  const edge = mine - other;
                                  const bg = edge > 0.15 ? "rgba(26,115,64,0.15)" : edge < -0.15 ? "rgba(192,32,32,0.08)" : "transparent";
                                  return (
                                    <td key={h} style={{ padding: "7px 4px", textAlign: "center", background: bg, fontSize: 13, fontWeight: edge > 0.15 || edge < -0.15 ? 700 : 400, color: edge > 0.15 ? "var(--green-700)" : edge < -0.15 ? "var(--red-600)" : "var(--text-primary)" }}>
                                      {mine.toFixed(1)}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                            <tr style={{ background: "var(--surface2)" }}>
                              <td style={{ padding: "5px 8px", fontSize: 11, fontWeight: 700, color: "var(--text-muted)" }}>Edge</td>
                              {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((h: number) => {
                                const diff = holeAvgA[h] - holeAvgB[h];
                                const favA = diff > 0.05;
                                const favB = diff < -0.05;
                                return (
                                  <td key={h} style={{ padding: "5px 4px", textAlign: "center", fontSize: 11, fontWeight: 700, color: favA ? "var(--green-700)" : favB ? "var(--gold-700)" : "var(--text-muted)" }}>
                                    {Math.abs(diff) < 0.05 ? "--" : favA ? (gA?.first_name[0] + (gA?.last_name?.[0] || "")) : (gB?.first_name[0] + (gB?.last_name?.[0] || ""))}
                                  </td>
                                );
                              })}
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Back 9 */}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>Back 9</div>
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 340 }}>
                          <thead>
                            <tr style={{ background: "var(--green-900)" }}>
                              <th style={{ padding: "6px 8px", fontSize: 11, fontWeight: 700, color: "var(--gold-300)", textAlign: "left", width: 70 }}>Hole</th>
                              {[9, 10, 11, 12, 13, 14, 15, 16, 17].map(h => (
                                <th key={h} style={{ padding: "6px 4px", fontSize: 12, fontWeight: 700, color: "var(--gold-300)", textAlign: "center", minWidth: 32 }}>
                                  {h + 1}
                                  {h2hCourse && <div style={{ fontSize: 9, opacity: 0.7, fontWeight: 400 }}>P{h2hCourse.hole_pars[h]}</div>}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {[{ label: gA?.first_name, avgs: holeAvgA, color: "var(--gold-700)" }, { label: gB?.first_name, avgs: holeAvgB, color: "var(--green-700)" }].map((row: any) => (
                              <tr key={row.label} style={{ borderBottom: "1px solid var(--border)" }}>
                                <td style={{ padding: "7px 8px", fontWeight: 700, fontSize: 13, color: row.color }}>{row.label}</td>
                                {[9, 10, 11, 12, 13, 14, 15, 16, 17].map((h: number) => {
                                  const mine = row.avgs[h];
                                  const other = row.label === gA?.first_name ? holeAvgB[h] : holeAvgA[h];
                                  const edge = mine - other;
                                  const bg = edge > 0.15 ? "rgba(26,115,64,0.15)" : edge < -0.15 ? "rgba(192,32,32,0.08)" : "transparent";
                                  return (
                                    <td key={h} style={{ padding: "7px 4px", textAlign: "center", background: bg, fontSize: 13, fontWeight: edge > 0.15 || edge < -0.15 ? 700 : 400, color: edge > 0.15 ? "var(--green-700)" : edge < -0.15 ? "var(--red-600)" : "var(--text-primary)" }}>
                                      {mine.toFixed(1)}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                            <tr style={{ background: "var(--surface2)" }}>
                              <td style={{ padding: "5px 8px", fontSize: 11, fontWeight: 700, color: "var(--text-muted)" }}>Edge</td>
                              {[9, 10, 11, 12, 13, 14, 15, 16, 17].map((h: number) => {
                                const diff = holeAvgA[h] - holeAvgB[h];
                                const favA = diff > 0.05;
                                const favB = diff < -0.05;
                                return (
                                  <td key={h} style={{ padding: "5px 4px", textAlign: "center", fontSize: 11, fontWeight: 700, color: favA ? "var(--green-700)" : favB ? "var(--gold-700)" : "var(--text-muted)" }}>
                                    {Math.abs(diff) < 0.05 ? "--" : favA ? (gA?.first_name[0] + (gA?.last_name?.[0] || "")) : (gB?.first_name[0] + (gB?.last_name?.[0] || ""))}
                                  </td>
                                );
                              })}
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Summary: holes won each */}
                    {(() => {
                      const aWins = holeAvgA.filter((_: number, i: number) => holeAvgA[i] - holeAvgB[i] > 0.05).length;
                      const bWins = holeAvgA.filter((_: number, i: number) => holeAvgB[i] - holeAvgA[i] > 0.05).length;
                      const even = 18 - aWins - bWins;
                      return (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                          <div style={{ background: "var(--gold-50)", border: "1px solid var(--gold-200)", borderRadius: "var(--radius-md)", padding: "10px", textAlign: "center", boxShadow: "var(--shadow-sm)" }}>
                            <div style={{ fontSize: 22, fontWeight: 700, color: "var(--gold-700)" }}>{aWins}</div>
                            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{gA?.first_name} holes</div>
                          </div>
                          <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "10px", textAlign: "center", boxShadow: "var(--shadow-sm)" }}>
                            <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text-muted)" }}>{even}</div>
                            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Even</div>
                          </div>
                          <div style={{ background: "var(--green-50)", border: "1px solid var(--green-200)", borderRadius: "var(--radius-md)", padding: "10px", textAlign: "center", boxShadow: "var(--shadow-sm)" }}>
                            <div style={{ fontSize: 22, fontWeight: 700, color: "var(--green-700)" }}>{bWins}</div>
                            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{gB?.first_name} holes</div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
                {(!holeAvgA || !holeAvgB) && h2hShared.length === 0 && (
                  <div style={{ fontSize: 13, color: "var(--text-muted)", padding: "10px 12px", background: "var(--surface2)", borderRadius: "var(--radius-md)", marginBottom: 12 }}>
                    No shared events yet -- hole-by-hole breakdown requires at least 1 shared event.
                  </div>
                )}

                <div style={{ padding: "12px 14px", background: "var(--surface2)", borderRadius: "var(--radius-md)", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
                  <strong style={{ color: "var(--text-secondary)" }}>H2H methodology:</strong> Win probability blends {MC_TRIALS.toLocaleString()}-trial Monte Carlo (60%) with decay-weighted head-to-head record (40%, d=0.85/event). Spread = projected score differential. Spread line uses standard -110 vig. Hole-by-hole: actual HxH data used where available, otherwise estimates pts distribution via stroke-index difficulty weighting.
                </div>
              </div>
            );
          })()}

          {(!gA || !gB) && (
            <div className="empty-state"><div className="empty-text">Select two golfers to see head-to-head odds</div></div>
          )}
          {gA && gB && (!profA || !profB) && (
            <div className="empty-state"><div className="empty-text">One or both golfers have no scoring history -- can't calculate odds yet</div></div>
          )}
        </div>
      )}
    </div>
  );
}