import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../lib/supabaseClient";
import { formatDate } from "../../lib/formatters";
import { toAmericanOdds, applyVig, pickBestH2H } from "../../lib/monteCarlo";

// ============================================================
// TONY.AI -- Golf betting savant insight component
//
// Uses Gemini 2.0 Flash (free tier: 1,500 req/day, 1M tok/day)
// Requires VITE_GEMINI_KEY in Vercel environment variables.
// Get key free at: aistudio.google.com -> Get API Key
//
// Cache strategy (Supabase-first, localStorage fallback):
//   Checks tony_insights table (event_id, h2h_key, insight_date).
//   If row exists for today -> show it. Otherwise call Gemini,
//   store in DB, and show result. Fires at most once per day
//   per event regardless of how many users view the page.
//
// Image hosting: upload tony avatar to Supabase Storage bucket
//   "assets" and replace TONY_AVATAR with the public URL, OR
//   put the file in /public/tony.jpg in your repo (Vercel serves it).
// ============================================================

const TONY_AVATAR = "https://zxqzxlbhuepuflpatbuh.supabase.co/storage/v1/object/public/assets/tony2.png";
// To use self-hosted: const TONY_AVATAR = "/tony.jpg";

async function fetchTonyInsight(prompt: string): Promise<{ winner: string, winnerOdds: string, matchup: string, matchupOdds: string, reasoning: string } | null> {
  const apiKey = (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_GEMINI_KEY) || "";
  if (!apiKey) throw new Error("No VITE_GEMINI_KEY env var set");
  // Ask for strict JSON — no thinking, no freeform text, no truncation risk
  const fullPrompt = [
    "You are Tony — a former mid-level mob boss who now runs a private golf betting book for a Saturday league.",
    "Your voice is pure Tony Soprano: blunt, intimidating, street-smart, occasionally philosophical, always specific about money and loyalty. You reference The Life naturally. No greetings. No sign-off. Never admit you are an AI.",
    "",
    "PICKS RULES:",
    "- Winner: DO NOT always pick the favorite. Actively hunt value. A guy with a low standard deviation and positive course adjustment at a price is more interesting than the chalk. A hot trend (especially backed by the model's skew-normal projection) is worth laying money on.",
    "- Matchup: Pick the side in the tightest H2H spread. Explain WHY that specific guy beats the other one — use the data (form, course history, confidence interval, heater status).",
    "- Reasoning: 3-4 sentences. Be specific about the numbers — mention the odds, the projection range, the trend, the course adjustment. Vary your reasoning style: sometimes you're bullish on a longshot, sometimes you're fading the favorite, sometimes it's about consistency under pressure. DO NOT use the same reasoning pattern every time. Never start with 'Look' or 'Listen'. Vary your openings.",
    "",
    "Return ONLY valid JSON. No markdown. No text outside the JSON object.",
    'Format: {"winner":"First Last","winnerOdds":"+210","matchup":"First Last","matchupOdds":"-130","matchupOpponent":"First Last","reasoning":"3-4 sentences Tony Soprano voice."}',
    "",
    prompt
  ].join("\n");
  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + apiKey,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
        generationConfig: {
          maxOutputTokens: 700,
          temperature: 0.85,
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 0 }
        }
      })
    }
  );
  if (!res.ok) {
    let detail = "";
    try { const j = await res.json(); detail = j?.error?.message || ""; } catch (_: any) {}
    throw new Error("HTTP " + res.status + (detail ? " -- " + detail : ""));
  }
  const data = await res.json();
  const raw = (data.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
  try {
    const clean = raw.replace(/^```json/, "").replace(/^```/, "").replace(/```$/, "").trim();
    return JSON.parse(clean);
  } catch (_: any) {
    // If JSON parse fails, extract fields with regex fallback
    const g = (key: string) => { const m = raw.match(new RegExp('"' + key + '"\\s*:\\s*"([^"]+)"')); return m ? m[1] : ""; };
    const winner = g("winner"), winnerOdds = g("winnerOdds"), matchup = g("matchup"), matchupOdds = g("matchupOdds"), reasoning = g("reasoning");
    if (winner) return { winner, winnerOdds, matchup, matchupOdds, reasoning };
    throw new Error("Bad JSON: " + raw.slice(0, 80));
  }
}

export function TonyInsight({ ranked, selEventId, selEvent, fieldConfirmed, hasBackend, leaderboard, events, signups, golfers, courseName, hideRecord }: any) {
  type TonyPick = { winner: string, winnerOdds: string, matchup: string, matchupOdds: string, matchupOpponent?: string, reasoning: string };
  const [pick, setPick] = useState<TonyPick | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [imgErr, setImgErr] = useState(false);
  const [record, setRecord] = useState<{ wins: number, losses: number, pushes: number, rows: any[] } | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // today in PST (America/Los_Angeles) — never derived from UTC toISOString()
  // which would tick over to the next calendar day at 5pm PST, causing Tony
  // to see a cache miss and re-fire his analysis mid-afternoon.
  // useMemo keeps the value stable across re-renders so it never appears as a
  // changed dependency and triggers the effect twice in the same day.
  const today = useMemo(() => {
    return new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
    // en-CA locale produces YYYY-MM-DD format natively
  }, []);
  const cacheKey = "field";

  // Build a rich prompt using all available data — backend model data when
  // field is confirmed, client projections otherwise.
  const buildPrompt = (): string => {
    const eventLabel = selEvent ? (selEvent.course_name + " on " + selEvent.date) : "Unknown event";
    const fieldLines = ranked.map((r: any) => {
      const name = r.golfer.first_name + " " + r.golfer.last_name;
      const odds = r.oddsAmerican ?? toAmericanOdds(applyVig(r.prob));
      const proj = r.projMean ?? r.proj;
      const ci = r.projLow != null && r.projHigh != null ? " (range " + r.projLow + "-" + r.projHigh + " pts)" : "";
      const trend = r.trend > 0.1 ? " TRENDING UP" : r.trend < -0.1 ? " TRENDING DOWN" : "";
      const heater = r.heaterActive ? " HOT STREAK" : "";
      const form = r.rounds > 0 ? " " + r.rounds + " rds avg " + r.wAvg + "pts" : " (new)";
      const cAdj = r.cAdj && Math.abs(r.cAdj) > 0.3 ? " course adj " + (r.cAdj > 0 ? "+" : "") + r.cAdj.toFixed(1) : "";
      const consistency = r.sd ? " stddev " + r.sd : "";
      const guestNote = r.isGuestEstimate ? " [GUEST - estimated odds]" : "";
      return name + ": " + odds + " | proj " + proj + "pts" + ci + form + cAdj + " " + consistency + trend + heater + guestNote;
    }).join("\n");
    // Use real H2H odds (same model as the H2H tab) instead of field-share approximation
    const h2h = pickBestH2H(ranked, leaderboard, events, signups, golfers, courseName || "");
    const h2hLine = h2h ? "\nTightest matchup (H2H model): " + h2h.nameA + " " + h2h.oddsA + " vs " + h2h.nameB + " " + h2h.oddsB + ", spread " + h2h.spread : "";
    const modelNote = hasBackend
      ? "Model: Supabase backend (10,000-trial Monte Carlo, per-hole baselines, Glicko-2). Field confirmed."
      : "Model: client-side projection (decay-weighted average, course and HCP adjustments).";
    return "Event: " + eventLabel + "\n" + modelNote + "\n\nFull field:\n" + fieldLines + h2hLine;
  };

  // ── Load Win/Loss/Push record ──────────────────────────────────
  // Matches tony_insights rows (insight_date = event date) against completed events.
  // A pick is evaluated using the insight stored ON the day of the event.
  useEffect(() => {
    const loadRecord = async () => {
      try {
        // Fetch all tony insights (field picks only)
        const insightRows = await supabase.from("tony_insights").select("*", "&h2h_key=eq.field");
        if (!insightRows || !insightRows.length) { setRecord({ wins: 0, losses: 0, pushes: 0, rows: [] }); return; }
        // Map event date → event
        const evByDate: Record<string, any> = {};
        (events ?? []).forEach((e: any) => { if (e.date) evByDate[e.date] = e; });
        // Fetch leaderboard for completed events
        const completedEids = new Set((events ?? []).filter((e: any) => e.status === "Completed").map((e: any) => e.event_id));
        const rows: any[] = [];
        let wins = 0, losses = 0, pushes = 0;
        for (const ins of insightRows) {
          // Only grade picks where insight_date matches the event date
          const ev = evByDate[ins.insight_date];
          if (!ev || !completedEids.has(ev.event_id)) continue;
          let pick_: TonyPick | null = null;
          try { pick_ = JSON.parse(ins.insight_text); } catch (_: any) { continue; }
          if (!pick_) continue;
          // Grade winner pick: find actual winner of the event
          const evLb = (leaderboard ?? [])
            .filter((r: any) => r.event_id === ev.event_id)
            .sort((a: any, b: any) => b.total_stableford_points - a.total_stableford_points);
          const maxPts = evLb[0]?.total_stableford_points;
          if (maxPts == null) continue;
          const winners = evLb.filter((r: any) => r.total_stableford_points === maxPts).map((r: any) => {
            const g = (golfers ?? []).find((gg: any) => gg.golfer_id === r.golfer_id);
            return g ? `${g.first_name} ${g.last_name}` : "";
          }).filter(Boolean);
          // Grade matchup pick: find which of the two scored more
          let matchupResult: "W" | "L" | "P" | "N/A" = "N/A";
          if (pick_.matchup && pick_.matchupOpponent) {
            const findPts = (name: string) => {
              const [fn, ...rest] = name.trim().split(" ");
              const ln = rest.join(" ");
              const g = (golfers ?? []).find((gg: any) => gg.first_name === fn && gg.last_name === ln);
              if (!g) return null;
              const r = evLb.find((lb: any) => lb.golfer_id === g.golfer_id);
              return r?.total_stableford_points ?? null;
            };
            const ptsA = findPts(pick_.matchup);
            const ptsB = findPts(pick_.matchupOpponent);
            if (ptsA != null && ptsB != null) {
              if (ptsA > ptsB) matchupResult = "W";
              else if (ptsB > ptsA) matchupResult = "L";
              else matchupResult = "P";
            }
          }
          // Overall winner pick: W if correct, P if tied for win, L otherwise
          const pickedName = (pick_.winner || "").trim();
          let winnerResult: "W" | "L" | "P" = "L";
          if (winners.includes(pickedName)) winnerResult = winners.length > 1 ? "P" : "W";
          if (winnerResult === "W") wins++;
          else if (winnerResult === "P") pushes++;
          else losses++;
          // H2H matchup pick: also counts toward overall W/L/P tally
          if (matchupResult === "W") wins++;
          else if (matchupResult === "P") pushes++;
          else if (matchupResult === "L") losses++;
          // (matchupResult==="N/A" means one player couldn't be found — skip)
          // Compute picked winner's actual finish position (ties share the same position)
          const [fn, ...rest] = pickedName.split(" ");
          const ln = rest.join(" ");
          const pickedGolfer = (golfers ?? []).find((gg: any) => gg.first_name === fn && gg.last_name === ln);
          let pickedFinish = "–";
          if (pickedGolfer) {
            const pickedLbRow = evLb.find((r: any) => r.golfer_id === pickedGolfer.golfer_id);
            if (pickedLbRow) {
              // Finish position = number of players with strictly more points + 1
              const pos = evLb.filter((r: any) => r.total_stableford_points > pickedLbRow.total_stableford_points).length + 1;
              const tied = evLb.filter((r: any) => r.total_stableford_points === pickedLbRow.total_stableford_points).length > 1;
              pickedFinish = (tied ? "T" : "") + pos;
            }
          }
          rows.push({
            date: ins.insight_date,
            course: ev.course_name,
            pickedWinner: pickedName,
            pickedFinish,
            winnerOdds: pick_.winnerOdds,
            matchupPick: pick_.matchup,
            matchupOpp: pick_.matchupOpponent || "",
            matchupOdds: pick_.matchupOdds,
            winnerResult,
            matchupResult,
          });
        }
        rows.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setRecord({ wins, losses, pushes, rows });
      } catch (e: any) {
        // fail silently — record not critical
        setRecord({ wins: 0, losses: 0, pushes: 0, rows: [] });
      }
    };
    if (!hideRecord && leaderboard && events && golfers) loadRecord();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaderboard, events, golfers]);

  useEffect(() => {
    // Only fire Tony when the field is confirmed AND backend odds are loaded.
    // This prevents Tony from analysing off client-side MC while the backend
    // model is still computing (first 1-2 mins after pairings are set).
    if (!fieldConfirmed || !hasBackend || !ranked.length || !selEventId) return;
    const eid = parseInt(selEventId);
    if (!eid) return;

    const checkAndGenerate = async () => {
      // 1. Check Supabase cache — one call per event per day
      try {
        const q = "&event_id=eq." + eid + "&h2h_key=eq." + cacheKey + "&insight_date=eq." + today;
        const rows = await supabase.from("tony_insights").select("insight_text", q);
        if (rows && rows[0]) {
          try { setPick(JSON.parse(rows[0].insight_text)); return; } catch (_: any) {}
        }
      } catch (_: any) {}

      // 2. Call Gemini with the full enriched prompt
      setLoading(true); setErrMsg(null);
      try {
        const result = await fetchTonyInsight(buildPrompt());
        if (!result) throw new Error("Empty response");
        setPick(result);
        // 3. Cache result so Tony doesn't regenerate on every page load
        try {
          await supabase.from("tony_insights").upsert(
            { event_id: eid, h2h_key: cacheKey, insight_date: today, insight_text: JSON.stringify(result) },
            "event_id,h2h_key,insight_date"
          );
        } catch (_: any) {}
      } catch (e: any) {
        setErrMsg((e?.message || String(e)).slice(0, 200));
      } finally {
        setLoading(false);
      }
    };
    checkAndGenerate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selEventId, fieldConfirmed, hasBackend]);

  if (!ranked.length) return null;

  const isFav = (odds: string) => odds.startsWith("-");

  return (
    <div>
    <div style={{ marginTop: 18, background: "linear-gradient(135deg,#0f1f14,#1a2f1e)", borderRadius: "var(--radius-md)", border: "1.5px solid rgba(196,120,0,0.4)", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0px 14px", borderBottom: "1px solid rgba(196,120,0,0.2)", background: "rgba(0,0,0,0.3)" }}>
        <div style={{ flexShrink: 0 }}>
          {imgErr
            ? <div style={{ width: 110, height: 80, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>🎯</div>
            : <img src={TONY_AVATAR} alt="Tony.ai"
                style={{ width: 110, height: 80, objectFit: "contain", display: "block"
                  }}
                onError={() => setImgErr(true)} />
          }
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--gold-300)", letterSpacing: "0.05em", marginLeft: -15 }}>TONY.AI</div>

        </div>
        <div style={{ marginLeft: "auto", fontSize: 13, color: "rgba(255,255,255,0.28)", textAlign: "right" }}>
          {today}<br />
        </div>
      </div>

      {/* Holding message — field not yet confirmed */}
      {!fieldConfirmed && (
        <div style={{ padding: "14px 16px", textAlign: "left", fontSize: 13, color: "rgba(255,255,255,0.65)", lineHeight: 1.7, fontStyle: "italic" }}>
          Come back when the field is set — then you can bank on what I'm tellin' ya. Until then, you're on your own, capisce?
        </div>
      )}

      {/* Waiting for backend model — field confirmed but odds still computing */}
      {fieldConfirmed && !hasBackend && !pick && !loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", color: "rgba(255,255,255,0.5)", fontSize: 13 }}>
          <div style={{ width: 14, height: 14, border: "2px solid rgba(196,120,0,0.4)", borderTopColor: "var(--gold-400)", borderRadius: "50%", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
          Running the numbers on the confirmed field... I'll have my picks ready in a minute.
        </div>
      )}

      {/* Loading — Gemini is generating */}
      {fieldConfirmed && hasBackend && loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px", color: "rgba(255,255,255,0.5)", fontSize: 13 }}>
          <div style={{ width: 14, height: 14, border: "2px solid rgba(196,120,0,0.4)", borderTopColor: "var(--gold-400)", borderRadius: "50%", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
          Studying the numbers...
        </div>
      )}

      {/* Error */}
      {!loading && errMsg && (
        <div style={{ padding: "12px 16px", fontSize: 12, color: "#f87171", fontFamily: "monospace", background: "rgba(255,0,0,0.07)" }}>
          Tony.ai error: {errMsg}
        </div>
      )}

      {/* Picks */}
      {!loading && pick && (
        <>
          {/* Pick rows */}
          <div style={{ padding: "12px 16px 0" }}>
            {/* Row 1 — Overall winner */}
            <div style={{ display: "grid", gridTemplateColumns: "80px 1fr auto", alignItems: "center", gap: 8, padding: "10px 12px", background: "rgba(196,120,0,0.1)", borderRadius: 8, marginBottom: 8, border: "1px solid rgba(196,120,0,0.25)" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--gold-400)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Overall
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "white" }}>{pick.winner}</div>
              <div style={{
                fontSize: 16, fontWeight: 800,
                color: isFav(pick.winnerOdds) ? "var(--gold-300)" : "var(--green-300)",
                fontVariantNumeric: "tabular-nums", textAlign: "right"
              }}>{pick.winnerOdds}</div>
            </div>
            {/* Row 2 — Matchup pick */}
            <div style={{ display: "grid", gridTemplateColumns: "80px 1fr auto", alignItems: "center", gap: 8, padding: "10px 12px", background: "rgba(26,115,64,0.12)", borderRadius: 8, marginBottom: 12, border: "1px solid rgba(26,115,64,0.3)" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--green-400)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                H2H Matchup
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "white" }}>{pick.matchup}</div>
                {pick.matchupOpponent && (
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2, fontStyle: "italic" }}>
                    vs. {pick.matchupOpponent}
                  </div>
                )}
              </div>
              <div style={{
                fontSize: 16, fontWeight: 800,
                color: isFav(pick.matchupOdds) ? "var(--gold-300)" : "var(--green-300)",
                fontVariantNumeric: "tabular-nums", textAlign: "right"
              }}>{pick.matchupOdds}</div>
            </div>
          </div>
          {/* Reasoning */}
          <div style={{ padding: "0 16px 14px", fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.6, fontStyle: "italic", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 10 }}>
            {pick.reasoning}
          </div>
        </>
      )}
    </div>

    {/* ── Tony.AI Historical Record ───────────────────────────── */}
    {!hideRecord && record && (record.wins + record.losses + record.pushes > 0) && (
      <div style={{ marginTop: 14, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
        {/* Record header — tap to expand/collapse history */}
        <div
          onClick={() => setShowHistory(h => !h)}
          style={{ background: "var(--green-900)", padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--gold-300)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Tony.AI Record</div>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{showHistory ? "▲" : "▼"}</span>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: "var(--green-300)" }}>{record.wins}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", letterSpacing: "0.08em", textTransform: "uppercase" }}>W</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#f87171" }}>{record.losses}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", letterSpacing: "0.08em", textTransform: "uppercase" }}>L</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: "rgba(255,255,255,0.55)" }}>{record.pushes}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", letterSpacing: "0.08em", textTransform: "uppercase" }}>P</div>
            </div>
            <div style={{ textAlign: "center", paddingLeft: 8, borderLeft: "1px solid rgba(255,255,255,0.12)" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--gold-300)" }}>
                {record.wins + record.losses + record.pushes > 0
                  ? Math.round(record.wins / (record.wins + record.losses + record.pushes) * 100) + "%"
                  : "–"}
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Win%</div>
            </div>
          </div>
        </div>
        {/* Per-event rows — revealed on tap */}
        {showHistory && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "var(--surface2)" }}>
                <th style={{ padding: "7px 10px", textAlign: "left", color: "var(--text-muted)", fontWeight: 600, whiteSpace: "nowrap" }}>Date</th>
                <th style={{ padding: "7px 8px", textAlign: "center", color: "var(--text-muted)", fontWeight: 600 }}>Picked Winner</th>
                <th style={{ padding: "7px 8px", textAlign: "center", color: "var(--text-muted)", fontWeight: 600 }}>Actual Finish</th>
                <th style={{ padding: "7px 8px", textAlign: "center", color: "var(--text-muted)", fontWeight: 600 }}>Result</th>
                <th style={{ padding: "7px 8px", textAlign: "left", color: "var(--text-muted)", fontWeight: 600 }}>H2H Pick</th>
                <th style={{ padding: "7px 8px", textAlign: "center", color: "var(--text-muted)", fontWeight: 600 }}>H2H</th>
              </tr>
            </thead>
            <tbody>
              {record.rows.map((row: any, i: number) => {
                const wColor = (r: "W" | "L" | "P" | "N/A") => r === "W" ? "var(--green-700)" : r === "L" ? "var(--red-600)" : r === "P" ? "var(--text-muted)" : "var(--text-muted)";
                return (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border)", background: i % 2 === 1 ? "var(--surface2)" : "transparent" }}>
                    <td style={{ padding: "8px 10px", whiteSpace: "nowrap", color: "var(--text-muted)" }}>{formatDate(row.date)}</td>
                    <td style={{ padding: "8px 8px" }}>
                      <div style={{ fontWeight: 600 }}>{row.pickedWinner}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{row.winnerOdds}</div>
                    </td>
                    <td style={{ padding: "8px 8px", textAlign: "center" }}>
                      <span style={{ fontWeight: 700, fontSize: 15, color: row.winnerResult === "W" ? "var(--gold-300)" : row.winnerResult === "P" ? "var(--text-muted)" : "var(--text-secondary)" }}>{row.pickedFinish}</span>
                    </td>
                    <td style={{ padding: "8px 8px", textAlign: "center" }}>
                      <span style={{ fontWeight: 800, fontSize: 14, color: wColor(row.winnerResult) }}>{row.winnerResult}</span>
                    </td>
                    <td style={{ padding: "8px 8px" }}>
                      {row.matchupPick ? (
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{row.matchupPick}</div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>vs {row.matchupOpp} · {row.matchupOdds}</div>
                        </div>
                      ) : <span style={{ color: "var(--text-muted)" }}>–</span>}
                    </td>
                    <td style={{ padding: "8px 8px", textAlign: "center" }}>
                      {row.matchupResult !== "N/A" ? (
                        <span style={{ fontWeight: 800, fontSize: 14, color: wColor(row.matchupResult) }}>{row.matchupResult}</span>
                      ) : <span style={{ color: "var(--text-muted)" }}>–</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        )}
        {showHistory}
      </div>
    )}
    </div>
  );
}
