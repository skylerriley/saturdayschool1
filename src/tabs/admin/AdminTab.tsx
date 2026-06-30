import { useState, useRef, useEffect } from "react";
import { SubTabPanel, FinanceView } from "../../App";
import { EventCreator } from "./EventCreator";
import { PairingDashboard } from "./PairingDashboard";
import { HandicapManager } from "./HandicapManager";
import { CourseHcpSheet } from "./CourseHcpSheet";
import { ScoreCorrection } from "./ScoreCorrection";
import { CourseManager } from "./CourseManager";
import { GolferRoster } from "./GolferRoster";
import { MessageBlast } from "./MessageBlast";
import { SUPABASE_URL, SUPABASE_KEY } from "../../lib/supabaseClient";

// BACKFILL UTILITY (one-time use after deploying the AI recap feature).
// Triggers generate-event-recap for all Completed events from 2026-05-13 forward
// that do not yet have ai_event_summary populated. Safe to run multiple times --
// the Edge Function is idempotent (skips already-generated events by default).
// Remove or hide this component once the initial backfill is complete.
function AiRecapBackfill({ events, showSuccess }: any) {
  const BACKFILL_CUTOFF = "2026-05-13";
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const targetEvents = [...events]
    .filter((e: any) => e.status === "Completed" && e.date >= BACKFILL_CUTOFF && !e.ai_event_summary)
    .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const run = async () => {
    if (running) return;
    setRunning(true);
    setLog([`Found ${targetEvents.length} event(s) to backfill...`]);
    for (let i = 0; i < targetEvents.length; i++) {
      const ev = targetEvents[i];
      setLog(prev => [...prev, `(${i + 1}/${targetEvents.length}) ${ev.date} ${ev.course_name}...`]);
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-event-recap`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + SUPABASE_KEY },
          body: JSON.stringify({ event_id: ev.event_id }),
        });
        const data = await res.json().catch(() => ({}));
        const msg = data.skipped ? "skipped (already done)" : data.error ? `error: ${data.error}` : "done";
        setLog(prev => [...prev.slice(0, -1), `(${i + 1}/${targetEvents.length}) ${ev.date} ${ev.course_name} -- ${msg}`]);
      } catch (err: any) {
        setLog(prev => [...prev.slice(0, -1), `(${i + 1}/${targetEvents.length}) ${ev.date} ${ev.course_name} -- fetch error: ${err.message}`]);
      }
      // Stagger calls to respect Gemini free-tier rate limits
      if (i < targetEvents.length - 1) {
        setLog(prev => [...prev, "Waiting 15s before next request (rate limit)..."]);
        await new Promise(r => setTimeout(r, 15000));
        setLog(prev => prev.filter(l => !l.startsWith("Waiting")));
      }
    }
    setLog(prev => [...prev, "Backfill complete."]);
    setRunning(false);
    showSuccess("AI recap backfill complete!");
  };

  return (
    <div style={{ marginTop: 24, padding: "16px", background: "var(--surface2)", borderRadius: "var(--radius-md)", border: "1px dashed var(--border)" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>AI Recap Backfill (one-time utility)</div>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 10, lineHeight: 1.5 }}>
        Generates AI recap for all Completed events from {BACKFILL_CUTOFF} forward that are missing one.
        Safe to re-run -- skips events already processed. Remove once backfill is done.
      </p>
      <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 8 }}>
        {targetEvents.length === 0 ? "No events need backfilling." : `${targetEvents.length} event(s) pending.`}
      </div>
      {targetEvents.length > 0 && (
        <button
          onClick={run}
          disabled={running}
          className="btn btn-outline"
          style={{ fontSize: 13, fontWeight: 700, opacity: running ? 0.6 : 1 }}
        >
          {running ? "Running..." : "Run Backfill"}
        </button>
      )}
      {log.length > 0 && (
        <div style={{ marginTop: 10, padding: "8px 10px", background: "var(--surface)", borderRadius: "var(--radius-sm)", fontSize: 12, fontFamily: "monospace", color: "var(--text-secondary)", maxHeight: 160, overflowY: "auto" }}>
          {log.map((line, i) => <div key={i}>{line}</div>)}
        </div>
      )}
    </div>
  );
}

export function AdminTab({ golfers, setGolfers, courses, setCourses, events, setEvents, signups, setSignups, leaderboard, setLeaderboard, holeScores, setHoleScores, dbUpsertLeaderboard, dbUpsertHoleScore, charityDonations, setCharityDonations, holeImages, setHoleImages, showSuccess, scrollToTop }: any) {
  const [subTab, setSubTab] = useState("events");
  const pillSentinelRef = useRef<HTMLDivElement|null>(null);
  const pillRowRef = useRef<HTMLDivElement|null>(null);
  useEffect(()=>{
    const sentinel = pillSentinelRef.current;
    if(!sentinel) return;
    const obs = new IntersectionObserver(([entry])=>{
      pillRowRef.current?.classList.toggle("stuck", !entry.isIntersecting);
    },{threshold:0,rootMargin:"0px"});
    obs.observe(sentinel);
    return()=>obs.disconnect();
  },[]);
  const ADMIN_TABS = [
    { id: "events" }, { id: "pairings" }, { id: "hcp" }, { id: "coursehcp" }, { id: "scores" }, { id: "payouts" }, { id: "courses" }, { id: "roster" }, { id: "message" },
  ];
  return (
    <div>
      <div className="section-title">Admin</div>
      <div className="section-sub">League management tools</div>
      <div ref={pillSentinelRef} style={{height:1,marginBottom:-1}}/>
      <div ref={pillRowRef} className="tab-sub">
        {[
          { id: "events", label: "Events" },
          { id: "pairings", label: "Pairings" },
          { id: "hcp", label: "Handicaps" },
          { id: "coursehcp", label: "Course HCPs" },
          { id: "scores", label: "Scores" },
          { id: "payouts", label: "Payouts" },
          { id: "courses", label: "Courses" },
          { id: "roster", label: "Roster" },
          { id: "message", label: "Message" },
        ].map(t => (
          <button key={t.id} className={`tab-sub-btn${subTab === t.id ? " active" : ""}`} onClick={() => setSubTab(t.id)}>{t.label}</button>
        ))}
      </div>
      <SubTabPanel tabs={ADMIN_TABS} value={subTab}>
        {subTab === "events" && <><EventCreator courses={courses} events={events} setEvents={setEvents} signups={signups} setSignups={setSignups} golfers={golfers} showSuccess={showSuccess} /><AiRecapBackfill events={events} showSuccess={showSuccess} /></>}
        {subTab === "pairings" && <PairingDashboard golfers={golfers} courses={courses} events={events} setEvents={setEvents} signups={signups} setSignups={setSignups} showSuccess={showSuccess} scrollToTop={scrollToTop} />}
        {subTab === "hcp" && <HandicapManager golfers={golfers} setGolfers={setGolfers} showSuccess={showSuccess} />}
        {subTab === "coursehcp" && <CourseHcpSheet golfers={golfers} courses={courses} showSuccess={showSuccess} />}
        {subTab === "scores" && <ScoreCorrection golfers={golfers} courses={courses} events={events} leaderboard={leaderboard} setLeaderboard={setLeaderboard} holeScores={holeScores} setHoleScores={setHoleScores} dbUpsertLeaderboard={dbUpsertLeaderboard} dbUpsertHoleScore={dbUpsertHoleScore} showSuccess={showSuccess} />}
        {subTab === "payouts" && <FinanceView golfers={golfers} leaderboard={leaderboard} events={[...events].filter((e: any) => e.status === "Completed").sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())} charityDonations={charityDonations} setCharityDonations={setCharityDonations} showSuccess={showSuccess} />}
        {subTab === "courses" && <CourseManager courses={courses} setCourses={setCourses} holeImages={holeImages} setHoleImages={setHoleImages} showSuccess={showSuccess} />}
        {subTab === "roster" && <GolferRoster golfers={golfers} setGolfers={setGolfers} showSuccess={showSuccess} />}
        {subTab === "message" && <MessageBlast golfers={golfers} showSuccess={showSuccess} />}
      </SubTabPanel>
    </div>
  );
}
