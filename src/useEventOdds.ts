// =============================================================
// useEventOdds.ts
// Drop-in React hook for Saturday School — replaces the
// client-side Monte Carlo with backend event_odds reads.
//
// HOW TO INTEGRATE:
//   1. Add this file to your src/ directory
//   2. In App.tsx, pass `eventOdds` and `oddsLoading` as props
//      to OddsTab (alongside the existing props)
//   3. Inside OddsTab, replace `calcFieldOdds(profiles)` calls
//      with the backend data below.  The fallback keeps working
//      if the backend hasn't run yet.
// =============================================================

import { useState, useEffect, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────

export interface PlayerOdds {
  golfer_id:            number;
  computed_at:          string;
  holes_complete:       number;
  simulation_type:      "pre_round" | "live" | "final";
  projected_final_mean: number;
  projected_final_low:  number;
  projected_final_high: number;
  points_so_far:        number | null;
  win_probability:      number;
  top3_probability:     number;
  top5_probability:     number;
  win_odds_american:    string;
  heater_active:        boolean;
  heater_magnitude:     number | null;
}

// ── Hook ──────────────────────────────────────────────────────

export function useEventOdds(
  supabase: any,
  eventId: number | null,
  isLive: boolean          // true when event status === "In-Progress"
): {
  odds:        PlayerOdds[];
  latestType:  string;
  loading:     boolean;
  lastUpdated: Date | null;
  trigger:     () => Promise<void>;
} {
  const [odds,        setOdds]        = useState<PlayerOdds[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Fetch the most recent snapshot for each player in the event
  const fetchOdds = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);

    try {
      // Get latest snapshot per player — prefer "live" if available, else "pre_round"
      const { data } = await supabase
        .from("event_odds")
        .select("*")
        .eq("event_id", eventId)
        .order("computed_at", { ascending: false });

      if (!data?.length) { setLoading(false); return; }

      // Keep the most recent row per golfer
      const latest: Record<number, PlayerOdds> = {};
      for (const row of data as PlayerOdds[]) {
        const existing = latest[row.golfer_id];
        if (!existing) {
          latest[row.golfer_id] = row;
        } else {
          // Prefer live over pre_round; within same type prefer newest
          const existingIsLive = existing.simulation_type === "live";
          const rowIsLive      = row.simulation_type === "live";
          if (rowIsLive && !existingIsLive) {
            latest[row.golfer_id] = row;
          } else if (rowIsLive === existingIsLive) {
            if (new Date(row.computed_at) > new Date(existing.computed_at)) {
              latest[row.golfer_id] = row;
            }
          }
        }
      }

      const result = Object.values(latest);
      setOdds(result);
      setLastUpdated(new Date());
    } catch (e) {
      console.error("useEventOdds fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, [supabase, eventId]);

  // Manually trigger a recalculation via the Edge Function
  const trigger = useCallback(async () => {
    if (!eventId) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const url   = (supabase.supabaseUrl || "").replace("/rest/v1", "") +
                    "/functions/v1/calculate-live-odds";
      await fetch(url, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ event_id: eventId }),
      });
      // Refetch after a short delay to allow the upsert to complete
      setTimeout(fetchOdds, 800);
    } catch (e) {
      console.error("trigger error:", e);
    }
  }, [supabase, eventId, fetchOdds]);

  // Initial load
  useEffect(() => { fetchOdds(); }, [fetchOdds]);

  // Poll every 30 s during live rounds
  useEffect(() => {
    if (!isLive) return;
    const id = setInterval(fetchOdds, 30_000);
    return () => clearInterval(id);
  }, [isLive, fetchOdds]);

  // Subscribe to real-time event_odds changes
  useEffect(() => {
    if (!eventId) return;
    const channel = supabase
      .channel(`event_odds_${eventId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table:  "event_odds",
        filter: `event_id=eq.${eventId}`,
      }, () => fetchOdds())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [supabase, eventId, fetchOdds]);

  const latestType = odds.length
    ? (odds.some(o => o.simulation_type === "live") ? "live" : "pre_round")
    : "none";

  return { odds, latestType, loading, lastUpdated, trigger };
}

// =============================================================
// INTEGRATION PATCH for OddsTab
// Copy the relevant sections below into your existing OddsTab
// component to wire up the backend odds.
// =============================================================

/*
──────────────────────────────────────────────────────────────
STEP 1: Add to OddsTab props signature

  function OddsTab({ ..., supabase, eventOdds, oddsLoading, oddsLastUpdated, onTriggerOdds }: any)

──────────────────────────────────────────────────────────────
STEP 2: Replace the existing `adjProbs` + `ranked` derivation

  // --- BEFORE (client-side MC) ---
  const adjProbs = profiles.length >= 2
    ? calcFieldOdds(profiles)
    : profiles.map(() => 1 / profiles.length);
  const ranked = [...profiles.map((p, i) => ({ ...p, prob: adjProbs[i] }))]
    .sort((a, b) => b.prob - a.prob);

  // --- AFTER (backend-driven, with client-side fallback) ---
  const backendMap: Record<number, PlayerOdds> = {};
  (eventOdds ?? []).forEach((o: PlayerOdds) => { backendMap[o.golfer_id] = o; });

  const ranked = (() => {
    const hasBackend = profiles.some((p: any) => backendMap[p.golfer.golfer_id]);

    if (hasBackend) {
      // Merge backend probabilities into profiles
      return [...profiles.map((p: any) => ({
        ...p,
        prob:              backendMap[p.golfer.golfer_id]?.win_probability  ?? 0,
        top3Prob:          backendMap[p.golfer.golfer_id]?.top3_probability ?? 0,
        top5Prob:          backendMap[p.golfer.golfer_id]?.top5_probability ?? 0,
        projMean:          backendMap[p.golfer.golfer_id]?.projected_final_mean,
        projLow:           backendMap[p.golfer.golfer_id]?.projected_final_low,
        projHigh:          backendMap[p.golfer.golfer_id]?.projected_final_high,
        oddsAmerican:      backendMap[p.golfer.golfer_id]?.win_odds_american,
        heaterActive:      backendMap[p.golfer.golfer_id]?.heater_active ?? false,
        heaterMagnitude:   backendMap[p.golfer.golfer_id]?.heater_magnitude,
        pointsSoFar:       backendMap[p.golfer.golfer_id]?.points_so_far,
        oddsSource:        "backend",
      }))].sort((a: any, b: any) => b.prob - a.prob);
    }

    // Fallback: client-side Monte Carlo (current logic)
    const adjProbs = calcFieldOdds(profiles);
    return [...profiles.map((p: any, i: number) => ({
      ...p,
      prob: adjProbs[i],
      oddsAmerican: toAmericanOdds(adjProbs[i]),
      oddsSource: "client",
    }))].sort((a: any, b: any) => b.prob - a.prob);
  })();

──────────────────────────────────────────────────────────────
STEP 3: Add a live indicator + refresh button above the table.
  Paste this JSX above the odds table (inside the "field" mode block):

  {selEvent?.status === "In-Progress" && (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "8px 12px", borderRadius: "var(--radius-md)",
      background: "var(--green-50)", border: "1px solid var(--green-200)",
      marginBottom: 12, fontSize: 13,
    }}>
      <span style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--green-800)" }}>
        <span style={{
          width: 8, height: 8, borderRadius: "50%",
          background: "var(--green-500)", display: "inline-block",
          animation: "livePulse 1.5s infinite",
        }}/>
        Live odds · {ranked.some((r: any) => r.oddsSource === "backend")
          ? (oddsLastUpdated ? `updated ${new Date(oddsLastUpdated).toLocaleTimeString()}` : "backend")
          : "client estimate"}
      </span>
      <button
        onClick={onTriggerOdds}
        disabled={oddsLoading}
        style={{
          background: "var(--green-700)", color: "white", border: "none",
          borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer",
        }}
      >
        {oddsLoading ? "…" : "↻ Refresh"}
      </button>
    </div>
  )}

──────────────────────────────────────────────────────────────
STEP 4: In each ranked row, show extra data when available:

  // Replace the existing odds string line:
  const odds = r.oddsAmerican ?? toAmericanOdds(r.prob);

  // And add a heater badge alongside the trend indicator:
  {r.heaterActive && (
    <span style={{
      fontSize: 10, fontWeight: 700,
      background: "var(--gold-100)", color: "var(--gold-800)",
      border: "1px solid var(--gold-300)", borderRadius: 10,
      padding: "1px 7px", marginLeft: 4,
    }}>
      🔥 +{((r.heaterMagnitude ?? 0) * 10).toFixed(1)}σ
    </span>
  )}

  // Confidence interval (when backend data is available):
  {r.projLow != null && r.projHigh != null && (
    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
      {r.projLow}–{r.projHigh} pts
    </span>
  )}

──────────────────────────────────────────────────────────────
STEP 5: Wire it all up in the parent App component

  // In App.tsx, near the other useEffect hooks:

  const selOddsEvent = events.find((e: any) =>
    e.status === "In-Progress" || e.status === "Pairings Set" || e.status === "Upcoming"
  );
  const {
    odds:          eventOdds,
    latestType:    oddsType,
    loading:       oddsLoading,
    lastUpdated:   oddsLastUpdated,
    trigger:       triggerOdds,
  } = useEventOdds(supabase, selOddsEvent?.event_id ?? null, selOddsEvent?.status === "In-Progress");

  // Then pass to AnalyticsTab → OddsTab:
  // eventOdds={eventOdds} oddsLoading={oddsLoading}
  // oddsLastUpdated={oddsLastUpdated} onTriggerOdds={triggerOdds}
  // supabase={supabase}
*/
