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
        {subTab === "events" && <EventCreator courses={courses} events={events} setEvents={setEvents} signups={signups} setSignups={setSignups} golfers={golfers} showSuccess={showSuccess} />}
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
