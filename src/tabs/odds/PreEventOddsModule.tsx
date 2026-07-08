import { useState, useRef, useLayoutEffect, useEffect, useMemo } from "react";
import { buildProfile, calcFieldOdds, toAmericanOdds, applyVig, h2hHistory, h2hWinProb, MC_TRIALS, randNorm } from "../../lib/monteCarlo";
import { TonyInsight } from "./TonyInsight";

// ── Odds chip ─────────────────────────────────────────────────────────────────
function OddsChip({ odds }: { odds: string }) {
  const isFav = odds.startsWith("-") && odds !== "N/A";
  return (
    <span style={{
      display: "inline-block",
      background: isFav ? "rgba(196,120,0,0.22)" : "rgba(255,255,255,0.1)",
      color: isFav ? "var(--gold-300)" : "var(--green-300)",
      border: `1px solid ${isFav ? "rgba(196,120,0,0.5)" : "rgba(255,255,255,0.18)"}`,
      borderRadius: 20,
      padding: "3px 10px",
      fontSize: 13,
      fontWeight: 700,
      letterSpacing: "0.01em",
      minWidth: 56,
      textAlign: "center",
      flexShrink: 0,
    }}>
      {odds}
    </span>
  );
}

// ── Chevron icon ──────────────────────────────────────────────────────────────
function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
      style={{ flexShrink: 0, transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}>
      <path d="M4 6L8 10L12 6" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Groups view ───────────────────────────────────────────────────────────────
function GroupsView({ signups, golfers, event, ranked }: any) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  // Groups are defined by tee time — group_num is not written to signups
  const eventSignups = signups.filter((s: any) => s.event_id === event?.event_id && s.attending === "Yes" && s.assigned_tee_time != null);
  const teeTimes = ([...new Set(eventSignups.map((s: any) => s.assigned_tee_time as string))] as string[]).sort();

  if (!teeTimes.length) return (
    <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, padding: "16px 0", textAlign: "center" }}>
      No groups assigned yet
    </div>
  );

  // Build a prob lookup from the full-field ranked array
  const probByGid: Record<number, number> = {};
  ranked.forEach((r: any) => { probByGid[r.golfer.golfer_id] = r.prob; });

  return (
    <div style={{ background: "var(--green-900)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "8px 20px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--gold-300)", letterSpacing: "0.07em", textTransform: "uppercase", textAlign: "left" }}>
          Group
        </div>
      </div>

      {teeTimes.map((teeTime, idx) => {
        const members = eventSignups.filter((s: any) => s.assigned_tee_time === teeTime);
        const memberGolfers = members
          .map((s: any) => golfers.find((g: any) => g.golfer_id === s.golfer_id))
          .filter(Boolean);
        const isOpen = openGroup === teeTime;

        // Within-group odds: run MC only among this group's players
        // using their field-level probs as relative weights (simple renormalization)
        const groupProbs = memberGolfers.map((g: any) => probByGid[g.golfer_id] ?? 0);
        const totalProb = groupProbs.reduce((a: number, b: number) => a + b, 0);
        const groupOddsMap: Record<number, string> = {};
        memberGolfers.forEach((g: any, i: number) => {
          const normalized = totalProb > 0 ? (groupProbs[i] as number) / totalProb : 1 / memberGolfers.length;
          groupOddsMap[g.golfer_id as number] = toAmericanOdds(applyVig(normalized));
        });
        // Sort group members by descending normalized prob
        const sortedMembers = [...memberGolfers].sort((a: any, b: any) => {
          const pa = totalProb > 0 ? ((probByGid[a.golfer_id as number] ?? 0) as number) / totalProb : 0;
          const pb = totalProb > 0 ? ((probByGid[b.golfer_id as number] ?? 0) as number) / totalProb : 0;
          return pb - pa;
        });

        // Build display names: show last initial if two players share a first name in the full event field
        const allEventFirstNames = eventSignups
          .map((s: any) => golfers.find((g: any) => g.golfer_id === s.golfer_id))
          .filter(Boolean)
          .map((g: any) => g.first_name as string);
        const firstNameCounts: Record<string, number> = {};
        allEventFirstNames.forEach((n: string) => { firstNameCounts[n] = (firstNameCounts[n] ?? 0) + 1; });

        const nameList = memberGolfers
          .map((g: any) => firstNameCounts[g.first_name] > 1 ? `${g.first_name} ${g.last_name.charAt(0)}.` : g.first_name)
          .join(" / ");

        return (
          <div key={teeTime} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            {/* Group row */}
            <div
              onClick={() => setOpenGroup(isOpen ? null : teeTime)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "12px 20px", cursor: "pointer", WebkitTapHighlightColor: "transparent",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.88)", flex: 1, minWidth: 0, marginRight: 10, textAlign: "left" }}>
                <span style={{ fontWeight: 700, color: "var(--gold-300)" }}>Group {idx + 1}</span>
                {" - "}
                <span style={{ color: "rgba(255,255,255,0.7)" }}>{nameList}</span>
              </div>
              <Chevron open={isOpen} />
            </div>

            {/* Drawer */}
            {isOpen && (
              <div style={{ padding: "0 14px 14px" }}>
                {sortedMembers.map((g: any) => (
                  <div key={g.golfer_id} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "8px 20px", borderBottom: "1px solid rgba(255,255,255,0.05)",
                  }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.88)" }}>
                      {g.first_name} {g.last_name}
                    </div>
                    <OddsChip odds={groupOddsMap[g.golfer_id] ?? "N/A"} />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Matchups view ─────────────────────────────────────────────────────────────
function MatchupsView({ ranked, golfers, leaderboard, events, signups, courseName }: any) {
  const [openGid, setOpenGid] = useState<number | null>(null);

  if (ranked.length < 2) return (
    <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, padding: "16px 0", textAlign: "center" }}>
      Not enough players for matchups
    </div>
  );

  // Cache H2H odds for the open golfer vs all others
  const getH2HOdds = (gidA: number): Record<number, string> => {
    const profA = ranked.find((r: any) => r.golfer.golfer_id === gidA);
    if (!profA) return {};
    const result: Record<number, string> = {};
    ranked.filter((r: any) => r.golfer.golfer_id !== gidA).forEach((r: any) => {
      const gidB = r.golfer.golfer_id;
      let winsA = 0;
      for (let t = 0; t < MC_TRIALS; t++) {
        const dA = randNorm(profA.proj, profA.sd);
        const dB = randNorm(r.proj, r.sd);
        if (dA > dB) winsA++;
        else if (dA === dB) winsA += 0.5;
      }
      const rawProbA = winsA / MC_TRIALS;
      const shared = h2hHistory(leaderboard, events, gidA, gidB);
      const finalProbA = h2hWinProb(shared, rawProbA);
      const adjA = applyVig(finalProbA);
      result[gidB] = toAmericanOdds(adjA);
    });
    return result;
  };

  // We compute H2H odds lazily when a row opens, cache in a ref-like way via state
  const [h2hCache, setH2hCache] = useState<Record<number, Record<number, string>>>({});

  const handleOpen = (gid: number) => {
    if (openGid === gid) { setOpenGid(null); return; }
    setOpenGid(gid);
    if (!h2hCache[gid]) {
      setH2hCache(prev => ({ ...prev, [gid]: getH2HOdds(gid) }));
    }
  };

  return (
    <div style={{ background: "var(--green-900)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "8px 20px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        <div style={{ fontSize: 11, textAlign: "left",fontWeight: 700, color: "var(--gold-300)", letterSpacing: "0.07em", textTransform: "uppercase" }}>
          Golfer
        </div>
      </div>

      {ranked.map((r: any) => {
        const gid = r.golfer.golfer_id;
        const isOpen = openGid === gid;
        const h2hOdds = h2hCache[gid] ?? {};

        // Sort opponents by most favorable odds for selected player (most negative = biggest fav)
        const opponents = ranked
          .filter((opp: any) => opp.golfer.golfer_id !== gid)
          .map((opp: any) => ({ ...opp, h2hOdds: h2hOdds[opp.golfer.golfer_id] ?? "..." }))
          .sort((a: any, b: any) => {
            const pa = parseFloat(a.h2hOdds) || 0;
            const pb = parseFloat(b.h2hOdds) || 0;
            return pa - pb; // most negative (favorite) first
          });

        return (
          <div key={gid} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            {/* Golfer row */}
            <div
              onClick={() => handleOpen(gid)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "14px 20px", cursor: "pointer", WebkitTapHighlightColor: "transparent",
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 500, color: "rgba(255,255,255,0.88)" }}>
                {r.golfer.first_name} {r.golfer.last_name}
              </div>
              <Chevron open={isOpen} />
            </div>

            {/* Drawer: H2H vs every opponent */}
            {isOpen && (
              <div style={{ padding: "0 14px 14px" }}>
                {opponents.map((opp: any) => (
                  <div key={opp.golfer.golfer_id} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "8px 20px", borderBottom: "1px solid rgba(255,255,255,0.05)",
                  }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.75)" }}>
                      {opp.golfer.first_name} {opp.golfer.last_name}
                    </div>
                    <OddsChip odds={opp.h2hOdds} />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Odds view nav ─────────────────────────────────────────────────────────────
function OddsViewNav({ view, setView, showGroups }: { view: string; setView: (v: any) => void; showGroups: boolean }) {
  const tabs = [
    { id: "field", label: "FIELD" },
    ...(showGroups ? [{ id: "groups", label: "GROUPS" }] : []),
    { id: "matchups", label: "MATCHUPS" },
  ];

  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [inkStyle, setInkStyle] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const idx = tabs.findIndex(t => t.id === view);
    const el = btnRefs.current[idx];
    if (!el) return;
    const parent = el.parentElement;
    if (!parent) return;
    const parentRect = parent.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    setInkStyle({ left: elRect.left - parentRect.left, width: elRect.width });
  }, [view, showGroups]);

  return (
    <div style={{ position: "relative", display: "flex", justifyContent: "center", gap: 24, marginBottom: 0, paddingBottom: 0 }}>
      {tabs.map((t, i) => (
        <button
          key={t.id}
          ref={el => { btnRefs.current[i] = el; }}
          onClick={() => setView(t.id)}
          style={{
            background: "none", border: "none", cursor: "pointer",
            padding: "0 4px 12px",
            fontSize: 13, fontWeight: 700,
            color: view === t.id ? "white" : "rgba(255,255,255,0.4)",
            WebkitTapHighlightColor: "transparent",
            transition: "color 0.2s",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          {t.label}
        </button>
      ))}
      {/* Track line */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        height: 1, background: "rgba(255,255,255,0.12)",
      }} />
      {/* Ink indicator */}
      {inkStyle && (
        <div style={{
          position: "absolute", bottom: 0,
          left: inkStyle.left,
          width: inkStyle.width,
          height: 2,
          background: "var(--gold-400)",
          borderRadius: 2,
          transition: "left 0.28s cubic-bezier(0.4,0,0.2,1), width 0.28s cubic-bezier(0.4,0,0.2,1)",
        }} />
      )}
    </div>
  );
}

// ── Pre-event odds module ─────────────────────────────────────────────────────
// Pre-event odds module: compact field-odds board + Tony.AI pick,
// used on the "Upcoming" leaderboard tab. Mirrors OddsTab's field-odds
// logic for a single fixed event (no event selector, no exclude toggles).
export function PreEventOddsModule({ golfers, leaderboard, events, signups, courses, holeScores, event, eventOdds, oddsLoading, oddsLastUpdated, onTriggerOdds }: any) {
  const [oddsView, setOddsView] = useState<"field" | "groups" | "matchups">("field");

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

  // Memoized: profile building + the Monte Carlo below are too heavy to re-run
  // on every parent re-render (this module lives inside the Upcoming tab).
  const allProfiles = useMemo(() => {
    const profiles = playingField
      .map((g: any) => buildProfile(g, leaderboard, events, signups, courseName, playingIds, playingField))
      .filter(Boolean) as any[];

    // Only use eventOdds to surface extra golfers when no confirmed field exists.
    // When signups/leaderboard define the field, eventOdds may belong to a different
    // event (App.tsx loads odds for the soonest event only) and must not add players.
    const lateAddGolferIds = allFieldIds.size === 0
      ? (eventOdds ?? []).map((o: any) => o.golfer_id).filter((gid: number) => !playingIds.has(gid))
      : [];
    const lateAddProfiles = lateAddGolferIds
      .map((gid: number) => golfers.find((g: any) => g.golfer_id === gid))
      .filter(Boolean)
      .map((g: any) => buildProfile(g, leaderboard, events, signups, courseName, playingIds, playingField))
      .filter(Boolean) as any[];
    return [...profiles, ...lateAddProfiles];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [golfers, leaderboard, events, signups, eventOdds, event?.event_id, courseName]);

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

  // Memoized: 5,000-trial MC per run — unmemoized it re-simulates (and visibly
  // jitters) on every parent re-render.
  const ranked = useMemo(() => {
    if (hasBackend) {
      const allMcProbs = allProfiles.length >= 2 ? calcFieldOdds(allProfiles) : allProfiles.map(() => 1 / allProfiles.length);
      return [...allProfiles.map((p: any, i: number) => {
        const bk = backendMap[p.golfer.golfer_id];
        if (bk) {
          return { ...p, prob: bk.win_probability ?? 0, projMean: bk.projected_final_mean, projLow: bk.projected_final_low, projHigh: bk.projected_final_high,
            oddsAmerican: bk.win_odds_american, heaterActive: bk.heater_active ?? false, heaterMag: bk.heater_magnitude, oddsSource: "backend" };
        }
        const mcProb = allMcProbs[i] ?? 0;
        return { ...p, prob: mcProb, projMean: p.proj, projLow: null, projHigh: null, oddsAmerican: toAmericanOdds(applyVig(mcProb)), heaterActive: false, heaterMag: null, oddsSource: "client" };
      })].sort((a: any, b: any) => b.prob - a.prob);
    }
    // prob stays fair (field sums to 100%); vig only shapes the payout odds.
    const rawProbs = allProfiles.length >= 2 ? calcFieldOdds(allProfiles) : allProfiles.map(() => 1 / allProfiles.length);
    return [...allProfiles.map((p: any, i: number) => ({ ...p, prob: rawProbs[i], oddsAmerican: toAmericanOdds(applyVig(rawProbs[i])), oddsSource: "client" }))].sort((a: any, b: any) => b.prob - a.prob);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allProfiles, eventOdds, hasBackend]);

  if (allProfiles.length < 2) return null;

  const pairingsSet = event?.status === "Pairings Set";
  const hasGroups = pairingsSet && signups.some((s: any) => s.event_id === event?.event_id && s.attending === "Yes" && s.assigned_tee_time != null);

  // ── Slide transition + skeleton ──────────────────────────────────────────────
  const tabOrder = ["field", ...(hasGroups ? ["groups"] : []), "matchups"];
  const prevViewRef = useRef(oddsView);
  const [displayView, setDisplayView] = useState(oddsView);
  const [slideDir, setSlideDir] = useState<"left" | "right">("right");
  const [phase, setPhase] = useState<"idle" | "skeleton" | "sliding">("idle");
  const contentRef = useRef<HTMLDivElement | null>(null);
  const lockedHeightRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (oddsView === displayView) return;
    const prevIdx = tabOrder.indexOf(prevViewRef.current);
    const nextIdx = tabOrder.indexOf(oddsView);
    setSlideDir(nextIdx > prevIdx ? "left" : "right");
    prevViewRef.current = oddsView;

    // Lock the container height so the page doesn't jump when content changes size
    if (contentRef.current) {
      lockedHeightRef.current = contentRef.current.getBoundingClientRect().height;
    }

    // Phase 1: show skeleton (holds height via locked min-height)
    setPhase("skeleton");
    if (timerRef.current != null) clearTimeout(timerRef.current);

    // After 180ms skeleton, swap in real content and play slide-in
    timerRef.current = window.setTimeout(() => {
      setDisplayView(oddsView);
      setPhase("sliding");
      lockedHeightRef.current = null;
      timerRef.current = window.setTimeout(() => setPhase("idle"), 320);
    }, 180);
  }, [oddsView]);

  useEffect(() => () => { if (timerRef.current != null) clearTimeout(timerRef.current); }, []);

  const slideIn = phase === "sliding" ? {
    animation: `odds-slide-${slideDir} 0.30s cubic-bezier(0.22,1,0.36,1) both`,
  } : {};

  // Skeleton rows
  const SkeletonRows = ({ count = 5 }: { count?: number }) => (
    <div style={{ padding: "8px 0" }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <div style={{ height: 14, borderRadius: 7, background: "rgba(255,255,255,0.08)", width: `${48 + (i % 3) * 14}%`, animation: "odds-shimmer 1.4s ease-in-out infinite", animationDelay: `${i * 0.07}s` }} />
          <div style={{ height: 28, width: 56, borderRadius: 14, background: "rgba(255,255,255,0.08)", animation: "odds-shimmer 1.4s ease-in-out infinite", animationDelay: `${i * 0.07 + 0.1}s` }} />
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ marginTop: 14 }}>
      <style>{`
        @keyframes odds-slide-left {
          from { opacity: 0; transform: translateX(18px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes odds-slide-right {
          from { opacity: 0; transform: translateX(-18px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes odds-shimmer {
          0%, 100% { opacity: 0.5; }
          50%       { opacity: 1; }
        }
      `}</style>
      <div className="card-title" style={{ marginBottom: 10 }}>Event Odds</div>

      {/* Odds view nav — rendered on dark background */}
      <div style={{ background: "var(--green-900)", borderRadius: "var(--radius-md)", overflow: "hidden", marginBottom: 4 }}>
        <div style={{ padding: "14px 14px 0" }}>
          <OddsViewNav view={oddsView} setView={(v) => {
            const mc = document.querySelector(".main-content") as HTMLElement | null;
            const saved = mc?.scrollTop ?? 0;
            setOddsView(v);
            requestAnimationFrame(() => { if (mc) mc.scrollTop = saved; });
          }} showGroups={hasGroups} />
        </div>

        {/* Animated content area */}
        <div ref={contentRef} style={{ marginTop: 12, minHeight: lockedHeightRef.current ?? undefined, ...slideIn }}>
          {phase === "skeleton" ? (
            <SkeletonRows count={displayView === "matchups" ? ranked.length : displayView === "groups" ? 3 : 5} />
          ) : displayView === "field" ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 60px 65px 60px", padding: "8px 20px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--gold-300)", letterSpacing: "0.07em", textAlign: "left", textTransform: "uppercase" }}>Golfer</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--gold-300)", letterSpacing: "0.07em", textTransform: "uppercase", textAlign: "center" }}>Proj</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--gold-300)", letterSpacing: "0.07em", textTransform: "uppercase", textAlign: "center" }}>Win %</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--gold-300)", letterSpacing: "0.07em", textTransform: "uppercase", textAlign: "right" }}>Odds</div>
              </div>
              {ranked.map((r: any, i: number) => {
                const rawOdds = r.oddsAmerican ?? toAmericanOdds(applyVig(r.prob));
                const odds = (r.prob === 0 || rawOdds === "N/A" || rawOdds === "EVEN") ? "N/A" : rawOdds;
                const isFav = i === 0;
                return (
                  <div key={r.golfer.golfer_id} style={{ display: "grid", gridTemplateColumns: "1fr 60px 65px 60px", padding: "11px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: isFav ? "rgba(196,120,0,0.12)" : "transparent", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 15, textAlign: "left", fontWeight: isFav ? 700 : 500, color: isFav ? "var(--gold-300)" : "rgba(255,255,255,0.88)" }}>
                        {r.golfer.first_name} {r.golfer.last_name}{isFav ? " 🏆" : ""}
                        {r.golfer.is_guest && <span style={{ fontSize: 10, fontWeight: 700, background: "rgba(196,120,0,0.25)", color: "var(--gold-300)", borderRadius: 4, padding: "1px 5px", marginLeft: 5 }}>guest</span>}
                      </div>
                      {r.projLow != null && r.projHigh != null && (
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", textAlign: "left", marginTop: 1 }}>{r.projLow}–{r.projHigh} pts</div>
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
            </>
          ) : displayView === "groups" && hasGroups ? (
            <GroupsView signups={signups} golfers={golfers} event={event} ranked={ranked} />
          ) : displayView === "matchups" ? (
            <MatchupsView
              ranked={ranked}
              golfers={golfers}
              leaderboard={leaderboard}
              events={events}
              signups={signups}
              courseName={courseName}
            />
          ) : null}
        </div>
      </div>

      {displayView === "field" && fieldConfirmed && phase === "idle" && (
        <TonyInsight ranked={ranked} selEventId={String(event?.event_id)} selEvent={event} fieldConfirmed={fieldConfirmed} hasBackend={hasBackend}
          leaderboard={leaderboard} events={events} signups={signups} golfers={golfers} courseName={courseName} hideRecord />
      )}
    </div>
  );
}
