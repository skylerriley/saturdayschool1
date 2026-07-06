import { useState, useRef, useEffect } from "react";
import { SubTabPanel } from "../../App";
import { GlassPicker } from "../../components/common";
import { formatDate, uniqueCourseNames } from "../../lib/formatters";
import { calcSeasonLeaderData } from "../../lib/seasonStats";
import { OddsTab } from "../odds/OddsTab";
import { SeasonOverview } from "./SeasonOverview";
import { CourseChart } from "./CourseChart";
import { ScatterChart } from "./ScatterChart";
import { ChampionsView } from "./ChampionsView";
import { GolferHistoryChart } from "./GolferHistoryChart";
import { PointsGained } from "./PointsGained";

export function AnalyticsTab({golfers,courses,events,leaderboard,signups,holeScores,eventOdds,oddsLoading,oddsLastUpdated,onTriggerOdds,supabase,refreshLiveData,initialGolfer,onInitialGolferConsumed,onBack,backLabel,charityDonations}:any){
  const [subTab,setSubTab]=useState("overview");
  const [selGolfer,setSelGolfer]=useState("");
  const [initialPtsTab,setInitialPtsTab]=useState<string|undefined>(undefined);

  useEffect(()=>{
    if(initialGolfer){
      setSelGolfer(String(initialGolfer));
      setSubTab("golfer");
      onInitialGolferConsumed?.();
    }
  },[initialGolfer]);
  const allSeasons=[...new Set(events.map((e:any)=>e.season))].sort((a:any,b:any)=>b-a) as number[];
  const [selSeason,setSelSeason]=useState<number>(allSeasons[0]||new Date().getFullYear());

  useEffect(()=>{
    if(selSeason<2026&&subTab==="points-gained") setSubTab("overview");
  },[selSeason]);

  const seasonData=calcSeasonLeaderData(golfers,leaderboard,events,selSeason);
  const seasonEvents=events.filter((e:any)=>e.season===selSeason&&e.status==="Completed");

  const courseNames=uniqueCourseNames(courses);
  const courseAvgs=courseNames.map(name=>{
    const evIds=events.filter((e:any)=>e.course_name===name&&e.season===selSeason).map((e:any)=>e.event_id);
    const entries=leaderboard.filter((r:any)=>evIds.includes(r.event_id)&&!golfers.find((g:any)=>g.golfer_id===r.golfer_id)?.is_guest);
    const avg=entries.length?entries.reduce((s:number,r:any)=>s+r.total_stableford_points,0)/entries.length:0;
    return{name,avg,count:entries.length};
  }).filter((c:any)=>c.count>0);

  const scatterData=golfers.filter((g:any)=>!g.is_guest&&g.status==="Active").map((g:any)=>{
    const rounds=leaderboard.filter((r:any)=>r.golfer_id===g.golfer_id&&r.season===selSeason).map((r:any)=>r.total_stableford_points);
    if(!rounds.length)return null;
    return{golfer:g,hcp:g.current_handicap_index,avg:rounds.reduce((a:number,b:number)=>a+b,0)/rounds.length,rounds:rounds.length};
  }).filter(Boolean);

  // Flight win % — 1st or 2nd place finish counts as a "win"
  const flightBands=[{label:"0–5",min:0,max:5},{label:"5.1–10",min:5.1,max:10},{label:"10.1–15",min:10.1,max:15},{label:"15.1–20",min:15.1,max:20},{label:"20.1–25",min:20.1,max:25}];
  const completedSeasonEvents=events.filter((e:any)=>e.season===selSeason&&e.status==="Completed");
  const flightWinData=flightBands.map(band=>{
    let appearances=0,wins=0;
    completedSeasonEvents.forEach((ev:any)=>{
      const paid=[...leaderboard.filter((r:any)=>r.event_id===ev.event_id&&r.buy_in_paid)].sort((a:any,b:any)=>b.total_stableford_points-a.total_stableford_points);
      if(!paid.length)return;
      const topPts=paid[0].total_stableford_points;
      const tied1st=paid.filter((r:any)=>r.total_stableford_points===topPts);
      const secondPts=tied1st.length===1&&paid.length>1?paid[tied1st.length]?.total_stableford_points:null;
      const tied2nd=secondPts!=null?paid.filter((r:any)=>r.total_stableford_points===secondPts):[];
      const winnerIds=new Set([...tied1st,...tied2nd].map((r:any)=>r.golfer_id));
      paid.forEach((r:any)=>{
        const g=golfers.find((gl:any)=>gl.golfer_id===r.golfer_id);
        if(!g||g.is_guest)return;
        const hcp=g.current_handicap_index;
        if(hcp>=band.min&&hcp<=band.max){
          appearances++;
          if(winnerIds.has(r.golfer_id))wins++;
        }
      });
    });
    return{label:band.label,winPct:appearances>0?Math.round((wins/appearances)*100):0,appearances};
  });

  const selG=golfers.find((g:any)=>g.golfer_id===parseInt(selGolfer));
  const selGData=selG?seasonData.find((d:any)=>d.golfer.golfer_id===selG.golfer_id):null;
  // Build per-round data sorted by event date
  const golferRounds=selG?seasonEvents
    .sort((a:any,b:any)=>new Date(a.date).getTime()-new Date(b.date).getTime())
    .map((ev:any)=>{
      const entry=leaderboard.filter((r:any)=>r.golfer_id===selG.golfer_id&&r.event_id===ev.event_id).sort((a:any,b:any)=>b.total_stableford_points-a.total_stableford_points)[0];
      if(!entry)return null;
      // Calc rank for this event
      const paidEv=leaderboard.filter((r:any)=>r.event_id===ev.event_id&&r.buy_in_paid).sort((a:any,b:any)=>b.total_stableford_points-a.total_stableford_points);
      const rank=paidEv.findIndex((r:any)=>r.golfer_id===selG.golfer_id)+1;
      const pot=paidEv.length*20;
      const topPts=paidEv[0]?.total_stableford_points;
      const tied1st=paidEv.filter((r:any)=>r.total_stableford_points===topPts);
      const secondPts=tied1st.length<paidEv.length?paidEv[tied1st.length]?.total_stableford_points:null;
      // 2nd place only exists when there is exactly ONE player in 1st (matches weekly logic)
      const secondPtsRbR=tied1st.length===1&&paidEv.length>1?paidEv[tied1st.length]?.total_stableford_points:null;
      const tied2nd=secondPtsRbR!=null?paidEv.filter((r:any)=>r.total_stableford_points===secondPtsRbR):[];
      let roundEarned=0;
      if(tied1st.some((r:any)=>r.golfer_id===selG.golfer_id)){
        // Solo 1st: 2/3 of pot. Tied 1st: split entire pot (no 2nd place payout)
        roundEarned=tied1st.length===1?pot*(2/3):pot/tied1st.length;
      } else if(tied2nd.some((r:any)=>r.golfer_id===selG.golfer_id)){
        // 2nd place: 1/3 of pot (only reachable when solo 1st exists)
        roundEarned=(pot*(1/3))/tied2nd.length;
      }
      return{pts:entry.total_stableford_points,eid:ev.event_id,date:ev.date,course:ev.course_name,rank,players:paidEv.length,earned:roundEarned,won:tied1st.some((r:any)=>r.golfer_id===selG.golfer_id)};
    }).filter(Boolean):[];

  const SUBTABS=[{id:"overview",label:"Overview"},{id:"golfer",label:"By Golfer"},{id:"odds",label:"Odds"},...(selSeason>=2026?[{id:"points-gained",label:"Pts Gained"}]:[]),({id:"course",label:"By Course"}),{id:"scatter",label:"HCP vs Pts"},{id:"champions",label:"Champions"}];

  const switchSubTab=(id:string)=>{
    setSubTab(id);
    if(pillRowRef.current?.classList.contains("stuck")){
      const mc=document.querySelector(".main-content") as HTMLElement|null;
      const sentinel=pillSentinelRef.current;
      if(mc&&sentinel){
        const offset=sentinel.getBoundingClientRect().top-mc.getBoundingClientRect().top+mc.scrollTop;
        mc.scrollTo({top:offset-6,behavior:"smooth"});
      }
    }
  };

  const pillSentinelRef=useRef<HTMLDivElement|null>(null);
  const pillRowRef=useRef<HTMLDivElement|null>(null);
  useEffect(()=>{
    const sentinel=pillSentinelRef.current;
    if(!sentinel)return;
    const obs=new IntersectionObserver(([entry])=>{
      pillRowRef.current?.classList.toggle("stuck",!entry.isIntersecting);
    },{threshold:0,rootMargin:"0px"});
    obs.observe(sentinel);
    return()=>obs.disconnect();
  },[]);

  return(
    <div>
      {onBack&&(
        <button onClick={onBack} style={{display:"flex",alignItems:"center",gap:6,background:"transparent",border:"none",padding:"10px 16px 2px",fontSize:13,fontWeight:600,color:"var(--green-600,#2d6a4f)",cursor:"pointer",WebkitTapHighlightColor:"transparent"}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          {backLabel||"Back"}
        </button>
      )}
      <div className="section-title">Analytics</div>
      <div className="section-sub">Performance insights</div>
      <div className="form-group" style={{marginBottom:12}}>
        <GlassPicker
          value={selSeason}
          onChange={v=>setSelSeason(v)}
          options={allSeasons.map(y=>({value:y,label:`${y} Season`}))}
        />
      </div>
      <div ref={pillSentinelRef} style={{height:1,marginBottom:-1}}/>
      <div ref={pillRowRef} className="tab-sub">
        {SUBTABS.map(t=>(
          <button key={t.id} className={`tab-sub-btn${subTab===t.id?" active":""}`} onClick={()=>switchSubTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {(()=>{
        // ── Fog of History (content-wide) ──────────────────────────
        // Older seasons render with progressively lower contrast and a
        // cooler color temperature. The current year (age 0) is fully vivid.
        const selAge=Math.max(0,allSeasons[0]-selSeason);
        const fogContentStyle:React.CSSProperties=selAge===0?{}:{
          filter:`saturate(${Math.max(0.9,1-selAge*0.02)}) hue-rotate(${Math.min(4,selAge*0.8)}deg) contrast(${Math.max(0.98,1-selAge*0.004)}) brightness(${Math.max(0.985,1-selAge*0.003)})`,
          transition:"filter 0.4s ease",
        };
        const renderAnalyticsTab=(id:string):React.ReactNode=>{
          switch(id){
            case "overview":return <SeasonOverview seasonData={seasonData} seasonEvents={seasonEvents} season={selSeason} leaderboard={leaderboard} golfers={golfers} events={events} charityDonations={charityDonations}/>;
            case "course":return <CourseChart courseAvgs={courseAvgs} holeScores={holeScores} events={events} courses={courses} leaderboard={leaderboard} golfers={golfers}/>;
            case "scatter":return <ScatterChart scatterData={scatterData} flightWinData={flightWinData}/>;
            case "champions":return <ChampionsView golfers={golfers} leaderboard={leaderboard} events={events}/>;
            case "points-gained":return <PointsGained golfers={golfers} events={events} leaderboard={leaderboard} holeScores={holeScores} courses={courses} signups={signups} selSeason={selSeason} initialTab={initialPtsTab} seasonData={seasonData}/>;
            case "golfer":return(
              <>
                <div className="form-group">
                  <label className="form-label">Select Golfer</label>
                  <GlassPicker
                    value={selGolfer}
                    onChange={(v)=>setSelGolfer(v)}
                    options={[
                      {value:"",label:"Choose golfer…"},
                      ...golfers.filter((g:any)=>!g.is_guest&&g.status==="Active").sort((a:any,b:any)=>a.first_name.localeCompare(b.first_name)).map((g:any)=>(
                        {value:String(g.golfer_id),label:`${g.first_name} ${g.last_name}`}
                      )),
                    ]}
                  />
                </div>
                {selG&&golferRounds.length>0&&<GolferHistoryChart golfer={selG} rounds={golferRounds} seasonData={selGData} leaderboard={leaderboard} golfers={golfers} seasonEvents={seasonEvents} holeScores={holeScores} courses={courses} signups={signups} onNavigatePtsGained={(tabId:string)=>{setInitialPtsTab(tabId);switchSubTab("points-gained");}}/>}
                {selG&&golferRounds.length===0&&<div className="empty-state"><div className="empty-text">No rounds recorded this season</div></div>}
              </>
            );
            case "odds":return <OddsTab golfers={golfers} leaderboard={leaderboard} events={events} signups={signups} courses={courses} holeScores={holeScores} season={selSeason} eventOdds={eventOdds} oddsLoading={oddsLoading} oddsLastUpdated={oddsLastUpdated} onTriggerOdds={onTriggerOdds} refreshLiveData={refreshLiveData}/>;
            default:return null;
          }
        };
        return(
          <div style={fogContentStyle}>
            <SubTabPanel tabs={SUBTABS} value={subTab} onChange={setSubTab} renderTab={renderAnalyticsTab}>
              {renderAnalyticsTab(subTab)}
            </SubTabPanel>
          </div>
        );
      })()}
    </div>
  );
}
