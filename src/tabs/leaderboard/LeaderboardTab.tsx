import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from "react";
import { Sparkles } from "lucide-react";
import ReactDOM from "react-dom";
import { SeasonScrubber, FlickCarousel, SubTabPanel, ToggleGroup, ScoreSymbol, GlassPicker } from "../../components/common";
import { golferName, formatDate } from "../../lib/formatters";
import { calcPlayingHandicap } from "../../lib/golfMath";
import { supabase } from "../../lib/supabaseClient";
import { buildSeasonRounds, golferStats, dedupeLeaderboard } from "../../lib/seasonStats";
import { useLiveWeather } from "../../hooks/useLiveWeather";
import { WindParticles } from "../../components/weather/WindParticles";
import { WeatherModal } from "../../components/weather/WeatherModal";
import { UpcomingCourseCard } from "./UpcomingCourseCard";
import { ensureShimmer } from "../../components/weather/WeatherSkeleton";
import { FieldStrengthMeter } from "./FieldStrengthMeter";
import { UpcomingPlayerDrawer } from "./UpcomingPlayerDrawer";
import { PreEventOddsModule } from "../odds/PreEventOddsModule";
import { WinProbabilityChart } from "../../WinProbabilityChart";

ensureShimmer();

// ── EventFeedCard ─────────────────────────────────────────────────────────────
// Full-width image card for the weekly leaderboard feed.
// Props: event, eventNumber, golfers, leaderboard, holeScores, holeImages
function EventFeedCard({event,eventNumber,golfers,leaderboard,holeScores,holeImages,onClick}:any){
  const courseName:string=event.course_name||"";

  // Hole image: cycle 1..18 by event number
  const holeNum=((eventNumber-1)%18)+1;
  const imgRecord=(holeImages||[]).find((img:any)=>img.course_name===courseName&&img.hole_number===holeNum&&img.public_url);
  const imgUrl:string|null=imgRecord?imgRecord.public_url:null;

  const [imgLoaded,setImgLoaded]=useState(false);
  // Reset when the URL changes (different card / holeImages update)
  useEffect(()=>{ setImgLoaded(false); },[imgUrl]);

  // Leaderboard entries for this event, sorted by points desc
  const entries=dedupeLeaderboard(leaderboard.filter((r:any)=>r.event_id===event.event_id))
    .sort((a:any,b:any)=>b.total_stableford_points-a.total_stableford_points);
  const paidEntries=entries.filter((r:any)=>r.buy_in_paid);

  // 1st place (handle ties)
  const firstPts:number|null=paidEntries[0]?.total_stableford_points??null;
  const tied1st=firstPts!=null?paidEntries.filter((r:any)=>r.total_stableford_points===firstPts):[];
  const isTied1st=tied1st.length>1;

  const nameOf=(gid:number)=>{
    const g=golfers.find((x:any)=>x.golfer_id===gid);
    return g?`${g.first_name} ${g.last_name}`:"Unknown";
  };

  const first1stLine=tied1st.length>0
    ? (isTied1st
        ? tied1st.map((r:any)=>nameOf(r.golfer_id).split(" ")[0]).join(" & ")+" — "+firstPts+" pts"
        : nameOf(tied1st[0].golfer_id)+" — "+firstPts+" pts"
      )
    : null;

  // 2nd place: only when 1st is solo
  let first2ndLine:string|null=null;
  if(!isTied1st&&paidEntries.length>1){
    const secondPts=paidEntries.find((r:any)=>r.total_stableford_points<(firstPts??0))?.total_stableford_points??null;
    if(secondPts!=null){
      const tied2nd=paidEntries.filter((r:any)=>r.total_stableford_points===secondPts);
      first2ndLine=tied2nd.map((r:any)=>nameOf(r.golfer_id).split(" ")[0]).join(" & ")+" — "+secondPts+" pts";
    }
  }

  // Skins: count distinct holes won
  const entryIds=new Set(entries.map((r:any)=>r.summary_id));
  const skinsPaidIds=new Set(entries.filter((r:any)=>r.skins_paid).map((r:any)=>r.summary_id));
  const playerHoleMap:Record<number,Record<number,number>>={};
  holeScores.filter((h:any)=>skinsPaidIds.has(h.summary_id)&&h.stableford_points!=null).forEach((h:any)=>{
    const gid=entries.find((r:any)=>r.summary_id===h.summary_id)?.golfer_id;
    if(gid==null)return;
    if(!playerHoleMap[gid])playerHoleMap[gid]={};
    playerHoleMap[gid][h.hole_number]=h.stableford_points;
  });
  void entryIds;
  const pids=Object.keys(playerHoleMap).map(Number);
  let skinsCount=0;
  for(let hN=1;hN<=18;hN++){
    const scores=pids.map(id=>({id,pts:playerHoleMap[id]?.[hN]})).filter(x=>x.pts!=null);
    if(!scores.length)continue;
    const maxPts=Math.max(...scores.map(x=>x.pts));
    const leaders=scores.filter(x=>x.pts===maxPts);
    if(leaders.length===1)skinsCount++;
  }

  // Date MM/DD
  const dt=new Date(event.date+"T00:00:00");
  const dateLabel=`${String(dt.getMonth()+1).padStart(2,"0")}/${String(dt.getDate()).padStart(2,"0")}`;
  const fieldSize=entries.length;

  return(
    <div
      className="ef-card"
      onClick={onClick}
      style={{
        position:"relative",borderRadius:"var(--radius-lg)",overflow:"hidden",
        minHeight:230,marginBottom:14,cursor:"pointer",
        background:"linear-gradient(145deg,var(--green-900),var(--green-800))",
        boxShadow:"0 4px 18px rgba(28,20,16,0.18)",
        WebkitTapHighlightColor:"transparent",
        flexShrink:0,
      }}
    >
      {/* Shimmer placeholder — visible until image loads */}
      {imgUrl&&!imgLoaded&&(
        <div className="wx-skel" style={{position:"absolute",inset:0,borderRadius:0}}/>
      )}
      {/* Background image — fades in once decoded */}
      {imgUrl&&(
        <img
          src={imgUrl}
          alt={`${courseName} hole ${holeNum}`}
          style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",objectPosition:"center 60%",
            opacity:imgLoaded?1:0,transition:"opacity 0.4s ease"}}
          loading="lazy"
          draggable={false}
          onLoad={()=>setImgLoaded(true)}
        />
      )}
      {/* Scrim: dark at bottom, light touch at top */}
      <div style={{position:"absolute",inset:0,background:"linear-gradient(to bottom,rgba(0,0,0,0.45) 0%,rgba(0,0,0,0.0) 30%,rgba(0,0,0,0.75) 100%)"}}/>
      {/* Content layer */}
      <div style={{position:"relative",minHeight:230,display:"flex",flexDirection:"column",justifyContent:"space-between",padding:"12px 14px 14px",color:"white"}}>

        {/* Top row: course name left, date pill right */}
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8}}>
          <div style={{fontSize:18,fontWeight:800,lineHeight:1.15,letterSpacing:"-0.01em",textShadow:"0 1px 8px rgba(0,0,0,0.6)"}}>{courseName}</div>
          <div style={{background:"rgba(0,0,0,0.45)",backdropFilter:"blur(4px)",borderRadius:20,padding:"4px 11px",fontSize:12,fontWeight:700,letterSpacing:"0.04em",whiteSpace:"nowrap",flexShrink:0}}>{dateLabel}</div>
        </div>

        {/* Bottom block */}
        <div>
          {/* Winner rows -- centered, full width, wraps gracefully */}
          {tied1st.length>0&&firstPts!=null&&(
            <div style={{marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:7,marginBottom:6,flexWrap:"wrap"}}>
                <span style={{background:"rgba(212,168,67,0.35)",border:"1px solid rgba(212,168,67,0.7)",borderRadius:8,padding:"3px 10px",fontSize:12,fontWeight:900,color:"#f5d87a",letterSpacing:"0.04em",lineHeight:1.2,flexShrink:0}}>1st</span>
                <span style={{fontSize:20,fontWeight:800,lineHeight:1.2,textShadow:"0 1px 8px rgba(0,0,0,0.6)",textAlign:"center"}}>{isTied1st?tied1st.map((r:any)=>nameOf(r.golfer_id).split(" ")[0]).join(" & "):nameOf(tied1st[0].golfer_id)}</span>
                <span style={{fontSize:14,fontWeight:700,color:"#f5d87a",opacity:0.9,flexShrink:0}}>{firstPts} pts</span>
              </div>
              {first2ndLine!=null&&(()=>{
                const secondPts=paidEntries.find((r:any)=>r.total_stableford_points<(firstPts??0))?.total_stableford_points??null;
                const tied2nd=secondPts!=null?paidEntries.filter((r:any)=>r.total_stableford_points===secondPts):[];
                const name2nd=tied2nd.map((r:any)=>nameOf(r.golfer_id).split(" ")[0]).join(" & ");
                return secondPts!=null?(
                  <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:7,flexWrap:"wrap"}}>
                    <span style={{background:"rgba(255,255,255,0.15)",border:"1px solid rgba(255,255,255,0.3)",borderRadius:8,padding:"3px 10px",fontSize:12,fontWeight:900,letterSpacing:"0.04em",lineHeight:1.2,flexShrink:0}}>2nd</span>
                    <span style={{fontSize:16,fontWeight:600,opacity:0.88,lineHeight:1.2,textAlign:"center"}}>{name2nd}</span>
                    <span style={{fontSize:13,fontWeight:700,opacity:0.72,flexShrink:0}}>{secondPts} pts</span>
                  </div>
                ):null;
              })()}
            </div>
          )}
          {/* Stat pills row */}
          <div style={{display:"flex",justifyContent:"center",gap:8}}>
            <span style={{background:"rgba(255,255,255,0.18)",backdropFilter:"blur(4px)",borderRadius:20,padding:"4px 13px",fontSize:13,fontWeight:700,whiteSpace:"nowrap"}}>
              {fieldSize} golfer{fieldSize!==1?"s":""}
            </span>
            {skinsCount>0&&(
              <span style={{background:"rgba(255,255,255,0.18)",backdropFilter:"blur(4px)",borderRadius:20,padding:"4px 13px",fontSize:13,fontWeight:700,whiteSpace:"nowrap"}}>
                {skinsCount} skin{skinsCount!==1?"s":""}
              </span>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

const FEED_PAGE_INIT=10;
const FEED_PAGE_MORE=5;

// ── LeaderboardFeed ───────────────────────────────────────────────────────────
// Paginated vertical feed of EventFeedCards for the selected season.
// Props: seasonEvents (all completed events for the season, newest first),
//        golfers, leaderboard, holeScores, holeImages, onCardTap
function LeaderboardFeed({seasonEvents,golfers,leaderboard,holeScores,holeImages,onCardTap}:any){
  const [visibleCount,setVisibleCount]=useState(FEED_PAGE_INIT);
  const sentinelRef=useRef<HTMLDivElement|null>(null);
  const allEvents:any[]=[...seasonEvents].sort((a:any,b:any)=>new Date(b.date).getTime()-new Date(a.date).getTime());
  const shown=allEvents.slice(0,visibleCount);
  const hasMore=visibleCount<allEvents.length;

  // eventNumber: 1-based index within the season ordered oldest-first
  const oldestFirst=[...allEvents].reverse();
  const eventNumMap:Record<number,number>={};
  oldestFirst.forEach((ev:any,i:number)=>{eventNumMap[ev.event_id]=i+1;});

  useEffect(()=>{
    if(!sentinelRef.current||!hasMore)return;
    const obs=new IntersectionObserver((entries)=>{
      if(entries[0]?.isIntersecting)setVisibleCount(prev=>prev+FEED_PAGE_MORE);
    },{threshold:0.1});
    obs.observe(sentinelRef.current);
    return()=>obs.disconnect();
  },[hasMore,visibleCount]);

  if(allEvents.length===0){
    return(
      <div className="empty-state">
        <div className="empty-text">No events yet this season</div>
        <div className="empty-sub">Completed events will appear here</div>
      </div>
    );
  }

  return(
    <div>
      {shown.map((ev:any)=>(
        <EventFeedCard
          key={ev.event_id}
          event={ev}
          eventNumber={eventNumMap[ev.event_id]||1}
          golfers={golfers}
          leaderboard={leaderboard}
          holeScores={holeScores}
          holeImages={holeImages}
          onClick={()=>onCardTap(ev)}
        />
      ))}
      {hasMore&&<div ref={sentinelRef} style={{height:2}}/>}
    </div>
  );
}

export function LeaderboardTab({golfers,courses,events,leaderboard,holeScores,signups,adminMode,eventImages,setEventImages,holeImages,setHoleImages,showSuccess,eventOdds,oddsLoading,oddsLastUpdated,onTriggerOdds,refreshLiveData,initialSubTab,restoreSubTab,onSubTabChange,initialFeedOpen,onNavigateToAnalyticsGolfer}:any){
  // ── Golden Hour Mode ──────────────────────────────────────────────────
  // Fri/Sat 4-8pm PST: the leaderboard drifts toward amber-tinted greens and
  // warmer whites. Friday afternoon = anticipation; Saturday evening = the
  // 19th-hole moment after most groups have finished. Checked once a minute
  // (cheap) and derived from America/Los_Angeles wall-clock time so it's
  // correct regardless of the device's local timezone.
  const [isGoldenHour,setIsGoldenHour]=useState(false);
  useEffect(()=>{
    const check=()=>{
      const parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/Los_Angeles",weekday:"short",hour:"numeric",hour12:false}).formatToParts(new Date());
      const weekday=parts.find(p=>p.type==="weekday")?.value;
      const hour=parseInt(parts.find(p=>p.type==="hour")?.value||"0",10);
      const isFriOrSat=weekday==="Fri"||weekday==="Sat";
      // 4pm (16:00) through 8pm (20:00) -- hour 16,17,18,19 (20 itself is the end boundary)
      setIsGoldenHour(isFriOrSat&&hour>=16&&hour<20);
    };
    check();
    const id=window.setInterval(check,60000);
    return()=>window.clearInterval(id);
  },[]);

  const validSubTabs=["live","upcoming","season","top15","weekly"];
  const [subTab,setSubTab]=useState(validSubTabs.includes(restoreSubTab||"")?restoreSubTab:validSubTabs.includes(initialSubTab||"")?initialSubTab:"weekly");

  // While a round is actively being scored, App.tsx's 5-minute background poll
  // is too slow -- players expect the Live tab (leaderboard + player drawer
  // scorecards) to track hole-by-hole entries as they happen. Poll fast here,
  // scoped to only when the Live tab is actually open and visible.
  useEffect(()=>{
    if(subTab!=="live"||!refreshLiveData)return;
    const LIVE_REFRESH_MS=15000;
    const id=window.setInterval(()=>{
      if(!document.hidden)refreshLiveData();
    },LIVE_REFRESH_MS);
    return()=>window.clearInterval(id);
  },[subTab,refreshLiveData]);
  const [selEventId,setSelEventId]=useState<number|null>(null);
  const [expandedId,setExpandedId]=useState<number|null>(null);
  // Switching tabs and collapsing an expanded row used to happen in the
  // SAME click handler/render. On Season/Top15 (the views WITH the
  // scrubber visible) the row list is the full season roster and carries
  // per-row FLIP/cascade animations, so collapsing a row at the same
  // moment the tab itself switches is meaningfully heavier than on
  // Weekly -- on a slow frame the tab change doesn't paint in time and
  // the tap feels like it didn't register. Splitting these into two
  // passes keeps the tab switch itself cheap and immediate.
  const switchSubTab=(id:string)=>{
    setSubTab(id);
    onSubTabChange?.(id);
    if(expandedId!=null)requestAnimationFrame(()=>setExpandedId(null));
    if(pillRowRef.current?.classList.contains("stuck")){
      const mc=document.querySelector(".main-content") as HTMLElement|null;
      const sentinel=pillSentinelRef.current;
      if(mc&&sentinel){
        const offset=sentinel.getBoundingClientRect().top-mc.getBoundingClientRect().top+mc.scrollTop;
        mc.scrollTo({top:offset-6,behavior:"smooth"});
      }
    }
  };
  // Cascading row-entrance animation for Season/Top15, deferred by one
  // frame: the click that switches into the tab mounts the rows WITHOUT
  // the animation class (cheap, registers immediately), then the next
  // frame adds it so the staggered entrance plays without competing with
  // the tab-switch click itself (see switchSubTab comment above -- this
  // was the cause of the dropped first tap with a full roster).
  const [cascadeOn,setCascadeOn]=useState(false);
  useEffect(()=>{
    setCascadeOn(false);
    if(subTab==="season"||subTab==="top15"){
      const raf=requestAnimationFrame(()=>setCascadeOn(true));
      return()=>cancelAnimationFrame(raf);
    }
  },[subTab]);
  const [showScorecardModal,setShowScorecardModal]=useState(false);
  const [scorecardUploading,setScorecardUploading]=useState(false);
  const [lightboxImg,setLightboxImg]=useState<string|null>(null);
  const [liveExpandedId,setLiveExpandedId]=useState<number|null>(null);
  const [upcomingExpandedId,setUpcomingExpandedId]=useState<number|null>(null);
  const [liveWeatherOpen,setLiveWeatherOpen]=useState(false);
  const [upcomingWeatherOpen,setUpcomingWeatherOpen]=useState(false);
  const [liveSkinsRevealedHole,setLiveSkinsRevealedHole]=useState<number|null>(null);
  const [weeklySkinsRevealedHole,setWeeklySkinsRevealedHole]=useState<number|null>(null);

  // Feed overlay state: which event's full detail is open
  const [feedOverlayEvent,setFeedOverlayEvent]=useState<any|null>(null);
  const [feedOverlayClosing,setFeedOverlayClosing]=useState(false);
  const [feedOverlayReady,setFeedOverlayReady]=useState(false);
  const feedScrollPosRef=useRef<number>(0);
  const overlayScrollRef=useRef<HTMLDivElement|null>(null);
  // Stable ref callback (useCallback with []) so React doesn't re-invoke it on
  // every re-render (which would reset scrollTop=0 on each Supabase update).
  const overlayRefCallback=useCallback((node:HTMLDivElement|null)=>{
    overlayScrollRef.current=node;
    if(node)node.scrollTop=0;
  },[]);
  // While the overlay is open: disable pull-to-refresh and fill the nav bowl
  // cutout so the feed behind the overlay doesn't show through the transparent
  // hole in the active tab.
  useEffect(()=>{
    const mc=document.querySelector(".main-content") as HTMLElement|null;
    if(feedOverlayEvent){
      if(mc)mc.style.pointerEvents="none";
      document.body.classList.add("feed-overlay-open");
    }else{
      if(mc)mc.style.pointerEvents="";
      document.body.classList.remove("feed-overlay-open");
    }
    return()=>{
      if(mc)mc.style.pointerEvents="";
      document.body.classList.remove("feed-overlay-open");
    };
  },[feedOverlayEvent]);

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

  const openFeedOverlay=(ev:any)=>{
    const mc=document.querySelector(".main-content") as HTMLElement|null;
    feedScrollPosRef.current=mc?mc.scrollTop:0;
    setSelEventId(ev.event_id);
    setExpandedId(null);
    setFeedOverlayReady(false);
    setFeedOverlayEvent(ev);
    setTimeout(()=>setFeedOverlayReady(true),320);
  };
  const closeFeedOverlay=()=>{
    setFeedOverlayClosing(true);
    setTimeout(()=>{
      setFeedOverlayEvent(null);
      setFeedOverlayClosing(false);
      setFeedOverlayReady(false);
      requestAnimationFrame(()=>{
        const mc=document.querySelector(".main-content") as HTMLElement|null;
        if(mc)mc.scrollTop=feedScrollPosRef.current;
      });
    },280);
  };

  // 1) Season selector -- dropdown only, no "all time"
  const allSeasons=[...new Set([...events.map((e:any)=>e.season),...leaderboard.map((r:any)=>r.season)])].sort((a:any,b:any)=>b-a) as number[];
  const [selSeason,setSelSeason]=useState<number>(allSeasons[0]||2026);

  const completedEvents=[...events].filter((e:any)=>e.status==="Completed").sort((a:any,b:any)=>new Date(b.date).getTime()-new Date(a.date).getTime());
  const seasonEvents=completedEvents.filter((e:any)=>e.season===selSeason);
  const displayEvent=selEventId?completedEvents.find((e:any)=>e.event_id===selEventId):seasonEvents[0];

  // Event number used for hero hole image (same formula as EventFeedCard)
  const overlayEventNumMap:Record<number,number>={};
  [...completedEvents].reverse().forEach((ev:any,i:number)=>{overlayEventNumMap[ev.event_id]=i+1;});

  // Post-Saturday recap: auto-open the most recent completed event detail on first load
  const recapOpenedRef=useRef(false);
  useEffect(()=>{
    if(!initialFeedOpen||recapOpenedRef.current)return;
    const mostRecent=completedEvents[0];
    if(!mostRecent)return;
    recapOpenedRef.current=true;
    setFeedOverlayEvent(mostRecent);
    setSelEventId(mostRecent.event_id);
    setFeedOverlayReady(false);
    setTimeout(()=>setFeedOverlayReady(true),320);
  },[initialFeedOpen,completedEvents.length]);

  const eventEntries=displayEvent
    ?dedupeLeaderboard(leaderboard.filter((e:any)=>e.event_id===displayEvent.event_id)).sort((a:any,b:any)=>b.total_stableford_points-a.total_stableford_points)
    :[];

  const paidEntries=[...eventEntries.filter((e:any)=>e.buy_in_paid)].sort((a:any,b:any)=>b.total_stableford_points-a.total_stableford_points);
  const totalPot=paidEntries.length*20;
  const first1stPts=paidEntries[0]?.total_stableford_points;
  const tied1st=paidEntries.filter((e:any)=>e.total_stableford_points===first1stPts);

  // Check if skins are calculable for this event (all H-H)
  const skinsEligible=eventEntries.length>0&&eventEntries.every((e:any)=>e.entry_type==="Hole-by-Hole");

  // Skin calculations for COMPLETED event weekly scorecard view.
  // (Live skins are computed inside the live tab IIFE below, against liveEvent.)
  const calcSkinHoleWinnersForEvent:(()=>Record<number,number>)=()=>{
    if(!displayEvent)return{};
    const skinsPaid=eventEntries.filter((e:any)=>e.skins_paid);
    if(!skinsPaid.length)return{};
    const playerHoleMap:Record<number,Record<number,number>>={};
    skinsPaid.forEach((entry:any)=>{
      const hs=holeScores.filter((h:any)=>h.summary_id===entry.summary_id);
      hs.forEach((h:any)=>{
        if(h.stableford_points==null)return;
        if(!playerHoleMap[entry.golfer_id])playerHoleMap[entry.golfer_id]={};
        playerHoleMap[entry.golfer_id][h.hole_number]=h.stableford_points;
      });
    });
    const playerIds=Object.keys(playerHoleMap).map(Number);
    if(playerIds.length<1)return{};
    const holeWinners:Record<number,number>={};
    for(let hNum=1;hNum<=18;hNum++){
      const scores=playerIds
        .map(id=>({id,pts:playerHoleMap[id]?.[hNum]}))
        .filter(x=>x.pts!=null);
      if(scores.length<1)continue;
      const maxPts=Math.max(...scores.map(x=>x.pts));
      const leaders=scores.filter(x=>x.pts===maxPts);
      if(leaders.length===1) holeWinners[hNum]=leaders[0].id;
    }
    return holeWinners;
  };
  const skinHoleWinners=calcSkinHoleWinnersForEvent();

  // Skins payout for the COMPLETED event weekly view.
  // NOTE: skins_payout_won is always stored as 0 in the DB (written at score-entry time
  // before payouts are known), so we always derive it from hole scores.
  const calcCompletedEventSkinPayouts:(()=>Record<number,number>)=()=>{
    if(!displayEvent)return{};
    const skinsPaid=eventEntries.filter((e:any)=>e.skins_paid);
    if(!skinsPaid.length)return{};
    const skinPot=skinsPaid.length*10;
    const playerHoleMap:Record<number,Record<number,number>>={};
    skinsPaid.forEach((entry:any)=>{
      const hs=holeScores.filter((h:any)=>h.summary_id===entry.summary_id);
      hs.forEach((h:any)=>{
        if(h.stableford_points==null)return;
        if(!playerHoleMap[entry.golfer_id])playerHoleMap[entry.golfer_id]={};
        playerHoleMap[entry.golfer_id][h.hole_number]=h.stableford_points;
      });
    });
    const playerIds=Object.keys(playerHoleMap).map(Number);
    if(playerIds.length<1)return{};
    const skinWins:Record<number,number>={};
    for(let hNum=1;hNum<=18;hNum++){
      const scores=playerIds
        .map(id=>({id,pts:playerHoleMap[id]?.[hNum]}))
        .filter(x=>x.pts!=null);
      if(scores.length<1)continue;
      const maxPts=Math.max(...scores.map(x=>x.pts));
      const leaders=scores.filter(x=>x.pts===maxPts);
      if(leaders.length===1){
        skinWins[leaders[0].id]=(skinWins[leaders[0].id]||0)+1;
      }
    }
    const totalSkins=Object.values(skinWins).reduce((s,n)=>s+n,0);
    if(!totalSkins)return{};
    const perSkin=skinPot/totalSkins;
    const payouts:Record<number,number>={};
    Object.entries(skinWins).forEach(([gid,wins])=>{payouts[parseInt(gid)]=wins*perSkin;});
    return payouts;
  };
  const liveSkinPayouts=calcCompletedEventSkinPayouts();
  const hasLiveSkins=Object.keys(liveSkinPayouts).length>0;

  // 1a) Show ALL golfers -- exclude In-Progress rounds, flag <15 as unqualified
  const completedEventIds=new Set(events.filter((e:any)=>e.status==="Completed").map((e:any)=>e.event_id));
  const leaderboardCompleted=leaderboard.filter((r:any)=>completedEventIds.has(r.event_id));
  const byG=buildSeasonRounds(golfers,leaderboardCompleted,selSeason);
  const seasonAvg=Object.entries(byG)
    .map(([gid,r])=>({golfer_id:parseInt(gid),avg:r.reduce((a,b)=>a+b,0)/r.length,rounds:r.length,qualified:r.length>=15}))
    .sort((a,b)=>b.avg-a.avg);

  const top15Avg=Object.entries(byG)
    .map(([gid,r])=>{const top=[...r].sort((a,b)=>b-a).slice(0,15);return{golfer_id:parseInt(gid),avg:top.reduce((a,b)=>a+b,0)/top.length,rounds:r.length,qualified:r.length>=15};})
    .sort((a,b)=>b.avg-a.avg);

  // Live event: any event currently In-Progress
  const liveEvent=events.find((e:any)=>e.status==="In-Progress");
  // Background wind particles -- live weather for the in-progress course (hook must run unconditionally)
  const{data:liveWxData}=useLiveWeather(liveEvent?.course_name||"");

  // ── Live leaderboard row choreography + position-badge flip ──────────────
  // Compute golfer_id -> pos (with ties) for the current live standings so we
  // can diff against the previous render and detect reordering / rank changes.
  // Lives at top-level (not inside the live-tab IIFE) so the diffing effect
  // below can be a normal hook.
  const livePosMap=useMemo(()=>{
    if(!liveEvent)return{} as Record<number,number>;
    const liveEntries=dedupeLeaderboard(leaderboard.filter((r:any)=>r.event_id===liveEvent.event_id))
      .sort((a:any,b:any)=>b.total_stableford_points-a.total_stableford_points);
    let cp=1;
    const map:Record<number,number>={};
    liveEntries.forEach((r:any,i:number)=>{
      if(i>0&&liveEntries[i].total_stableford_points===liveEntries[i-1].total_stableford_points){
        map[r.golfer_id]=cp;
      }else{
        cp=i+1;
        map[r.golfer_id]=cp;
      }
    });
    return map;
  },[liveEvent,leaderboard]);
  const liveOrderedIds=useMemo(()=>{
    if(!liveEvent)return[] as number[];
    return dedupeLeaderboard(leaderboard.filter((r:any)=>r.event_id===liveEvent.event_id))
      .sort((a:any,b:any)=>b.total_stableford_points-a.total_stableford_points)
      .map((r:any)=>r.golfer_id);
  },[liveEvent,leaderboard]);

  const prevLivePosMapRef=useRef<Record<number,number>>({});
  const prevLiveOrderRef=useRef<number[]>([]);
  const liveRowRefs=useRef<Record<number,HTMLDivElement|null>>({});
  const [liveRowH,setLiveRowH]=useState<number|null>(null);
  // Per-golfer trail class for the current choreography pass ("up"/"down"),
  // cleared once the 600ms reorder animation finishes.
  const[liveTrail,setLiveTrail]=useState<Record<number,"up"|"down">>({});
  const liveTrailTimeoutRef=useRef<number|null>(null);
  // Per-golfer position-badge flip trigger: set true for ~200ms whenever a
  // golfer's `pos` changes, driving the departures-board flip animation.
  const[livePosFlip,setLivePosFlip]=useState<Record<number,boolean>>({});
  const livePosFlipTimeoutsRef=useRef<Record<number,number>>({});
  // The OLD pos value to render on the "out" face while a badge is flipping
  // (the new pos is already in `row.pos` by the time we render the flip).
  const livePosFlipFromRef=useRef<Record<number,number>>({});

  useLayoutEffect(()=>{
    if(liveExpandedId!=null)return; // don't measure while a row is expanded (taller)
    for(const k of Object.keys(liveRowRefs.current)){
      const el=liveRowRefs.current[Number(k)];
      if(el){const h=el.getBoundingClientRect().height;if(h>0){setLiveRowH(h);break;}}
    }
  },[liveOrderedIds.length,liveExpandedId]);

  useEffect(()=>{
    const prevOrder=prevLiveOrderRef.current;
    const prevPos=prevLivePosMapRef.current;
    if(prevOrder.length>0&&liveOrderedIds.length>0){
      // Count how many golfers changed position (rank) since last render.
      let changed=0;
      liveOrderedIds.forEach(gid=>{
        const before=prevPos[gid];
        const after=livePosMap[gid];
        if(before!=null&&after!=null&&before!==after)changed++;
      });
      // Row choreography only fires on 2+ position changes (avoid noise from
      // single-player score ticks that don't reshuffle anyone else).
      if(changed>=2){
        const trails:Record<number,"up"|"down">={};
        liveOrderedIds.forEach(gid=>{
          const before=prevPos[gid];
          const after=livePosMap[gid];
          if(before==null||after==null||before===after)return;
          trails[gid]=after<before?"up":"down";
        });
        setLiveTrail(trails);
        if(liveTrailTimeoutRef.current!=null)window.clearTimeout(liveTrailTimeoutRef.current);
        liveTrailTimeoutRef.current=window.setTimeout(()=>setLiveTrail({}),600);
      }
      // Position-badge flip fires independently for ANY golfer whose `pos`
      // number changed (including the 1-position case the row choreography
      // skips), departures-board style.
      const flips:Record<number,boolean>={};
      liveOrderedIds.forEach(gid=>{
        const before=prevPos[gid];
        const after=livePosMap[gid];
        if(before==null||after==null||before===after)return;
        flips[gid]=true;
        livePosFlipFromRef.current[gid]=before;
        if(livePosFlipTimeoutsRef.current[gid]!=null)window.clearTimeout(livePosFlipTimeoutsRef.current[gid]);
        livePosFlipTimeoutsRef.current[gid]=window.setTimeout(()=>{
          setLivePosFlip(prev=>{const next={...prev};delete next[gid];return next;});
        },200);
      });
      if(Object.keys(flips).length>0)setLivePosFlip(prev=>({...prev,...flips}));
    }
    prevLiveOrderRef.current=liveOrderedIds;
    prevLivePosMapRef.current=livePosMap;
  },[liveOrderedIds,livePosMap]);

  useEffect(()=>()=>{
    if(liveTrailTimeoutRef.current!=null)window.clearTimeout(liveTrailTimeoutRef.current);
    Object.values(livePosFlipTimeoutsRef.current).forEach(id=>window.clearTimeout(id));
  },[]);

  // Upcoming event: the next Upcoming/Pairings-Set event, shown starting 2 days out
  const nextEvent=[...events]
    .filter((e:any)=>e.status==="Upcoming"||e.status==="Pairings Set")
    .sort((a:any,b:any)=>new Date(a.date).getTime()-new Date(b.date).getTime())[0];
  const showUpcomingTab=(()=>{
    if(!nextEvent)return false;
    const today=new Date();today.setHours(0,0,0,0);
    const evDate=new Date(nextEvent.date+"T00:00:00");
    const diffDays=Math.round((evDate.getTime()-today.getTime())/86400000);
    return diffDays<=2&&diffDays>=0;
  })();

  // Auto-switch to LIVE tab when an in-progress event appears
  useEffect(()=>{
    if(liveEvent&&subTab!=="live") setSubTab("live");
  },[liveEvent?.event_id]);

  // Default to the Upcoming tab once it becomes available (until the user
  // navigates away from the initial "weekly" default themselves).
  useEffect(()=>{
    if(showUpcomingTab&&!liveEvent&&subTab==="weekly")setSubTab("upcoming");
  },[showUpcomingTab,liveEvent?.event_id]);

  const tabs=[
    ...(liveEvent?[{id:"live",label:"live"}]:[]),
    ...(showUpcomingTab?[{id:"upcoming",label:"Upcoming"}]:[]),
    {id:"season",label:"Season Avg"},
    {id:"top15",label:"Top 15 Avg"},
    {id:"weekly",label:"Weekly"},
  ];

  // Helper: assign tie positions to a sorted array
  // Both players in a tie get marked tied:true so they both show "T1", "T2", etc.
  const withTiePositions=(arr:any[],scoreKey:string)=>{
    let currentPos=1;
    // First pass: assign positions and detect ties
    const withPos=arr.map((row,i)=>{
      if(i>0&&arr[i][scoreKey]===arr[i-1][scoreKey]){
        return{...row,pos:currentPos,tied:true};
      }
      currentPos=i+1;
      return{...row,pos:currentPos,tied:false};
    });
    // Second pass: if any row with a given pos has tied:true, mark ALL rows at that pos as tied
    const tiedPositions=new Set(withPos.filter((r:any)=>r.tied).map((r:any)=>r.pos));
    return withPos.map((r:any)=>tiedPositions.has(r.pos)?{...r,tied:true}:r);
  };

  const seasonAvgWithTies=withTiePositions(seasonAvg,"avg");
  const top15AvgWithTies=withTiePositions(top15Avg,"avg");
  const eventEntriesWithTies=withTiePositions(eventEntries,"total_stableford_points");

  // ── Season Replay (Season Avg / Top 15 Avg tabs) ────────────
  // Scrub through the season event-by-event and watch the
  // standings recompute as if only the first N events had
  // happened yet. Chronological order, oldest first.
  const seasonEventsAsc=useMemo(()=>
    [...seasonEvents].sort((a:any,b:any)=>new Date(a.date).getTime()-new Date(b.date).getTime())
  ,[seasonEvents]);
  const numSeasonEvents=seasonEventsAsc.length;

  // Per-golfer points keyed by event_id (deduped, mirrors buildSeasonRounds)
  const seasonPointsByEvent=useMemo(()=>{
    const map:Record<number,Record<number,number>>={};
    leaderboardCompleted.forEach((r:any)=>{
      if(r.season!==selSeason)return;
      const g=golfers.find((x:any)=>x.golfer_id===r.golfer_id);
      if(!g||g.is_guest)return;
      if(!map[r.golfer_id])map[r.golfer_id]={};
      const existing=map[r.golfer_id][r.event_id];
      if(existing==null||r.total_stableford_points>existing)map[r.golfer_id][r.event_id]=r.total_stableford_points;
    });
    return map;
  },[leaderboardCompleted,selSeason,golfers]);

  const [seasonScrub,setSeasonScrub]=useState(numSeasonEvents);
  useEffect(()=>{setSeasonScrub(numSeasonEvents);},[numSeasonEvents,selSeason]);

  const isSeasonReplaying=numSeasonEvents>1&&seasonScrub<numSeasonEvents;

  // Recompute season avg / top15 avg using only events[0..seasonScrub)
  const{seasonAvgReplay,top15AvgReplay}=useMemo(()=>{
    if(!isSeasonReplaying)return{seasonAvgReplay:seasonAvg,top15AvgReplay:top15Avg};
    const eventIdsThru=new Set(seasonEventsAsc.slice(0,seasonScrub).map((e:any)=>e.event_id));
    const sa:any[]=[];const ta:any[]=[];
    Object.entries(seasonPointsByEvent).forEach(([gid,byEvent])=>{
      const pts=Object.entries(byEvent).filter(([eid])=>eventIdsThru.has(parseInt(eid))).map(([,p])=>p as number);
      if(!pts.length)return;
      const finalRow=seasonAvg.find((r:any)=>r.golfer_id===parseInt(gid));
      const qualified=finalRow?.qualified??false;
      sa.push({golfer_id:parseInt(gid),avg:pts.reduce((a,b)=>a+b,0)/pts.length,rounds:pts.length,qualified});
      const top=[...pts].sort((a,b)=>b-a).slice(0,15);
      ta.push({golfer_id:parseInt(gid),avg:top.reduce((a,b)=>a+b,0)/top.length,rounds:pts.length,qualified});
    });
    sa.sort((a,b)=>b.avg-a.avg);
    ta.sort((a,b)=>b.avg-a.avg);
    return{seasonAvgReplay:sa,top15AvgReplay:ta};
  },[isSeasonReplaying,seasonScrub,seasonEventsAsc,seasonPointsByEvent,seasonAvg,top15Avg]);

  const seasonAvgWithTiesReplay=withTiePositions(seasonAvgReplay,"avg");
  const top15AvgWithTiesReplay=withTiePositions(top15AvgReplay,"avg");

  // ── Trajectory maps: position movement since previous event ──────────────
  // Compute "prev" standings by replaying one event earlier, then diff ranks.
  // Keyed by golfer_id; value is delta (positive = moved up) or null (no indicator).
  const buildAvgFromPoints=(pointsMap:Record<number,Record<number,number>>,eventIds:Set<number>,top15:boolean,qualifiedRef:any[]):any[]=>{
    const rows:any[]=[];
    Object.entries(pointsMap).forEach(([gid,byEvent])=>{
      const pts=Object.entries(byEvent).filter(([eid])=>eventIds.has(parseInt(eid))).map(([,p])=>p as number);
      if(!pts.length)return;
      const finalRow=qualifiedRef.find((r:any)=>r.golfer_id===parseInt(gid));
      const qualified=finalRow?.qualified??false;
      if(top15){
        const top=[...pts].sort((a,b)=>b-a).slice(0,15);
        rows.push({golfer_id:parseInt(gid),avg:top.reduce((a,b)=>a+b,0)/top.length,rounds:pts.length,qualified});
      }else{
        rows.push({golfer_id:parseInt(gid),avg:pts.reduce((a,b)=>a+b,0)/pts.length,rounds:pts.length,qualified});
      }
    });
    rows.sort((a,b)=>b.avg-a.avg);
    return rows;
  };

  const buildTrajectoryMap=(currentRows:any[],prevRows:any[]):Record<number,number|null>=>{
    const prevRankMap:Record<number,number>={};
    prevRows.forEach((r:any,i:number)=>{prevRankMap[r.golfer_id]=i+1;});
    const map:Record<number,number|null>={};
    currentRows.forEach((r:any,i:number)=>{
      const currentRank=i+1;
      const prevRank=prevRankMap[r.golfer_id];
      if(prevRank==null){map[r.golfer_id]=null;return;}
      const delta=prevRank-currentRank;
      map[r.golfer_id]=Math.abs(delta)>=2?delta:null;
    });
    return map;
  };

  const{seasonTrajectoryMap,top15TrajectoryMap}=useMemo(()=>{
    // When scrubbing: compare current scrub position vs scrub-1
    // When not scrubbing: compare full standings vs standings excluding most recent event
    const eventIdsAll=new Set(seasonEventsAsc.map((e:any)=>e.event_id as number));

    if(isSeasonReplaying){
      // scrubber active: prev = seasonScrub-1
      if(seasonScrub<=1){
        const empty:Record<number,number|null>={};
        seasonAvgWithTiesReplay.forEach((r:any)=>{empty[r.golfer_id]=null;});
        top15AvgWithTiesReplay.forEach((r:any)=>{empty[r.golfer_id]=null;});
        return{seasonTrajectoryMap:empty,top15TrajectoryMap:empty};
      }
      const prevEventIds=new Set(seasonEventsAsc.slice(0,seasonScrub-1).map((e:any)=>e.event_id as number));
      const prevSa=buildAvgFromPoints(seasonPointsByEvent,prevEventIds,false,seasonAvg);
      const prevTa=buildAvgFromPoints(seasonPointsByEvent,prevEventIds,true,top15Avg);
      return{
        seasonTrajectoryMap:buildTrajectoryMap(seasonAvgReplay,prevSa),
        top15TrajectoryMap:buildTrajectoryMap(top15AvgReplay,prevTa),
      };
    }

    // Not scrubbing: prev = all events minus the most recent
    if(seasonEventsAsc.length<=1){
      const empty:Record<number,number|null>={};
      seasonAvgWithTiesReplay.forEach((r:any)=>{empty[r.golfer_id]=null;});
      top15AvgWithTiesReplay.forEach((r:any)=>{empty[r.golfer_id]=null;});
      return{seasonTrajectoryMap:empty,top15TrajectoryMap:empty};
    }
    const prevEventIds=new Set(seasonEventsAsc.slice(0,-1).map((e:any)=>e.event_id as number));
    void eventIdsAll;
    const prevSa=buildAvgFromPoints(seasonPointsByEvent,prevEventIds,false,seasonAvg);
    const prevTa=buildAvgFromPoints(seasonPointsByEvent,prevEventIds,true,top15Avg);
    return{
      seasonTrajectoryMap:buildTrajectoryMap(seasonAvg,prevSa),
      top15TrajectoryMap:buildTrajectoryMap(top15Avg,prevTa),
    };
  },[isSeasonReplaying,seasonScrub,seasonEventsAsc,seasonPointsByEvent,seasonAvg,top15Avg,seasonAvgReplay,top15AvgReplay,seasonAvgWithTiesReplay,top15AvgWithTiesReplay]);

  // Measure collapsed row height once so reordered rows can animate via `top`
  const lbRowRefs=useRef<Record<number,HTMLDivElement|null>>({});
  const [lbRowH,setLbRowH]=useState<number|null>(null);
  useLayoutEffect(()=>{
    if(expandedId!=null)return; // don't measure while a row is expanded (taller)
    for(const k of Object.keys(lbRowRefs.current)){
      const el=lbRowRefs.current[Number(k)];
      if(el){const h=el.getBoundingClientRect().height;if(h>0){setLbRowH(h);break;}}
    }
  },[seasonAvgWithTiesReplay.length,top15AvgWithTiesReplay.length,expandedId,subTab]);

  // ScoreSymbol moved to module scope — see below LeaderboardTab

  // Render ESPN-style leaderboard row
  const renderLbRow=(row:any,mode:"season"|"weekly",trajectoryDelta?:number|null)=>{
    const gid=row.golfer_id;
    const g=golfers.find((x:any)=>x.golfer_id===gid);
    const isExpanded=expandedId===gid;
    const stats=golferStats(golfers,leaderboardCompleted,gid,selSeason);
    // 4: tie display
    const posLabel=row.tied?`T${row.pos}`:String(row.pos);
    const rankClass=row.pos===1?"r1":row.pos===2?"r2":row.pos===3?"r3":"";

    const weeklyEntry=mode==="weekly"?leaderboard.find((r:any)=>r.event_id===displayEvent?.event_id&&r.golfer_id===gid):null;
    const hbhScores=weeklyEntry?.entry_type==="Hole-by-Hole"
      ?holeScores.filter((hs:any)=>hs.summary_id===weeklyEntry.summary_id).sort((a:any,b:any)=>a.hole_number-b.hole_number)
      :[];
    const signup=displayEvent?signups.find((s:any)=>s.event_id===displayEvent.event_id&&s.golfer_id===gid):null;
    const teePlayed=signup?.tee_box_course_id?courses.find((c:any)=>c.course_id===signup.tee_box_course_id):null;
    // Derive weekly earnings from score rankings (stored fields are often 0)
    const weeklyEarned=(()=>{
      if(!weeklyEntry||!weeklyEntry.buy_in_paid)return 0;
      const paidEv=eventEntries.filter((e:any)=>e.buy_in_paid).sort((a:any,b:any)=>b.total_stableford_points-a.total_stableford_points);
      if(!paidEv.length)return 0;
      const pot=paidEv.length*20;
      const topPts=paidEv[0].total_stableford_points;
      const tied1stEv=paidEv.filter((e:any)=>e.total_stableford_points===topPts);
      const secondPts=tied1stEv.length===1&&paidEv.length>1?paidEv[1]?.total_stableford_points:null;
      const tied2ndEv=secondPts!=null?paidEv.filter((e:any)=>e.total_stableford_points===secondPts):[];
      let earned=0;
      if(tied1stEv.some((e:any)=>e.golfer_id===gid)){
        earned=tied1stEv.length===1?pot*(2/3):pot/tied1stEv.length;
      } else if(tied2ndEv.some((e:any)=>e.golfer_id===gid)){
        earned=(pot*(1/3))/tied2ndEv.length;
      }
      // Use live skins calculation if available, else fall back to stored field
      earned+=hasLiveSkins?(liveSkinPayouts[gid]||0):Number(weeklyEntry.skins_payout_won||0);
      return earned;
    })();

    // ── Post-round decay ──────────────────────────────────────
    // The weekly #1 finisher's row gets a slow gold shimmer that fades
    // to nothing over the 24h following the event. Marks "this just
    // happened" -> "this is now history" without any explicit label.
    let decayOpacity=0;
    if(mode==="weekly"&&row.pos===1&&displayEvent?.date){
      const eventTime=new Date(displayEvent.date+"T00:00:00").getTime();
      const hoursSince=(Date.now()-eventTime)/3600000;
      if(hoursSince>=0&&hoursSince<36)decayOpacity=1-hoursSince/36;
    }

    return(
      <div key={gid}>
        <div
          className={`lb-row${isExpanded?" expanded lb-row-open":""}${decayOpacity>0?" post-win":""}`}
          style={decayOpacity>0?{["--decay-opacity" as any]:decayOpacity.toFixed(3)}:undefined}
          onClick={()=>{
            // Preserve overlay scroll position -- expanding a row changes layout
            // height which can cause the overlay scroll container to jump.
            const savedScroll=overlayScrollRef.current?.scrollTop??0;
            setExpandedId(isExpanded?null:gid);
            requestAnimationFrame(()=>{
              if(overlayScrollRef.current)overlayScrollRef.current.scrollTop=savedScroll;
            });
          }}
        >
          <div className={`lb-rank-cell ${rankClass}`} style={{fontSize:row.tied?16:22,fontWeight:700,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:1}}>
            {trajectoryDelta!=null&&trajectoryDelta>=3&&<span style={{fontSize:9,lineHeight:1,color:"var(--green-500)"}}>▲</span>}
            {trajectoryDelta!=null&&trajectoryDelta<=-3&&<span style={{fontSize:9,lineHeight:1,color:"#c0392b"}}>▼</span>}
            {posLabel}
          </div>
          <div className="lb-name-cell">
            <div className="lb-name-main">{(()=>{
              if(!g)return"Unknown";
              // Easter egg: Errol Kaplan wins the weekly event -> "Happy Kappy -" when expanded
              const isErrol=g.first_name==="Errol"&&g.last_name==="Kaplan";
              const topGidPaid=paidEntries[0]?.golfer_id;
              const topPtsPaid=paidEntries[0]?.total_stableford_points;
              const errolSoloWin=mode==="weekly"&&paidEntries.length>0&&topGidPaid===gid
                &&(paidEntries.length===1||paidEntries[1].total_stableford_points<topPtsPaid);
              if(isErrol&&errolSoloWin&&isExpanded)return"Happy Kappy 😊";
              return g.first_name+" "+g.last_name;
            })()}</div>
          </div>
          <div className="lb-score-cell">
            {/* 4b: 2 decimal places on season avg */}
            <div className="lb-score-big">{mode==="season"?(row.avg as number).toFixed(2):mode==="weekly"?(row as any).total_stableford_points:""}</div>
          </div>
          <div className="lb-thru-cell">
            {mode==="season"
              ?<div className="lb-thru-big">{row.rounds}{!row.qualified?"*":""}</div>
              :<div className="lb-thru-big" style={{color:weeklyEarned>0?"var(--gold-600)":"var(--text-muted)",fontSize:15}}>{weeklyEarned>0?`$${weeklyEarned.toFixed(0)}`:"--"}</div>
            }
          </div>
        </div>
        {isExpanded&&(
          <div className="lb-detail">
            {mode==="season"?(()=>{
              const chronoRounds:number[]=seasonEventsAsc
                .map((e:any)=>seasonPointsByEvent[gid]?.[e.event_id])
                .filter((v:any)=>v!=null) as number[];

              if(subTab==="top15"){
                // Top 15 avg — scoring band donut above tiles + revised tile metrics
                const sorted=[...chronoRounds].sort((a,b)=>b-a);
                const top15Rounds=sorted.slice(0,15);
                const myTop15Row=top15AvgWithTiesReplay.find((r:any)=>r.golfer_id===gid);
                // Tile 3: Worst round counting toward top 15 avg (lowest score in top15Rounds)
                const worstTop15=top15Rounds.length>0?top15Rounds[top15Rounds.length-1]:null;
                const worstTop15Val=worstTop15!=null?String(worstTop15):"--";
                // Tile 4: Gap to 1st place avg
                const myAvg=myTop15Row?.avg??null;
                const firstRow=top15AvgWithTiesReplay[0];
                let gapTo1st:"—"|string="—";
                if(myAvg!=null&&firstRow&&firstRow.golfer_id!==gid&&firstRow.avg!=null){
                  gapTo1st=`−${(firstRow.avg-myAvg).toFixed(2)}`;
                }
                // Donut chart data
                const bandDefs=[
                  {count:top15Rounds.filter(p=>p>=40).length,color:"#c9a227",label:"40+"},
                  {count:top15Rounds.filter(p=>p>=35&&p<40).length,color:"#1e3320",label:"35–39"},
                  {count:top15Rounds.filter(p=>p>=30&&p<35).length,color:"#4a7a5a",label:"30–34"},
                  {count:top15Rounds.filter(p=>p<30).length,color:"#b94040",label:"<30"},
                ];
                const totalBands=top15Rounds.length||1;
                const showDonut=top15Rounds.length>0;
                return(
                  <div className="drawer-shell">
                    {showDonut&&(()=>{
                      const CX=56,CY=56,R=38,SW=22;
                      let cursor=-90;
                      const arcs=bandDefs.map((b,i)=>{
                        if(b.count===0)return null;
                        const sweep=Math.min((b.count/totalBands)*360,359.999);
                        const startRad=cursor*Math.PI/180;
                        const endRad=(cursor+sweep)*Math.PI/180;
                        const sx=CX+R*Math.cos(startRad),sy=CY+R*Math.sin(startRad);
                        const ex=CX+R*Math.cos(endRad),ey=CY+R*Math.sin(endRad);
                        const large=sweep>180?1:0;
                        cursor+=sweep;
                        return<path key={i} d={`M${sx.toFixed(2)},${sy.toFixed(2)} A${R},${R} 0 ${large},1 ${ex.toFixed(2)},${ey.toFixed(2)}`} fill="none" stroke={b.color} strokeWidth={SW}/>;
                      });
                      return(
                        <div className="drawer-chart-zone">
                          <div className="drawer-card-section-label" style={{textAlign:"center"}}>TOP 15 SCORING</div>
                          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:16}}>
                            <svg width={112} height={112} style={{flexShrink:0}}>
                              {arcs}
                              <text x={CX} y={CY-5} textAnchor="middle" fontSize="18" fontWeight="800" fill="var(--text-primary)">{top15Rounds.length}</text>
                              <text x={CX} y={CY+12} textAnchor="middle" fontSize="10" fill="var(--text-muted)">rounds</text>
                            </svg>
                            <div style={{display:"flex",flexDirection:"column",gap:7}}>
                              {bandDefs.map(b=>(
                                <div key={b.label} style={{display:"flex",alignItems:"center",gap:7}}>
                                  <div style={{width:10,height:10,borderRadius:"50%",background:b.color,flexShrink:0}}/>
                                  <span style={{fontSize:12,fontWeight: 600,color:"var(--text-muted)",minWidth:38}}>{b.label}</span>
                                  <span style={{fontSize:13,fontWeight:700,color:"var(--text-primary)"}}>{b.count}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                    <div className="drawer-tiles">
                      <div className="drawer-tile">
                        <div className="drawer-tile-value">{g?.current_handicap_index?.toFixed(1)??"--"}</div>
                        <div className="drawer-tile-label">HCP</div>
                      </div>
                      <div className="drawer-tile">
                        <div className="drawer-tile-value val-gold">{top15Rounds[0]??stats.best}</div>
                        <div className="drawer-tile-label">Best</div>
                      </div>
                      <div className="drawer-tile">
                        <div className="drawer-tile-value val-red">{worstTop15Val}</div>
                        <div className="drawer-tile-label">Low</div>
                      </div>
                      <div className="drawer-tile">
                        <div className="drawer-tile-value">{gapTo1st}</div>
                        <div className="drawer-tile-label">Gap to 1st</div>
                      </div>
                    </div>
                    {onNavigateToAnalyticsGolfer&&(
                      <div style={{paddingBottom:5}}>
                        <div className="">
                          <button className="drawer-profile-pill" onClick={(e:any)=>{e.stopPropagation();onNavigateToAnalyticsGolfer(String(gid),"Top 15 Avg",subTab);}}>
                            View Profile
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              }

              // Season avg drawer — HCP trend sparkline above tile strip
              const evDateMap2:Record<number,string>={};
              events.forEach((e:any)=>{evDateMap2[e.event_id]=e.date;});
              const hcpPts=signups
                .filter((s:any)=>s.golfer_id===gid&&s.playing_handicap!=null&&evDateMap2[s.event_id])
                .map((s:any)=>({
                  hcp:s.playing_handicap,
                  pts:seasonPointsByEvent[gid]?.[s.event_id]??null,
                  eventId:s.event_id,
                  date:evDateMap2[s.event_id],
                }))
                .sort((a:any,b:any)=>new Date(a.date).getTime()-new Date(b.date).getTime());
              // Require at least 3 distinct data points for a meaningful trend
              const showHcpChart=hcpPts.length>=3;
              // Trend direction: compare last value to first
              const hcpFirst=hcpPts.length>0?hcpPts[0].hcp:null;
              const hcpLast=hcpPts.length>0?hcpPts[hcpPts.length-1].hcp:null;
              const hcpDelta=hcpFirst!=null&&hcpLast!=null?hcpLast-hcpFirst:null;
              const trendDown=hcpDelta!=null&&hcpDelta<-0.4;
              const trendUp=hcpDelta!=null&&hcpDelta>0.4;
              const trendColor=trendDown?"var(--green-600)":trendUp?"#b94040":"var(--text-muted)";
              const trendArrow=trendDown?"↓":trendUp?"↑":"→";
              const trendLabel=hcpDelta!=null
                ?(trendDown?`↓ ${Math.abs(hcpDelta).toFixed(1)} this season`:trendUp?`↑ ${Math.abs(hcpDelta).toFixed(1)} this season`:"Stable this season")
                :"";
              // Best-round event annotation
              const bestPtsEntry=hcpPts.length>0?hcpPts.reduce((best:any,h:any)=>h.pts!=null&&(best==null||h.pts>best.pts)?h:best,null):null;
              // SVG sparkline math (only computed when showHcpChart)
              const spW=160,spH=52,spPad=4;
              const hcpVals=hcpPts.map((h:any)=>h.hcp);
              const hcpMinV=showHcpChart?Math.min(...hcpVals)-0.5:0;
              const hcpMaxV=showHcpChart?Math.max(...hcpVals)+0.5:1;
              const hcpRange=Math.max(hcpMaxV-hcpMinV,0.5);
              const xOf=(i:number)=>spPad+(i/(hcpPts.length-1))*(spW-spPad*2);
              const yOf=(hcp:number)=>spH-spPad-((hcp-hcpMinV)/hcpRange)*(spH-spPad*2);
              const polyPoints=hcpPts.map((h:any,i:number)=>`${xOf(i).toFixed(1)},${yOf(h.hcp).toFixed(1)}`).join(" ");
              const lineCol=trendDown?"#b94040":trendUp?"#4a7a5a":"#9c7c65";
              const netSign=stats.netEarnings>=0;
              const netLabel=netSign?`+$${stats.netEarnings.toFixed(0)}`:`-$${Math.abs(stats.netEarnings).toFixed(0)}`;
              return(
                <div className="drawer-shell">
                  {showHcpChart&&(
                    <div className="drawer-chart-zone">
                      {(stats.wins>0||stats.seconds>0)&&(
                        <div style={{gap:6,flexWrap:"wrap",marginBottom:6}}>
                          {stats.wins>0&&<span className="drawer-badge-win">&#127942; {stats.wins} win{stats.wins>1?"s":""}</span>}
                          {stats.seconds>0&&<span className="drawer-badge-pod">&#129352; {stats.seconds}x 2nd</span>}
                        </div>
                      )}
                      <div className="drawer-card-section-label" style={{textAlign:"center"}}>COURSE HANDICAP TREND</div>
                      
                      <svg viewBox={`0 0 ${spW} ${spH}`} width="100%" height={spH} style={{overflow:"visible",display:"block"}}>
                        <defs>
                          <linearGradient id={`hcpfill-${gid}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={lineCol} stopOpacity="0.12"/>
                            <stop offset="100%" stopColor={lineCol} stopOpacity="0"/>
                          </linearGradient>
                        </defs>
                        <polygon
                          points={`${polyPoints} ${xOf(hcpPts.length-1).toFixed(1)},${spH} ${xOf(0).toFixed(1)},${spH}`}
                          fill={`url(#hcpfill-${gid})`}
                        />
                        <polyline points={polyPoints} fill="none"
                          stroke={lineCol} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        {hcpPts.map((h:any,i:number)=>{
                          const isRecent=i===hcpPts.length-1;
                          const isBest=bestPtsEntry&&h.eventId===bestPtsEntry.eventId;
                          const cx=xOf(i),cy=yOf(h.hcp);
                          return(
                            <g key={i}>
                              <circle cx={cx} cy={cy} r={isRecent?5:isBest?4.5:3}
                                fill={isRecent?"#c9a227":lineCol}
                                stroke="#fff" strokeWidth={isRecent?2:1.5}
                              />
                            </g>
                          );
                        })}
                        <text x={xOf(0)} y={spH+12} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--text-muted)">{hcpVals[0]}</text>
                        <text x={xOf(hcpPts.length-1)} y={spH+12} textAnchor="middle" fontWeight="600" fontSize="12" fill="var(--text-muted)">{hcpVals[hcpVals.length-1]}</text>
                      </svg>
                      {trendLabel&&(
                        <div style={{marginTop:25,fontSize:12,color:trendColor,fontWeight:600,textAlign:"center"}}>
                          {trendLabel}
                        </div>
                      )}
                    </div>
                  )}
                  {!showHcpChart&&(stats.wins>0||stats.seconds>0)&&(
                    <div style={{gap:6,flexWrap:"wrap",padding:"0 10px 8px"}}>
                      {stats.wins>0&&<span className="drawer-badge-win">&#127942; {stats.wins} win{stats.wins>1?"s":""}</span>}
                      {stats.seconds>0&&<span className="drawer-badge-pod">&#129352; {stats.seconds}x 2nd</span>}
                    </div>
                  )}
                  <div className="drawer-tiles">
                    
                    <div className="drawer-tile">
                      <div className="drawer-tile-value">{g?.current_handicap_index?.toFixed(1)??"--"}</div>
                      <div className="drawer-tile-label">HCP</div>
                    </div>
                    <div className="drawer-tile">
                      <div className="drawer-tile-value val-gold">{stats.best}</div>
                      <div className="drawer-tile-label">Best</div>
                    </div>
                    <div className="drawer-tile">
                      <div className="drawer-tile-value val-red">{stats.worst}</div>
                      <div className="drawer-tile-label">Worst</div>
                    </div>
                    <div className="drawer-tile">
                      <div className={`drawer-tile-value${netSign?" val-gold":" val-red"}`}>{netLabel}</div>
                      <div className="drawer-tile-label">Net Earnings</div>
                    </div>
                  </div>
                  
                  <div style={{paddingBottom:5}}>
                    <div className="">
                      {onNavigateToAnalyticsGolfer&&(
                        <button className="drawer-profile-pill" onClick={(e:any)=>{e.stopPropagation();onNavigateToAnalyticsGolfer(String(gid),"Season Average",subTab);}}>
                          View Profile
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })():(()=>{
              // 5: weekly detail with total score + proper scorecard
              const course=teePlayed||courses.find((c:any)=>c.course_name===displayEvent?.course_name);
              const front9=hbhScores.slice(0,9);
              const back9=hbhScores.slice(9,18);
              const front9Gross=front9.reduce((s:number,h:any)=>s+(h.gross_score||0),0);
              const back9Gross=back9.reduce((s:number,h:any)=>s+(h.gross_score||0),0);
              const front9Pts=front9.reduce((s:number,h:any)=>s+(h.stableford_points||0),0);
              const back9Pts=back9.reduce((s:number,h:any)=>s+(h.stableford_points||0),0);
              return(
                <>
                  <div className="drawer-shell">
                    <div className="drawer-tiles">
                      <div className="drawer-tile">
                        <div className="drawer-tile-value">{signup?.playing_handicap!=null?signup.playing_handicap:(g&&teePlayed?calcPlayingHandicap(g.current_handicap_index,teePlayed.tee_slope,teePlayed.tee_rating,teePlayed.par):"--")}</div>
                        <div className="drawer-tile-label">Course HCP</div>
                      </div>
                      <div className="drawer-tile">
                        <div className="drawer-tile-value">{teePlayed?.tee_box_name??"--"}</div>
                        <div className="drawer-tile-label">Tees</div>
                      </div>
                      <div className="drawer-tile">
                        <div className="drawer-tile-value">{hbhScores.length>0?front9Gross+back9Gross:"--"}</div>
                        <div className="drawer-tile-label">Gross</div>
                      </div>
                      <div className="drawer-tile">
                        <div className={`drawer-tile-value${(hasLiveSkins?(liveSkinPayouts[gid]||0):Number(weeklyEntry?.skins_payout_won||0))>0?" val-gold":""}`}>
                          {(()=>{const s=hasLiveSkins?(liveSkinPayouts[gid]||0):Number(weeklyEntry?.skins_payout_won||0);return s>0?`$${s.toFixed(0)}`:"--";})()}
                        </div>
                        <div className="drawer-tile-label">Skins</div>
                      </div>
                    </div>

                  {/* Full golf scorecard table */}
                  {hbhScores.length>0&&course&&(()=>{
                    // Build a single unified 11-column table (label + 9 holes + OUT/IN + TOT)
                    // F9 rows on top, B9 rows below — columns align so hole 1 is above hole 10, etc.
                    const f9pars=course?.hole_pars?.slice(0,9)||[];
                    const b9pars=course?.hole_pars?.slice(9,18)||[];
                    const totPar=(course?.hole_pars||[]).reduce((a:number,b:number)=>a+b,0)||"";
                    const totGross=front9Gross+back9Gross||"";
                    const totPts=front9Pts+back9Pts;
                    // helper: skin style for a given hole number
                    const sk=(hNum:number)=>skinHoleWinners[hNum]===gid;
                    return(
                      <div>
                        <div style={{fontSize:14,fontWeight:700,color:"var(--text-muted)",letterSpacing:"0.06em",textAlign:"center",textTransform:"uppercase",marginBottom:4}}>Scorecard</div>
                        <div style={{overflowX:"auto",margin:8,paddingLeft:2,paddingRight:2}}>
                          <table className="scorecard-table" style={{minWidth:0,width:"100%"}}>
                            {/* ── COL sizing: label | 9 hole cols | summary | tot ── */}
                            <colgroup>
                              <col style={{width:"10%"}}/>
                              {Array.from({length:9},(_,i)=><col key={i} style={{width:"7%"}}/>)}
                              <col style={{width:"7%"}}/>
                              <col style={{width:"7%"}}/>
                            </colgroup>

                            {/* ══ FRONT NINE ══ */}
                            <thead>
                              <tr>
                                <th className="label-col" style={{textTransform:"uppercase"}}>HOLE</th>
                                {[1,2,3,4,5,6,7,8,9].map(hNum=>{
                                  const wonSkin=sk(hNum);
                                  return<th key={hNum} style={wonSkin?{background:"var(--gold-100,#fef3cd)",color:"var(--gold-700)"}:{}}>{hNum}{wonSkin?" 💰":""}</th>;
                                })}
                                <th className="total-col">OUT</th>
                                <th className="total-col" style={{background:"var(--surface2)",color:"transparent",userSelect:"none"}}>TOT</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td className="label-col" style={{textTransform:"uppercase",fontSize:12}}>PAR</td>
                                {f9pars.map((p:number,i:number)=>{
                                  const hNum=i+1;
                                  return<td key={i} style={{color:"var(--text-muted)",fontSize:13,...(sk(hNum)?{background:"var(--gold-50,#fffbeb)"}:{})}}>{p}</td>;
                                })}
                                <td className="total-col">{f9pars.reduce((a:number,b:number)=>a+b,0)||""}</td>
                                <td className="total-col" style={{background:"var(--surface2)"}}></td>
                              </tr>
                              {front9.length>0&&<tr>
                                <td className="label-col" style={{textTransform:"uppercase",fontSize:12}}>SCORE</td>
                                {front9.map((h:any,i:number)=>{
                                  const par=f9pars[i];
                                  const hNum=i+1;
                                  return<td key={i} style={sk(hNum)?{background:"var(--gold-50,#fffbeb)"}:{}}>{h.gross_score&&par!=null?<ScoreSymbol gross={h.gross_score} par={par}/>:""}</td>;
                                })}
                                <td className="total-col">{front9Gross||""}</td>
                                <td className="total-col" style={{background:"var(--surface2)"}}></td>
                              </tr>}
                              {front9.length>0&&<tr>
                                <td className="label-col" style={{textTransform:"uppercase",color:"var(--text-muted)",fontSize:12}}>PTS</td>
                                {front9.map((h:any,i:number)=>{
                                  const hNum=i+1;
                                  return<td key={i} style={{fontSize:15,...(sk(hNum)?{background:"var(--gold-50,#fffbeb)",fontWeight:700,color:"var(--gold-700)"}:{color:"var(--text-muted)"})}}>{h.stableford_points!=null?h.stableford_points:""}</td>;
                                })}
                                <td className="total-col" style={{color:"var(--green-700)"}}>{front9Pts}</td>
                                <td className="total-col" style={{background:"var(--surface2)"}}></td>
                              </tr>}
                            </tbody>

                            {/* ══ BACK NINE ══ */}
                            <tbody>
                              <tr style={{borderTop:"2px solid var(--border-md)"}}>
                                <th className="label-col" style={{textTransform:"uppercase",background:"var(--green-900)",color:"var(--gold-300)",fontWeight:700,fontSize:11,padding:"5px 3px 5px 8px",textAlign:"left",whiteSpace:"nowrap"}}>HOLE</th>
                                {[10,11,12,13,14,15,16,17,18].map(hNum=>{
                                  const wonSkin=sk(hNum);
                                  return<th key={hNum} style={{background:wonSkin?"var(--gold-100,#fef3cd)":"var(--green-900)",color:wonSkin?"var(--gold-700)":"var(--gold-300)",fontWeight:700,fontSize:11,padding:"5px 3px",textAlign:"center"}}>{hNum}{wonSkin?" 💰":""}</th>;
                                })}
                                <th className="total-col" style={{background:"var(--green-900)",color:"var(--gold-300)",fontWeight:700,fontSize:11,padding:"5px 3px"}}>IN</th>
                                <th className="total-col" style={{background:"var(--green-900)",color:"var(--gold-300)",fontWeight:700,fontSize:11,padding:"5px 3px"}}>TOT</th>
                              </tr>
                              <tr>
                                <td className="label-col" style={{textTransform:"uppercase",fontSize:12}}>PAR</td>
                                {b9pars.map((p:number,i:number)=>{
                                  const hNum=i+10;
                                  return<td key={i} style={{color:"var(--text-muted)",fontSize:14,...(sk(hNum)?{background:"var(--gold-50,#fffbeb)"}:{})}}>{p}</td>;
                                })}
                                <td className="total-col">{b9pars.reduce((a:number,b:number)=>a+b,0)||""}</td>
                                <td className="total-col">{totPar}</td>
                              </tr>
                              {back9.length>0&&<tr>
                                <td className="label-col" style={{textTransform:"uppercase",fontSize:12}}>SCORE</td>
                                {back9.map((h:any,i:number)=>{
                                  const par=b9pars[i];
                                  const hNum=i+10;
                                  return<td key={i} style={sk(hNum)?{background:"var(--gold-50,#fffbeb)"}:{}}>{h.gross_score&&par!=null?<ScoreSymbol gross={h.gross_score} par={par}/>:""}</td>;
                                })}
                                <td className="total-col">{back9Gross||""}</td>
                                <td className="total-col">{totGross}</td>
                              </tr>}
                              {back9.length>0&&<tr>
                                <td className="label-col" style={{textTransform:"uppercase",color:"var(--text-muted)",fontSize:12}}>PTS</td>
                                {back9.map((h:any,i:number)=>{
                                  const hNum=i+10;
                                  return<td key={i} style={{fontSize:15,...(sk(hNum)?{background:"var(--gold-50,#fffbeb)",fontWeight:700,color:"var(--gold-700)"}:{color:"var(--text-muted)"})}}>{h.stableford_points!=null?h.stableford_points:""}</td>;
                                })}
                                <td className="total-col" style={{color:"var(--green-700)"}}>{back9Pts}</td>
                                <td className="total-col" style={{color:"var(--green-700)",fontWeight:700}}>{totPts}</td>
                              </tr>}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}
                  {hbhScores.length===0&&<div style={{fontSize:13,color:"var(--text-muted)",fontStyle:"italic",marginTop:4,padding:"0 9px 9px"}}>Total-only entry -- no hole-by-hole data</div>}
                  {(()=>{
                    const evPts=weeklyEntry?.total_stableford_points;
                    const seasonAvgForGolfer=byG[gid]?.length?(byG[gid].reduce((a:number,b:number)=>a+b,0)/byG[gid].length):null;
                    const diff=evPts!=null&&seasonAvgForGolfer!=null?evPts-seasonAvgForGolfer:null;
                    const absDiff=diff!=null?Math.abs(diff).toFixed(1):null;
                    const insightText=diff!=null&&evPts!=null&&seasonAvgForGolfer!=null
                      ?(diff>=0
                        ?`${evPts} pts is +${absDiff} above their ${seasonAvgForGolfer.toFixed(1)} season avg`
                        :`${evPts} pts, ${absDiff} below their ${seasonAvgForGolfer.toFixed(1)} season avg`)
                      :null;
                    const aiInsight=!g?.is_guest&&displayEvent?.ai_golfer_insights
                      ?displayEvent.ai_golfer_insights[String(gid)]??null
                      :null;
                    return(
                      <div className="" style={{marginTop:12}}>
                        {/* AI per-golfer insight from Tony -- only shown when available */}
                        {aiInsight&&(
                          <div className="drawer-card" style={{marginBottom:10}}>
                            <div className="drawer-card-body">
                              <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:6}}>
                                <Sparkles size={11} fill="currentColor" style={{color:"var(--text-muted)",flexShrink:0}}/>
                                <div className="drawer-card-section-label" style={{marginBottom:0}}>PLAYER INSIGHT</div>
                              </div>
                              <p style={{margin:0,fontSize:13,lineHeight:1.55,color:"var(--text-primary)"}}>{aiInsight}</p>
                            </div>
                          </div>
                        )}
                        <div className="drawer-card-footer">
                          {onNavigateToAnalyticsGolfer&&(
                            <button className="drawer-profile-pill" onClick={(e:any)=>{e.stopPropagation();onNavigateToAnalyticsGolfer(String(gid),"Weekly",subTab);}}>
                              View Profile
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                  </div>{/* end drawer-shell */}
                </>
              );
            })()}
          </div>
        )}
      </div>
    );
  };

  // Render a list of season/top15 rows with FLIP-style position
  // animation so the Season Scrubber can reshuffle them in place.
  const renderSeasonRows=(rows:any[],trajectoryMap?:Record<number,number|null>)=>{
    const animatable=expandedId==null&&lbRowH!=null;
    return(
      <div style={{position:"relative",minHeight:animatable?rows.length*(lbRowH as number):undefined}}>
        {rows.map((row:any,i:number)=>(
          <div
            key={row.golfer_id}
            ref={el=>{lbRowRefs.current[row.golfer_id]=el;}}
            className={`replay-row-wrap${cascadeOn?" lb-cascade":""}${i===rows.length-1?" last":""}`}
            style={{...(animatable?{position:"absolute",left:0,right:0,top:i*(lbRowH as number),transition:"top 0.45s cubic-bezier(0.22,1,0.36,1)"}:{position:"relative"}),["--row-i" as any]:i}}
          >
            {renderLbRow(row,"season",trajectoryMap?trajectoryMap[row.golfer_id]:null)}
          </div>
        ))}
      </div>
    );
  };

  return(
    <div className={isGoldenHour?"golden-hour":undefined} style={{position:"relative"}}>
      <div className="section-title">Leaderboard</div>

      {/* 1) Season dropdown */}
      <div style={{marginBottom:12}}>
        <GlassPicker
          value={selSeason}
          onChange={(y:number)=>{setSelSeason(y);setSelEventId(null);setExpandedId(null);}}
          options={allSeasons.map(y=>({value:y,label:`${y} Season`}))}
        />
      </div>

      <div ref={pillSentinelRef} style={{height:1,marginBottom:-1}}/>
      <div ref={pillRowRef} className="tab-sub">
        {tabs.map(t=>(
          <button key={t.id} className={"tab-sub-btn"+(subTab===t.id?" active":"")} onClick={()=>switchSubTab(t.id)}>
            {t.id==="live"?<><span className="live-dot"/><span style={{fontWeight:700,letterSpacing:"0.05em"}}>LIVE</span></>:t.label}
          </button>
        ))}
      </div>

      {/* Rendered as a plain sibling -- NOT inside SubTabPanel -- so it
          can't be affected by that container's swipe touch handlers,
          entrance-animation transform, or stacking context. Those were
          all suspects for the "scrubber steals the first tap on the
          sub-tab pills" issue. */}
      {(subTab==="season"||subTab==="top15")&&numSeasonEvents>1&&
        <SeasonScrubber value={seasonScrub} setValue={setSeasonScrub} max={numSeasonEvents}/>
      }

      <SubTabPanel tabs={tabs} value={subTab} onChange={switchSubTab}>
      {subTab==="live"&&liveEvent&&(()=>{
        const liveEntries=dedupeLeaderboard(leaderboard.filter((r:any)=>r.event_id===liveEvent.event_id))
          .sort((a:any,b:any)=>b.total_stableford_points-a.total_stableford_points);
        const liveCourse=courses.find((c:any)=>c.course_name===liveEvent.course_name);

        // ── Live skins: highest stableford pts on a hole wins outright (no tie) ──
        // Computed here so they use liveEvent/liveEntries, not displayEvent/eventEntries.
        const liveSkinsEligible=liveEntries.length>0&&liveEntries.every((e:any)=>e.entry_type==="Hole-by-Hole");
        const calcLiveSkinData=():{payouts:Record<number,number>,holeWinners:Record<number,number>}=>{
          if(!liveSkinsEligible)return{payouts:{},holeWinners:{}};
          const skinsPaid=liveEntries.filter((e:any)=>e.skins_paid);
          if(!skinsPaid.length)return{payouts:{},holeWinners:{}};
          const skinPot=skinsPaid.length*10;
          // Map: golfer_id -> hole_number -> stableford_points
          const playerHoleMap:Record<number,Record<number,number>>={};
          skinsPaid.forEach((entry:any)=>{
            const hs=holeScores.filter((h:any)=>h.summary_id===entry.summary_id);
            hs.forEach((h:any)=>{
              if(h.stableford_points==null)return;
              if(!playerHoleMap[entry.golfer_id])playerHoleMap[entry.golfer_id]={};
              playerHoleMap[entry.golfer_id][h.hole_number]=h.stableford_points;
            });
          });
          const playerIds=Object.keys(playerHoleMap).map(Number);
          if(playerIds.length<1)return{payouts:{},holeWinners:{}};
          const skinWins:Record<number,number>={};
          const holeWinners:Record<number,number>={};
          for(let hNum=1;hNum<=18;hNum++){
            const scores=playerIds
              .map(id=>({id,pts:playerHoleMap[id]?.[hNum]}))
              .filter(x=>x.pts!=null);
            if(scores.length<1)continue; // nobody has scored this hole yet
            const maxPts=Math.max(...scores.map(x=>x.pts));
            const leaders=scores.filter(x=>x.pts===maxPts);
            if(leaders.length===1){
              skinWins[leaders[0].id]=(skinWins[leaders[0].id]||0)+1;
              holeWinners[hNum]=leaders[0].id;
            }
            // ties: no skin awarded for this hole
          }
          const totalSkins=Object.values(skinWins).reduce((s,n)=>s+n,0);
          const perSkin=totalSkins?skinPot/totalSkins:0;
          const payouts:Record<number,number>={};
          Object.entries(skinWins).forEach(([gid,wins])=>{payouts[parseInt(gid)]=wins*perSkin;});
          return{payouts,holeWinners};
        };
        const{payouts:liveSkinPayoutsLocal,holeWinners:liveSkinHoleWinners}=calcLiveSkinData();

        // Build rows with THRU count from holeScores + fire streak detection
        const liveRows=liveEntries.map((entry:any)=>{
          const hs=holeScores
            .filter((h:any)=>h.summary_id===entry.summary_id)
            .sort((a:any,b:any)=>a.hole_number-b.hole_number);
          // Fire emoji: last hole >= 3 pts AND at least the 2 most recent holes both >= 3 pts
          let isOnFire=false;
          if(hs.length>=2){
            const last=hs[hs.length-1];
            const prev=hs[hs.length-2];
            isOnFire=(last.stableford_points>=3)&&(prev.stableford_points>=3);
          }
          return{...entry,thru:hs.length,hs,isOnFire};
        });

        // Assign tie positions
        let cp=1;
        const withPos=liveRows.map((r:any,i:number)=>{
          if(i>0&&liveRows[i].total_stableford_points===liveRows[i-1].total_stableford_points)
            return{...r,pos:cp,tied:true};
          cp=i+1; return{...r,pos:cp,tied:false};
        });
        const tiedSet=new Set(withPos.filter((r:any)=>r.tied).map((r:any)=>r.pos));
        const finalRows=withPos.map((r:any)=>tiedSet.has(r.pos)?{...r,tied:true}:r);

        const ScoreSymbolLive=({gross,par}:{gross:number,par:number})=>{
          const d=gross-par;
          const cls=d<=-2?"sc-eagle":d===-1?"sc-birdie":d===0?"sc-par":d===1?"sc-bogey":d===2?"sc-dbl":"sc-triple";
          return <span className={"sc-score "+cls}>{gross}</span>;
        };



        // Weather modal state (local to live tab IIFE via ref trick -- use outer state)
        const showWeatherModal=liveWeatherOpen;
        const setShowWeatherModal=setLiveWeatherOpen;

        return(
          <div>
            <WindParticles windDeg={liveWxData?.current?.windDeg} windSpeed={liveWxData?.current?.wind}/>
            {/* Event header -- tappable to open weather */}
            <div
              onClick={()=>setShowWeatherModal(true)}
              style={{background:"linear-gradient(135deg,var(--green-900),var(--green-700))",borderRadius:"var(--radius-md)",padding:"12px 16px",color:"white",marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",WebkitTapHighlightColor:"transparent"}}>
              <div>
                <div style={{fontSize:11,letterSpacing:"0.1em",textTransform:"uppercase",opacity:0.8,display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                  <span className="live-dot" style={{background:"#ff6b6b"}}/>Scoring in Progress 
                  
                </div>
                <div style={{fontSize:16,textAlign:"left",fontWeight:700}}>{liveEvent.course_name}</div>
                <div style={{fontSize:13,textAlign:"left",opacity:0.7,marginTop:2}}>{formatDate(liveEvent.date)} <span style={{opacity:0.6,fontSize:10}}>· tap for weather</span></div>
                
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:28,fontWeight:700,color:"var(--gold-300)"}}>{liveEntries.length}</div>
                <div style={{fontSize:11,opacity:0.65,letterSpacing:"0.06em",textTransform:"uppercase"}}>Scoring</div>
              </div>
            </div>

            {/* ── Live odds status bar + refresh (above leaderboard) ── */}
            {(()=>{
              if(!eventOdds?.length)return null;
              const oddsMap:Record<number,any>={};
              eventOdds.forEach((o:any)=>{
                const ex=oddsMap[o.golfer_id];
                if(!ex){oddsMap[o.golfer_id]=o;return;}
                if(o.simulation_type==="live"&&ex.simulation_type!=="live"){oddsMap[o.golfer_id]=o;return;}
                if(o.simulation_type===ex.simulation_type&&new Date(o.computed_at)>new Date(ex.computed_at))oddsMap[o.golfer_id]=o;
              });
              const oddsRows=Object.values(oddsMap).filter((o:any)=>o.win_probability>0);
              if(!oddsRows.length)return null;
              const updatedAt=oddsLastUpdated?new Date(oddsLastUpdated).toLocaleTimeString():"…";
              return(
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",borderRadius:"var(--radius-md)",background:"var(--green-50)",border:"1px solid var(--green-200)",marginBottom:14,fontSize:13}}>
                  <span style={{display:"flex",alignItems:"center",gap:6,color:"var(--green-800)"}}>
                    {(()=>{
                      const sh=oddsRows[0]?.snapshot_hole??0;
                      if(sh===99)return`Updated ${updatedAt}`;
                      if(sh===12)return`H12 snapshot · Updated ${updatedAt}`;
                      if(sh===6)return`H6 snapshot · Updated ${updatedAt}`;
                      return`Pre-round odds`;
                    })()}
                  </span>
                  <button onClick={()=>{onTriggerOdds();refreshLiveData();}} disabled={oddsLoading}
                    style={{background:"var(--green-700)",color:"white",border:"none",borderRadius:6,padding:"4px 10px",fontSize:12,cursor:"pointer",opacity:oddsLoading?0.6:1}}>
                    {oddsLoading?"…":"↻ Refresh"}
                  </button>
                </div>
              );
            })()}

            {liveRows.length===0&&(
              <div className="empty-state">
                <div className="empty-text">No scores entered yet</div>
                <div className="empty-sub">Scores will appear here hole by hole as they are entered</div>
              </div>
            )}

            {finalRows.length>0&&(
              <div style={{background:"var(--surface)",borderRadius:"var(--radius-md)",border:"1px solid var(--border)",overflow:"hidden",boxShadow:"var(--shadow-sm)"}}>
                <div style={{display:"grid",gridTemplateColumns:"44px 1fr 56px 52px",padding:"8px 12px",background:"var(--green-900)"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--gold-300)",letterSpacing:"0.07em",textTransform:"uppercase"}}>POS</div>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--gold-300)",letterSpacing:"0.07em",textAlign:"left",marginLeft:5,textTransform:"uppercase"}}>Golfer</div>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--gold-300)",letterSpacing:"0.07em",textTransform:"uppercase",textAlign:"right"}}>PTS</div>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--gold-300)",letterSpacing:"0.07em",textTransform:"uppercase",textAlign:"right"}}>THRU</div>
                </div>

                {(()=>{
                  const liveAnimatable=liveExpandedId==null&&liveRowH!=null;
                  return(
                <div style={{position:"relative",minHeight:liveAnimatable?finalRows.length*(liveRowH as number):undefined}}>
                {finalRows.map((row:any,i:number)=>{
                  const g=golfers.find((x:any)=>x.golfer_id===row.golfer_id);
                  const isExp=liveExpandedId===row.golfer_id;
                  const rankColor=row.pos===1?"var(--gold-500)":row.pos===2?"var(--text-secondary)":row.pos===3?"var(--earth-400,#9c7c65)":"var(--text-muted)";
                  const posLabel=(row.tied?"T":"")+row.pos;
                  const signup=signups.find((s:any)=>s.event_id===liveEvent.event_id&&s.golfer_id===row.golfer_id);
                  const playerCourse=signup?.tee_box_course_id
                    ?courses.find((c:any)=>c.course_id===signup.tee_box_course_id)
                    :liveCourse;
                  const pars:number[]=playerCourse?.hole_pars||[];
                  const front=row.hs.filter((h:any)=>h.hole_number<=9);
                  const back=row.hs.filter((h:any)=>h.hole_number>9);

                  const trailDir=liveTrail[row.golfer_id];
                  const isFlipping=!!livePosFlip[row.golfer_id];
                  const flipFromLabel=isFlipping?(row.tied?"T":"")+livePosFlipFromRef.current[row.golfer_id]:null;

                  return(
                    <div
                      key={row.golfer_id}
                      ref={el=>{liveRowRefs.current[row.golfer_id]=el;}}
                      className={`live-row-wrap${trailDir==="up"?" trail-up":trailDir==="down"?" trail-down":""}${i===finalRows.length-1?" last":""}`}
                      style={liveAnimatable?{position:"absolute",left:0,right:0,top:i*(liveRowH as number)}:{position:"relative"}}
                    >
                      <div className="lb-live-row" onClick={()=>setLiveExpandedId(isExp?null:row.golfer_id)}>
                        <div className="pos-flip" style={{fontSize:18,fontWeight:700,color:rankColor}}>
                          {isFlipping?(
                            <>
                              <span className="pos-flip-face out">{flipFromLabel}</span>
                              <span className="pos-flip-face in">{posLabel}</span>
                            </>
                          ):posLabel}
                        </div>
                        <div>
                          <div style={{fontSize:18,textAlign:"left",marginLeft:5,fontWeight:600}}>{g?g.first_name+" "+g.last_name:"Unknown"}{row.isOnFire&&<span style={{marginLeft:5,fontSize:16}} title="On fire -- 2+ consecutive holes of 3+ pts">🔥</span>}</div>
                          
                        </div>
                        <div style={{fontSize:20,fontWeight:700,color:"var(--green-700)",textAlign:"right"}}>{row.total_stableford_points||"--"}</div>
                        <div style={{fontSize:18,fontWeight:600,color:row.thru===18?"var(--green-600)":"var(--text-muted)",textAlign:"right"}}>
                          {row.thru===18?"F":row.thru||"--"}
                        </div>
                      </div>

                      {isExp&&(()=>{
                        const sk2=(hNum:number)=>liveSkinHoleWinners[hNum]===row.golfer_id;
                        const f9cells=Array.from({length:9},(_,i)=>row.hs.find((h:any)=>h.hole_number===i+1)||null);
                        const b9cells=Array.from({length:9},(_,i)=>row.hs.find((h:any)=>h.hole_number===i+10)||null);
                        const f9gross=f9cells.reduce((s:number,h:any)=>s+(h?.gross_score||0),0);
                        const b9gross=b9cells.reduce((s:number,h:any)=>s+(h?.gross_score||0),0);
                        const f9pts=f9cells.reduce((s:number,h:any)=>s+(h?.stableford_points||0),0);
                        const b9pts=b9cells.reduce((s:number,h:any)=>s+(h?.stableford_points||0),0);
                        const totGross=(f9gross+b9gross)||"";
                        const totPts=f9pts+b9pts;
                        const hasF9=front.length>0;
                        const hasB9=back.length>0;
                        return(
                        <div className="lb-detail">
                          <div className="drawer-shell">
                            <div className="drawer-tiles">
                              <div className="drawer-tile">
                                <div className="drawer-tile-value">{g?.current_handicap_index?.toFixed(1)??"--"}</div>
                                <div className="drawer-tile-label">HCP</div>
                              </div>
                              <div className="drawer-tile">
                                <div className="drawer-tile-value">{playerCourse?.tee_box_name??"--"}</div>
                                <div className="drawer-tile-label">Tees</div>
                              </div>
                              <div className="drawer-tile">
                                <div className="drawer-tile-value">{row.hs.length>0?(f9gross+b9gross)||"--":"--"}</div>
                                <div className="drawer-tile-label">Gross*</div>
                              </div>
                              <div className="drawer-tile">
                                <div className={`drawer-tile-value${(liveSkinPayoutsLocal[row.golfer_id]||0)>0?" val-gold":""}`}>
                                  {(()=>{const s=liveSkinPayoutsLocal[row.golfer_id]||0;return s>0?`$${s.toFixed(0)}`:"--";})()}
                                </div>
                                <div className="drawer-tile-label">Skins</div>
                              </div>
                            </div>
                          {row.hs.length>0&&playerCourse?(
                            <div>
                              <div style={{fontSize:14,fontWeight:700,color:"var(--text-muted)",letterSpacing:"0.06em",textAlign:"center",textTransform:"uppercase",marginBottom:4}}>
                                Scorecard · {playerCourse.tee_box_name} tees
                              </div>
                              {(()=>{
                                return(
                                  <div style={{overflowX:"auto",margin:8,paddingLeft:2,paddingRight:2}}>
                                    <table className="scorecard-table" style={{minWidth:0,width:"100%"}}>
                                      <colgroup>
                                        <col style={{width:"10%"}}/>
                                        {Array.from({length:9},(_,i)=><col key={i} style={{width:"7%"}}/>)}
                                        <col style={{width:"7%"}}/>
                                        <col style={{width:"7%"}}/>
                                      </colgroup>

                                      {/* ── FRONT NINE ── */}
                                      <thead>
                                        <tr>
                                          <th className="label-col" style={{textTransform:"uppercase"}}>HOLE</th>
                                          {[1,2,3,4,5,6,7,8,9].map(hNum=>{
                                            const wonSkin=sk2(hNum);
                                            return<th key={hNum} style={wonSkin?{background:"var(--gold-100,#fef3cd)",color:"var(--gold-700)"}:{}}>{hNum}{wonSkin?" 💰":""}</th>;
                                          })}
                                          <th className="total-col">OUT</th>
                                          <th className="total-col" style={{background:"var(--surface2)",color:"transparent",userSelect:"none"}}>TOT</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        <tr>
                                          <td className="label-col" style={{textTransform:"uppercase",fontSize:12}}>PAR</td>
                                          {f9cells.map((_:any,i:number)=>{
                                            const hNum=i+1;
                                            return<td key={i} style={{color:"var(--text-muted)",fontSize:13,...(sk2(hNum)?{background:"var(--gold-50,#fffbeb)"}:{})}}>{pars[i]||"-"}</td>;
                                          })}
                                          <td className="total-col">{pars.slice(0,9).reduce((a:number,b:number)=>a+b,0)||""}</td>
                                          <td className="total-col" style={{background:"var(--surface2)"}}></td>
                                        </tr>
                                        <tr>
                                          <td className="label-col" style={{textTransform:"uppercase",fontSize:12}}>SCORE</td>
                                          {f9cells.map((h:any,i:number)=>{
                                            const hNum=i+1;
                                            return<td key={i} style={sk2(hNum)?{background:"var(--gold-50,#fffbeb)"}:{}}>{h?<ScoreSymbolLive gross={h.gross_score} par={pars[i]||4}/>:<span style={{color:"var(--border)"}}>·</span>}</td>;
                                          })}
                                          <td className="total-col">{hasF9?f9gross||"":""}</td>
                                          <td className="total-col" style={{background:"var(--surface2)"}}></td>
                                        </tr>
                                        <tr>
                                          <td className="label-col" style={{textTransform:"uppercase",color:"var(--text-muted)",fontSize:12}}>PTS</td>
                                          {f9cells.map((h:any,i:number)=>{
                                            const hNum=i+1;
                                            const p=h?.stableford_points;
                                            return<td key={i} style={{fontSize:15,...(sk2(hNum)?{background:"var(--gold-50,#fffbeb)",fontWeight:700,color:"var(--gold-700)"}:{color:"var(--text-muted)"})}}>{h!=null?p:<span style={{color:"var(--border)"}}>·</span>}</td>;
                                          })}
                                          <td className="total-col" style={{color:"var(--green-700)"}}>{hasF9?f9pts||"":""}</td>
                                          <td className="total-col" style={{background:"var(--surface2)"}}></td>
                                        </tr>
                                      </tbody>

                                      {/* ── BACK NINE ── */}
                                      <tbody>
                                        <tr style={{borderTop:"2px solid var(--border-md)"}}>
                                          <th className="label-col" style={{textTransform:"uppercase",background:"var(--green-900)",color:"var(--gold-300)",fontWeight:700,fontSize:11,padding:"5px 3px 5px 8px",textAlign:"left",whiteSpace:"nowrap"}}>HOLE</th>
                                          {[10,11,12,13,14,15,16,17,18].map(hNum=>{
                                            const wonSkin=sk2(hNum);
                                            return<th key={hNum} style={{background:wonSkin?"var(--gold-100,#fef3cd)":"var(--green-900)",color:wonSkin?"var(--gold-700)":"var(--gold-300)",fontWeight:700,fontSize:11,padding:"5px 3px",textAlign:"center"}}>{hNum}{wonSkin?" 💰":""}</th>;
                                          })}
                                          <th className="total-col" style={{background:"var(--green-900)",color:"var(--gold-300)",fontWeight:700,fontSize:11,padding:"5px 3px"}}>IN</th>
                                          <th className="total-col" style={{background:"var(--green-900)",color:"var(--gold-300)",fontWeight:700,fontSize:11,padding:"5px 3px"}}>TOT</th>
                                        </tr>
                                        <tr>
                                          <td className="label-col" style={{textTransform:"uppercase",fontSize:12}}>PAR</td>
                                          {b9cells.map((_:any,i:number)=>{
                                            const hNum=i+10;
                                            return<td key={i} style={{color:"var(--text-muted)",fontSize:14,...(sk2(hNum)?{background:"var(--gold-50,#fffbeb)"}:{})}}>{pars[9+i]||"-"}</td>;
                                          })}
                                          <td className="total-col">{pars.slice(9,18).reduce((a:number,b:number)=>a+b,0)||""}</td>
                                          <td className="total-col">{pars.reduce((a:number,b:number)=>a+b,0)||""}</td>
                                        </tr>
                                        <tr>
                                          <td className="label-col" style={{textTransform:"uppercase",fontSize:12}}>SCORE</td>
                                          {b9cells.map((h:any,i:number)=>{
                                            const hNum=i+10;
                                            return<td key={i} style={sk2(hNum)?{background:"var(--gold-50,#fffbeb)"}:{}}>{h?<ScoreSymbolLive gross={h.gross_score} par={pars[9+i]||4}/>:<span style={{color:"var(--border)"}}>·</span>}</td>;
                                          })}
                                          <td className="total-col">{hasB9?b9gross||"":""}</td>
                                          <td className="total-col">{hasF9&&hasB9?totGross:""}</td>
                                        </tr>
                                        <tr>
                                          <td className="label-col" style={{textTransform:"uppercase",color:"var(--text-muted)",fontSize:12}}>PTS</td>
                                          {b9cells.map((h:any,i:number)=>{
                                            const hNum=i+10;
                                            const p=h?.stableford_points;
                                            return<td key={i} style={{fontSize:15,...(sk2(hNum)?{background:"var(--gold-50,#fffbeb)",fontWeight:700,color:"var(--gold-700)"}:{color:"var(--text-muted)"})}}>{h!=null?p:<span style={{color:"var(--border)"}}>·</span>}</td>;
                                          })}
                                          <td className="total-col" style={{color:"var(--green-700)"}}>{hasB9?b9pts||"":""}</td>
                                          <td className="total-col" style={{color:"var(--green-700)",fontWeight:700}}>{hasF9&&hasB9?totPts:""}</td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  </div>
                                );
                              })()}
                            </div>
                          ):(
                            <div style={{fontSize:13,color:"var(--text-muted)",fontStyle:"italic",padding:"8px 9px"}}>No hole-by-hole data yet</div>
                          )}
                          {(()=>{
                            if(row.hs.length===0||row.thru>=18)return null;
                            const nextHole=row.hs[row.hs.length-1].hole_number+1;
                            if(nextHole>18)return null;
                            const completedSummaryIds=new Set(
                              leaderboardCompleted
                                .filter((r:any)=>r.golfer_id===row.golfer_id)
                                .map((r:any)=>r.summary_id)
                            );
                            const summaryDateMap:Record<number,string>={};
                            leaderboardCompleted.filter((r:any)=>r.golfer_id===row.golfer_id).forEach((r:any)=>{
                              const ev=events.find((e:any)=>e.event_id===r.event_id);
                              if(ev)summaryDateMap[r.summary_id]=ev.date||"";
                            });
                            const holeHistory=holeScores.filter((h:any)=>
                              completedSummaryIds.has(h.summary_id)&&
                              h.hole_number===nextHole&&
                              h.stableford_points!=null
                            ).sort((a:any,b:any)=>(summaryDateMap[b.summary_id]||"").localeCompare(summaryDateMap[a.summary_id]||"")).slice(0,4);
                            if(holeHistory.length<2)return null;
                            const avg=holeHistory.reduce((s:number,h:any)=>s+h.stableford_points,0)/holeHistory.length;
                            const firstName=g?.first_name||"Player";
                            return(
                              <div className="drawer-card" style={{margin:"10px 9px 0"}}>
                                <div className="drawer-card-body">
                                  <div className="drawer-card-section-label" style={{marginBottom:6,textAlign:"left"}}>HOLE {nextHole} INSIGHT</div>
                                  <p style={{margin:0,fontSize:13,lineHeight:1.55,color:"var(--text-primary)",textAlign:"left"}}>
                                    {firstName} has averaged <strong>{avg.toFixed(1)} pts</strong> on Hole {nextHole} over his last {holeHistory.length} round{holeHistory.length===1?"":"s"}.
                                  </p>
                                </div>
                              </div>
                            );
                          })()}
                          </div>{/* end drawer-shell */}
                        </div>
                        );
                      })()}
                    </div>
                  );
                })}
                </div>
                  );
                })()}
              </div>
            )}
            {/* ── Live skins board ── */}
            {liveSkinsEligible&&(()=>{
              const skinsPaid=liveEntries.filter((e:any)=>e.skins_paid);
              if(!skinsPaid.length)return null;
              // Rebuild playerHoleMap to know which holes each player has scored
              const playerHoleMap2:Record<number,Record<number,number>>={};
              skinsPaid.forEach((entry:any)=>{
                const hs=holeScores.filter((h:any)=>h.summary_id===entry.summary_id);
                hs.forEach((h:any)=>{
                  if(h.stableford_points==null)return;
                  if(!playerHoleMap2[entry.golfer_id])playerHoleMap2[entry.golfer_id]={};
                  playerHoleMap2[entry.golfer_id][h.hole_number]=h.stableford_points;
                });
              });
              const playerIds2=Object.keys(playerHoleMap2).map(Number);
              const totalPlayers=playerIds2.length;

              // Per-hole state: "pending" | "tied" | golfer_id (winner)
              const holeState:(number|"tied"|"pending")[]=Array.from({length:18},(_,i)=>{
                const hNum=i+1;
                const scored=playerIds2.filter(id=>playerHoleMap2[id]?.[hNum]!=null).length;
                if(scored<totalPlayers||scored===0)return"pending";
                return liveSkinHoleWinners[hNum]!=null?liveSkinHoleWinners[hNum]:"tied";
              });

              const revealedHole=liveSkinsRevealedHole;
              const setRevealedHole=setLiveSkinsRevealedHole;

              return(
                <div style={{marginTop:14,marginBottom:4}}>
                  <div style={{background:"var(--surface)",borderRadius:"var(--radius-md)",border:"1px solid var(--border)",padding:"14px 12px",boxShadow:"var(--shadow-sm)"}}>
                    <div className="card-title" style={{marginBottom:10}}>Live Skins</div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(9,1fr)",gap:6}}>
                      {holeState.map((state,i)=>{
                        const hNum=i+1;
                        const isGold=typeof state==="number";
                        const isTied=state==="tied";
                        const isPending=state==="pending";
                        const isRevealed=revealedHole===hNum;
                        const winnerName=isGold
                          ?(()=>{const g=golfers.find((x:any)=>x.golfer_id===state);return g?g.first_name+(g.last_name?" "+g.last_name[0]+".":""):"?";})()
                          :null;
                        return(
                          <div key={hNum} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                            <div style={{fontSize:9,fontWeight:700,color:"var(--text-muted)",letterSpacing:"0.04em"}}>{hNum}</div>
                            <div
                              onClick={()=>setRevealedHole(isRevealed?null:hNum)}
                              style={{
                                width:"100%",aspectRatio:"1",borderRadius:5,cursor:isGold?"pointer":"default",
                                background:isGold?"var(--gold-400)":isTied?"var(--surface2)":"transparent",
                                border:isPending?"2px dashed #e05050":isTied?"2px solid var(--border)":"2px solid transparent",
                                display:"flex",alignItems:"center",justifyContent:"center",
                                WebkitTapHighlightColor:"transparent",
                                position:"relative",
                                transition:"transform 0.1s",
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                    {revealedHole!=null&&(()=>{
                      const state=holeState[revealedHole-1];
                      const isGold=typeof state==="number";
                      const winnerName=isGold
                        ?(()=>{const g=golfers.find((x:any)=>x.golfer_id===state);return g?g.first_name+" "+g.last_name:"?";})()
                        :null;
                      const winnerEntry=isGold?skinsPaid.find((e:any)=>e.golfer_id===state):null;
                      const winnerHole=winnerEntry?holeScores.find((h:any)=>h.summary_id===winnerEntry.summary_id&&h.hole_number===revealedHole):null;
                      const par=liveCourse?.hole_pars?.[revealedHole-1];
                      return winnerName?(
                        <div style={{marginTop:10,padding:"8px 12px",borderRadius:"var(--radius-sm)",background:"var(--gold-50,#fffaf0)",border:"1px solid var(--gold-300)",textAlign:"center"}}>
                          <span style={{fontSize:11,fontWeight:700,color:"var(--text-muted)",letterSpacing:"0.06em",textTransform:"uppercase"}}>Hole {revealedHole}{par!=null?` · Par ${par}`:""}</span>
                          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginTop:6}}>
                            <div style={{fontSize:24,fontWeight:700,color:"var(--gold-600)"}}>{winnerName}</div>
                            {winnerHole?.gross_score!=null&&par!=null&&(
                              <div style={{position:"relative",display:"inline-flex"}}>
                                <ScoreSymbol gross={winnerHole.gross_score} par={par} className="skin-reveal-score"/>
                                {winnerHole.stableford_points!=null&&(
                                  <span style={{position:"absolute",top:-9,right:-13,fontSize:14,fontWeight:800,color:"var(--gold-700)",lineHeight:1}}>{winnerHole.stableford_points}</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ):null;
                    })()}
                  <div style={{display:"flex",alignItems:"center",gap:14,marginTop:10,fontSize:12,color:"var(--text-muted)"}}>
                    <span style={{display:"flex",alignItems:"center",gap:5}}><span style={{display:"inline-block",width:12,height:12,borderRadius:3,background:"var(--gold-400)",flexShrink:0}}/>Skin won</span>
                    <span style={{display:"flex",alignItems:"center",gap:5}}><span style={{display:"inline-block",width:12,height:12,borderRadius:3,background:"var(--surface2)",border:"1.5px solid var(--border)",flexShrink:0}}/>Tied</span>
                    <span style={{display:"flex",alignItems:"center",gap:5}}><span style={{display:"inline-block",width:12,height:12,borderRadius:3,border:"1.5px dashed #e05050",flexShrink:0}}/>In progress</span>
                  </div>
                  </div>
                </div>
              );
            })()}

            {/* ── Live odds board ── */}
            {(()=>{
              if(!eventOdds?.length)return null;
              // Latest-per-golfer odds map, prefer live over pre_round
              const oddsMap:Record<number,any>={};
              eventOdds.forEach((o:any)=>{
                const ex=oddsMap[o.golfer_id];
                if(!ex){oddsMap[o.golfer_id]=o;return;}
                if(o.simulation_type==="live"&&ex.simulation_type!=="live"){oddsMap[o.golfer_id]=o;return;}
                if(o.simulation_type===ex.simulation_type&&new Date(o.computed_at)>new Date(ex.computed_at))oddsMap[o.golfer_id]=o;
              });
              // posMap: golfers in the formal leaderboard (scored but may not be in pairings)
              const posMap:Record<number,any>={};
              finalRows.forEach((r:any)=>{posMap[r.golfer_id]=r;});
              // Build rows from eventOdds — catches late adds with no signup
              const oddsRows=Object.values(oddsMap)
                .filter((o:any)=>o.win_probability>0)
                .map((o:any)=>{
                  const g=golfers.find((x:any)=>x.golfer_id===o.golfer_id);
                  const raw=o.win_odds_american;
                  const odds=(raw==="EVEN"||o.win_probability===0)?"N/A":raw;
                  return{golfer_id:o.golfer_id,g,o,odds};
                })
                .sort((a:any,b:any)=>b.o.win_probability-a.o.win_probability);
              if(!oddsRows.length)return null;
              void oddsLastUpdated;
              return(
                <div style={{marginTop:14}}>
                  <div className="card-title" style={{marginBottom:6}}>Live Odds</div>
                  {/* Odds board — same 4-col grid as OddsTab */}
                  <div style={{background:"var(--green-900)",borderRadius:"var(--radius-md)",overflow:"hidden",marginBottom:4}}>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 60px 65px 60px",padding:"8px 12px",borderBottom:"1px solid rgba(255,255,255,0.1)"}}>
                      <div style={{fontSize:11,fontWeight:700,color:"var(--gold-300)",letterSpacing:"0.07em",textTransform:"uppercase"}}>Golfer</div>
                      <div style={{fontSize:11,fontWeight:700,color:"var(--gold-300)",letterSpacing:"0.07em",textTransform:"uppercase",textAlign:"center"}}>Proj</div>
                      <div style={{fontSize:11,fontWeight:700,color:"var(--gold-300)",letterSpacing:"0.07em",textTransform:"uppercase",textAlign:"center"}}>Win %</div>
                      <div style={{fontSize:11,fontWeight:700,color:"var(--gold-300)",letterSpacing:"0.07em",textTransform:"uppercase",textAlign:"right"}}>Odds</div>
                    </div>
                    {oddsRows.map((r:any,i:number)=>{
                      const isFav=i===0;
                      const isLate=!posMap[r.golfer_id];
                      return(
                        <div key={r.golfer_id} style={{display:"grid",gridTemplateColumns:"1fr 60px 65px 60px",padding:"11px 12px",borderBottom:"1px solid rgba(255,255,255,0.06)",background:isFav?"rgba(196,120,0,0.12)":"transparent",alignItems:"center"}}>
                          <div>
                            <div style={{fontSize:15,fontWeight:isFav?700:500,color:isFav?"var(--gold-300)":"rgba(255,255,255,0.88)"}}>
                              {r.g?r.g.first_name+" "+r.g.last_name:"Unknown"}{isFav?" 🏆":""}
                              
                            </div>
                            <div style={{fontSize:11,color:"rgba(255,255,255,0.45)",marginTop:1,alignItems:"center",gap:4,flexWrap:"wrap"}}>
                              {r.o.heater_active&&<span style={{fontSize:10,fontWeight:700,background:"var(--gold-100)",color:"var(--gold-800)",border:"1px solid var(--gold-300)",borderRadius:10,padding:"1px 6px"}}>🔥 {(r.o.heater_magnitude??0).toFixed(1)}σ</span>}
                              {r.o.projected_final_low!=null&&r.o.projected_final_high!=null&&<span style={{color:"rgba(255,255,255,0.35)"}}>{"  "}{r.o.projected_final_low}–{r.o.projected_final_high} pts</span>}
                            </div>
                          </div>
                          <div style={{textAlign:"center",fontSize:17,fontWeight:700,color:"var(--green-300)"}}>{r.o.projected_final_mean??"—"}</div>
                          <div style={{textAlign:"center"}}>
                            <div style={{fontSize:14,fontWeight:700,color:"rgba(255,255,255,0.9)"}}>{(r.o.win_probability*100).toFixed(1)}%</div>
                            <div style={{height:4,background:"rgba(255,255,255,0.15)",borderRadius:2,marginTop:3}}>
                              <div style={{height:4,borderRadius:2,background:"var(--gold-400)",width:(r.o.win_probability*100)+"%"}}/>
                            </div>
                          </div>
                          <div style={{textAlign:"right",fontSize:15,fontWeight:700,color:r.odds.startsWith("-")?"var(--gold-300)":"var(--green-300)"}}>{r.odds}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            <div style={{fontSize:12,color:"var(--text-muted)",marginTop:10,textAlign:"center",paddingBottom:4}}>
              Updates as scores are entered · pull to refresh for latest
            </div>
          </div>
        );
      })()}

      {subTab==="upcoming"&&nextEvent&&(()=>{
        const upEntries=signups.filter((s:any)=>s.event_id===nextEvent.event_id&&s.attending==="Yes");
        const seasonPosMap:Record<number,any>={};
        seasonAvgWithTies.forEach((r:any)=>{seasonPosMap[r.golfer_id]=r;});
        const pairingsSet=nextEvent.status==="Pairings Set";
        const teeOrder=nextEvent.tee_times||[];
        const rows=[...upEntries].sort((a:any,b:any)=>{
          if(pairingsSet){
            const ai=a.assigned_tee_time?teeOrder.indexOf(a.assigned_tee_time):999;
            const bi=b.assigned_tee_time?teeOrder.indexOf(b.assigned_tee_time):999;
            if(ai!==bi)return ai-bi;
          }
          const ap=seasonPosMap[a.golfer_id]?.pos??999;
          const bp=seasonPosMap[b.golfer_id]?.pos??999;
          return ap-bp;
        });
        return(
          <div>
            <UpcomingCourseCard event={nextEvent} courses={courses} holeImages={holeImages} onClick={()=>setUpcomingWeatherOpen(true)} fieldCount={upEntries.length} firstTeeTime={(nextEvent.tee_times||[]).slice().sort()[0]}/>
            <FieldStrengthMeter upEntries={upEntries} golfers={golfers} leaderboard={leaderboardCompleted} events={events} season={selSeason}/>

            {rows.length===0&&(
              <div className="empty-state"><div className="empty-text">No RSVPs yet</div></div>
            )}

            {rows.length>0&&(
              <div style={{background:"var(--surface)",borderRadius:"var(--radius-md)",border:"1px solid var(--border)",overflow:"hidden",boxShadow:"var(--shadow-sm)",marginBottom:14}}>
                <div style={{display:"grid",gridTemplateColumns:"44px 1fr 56px 52px",padding:"8px 12px",background:"var(--green-900)"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--gold-300)",letterSpacing:"0.07em",textTransform:"uppercase"}}>RANK</div>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--gold-300)",letterSpacing:"0.07em",textAlign:"left",marginLeft:5,textTransform:"uppercase"}}>Golfer</div>
                  <div></div>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--gold-300)",textTransform:"uppercase",textAlign:"right"}}>Tee Time</div>
                </div>
                {rows.map((s:any,rowIdx:number)=>{
                  const g=golfers.find((x:any)=>x.golfer_id===s.golfer_id);
                  const sp=seasonPosMap[s.golfer_id];
                  const posLabel=sp?(sp.tied?`T${sp.pos}`:String(sp.pos)):"--";
                  const isExp=upcomingExpandedId===s.golfer_id;
                  const prevRow=rows[rowIdx-1];
                  const isGroupStart=pairingsSet&&rowIdx>0&&s.assigned_tee_time&&prevRow&&s.assigned_tee_time!==prevRow.assigned_tee_time;
                  return(
                    <div key={s.signup_id} className={isExp?"lb-row-open":undefined} style={isGroupStart?{borderTop:"2px solid var(--green-700)"}:undefined}>
                      <div className="lb-live-row" onClick={()=>setUpcomingExpandedId(isExp?null:s.golfer_id)}>
                        <div style={{fontSize:16,fontWeight:700,color:"var(--text-secondary)"}}>{posLabel}</div>
                        <div style={{fontSize:16,textAlign:"left",marginLeft:5,fontWeight:600}}>{g?g.first_name+" "+g.last_name:"Unknown"}</div>
                        <div></div>
                        <div style={{fontSize:15,fontWeight:600,textAlign:"right",color:s.assigned_tee_time?"var(--text-primary)":"var(--text-muted)"}}>
                          {s.assigned_tee_time?String(s.assigned_tee_time).slice(0,5):"-"}
                        </div>
                      </div>
                      {isExp&&g&&(
                        <UpcomingPlayerDrawer
                          golfer={g}
                          leaderboard={leaderboard}
                          events={events}
                          nextEvent={nextEvent}
                          seasonPos={sp}
                          onViewMore={onNavigateToAnalyticsGolfer?()=>onNavigateToAnalyticsGolfer(String(g.golfer_id),"Upcoming Field",subTab):undefined}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <PreEventOddsModule golfers={golfers} leaderboard={leaderboard} events={events} signups={signups} courses={courses} holeScores={holeScores}
              event={nextEvent} eventOdds={eventOdds} oddsLoading={oddsLoading} oddsLastUpdated={oddsLastUpdated} onTriggerOdds={onTriggerOdds}/>
          </div>
        );
      })()}

      {subTab==="season"&&(()=>{
        const isPastSeason=selSeason!==new Date().getFullYear();
        const qualRows=isPastSeason?seasonAvgWithTiesReplay.filter((r:any)=>r.qualified):seasonAvgWithTiesReplay;
        const dnqRows=isPastSeason?seasonAvgWithTiesReplay.filter((r:any)=>!r.qualified):[];
        return(
          <>
            {seasonAvg.length===0&&<div className="empty-state"><div className="empty-text">No rounds recorded</div></div>}
            {qualRows.length>0&&(
              <div style={{background:"var(--surface)",borderRadius:"var(--radius-md)",border:"1px solid var(--border)",overflow:"hidden",boxShadow:"var(--shadow-sm)",marginBottom:isPastSeason&&dnqRows.length>0?16:0}}>
                <div className="lb-header">
                  <div className="lb-header-cell">POS</div><div className="lb-header-cell">Golfer</div>
                  <div className="lb-header-cell right">Avg</div><div className="lb-header-cell right">Rnds</div>
                </div>
                {renderSeasonRows(qualRows,seasonTrajectoryMap)}
              </div>
            )}
            {!isPastSeason&&<div style={{fontSize:13,color:"var(--text-muted)",marginTop:10,marginBottom:10}}><span style={{color:"var(--gold-700)"}}>*</span> = fewer than 15 rounds (not yet qualified)</div>}
            {isPastSeason&&dnqRows.length>0&&(
              <>
                <div className="card-section-label">
                  <span style={{flex:1,borderTop:"1px solid var(--border)",display:"inline-block"}}></span>
                  Did Not Qualify ({"<"}15 rounds)
                  <span style={{flex:1,borderTop:"1px solid var(--border)",display:"inline-block"}}></span>
                </div>
                <div style={{background:"var(--surface)",borderRadius:"var(--radius-md)",border:"1px solid var(--border)",overflow:"hidden",boxShadow:"var(--shadow-sm)",opacity:0.75}}>
                  <div className="lb-header">
                    <div className="lb-header-cell">POS</div><div className="lb-header-cell">Golfer</div>
                    <div className="lb-header-cell right">Avg</div><div className="lb-header-cell right">Rnds</div>
                  </div>
                  {renderSeasonRows(dnqRows,seasonTrajectoryMap)}
                </div>
              </>
            )}
          </>
        );
      })()}

      {subTab==="top15"&&(()=>{
        const isPastSeason=selSeason!==new Date().getFullYear();
        const qualRows=isPastSeason?top15AvgWithTiesReplay.filter((r:any)=>r.qualified):top15AvgWithTiesReplay;
        const dnqRows=isPastSeason?top15AvgWithTiesReplay.filter((r:any)=>!r.qualified):[];
        return(
          <>
            {top15Avg.length===0&&<div className="empty-state"><div className="empty-text">No rounds recorded</div></div>}
            {qualRows.length>0&&(
              <div style={{background:"var(--surface)",borderRadius:"var(--radius-md)",border:"1px solid var(--border)",overflow:"hidden",boxShadow:"var(--shadow-sm)",marginBottom:isPastSeason&&dnqRows.length>0?16:0}}>
                <div className="lb-header">
                  <div className="lb-header-cell">POS</div><div className="lb-header-cell">Golfer</div>
                  <div className="lb-header-cell right">Avg</div><div className="lb-header-cell right">Rnds</div>
                </div>
                {renderSeasonRows(qualRows,top15TrajectoryMap)}
              </div>
            )}
            {!isPastSeason&&<div style={{fontSize:13,color:"var(--text-muted)",marginTop:10,marginBottom:10}}><span style={{color:"var(--gold-700)"}}>*</span> = fewer than 15 rounds (not yet qualified)</div>}
            {isPastSeason&&dnqRows.length>0&&(
              <>
                <div className="card-section-label">
                  <span style={{flex:1,borderTop:"1px solid var(--border)",display:"inline-block"}}></span>
                  Did Not Qualify ({"<"}15 rounds)
                  <span style={{flex:1,borderTop:"1px solid var(--border)",display:"inline-block"}}></span>
                </div>
                <div style={{background:"var(--surface)",borderRadius:"var(--radius-md)",border:"1px solid var(--border)",overflow:"hidden",boxShadow:"var(--shadow-sm)",opacity:0.75}}>
                  <div className="lb-header">
                    <div className="lb-header-cell">POS</div><div className="lb-header-cell">Golfer</div>
                    <div className="lb-header-cell right">Avg</div><div className="lb-header-cell right">Rnds</div>
                  </div>
                  {renderSeasonRows(dnqRows,top15TrajectoryMap)}
                </div>
              </>
            )}
          </>
        );
      })()}

      {subTab==="weekly"&&(
        <div>
          <LeaderboardFeed
            seasonEvents={seasonEvents}
            golfers={golfers}
            leaderboard={leaderboard}
            holeScores={holeScores}
            holeImages={holeImages}
            onCardTap={openFeedOverlay}
          />
        </div>
      )}



      </SubTabPanel>

      {liveWeatherOpen&&liveEvent&&ReactDOM.createPortal(
        <WeatherModal courseName={liveEvent.course_name} onClose={()=>setLiveWeatherOpen(false)} eventDate={liveEvent.date} firstTeeTime={(liveEvent.tee_times||[]).slice().sort()[0]}/>,
        document.body
      )}

      {upcomingWeatherOpen&&nextEvent&&(()=>{
        const sortedTeeTimes=(nextEvent.tee_times||[]).slice().sort();
        const firstTee=sortedTeeTimes[0]||undefined;
        return <WeatherModal courseName={nextEvent.course_name} onClose={()=>setUpcomingWeatherOpen(false)} eventDate={nextEvent.date} firstTeeTime={firstTee}/>;
      })()}

      {/* Portal the overlay to document.body so it escapes .app-shell's
          overflow:hidden and all ancestor stacking contexts. position:fixed
          is safe here because document.body has no CSS animation ancestor. */}
      {feedOverlayEvent&&displayEvent&&ReactDOM.createPortal(
        <div
          ref={overlayRefCallback}
          className={"feed-overlay"+(feedOverlayClosing?" feed-overlay--exit":" feed-overlay--enter")}
          style={{
            position:"fixed",
            top:0,left:0,right:0,bottom:0,
            background:"var(--bg)",
            zIndex:199,
            overflowY:"auto",
            overscrollBehaviorY:"contain",

          }}
        >
          {(()=>{
            // Hero image: same hole-cycling logic as EventFeedCard
            const heroCourseName:string=displayEvent.course_name||"";
            const heroEventNum=overlayEventNumMap[displayEvent.event_id]||1;
            const heroHoleNum=((heroEventNum-1)%18)+1;
            const heroImgRecord=(holeImages||[]).find((img:any)=>img.course_name===heroCourseName&&img.hole_number===heroHoleNum&&img.public_url);
            const heroImgUrl:string|null=heroImgRecord?heroImgRecord.public_url:null;

            // Date formatting: "SAT · Jun 14, 2025"
            const heroDt=new Date(displayEvent.date+"T00:00:00");
            const days=["SUN","MON","TUE","WED","THU","FRI","SAT"];
            const months=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
            const heroDateLine=days[heroDt.getDay()]+" · "+months[heroDt.getMonth()]+" "+heroDt.getDate()+", "+heroDt.getFullYear();

            // Status badge
            const evStatus=displayEvent.status;
            const showBadge=evStatus==="In-Progress"||evStatus==="Completed";
            const badgeLabel=evStatus==="In-Progress"?"Live":"Final";

            // Stats pills
            const heroPlayerCount=paidEntries.length;
            // Skins won = holes where exactly one player outscored the rest (from skinHoleWinners)
            const heroSkinsWon=Object.keys(skinHoleWinners).length;
            const heroAvgPts=paidEntries.length>0?(paidEntries.reduce((s:number,e:any)=>s+(e.total_stableford_points||0),0)/paidEntries.length).toFixed(1):"—";

            // Podium placements (same payout logic as existing block)
            const isTied=tied1st.length>1;
            const winner=paidEntries[0];
            const secondPts=!isTied?paidEntries.find((e:any)=>e.total_stableford_points<(winner?.total_stableford_points??0))?.total_stableford_points:null;
            const tied2nd=secondPts!=null?paidEntries.filter((e:any)=>e.total_stableford_points===secondPts):[];
            const winnerPayout=isTied?null:(totalPot*(2/3)).toFixed(0);
            const tiedWinnerPayout=isTied?(totalPot/tied1st.length).toFixed(0):null;
            const runnerUpPayout=tied2nd.length>0?((totalPot*(1/3))/tied2nd.length).toFixed(0):"0";

            // Pot values
            const heroPot=totalPot;
            const heroSkinsPot=(evStatus==="In-Progress"||skinsEligible)?eventEntries.filter((e:any)=>e.skins_paid).length*10:0;

            return(
              <>
                {/* ── Layer 1: Hero ── */}
                <div className="event-hero-wrap">
                  {heroImgUrl&&<img src={heroImgUrl} className="event-hero-bg" alt=""/>}
                  <div className="event-hero-gradient"/>

                  {/* Back button */}
                  <button className="event-hero-back" onClick={closeFeedOverlay} aria-label="Back">
                    <svg width="18" height="18" viewBox="0 0 22 22" fill="none">
                      <path d="M14 4L7 11L14 18" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>

                  {/* Status badge */}
                  {showBadge&&(
                    <div className={"event-hero-badge"+(evStatus==="In-Progress"?" event-hero-badge--live":"")}>
                      {evStatus==="In-Progress"&&<span className="event-hero-badge-dot"/>}{badgeLabel}
                    </div>
                  )}

                  {/* Header text */}
                  <div className="event-hero-header">
                    <div className="event-hero-date">{heroDateLine}</div>
                    <div className="event-hero-course">{heroCourseName}</div>
                    <div className="event-hero-pills">
                      <span className="event-hero-pill">{heroPlayerCount} golfers</span>
                      {skinsEligible&&heroSkinsWon>0&&<span className="event-hero-pill">{heroSkinsWon} skin{heroSkinsWon!==1?"s":""}</span>}
                      <span className="event-hero-pill">{heroAvgPts} avg</span>
                    </div>
                  </div>

                  {/* Podium — 2 slots: 1st left, 2nd right */}
                  {paidEntries.length>=1&&(
                    <div className="event-hero-podium">
                      <div className="event-hero-podium-row">
                        {/* 1st place */}
                        {winner&&(
                          <div className="event-hero-slot event-hero-slot--win">
                            <div className="event-hero-medal">🥇</div>
                            <div className="event-hero-name">
                              {isTied
                                ?tied1st.map((e:any)=>golferName(golfers,e.golfer_id).split(" ")[0]).join(" & ")
                                :golferName(golfers,winner.golfer_id).split(" ")[0]}
                            </div>
                            <div className="event-hero-card event-hero-card--win">
                              <div className="event-hero-pts">{winner.total_stableford_points}</div>
                              <div className="event-hero-pts-label">pts</div>
                              <div className="event-hero-payout">${isTied?tiedWinnerPayout:winnerPayout}</div>
                            </div>
                          </div>
                        )}
                        {/* 2nd place — only shown when 1st is not tied */}
                        {!isTied&&tied2nd.length>0&&(
                          <div className="event-hero-slot">
                            <div className="event-hero-medal">🥈</div>
                            <div className="event-hero-name">{tied2nd.length>1?tied2nd.map((e:any)=>golferName(golfers,e.golfer_id).split(" ")[0]).join(" & "):golferName(golfers,tied2nd[0].golfer_id).split(" ")[0]}</div>
                            <div className="event-hero-card">
                              <div className="event-hero-pts event-hero-pts--other">{tied2nd[0].total_stableford_points}</div>
                              <div className="event-hero-pts-label">pts</div>
                              <div className="event-hero-payout">${runnerUpPayout}{tied2nd.length>1?" ea":""}</div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Layer 2: Content card ── */}
                <div className="event-hero-content">
                  <div className="event-hero-handle"/>

                  {!feedOverlayReady&&(
                    <div className="event-detail-skel-content">
                      {/* Pot tiles */}
                      <div className="event-detail-skel-pot-row">
                        <div className="event-detail-skel-pot-tile">
                          <div className="event-detail-skel-pot-value"/>
                          <div className="event-detail-skel-pot-label"/>
                        </div>
                        <div className="event-detail-skel-pot-tile">
                          <div className="event-detail-skel-pot-value"/>
                          <div className="event-detail-skel-pot-label"/>
                        </div>
                      </div>
                      {/* Skins won grid */}
                      <div className="event-detail-skel-skins-card">
                        <div className="event-detail-skel-skins-title"/>
                        <div className="event-detail-skel-skins-grid">
                          {Array.from({length:18},(_,i)=>(
                            <div key={i} className="event-detail-skel-skins-cell">
                              <div className="event-detail-skel-skins-num"/>
                              <div className="event-detail-skel-skins-sq" style={{animationDelay:`${(i%9)*0.05}s`}}/>
                            </div>
                          ))}
                        </div>
                      </div>
                      {/* Leaderboard rows */}
                      <div className="event-detail-skel-lb-card">
                        <div className="event-detail-skel-lb-header"/>
                        {[0,1,2,3,4,5,6].map(i=>(
                          <div key={i} className="event-detail-skel-row" style={{animationDelay:`${i*0.07}s`}}>
                            <div className="event-detail-skel-row-rank"/>
                            <div className="event-detail-skel-row-name" style={{width:`${100+Math.sin(i*1.7)*40}px`}}/>
                            <div style={{flex:1}}/>
                            <div className="event-detail-skel-row-pts"/>
                            <div className="event-detail-skel-row-money"/>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{opacity:feedOverlayReady?1:0,transition:"opacity 0.25s ease",pointerEvents:feedOverlayReady?"auto":"none"}}>

                  {/* AI event recap -- rendered only when available; no spinner/placeholder */}
                  {displayEvent?.ai_event_summary&&(
                    <div style={{marginBottom:14,padding:"14px 16px",background:"var(--surface)",borderRadius:"var(--radius-md)",border:"1px solid var(--border)",boxShadow:"var(--shadow-sm)"}}>
                      <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:6}}>
                        <Sparkles size={11} fill="currentColor" style={{color:"var(--text-muted)",flexShrink:0}}/>
                        <div style={{fontSize:11,fontWeight:700,color:"var(--text-muted)",letterSpacing:"0.08em",textTransform:"uppercase"}}>EVENT SUMMARY</div>
                      </div>
                      <p style={{margin:0,fontSize:14,lineHeight:1.6,color:"var(--text-primary)"}}>{displayEvent.ai_event_summary}</p>
                    </div>
                  )}

                  {/* Pot tiles */}
                  <div className="event-hero-pot-row">
                    <div className="event-hero-pot-tile">
                      <div className="event-hero-pot-value event-hero-pot-value--green">${heroPot}</div>
                      <div className="event-hero-pot-label">Stableford Pot</div>
                    </div>
                    {(skinsEligible||heroSkinsPot>0)&&(
                      <div className="event-hero-pot-tile">
                        <div className="event-hero-pot-value event-hero-pot-value--gold">${heroSkinsPot}</div>
                        <div className="event-hero-pot-label">Skins Pot</div>
                      </div>
                    )}
                  </div>

                  {!skinsEligible&&eventEntries.some((e:any)=>e.entry_type==="Total Only")&&(
                    <div className="skins-warning"><span>⚠</span><span>Mixed entry -- skins cannot be calculated until all players have hole-by-hole scores.</span></div>
                  )}
          {skinsEligible&&hasLiveSkins&&(()=>{
            const weeklyCourse=courses.find((c:any)=>c.course_name===displayEvent?.course_name);
            // Build playerHoleMap for all skins-paid entries
            const skinsPaidEntries=eventEntries.filter((e:any)=>e.skins_paid);
            const wPlayerHoleMap:Record<number,Record<number,number>>={};
            skinsPaidEntries.forEach((entry:any)=>{
              const hs=holeScores.filter((h:any)=>h.summary_id===entry.summary_id);
              hs.forEach((h:any)=>{
                if(h.stableford_points==null)return;
                if(!wPlayerHoleMap[entry.golfer_id])wPlayerHoleMap[entry.golfer_id]={};
                wPlayerHoleMap[entry.golfer_id][h.hole_number]=h.stableford_points;
              });
            });
            const wPlayerIds=Object.keys(wPlayerHoleMap).map(Number);
            const wTotal=wPlayerIds.length;
            const wHoleState:(number|"tied"|"pending")[]=Array.from({length:18},(_,i)=>{
              const hNum=i+1;
              const scored=wPlayerIds.filter(id=>wPlayerHoleMap[id]?.[hNum]!=null).length;
              if(scored<wTotal||scored===0)return"pending";
              return skinHoleWinners[hNum]!=null?skinHoleWinners[hNum]:"tied";
            });
            const wSkinsWonCount=wHoleState.filter(s=>typeof s==="number").length;
            return(
              <div style={{marginBottom:14}}>
                <div style={{background:"var(--surface)",borderRadius:"var(--radius-md)",border:"1px solid var(--border)",padding:"14px 12px",boxShadow:"var(--shadow-sm)"}}>
                  <div className="card-title" style={{marginBottom:10,textAlign:"center"}}>Skins Won ({wSkinsWonCount})</div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(9,1fr)",gap:6}}>
                    {wHoleState.map((state,i)=>{
                      const hNum=i+1;
                      const isGold=typeof state==="number";
                      const isTied=state==="tied";
                      const isPending=state==="pending";
                      const isRevealed=weeklySkinsRevealedHole===hNum;
                      return(
                        <div key={hNum} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                          <div style={{fontSize:9,fontWeight:700,color:"var(--text-muted)",letterSpacing:"0.04em"}}>{hNum}</div>
                          <div
                            onClick={(e:any)=>{
                              e.stopPropagation();
                              const saved=overlayScrollRef.current?.scrollTop??0;
                              setWeeklySkinsRevealedHole(isRevealed?null:hNum);
                              requestAnimationFrame(()=>{if(overlayScrollRef.current)overlayScrollRef.current.scrollTop=saved;});
                            }}
                            style={{
                              width:"100%",aspectRatio:"1",borderRadius:5,cursor:isGold?"pointer":"default",
                              background:isGold?"var(--gold-400)":isTied?"var(--surface2)":"transparent",
                              border:isPending?"2px dashed #e05050":isTied?"2px solid var(--border)":"2px solid transparent",
                              display:"flex",alignItems:"center",justifyContent:"center",
                              WebkitTapHighlightColor:"transparent",
                              transition:"transform 0.1s",
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                  {weeklySkinsRevealedHole!=null&&(()=>{
                    const state=wHoleState[weeklySkinsRevealedHole-1];
                    const isGold=typeof state==="number";
                    const winnerName=isGold
                      ?(()=>{const g=golfers.find((x:any)=>x.golfer_id===state);return g?g.first_name+" "+g.last_name:"?";})()
                      :null;
                    const winnerEntry=isGold?skinsPaidEntries.find((e:any)=>e.golfer_id===state):null;
                    const winnerHole=winnerEntry?holeScores.find((h:any)=>h.summary_id===winnerEntry.summary_id&&h.hole_number===weeklySkinsRevealedHole):null;
                    const par=weeklyCourse?.hole_pars?.[weeklySkinsRevealedHole-1];
                    return winnerName?(
                      <div style={{marginTop:10,padding:"8px 12px",borderRadius:"var(--radius-sm)",background:"var(--gold-50,#fffaf0)",border:"1px solid var(--gold-300)",textAlign:"center"}}>
                        <span style={{fontSize:11,fontWeight:700,color:"var(--text-muted)",letterSpacing:"0.06em",textTransform:"uppercase"}}>Hole {weeklySkinsRevealedHole}{par!=null?` · Par ${par}`:""}</span>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginTop:6}}>
                          <div style={{fontSize:24,fontWeight:700,color:"var(--gold-600)"}}>{winnerName}</div>
                          {winnerHole?.gross_score!=null&&par!=null&&(
                            <div style={{position:"relative",display:"inline-flex"}}>
                              <ScoreSymbol gross={winnerHole.gross_score} par={par} className="skin-reveal-score"/>
                              {winnerHole.stableford_points!=null&&(
                                <span style={{position:"absolute",top:-9,right:-13,fontSize:14,fontWeight:800,color:"var(--gold-700)",lineHeight:1}}>{winnerHole.stableford_points}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ):null;
                  })()}
                  <div style={{display:"flex",alignItems:"center",gap:14,marginTop:10,fontSize:12,color:"var(--text-muted)"}}>
                    <span style={{display:"flex",alignItems:"center",gap:5}}><span style={{display:"inline-block",width:12,height:12,borderRadius:3,background:"var(--gold-400)",flexShrink:0}}/>Skin won</span>
                    <span style={{display:"flex",alignItems:"center",gap:5}}><span style={{display:"inline-block",width:12,height:12,borderRadius:3,background:"var(--surface2)",border:"1.5px solid var(--border)",flexShrink:0}}/>Tied — no skin</span>
                  </div>
                </div>
              </div>
            );
          })()}
                  <div style={{background:"var(--surface)",borderRadius:"var(--radius-md)",border:"1px solid var(--border)",overflow:"hidden",boxShadow:"var(--shadow-sm)"}}>
            <div className="lb-header" style={{gridTemplateColumns:"36px 1fr 56px 62px"}}>
              <div className="lb-header-cell">POS</div><div className="lb-header-cell">Golfer</div>
              <div className="lb-header-cell right">Pts</div><div className="lb-header-cell right">$$$</div>
            </div>
            {eventEntriesWithTies.map((entry:any,i:number)=>(
              <div key={entry.golfer_id} className="boot-row" style={{["--row-i" as any]:i}}>
                {renderLbRow(entry,"weekly")}
              </div>
            ))}
          </div>

          {adminMode&&eventEntries.length>=2&&(()=>{
            const md=(()=>{const dt=new Date(displayEvent.date+"T00:00:00");return String(dt.getMonth()+1).padStart(2,"0")+"/"+String(dt.getDate()).padStart(2,"0");})();
            const firstPts=eventEntriesWithTies[0]?.total_stableford_points;
            const winners=eventEntriesWithTies.filter((e:any)=>e.total_stableford_points===firstPts);
            const remaining=eventEntriesWithTies.filter((e:any)=>e.total_stableford_points!==firstPts);
            const secondPts=remaining[0]?.total_stableford_points;
            const runnersUp=secondPts!=null?remaining.filter((e:any)=>e.total_stableford_points===secondPts):[];
            const joinNames=(arr:any[])=>{
              const names=arr.map((e:any)=>golferName(golfers,e.golfer_id).split(" ")[0]);
              if(names.length===1)return names[0];
              if(names.length===2)return names[0]+" and "+names[1];
              return names.slice(0,-1).join(", ")+", and "+names[names.length-1];
            };
            const winnerVerb=winners.length>1?"came in 1st (tied)":"came in 1st";
            let body=`Congratulations to ${joinNames(winners)}, who ${winnerVerb} with ${firstPts} pts`;
            if(runnersUp.length>0){
              const ruVerb=runnersUp.length>1?"took 2nd (tied)":"took 2nd";
              body+=` and ${joinNames(runnersUp)} ${ruVerb} with ${secondPts} pts`;
            }
            body+=`.\n\nSee more details on the Saturday round in the app: https://saturdayschool.vercel.app/?tab=leaderboard`;
            const subject=`Saturday ${md} Results`;
            const mailtoHref=`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
            return(
              <a href={mailtoHref} className="btn btn-outline btn-full" style={{textDecoration:"none",marginTop:10,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                Send Round Recap
              </a>
            );
          })()}

          {(()=>{
            const imgs=(eventImages||[]).filter((img:any)=>img.event_id===displayEvent.event_id);
            const compressAndUpload=async(file:File):Promise<string|null>=>{
              return new Promise((resolve,reject)=>{
                const imgEl=new Image();
                const reader=new FileReader();
                reader.onload=(e:any)=>{
                  imgEl.onload=async()=>{
                    try{
                      const MAX=1200;
                      const scale=Math.min(1,MAX/Math.max(imgEl.width,imgEl.height));
                      const canvas=document.createElement("canvas");
                      canvas.width=Math.round(imgEl.width*scale);
                      canvas.height=Math.round(imgEl.height*scale);
                      canvas.getContext("2d")?.drawImage(imgEl,0,0,canvas.width,canvas.height);
                      canvas.toBlob(async(blob:Blob|null)=>{
                        if(!blob){reject(new Error("Canvas toBlob failed"));return;}
                        const path="event_"+displayEvent.event_id+"_"+Date.now()+".jpg";
                        try{
                          const result=await supabase.storage.upload("scorecards",path,blob);
                          if(!result){reject(new Error("Upload returned null"));return;}
                          const newImg={event_id:displayEvent.event_id,storage_path:path,public_url:result.url};
                          try{
                            const rows=await supabase.from("event_images").insert(newImg);
                            const savedImg=rows&&rows[0]?rows[0]:{...newImg,id:Date.now()};
                            setEventImages((p:any)=>[...p,savedImg]);
                          }catch(_:any){
                            setEventImages((p:any)=>[...p,{...newImg,id:Date.now()}]);
                          }
                          resolve(result.url);
                        }catch(uploadErr:any){
                          reject(uploadErr);
                        }
                      },"image/jpeg",0.82);
                    }catch(err:any){reject(err);}
                  };
                  imgEl.onerror=()=>reject(new Error("Image load failed"));
                  imgEl.src=e.target.result;
                };
                reader.onerror=()=>reject(new Error("FileReader failed"));
                reader.readAsDataURL(file);
              });
            };
            return(
              <div style={{marginTop:18}}>
                <button
                  className="btn btn-outline btn-full"
                  style={{fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}
                  onClick={()=>setShowScorecardModal(true)}
                >
                  View Scorecards{imgs.length>0?" ("+imgs.length+")":""}
                </button>
                {showScorecardModal&&ReactDOM.createPortal(
                  <div
                    style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",zIndex:300,display:"flex",alignItems:"flex-end",justifyContent:"center"}}
                    onClick={()=>{setShowScorecardModal(false);setLightboxImg(null);}}
                  >
                    <div
                      style={{background:"var(--surface)",borderRadius:"var(--radius-lg) var(--radius-lg) 0 0",padding:"20px 16px 88px",width:"100%",maxWidth:520,maxHeight:"88vh",overflowY:"auto"}}
                      onClick={(e:any)=>e.stopPropagation()}
                    >
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                        <div>
                          <div style={{fontSize:17,fontWeight:700,color:"var(--green-800)"}}>Scorecards</div>
                          <div style={{fontSize:13,color:"var(--text-muted)"}}>{formatDate(displayEvent.date)} -- {displayEvent.course_name}</div>
                        </div>
                        {adminMode&&(
                          <label style={{cursor:"pointer"}}>
                            <input type="file" accept="image/*" multiple style={{display:"none"}} onChange={async(e:any)=>{
                              const files=Array.from(e.target.files||[]) as File[];
                              if(!files.length)return;
                              setScorecardUploading(true);
                              let ok=0,fail=0;
                              for(const f of files){
                                try{
                                  await compressAndUpload(f);
                                  ok++;
                                }catch(err:any){
                                  fail++;
                                  console.error("Upload error:",err);
                                  alert("Upload failed: "+(err?.message||String(err)));
                                }
                              }
                              setScorecardUploading(false);
                              e.target.value="";
                              if(ok>0)showSuccess("Scorecard"+(ok>1?"s":"")+" uploaded!");
                            }}/>
                            <span className="btn btn-primary" style={{fontSize:13,padding:"8px 14px"}}>
                              {scorecardUploading?"Uploading...":"+ Add Photo"}
                            </span>
                          </label>
                        )}
                      </div>
                      {imgs.length===0&&!scorecardUploading&&(
                        <div style={{textAlign:"center",padding:"32px 0",color:"var(--text-muted)"}}>
                          <div style={{fontSize:32,marginBottom:8}}>📋</div>
                          <div style={{fontSize:14}}>No scorecards uploaded yet</div>
                          {adminMode&&<div style={{fontSize:12,marginTop:4}}>Tap "+ Add Photo" to upload</div>}
                        </div>
                      )}
                      {scorecardUploading&&(
                        <div style={{textAlign:"center",padding:"20px 0",color:"var(--text-muted)",fontSize:14}}>
                          <div style={{width:32,height:32,border:"3px solid var(--green-100)",borderTop:"3px solid var(--green-600)",borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto 10px"}}/>
                          Compressing and uploading...
                        </div>
                      )}
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:8}}>
                        {imgs.map((img:any)=>(
                          <div key={img.id||img.storage_path} style={{position:"relative",borderRadius:"var(--radius-md)",overflow:"hidden",aspectRatio:"4/3",background:"var(--surface2)",cursor:"pointer"}} onClick={()=>setLightboxImg(img.public_url)}>
                            <img src={img.public_url} alt="Scorecard" style={{width:"100%",height:"100%",objectFit:"cover"}} loading="lazy"/>
                            {adminMode&&(
                              <button
                                onClick={async(e:any)=>{
                                  e.stopPropagation();
                                  if(!window.confirm("Delete this scorecard photo?"))return;
                                  await supabase.storage.remove("scorecards",[img.storage_path]);
                                  await supabase.from("event_images").delete({id:img.id});
                                  setEventImages((p:any)=>p.filter((x:any)=>x.id!==img.id));
                                }}
                                style={{position:"absolute",top:4,right:4,background:"rgba(192,32,32,0.9)",color:"white",border:"none",borderRadius:6,padding:"4px 8px",fontSize:12,fontWeight:700,cursor:"pointer"}}
                              >Delete</button>
                            )}
                          </div>
                        ))}
                      </div>
                      <button className="btn btn-outline btn-full" style={{marginTop:8}} onClick={()=>setShowScorecardModal(false)}>Close</button>
                    </div>
                  </div>
                ,document.body)}
                {lightboxImg&&ReactDOM.createPortal(
                  <div
                    style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:310,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
                    onClick={()=>setLightboxImg(null)}
                  >
                    <img src={lightboxImg} alt="Scorecard" style={{maxWidth:"100%",maxHeight:"90vh",borderRadius:"var(--radius-md)",objectFit:"contain"}}/>
                    <button onClick={()=>setLightboxImg(null)} style={{position:"absolute",top:16,right:16,background:"rgba(255,255,255,0.15)",color:"white",border:"none",borderRadius:"50%",width:36,height:36,fontSize:20,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>x</button>
                  </div>
                ,document.body)}
              </div>
            );
          })()}

          {skinsEligible&&(()=>{
            const eventCourseName=displayEvent.course_name;
            const eventSignups=signups.filter((s:any)=>s.event_id===displayEvent.event_id&&s.tee_box_course_id);
            const eventEntryIds=new Set(leaderboard.filter((e:any)=>e.event_id===displayEvent.event_id).map((e:any)=>e.summary_id));
            const eventHoleScores=holeScores.filter((h:any)=>eventEntryIds.has(h.summary_id));
            const holeCount=18;
            const holePars:number[]=Array(holeCount).fill(0);
            const holeParsVotes:number[][]=Array.from({length:holeCount},()=>[]);
            for(const s of eventSignups){
              const c=courses.find((c:any)=>c.course_id===s.tee_box_course_id);
              if(c?.hole_pars){c.hole_pars.forEach((p:number,i:number)=>{holeParsVotes[i].push(p);});}
            }
            holePars.forEach((_,i)=>{
              const votes=holeParsVotes[i];
              holePars[i]=votes.length>0?Math.round(votes.reduce((a:number,b:number)=>a+b,0)/votes.length):4;
            });
            const holeYards:number[]=Array(holeCount).fill(0);
            let hasYards=false;
            for(const s of eventSignups){
              const c=courses.find((c:any)=>c.course_id===s.tee_box_course_id);
              if(c?.hole_yards&&Array.isArray(c.hole_yards)){hasYards=true;}
            }
            if(hasYards){
              const yardVotes:number[][]=Array.from({length:holeCount},()=>[]);
              for(const s of eventSignups){
                const c=courses.find((c:any)=>c.course_id===s.tee_box_course_id);
                if(c?.hole_yards){c.hole_yards.forEach((y:number,i:number)=>{if(y>0)yardVotes[i].push(y);});}
              }
              yardVotes.forEach((v,i)=>{holeYards[i]=v.length>0?Math.round(v.reduce((a:number,b:number)=>a+b,0)/v.length):0;});
            }
            const holeSIs:number[]=Array(holeCount).fill(0);
            {
              const siVotes:number[][]=Array.from({length:holeCount},()=>[]);
              for(const s of eventSignups){
                const c=courses.find((c:any)=>c.course_id===s.tee_box_course_id);
                if(c?.hole_stroke_indices){c.hole_stroke_indices.forEach((si:number,i:number)=>{if(si>0)siVotes[i].push(si);});}
              }
              siVotes.forEach((v,i)=>{holeSIs[i]=v.length>0?Math.round(v.reduce((a:number,b:number)=>a+b,0)/v.length):0;});
            }
            type HoleStat={hole:number;par:number;yards:number;strokeIndex:number;avgPts:number;plusMinus:number;count:number;eagles:number;birdies:number;pars:number;bogeys:number;dblPlus:number;};
            const holeStats:HoleStat[]=Array.from({length:holeCount},(_,i)=>{
              const hNum=i+1;
              const par=holePars[i]||4;
              const scores=eventHoleScores.filter((h:any)=>h.hole_number===hNum&&h.gross_score!=null&&h.stableford_points!=null);
              const count=scores.length;
              const avgPts=count>0?scores.reduce((s:number,h:any)=>s+(h.stableford_points||0),0)/count:0;
              const plusMinus=avgPts-2;
              let eagles=0,birdies=0,pars=0,bogeys=0,dblPlus=0;
              for(const h of scores){
                const diff=h.gross_score-par;
                if(diff<=-2)eagles++;
                else if(diff===-1)birdies++;
                else if(diff===0)pars++;
                else if(diff===1)bogeys++;
                else dblPlus++;
              }
              return{hole:hNum,par,yards:holeYards[i]||0,strokeIndex:holeSIs[i]||0,avgPts,plusMinus,count,eagles,birdies,pars,bogeys,dblPlus};
            }).filter(h=>h.count>0);
            const sorted=[...holeStats].sort((a,b)=>a.avgPts-b.avgPts);
            const rankMap:Record<number,number>={};
            sorted.forEach((h,i)=>{rankMap[h.hole]=i+1;});
            const summaryToGolfer:Record<number,number>={};
            leaderboard.filter((e:any)=>e.event_id===displayEvent.event_id).forEach((e:any)=>{summaryToGolfer[e.summary_id]=e.golfer_id;});
            const playerHoleData:Record<number,{golfer_id:number;name:string;gross:number;pts:number;isSkinWinner:boolean}[]>={};
            for(let hNum=1;hNum<=holeCount;hNum++){
              const rows=eventHoleScores
                .filter((h:any)=>h.hole_number===hNum&&h.gross_score!=null&&h.stableford_points!=null)
                .map((h:any)=>{
                  const gid=summaryToGolfer[h.summary_id];
                  const g=golfers.find((gl:any)=>gl.golfer_id===gid);
                  return{
                    golfer_id:gid,
                    name:g?`${g.first_name} ${g.last_name}`:"Unknown",
                    gross:h.gross_score,
                    pts:h.stableford_points,
                    isSkinWinner:skinHoleWinners[hNum]===gid,
                  };
                })
                .sort((a:any,b:any)=>b.pts-a.pts);
              playerHoleData[hNum]=rows;
            }
            return(
              <CourseStatsModule
                holeStats={holeStats}
                rankMap={rankMap}
                playerHoleData={playerHoleData}
                holeImages={holeImages}
                setHoleImages={setHoleImages}
                courseName={eventCourseName}
                adminMode={adminMode}
                supabase={supabase}
                showSuccess={showSuccess}
                hasYards={hasYards}
                holeCount={holeStats.length}
              />
            );
          })()}

                  </div>{/* end feedOverlayReady fade wrapper */}
                </div>{/* end event-hero-content */}
              </>
            );
          })()}
        </div>
      ,document.body)}
    </div>
  );
}





// ── Course Stats Module ──────────────────────────────────────────────────────
export function CourseStatsModule({holeStats,rankMap,playerHoleData,holeImages,setHoleImages,courseName,adminMode,showSuccess,hasYards,holeCount}:any){
  const [view,setView]=useState<"course"|"stats">("course");
  const [uploadingHole,setUploadingHole]=useState<number|null>(null);
  const [flippedHole,setFlippedHole]=useState<number|null>(null);
  // 3D flip transforms (perspective/preserve-3d/backfaceVisibility +
  // will-change:transform) are GPU-expensive -- with up to 18 cards,
  // applying them to all of them permanently is what was crashing iOS
  // on pinch-zoom. Instead, only the ONE card currently flipping gets
  // the 3D treatment (and its will-change), for the ~0.6s duration of
  // its animation; every other card stays flat (cheap show/hide).
  // 3D flip state machine. We track an explicit rotation `deg` (0 or 180)
  // and a `transition` flag separately from `flippedHole`, because:
  //  - flat mode's "front" and "back" resting states are both rendered
  //    with transform:none (the back face cancels its own 180deg via a
  //    local rotateY), so going flat -> 3D at deg=180 is a NUMERIC change
  //    (none -> rotateY(180deg)) even though it's visually a no-op.
  //  - If that priming render ALSO declares the transition, the browser
  //    starts animating that "no-op" right away (front->back never hit
  //    this because its priming angle is 0, i.e. none -> rotateY(0deg),
  //    a true no-change). Step 2 then retargets that half-finished
  //    animation, producing the "too fast / barely visible" flip back
  //    to front.
  // Fix: step 1 sets the priming angle with transition:"none" (instant,
  // zero animation, in BOTH directions). Step 2 (next frame) turns the
  // transition on and flips the angle -- a real, full-distance rotation
  // every time.
  const [flip3D,setFlip3D]=useState<{hole:number,deg:0|180,animate:boolean}|null>(null);
  const flipTimeoutRef=useRef<number|null>(null);
  const flipRafRef=useRef<number|null>(null);
  const toggleFlip=(hole:number)=>{
    if(flipTimeoutRef.current!=null)window.clearTimeout(flipTimeoutRef.current);
    if(flipRafRef.current!=null)cancelAnimationFrame(flipRafRef.current);
    const wasFlipped=flippedHole===hole;
    const startDeg:0|180=wasFlipped?180:0; // matches current flat resting state
    const endDeg:0|180=wasFlipped?0:180;
    // Step 1: prime at the starting angle, transition off -- instant, no-op.
    setFlip3D({hole,deg:startDeg,animate:false});
    flipRafRef.current=requestAnimationFrame(()=>{
      flipRafRef.current=requestAnimationFrame(()=>{
        // Step 2: turn the transition on and flip the angle -- real rotation.
        setFlip3D({hole,deg:endDeg,animate:true});
        setFlippedHole(prev=>prev===hole?null:hole);
      });
    });
    flipTimeoutRef.current=window.setTimeout(()=>{
      setFlip3D(prev=>prev&&prev.hole===hole?null:prev);
    },900);
  };
  // Drop the card out of 3D mode exactly when its rotation transition
  // finishes (rather than guessing with a fixed timer) -- a fixed timer
  // can fire before a slow/late-starting transition completes, yanking
  // the card back to flat mode mid-rotation and covering the animation.
  const onFlipTransitionEnd=(hole:number,e:React.TransitionEvent<HTMLDivElement>)=>{
    if(e.propertyName!=="transform")return;
    if(flipTimeoutRef.current!=null){window.clearTimeout(flipTimeoutRef.current);flipTimeoutRef.current=null;}
    setFlip3D(prev=>prev&&prev.hole===hole?null:prev);
  };
  useEffect(()=>()=>{
    if(flipTimeoutRef.current!=null)window.clearTimeout(flipTimeoutRef.current);
    if(flipRafRef.current!=null)cancelAnimationFrame(flipRafRef.current);
  },[]);



  const totalHoles=holeStats.length;
  if(totalHoles===0){
    return(
      <div style={{marginTop:16,padding:"18px 16px",background:"var(--surface)",borderRadius:"var(--radius-md)",border:"1px solid var(--border)",textAlign:"center",color:"var(--text-muted)",fontSize:14}}>
        📊 Course stats will appear after hole-by-hole scores are entered
      </div>
    );
  }

  // Stableford avg relative to par baseline (2 pts = par)
  const fmtPlusMinus=(pm:number)=>{
    if(Math.abs(pm)<0.0001)return"0.000";
    return(pm>0?"+":"")+pm.toFixed(1);
  };
  const pmColor=(pm:number)=>pm<0?"var(--green-700)":"var(--red-500,#e53e3e)";

  // Hole images keyed by hole number for this course
  const imgByHole:Record<number,any>={};
  for(const img of (holeImages||[])){
    if(img.course_name===courseName)imgByHole[img.hole_number]=img;
  }

  const uploadHoleImage=async(hole:number,file:File)=>{
    setUploadingHole(hole);
    try{
      const reader=new FileReader();
      const dataUrl=await new Promise<string>((res,rej)=>{reader.onload=(e:any)=>res(e.target.result);reader.onerror=()=>rej();reader.readAsDataURL(file);});
      const img=new Image();
      await new Promise<void>((res)=>{img.onload=()=>res();img.src=dataUrl;});
      const MAX=1400;
      const scale=Math.min(1,MAX/Math.max(img.width,img.height));
      const canvas=document.createElement("canvas");
      canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);
      const ctx=canvas.getContext("2d")!;ctx.drawImage(img,0,0,canvas.width,canvas.height);
      const blob=await new Promise<Blob>((res,rej)=>canvas.toBlob(b=>b?res(b):rej(),"image/jpeg",0.82));
      const path=`${courseName.replace(/\s+/g,"-").toLowerCase()}/hole-${hole}-${Date.now()}.jpg`;
      const result=await supabase.storage.upload("hole-images",path,blob);
      if(!result)throw new Error("Upload failed");
      const existing=imgByHole[hole];
      if(existing){
        // delete old storage file then update row
        await supabase.storage.remove("hole-images",[existing.storage_path]).catch(()=>{});
        const updated={...existing,public_url:result.url,storage_path:path};
        await supabase.from("hole_images").update({public_url:result.url,storage_path:path},{hole_image_id:existing.hole_image_id}).catch(()=>{});
        setHoleImages((p:any[])=>p.map((r:any)=>r.hole_image_id===existing.hole_image_id?updated:r));
      } else {
        const row={course_name:courseName,hole_number:hole,public_url:result.url,storage_path:path};
        const inserted=await supabase.from("hole_images").insert(row).catch(()=>null);
        setHoleImages((p:any[])=>[...p,{...row,hole_image_id:inserted?.hole_image_id||Date.now()}]);
      }
      showSuccess(`Hole ${hole} image uploaded!`);
    }catch(e:any){alert("Upload failed: "+(e?.message||String(e)));}
    setUploadingHole(null);
  };

  const deleteHoleImage=async(hole:number)=>{
    const existing=imgByHole[hole];
    if(!existing||!window.confirm(`Remove image for hole ${hole}?`))return;
    await supabase.storage.remove("hole-images",[existing.storage_path]).catch(()=>{});
    await supabase.from("hole_images").delete({hole_image_id:existing.hole_image_id}).catch(()=>{});
    setHoleImages((p:any[])=>p.filter((r:any)=>r.hole_image_id!==existing.hole_image_id));
    showSuccess(`Hole ${hole} image removed`);
  };

  // Subtotals
  const front=holeStats.filter((h:any)=>h.hole<=9);
  const back=holeStats.filter((h:any)=>h.hole>=10);
  const totalRow=(rows:any[],label:string)=>({
    hole:label,par:rows.reduce((s:number,h:any)=>s+h.par,0),
    yards:rows.reduce((s:number,h:any)=>s+h.yards,0),
    avgPts:rows.reduce((s:number,h:any)=>s+h.avgPts,0),
    plusMinus:rows.reduce((s:number,h:any)=>s+h.plusMinus,0),
    count:"-",eagles:rows.reduce((s:number,h:any)=>s+h.eagles,0),
    birdies:rows.reduce((s:number,h:any)=>s+h.birdies,0),
    pars:rows.reduce((s:number,h:any)=>s+h.pars,0),
    bogeys:rows.reduce((s:number,h:any)=>s+h.bogeys,0),
    dblPlus:rows.reduce((s:number,h:any)=>s+h.dblPlus,0),
  });

  const allRows=[
    ...front,
    ...(front.length>0?[totalRow(front,"OUT")]:[]),
    ...back,
    ...(back.length>0?[totalRow(back,"IN")]:[]),
    ...(front.length>0&&back.length>0?[totalRow(holeStats,"TOT")]:[]),
  ];

  return(
    <div style={{paddingBottom:100,marginTop:20}}>
      {/* Toggle */}
      <ToggleGroup
        options={[{value:"course",label:"Course Overview"},{value:"stats",label:"Hole Stats"}]}
        value={view}
        onChange={setView}
      />

      {/* ── Course cards view ── */}
      {view==="course"&&(
        <FlickCarousel count={holeStats.length}>
          <div style={{display:"flex",gap:12,paddingLeft:2,paddingRight:2,width:"max-content"}}>
            {holeStats.map((h:any)=>{
              const img=imgByHole[h.hole];
              const rank=rankMap[h.hole];
              const pm=h.plusMinus;
              const isFlipped=flippedHole===h.hole;
              const is3D=flip3D!=null&&flip3D.hole===h.hole;
              const flipDeg=is3D?flip3D!.deg:(isFlipped?180:0);
              const flipTransition=is3D&&flip3D!.animate?"transform 0.6s cubic-bezier(0.4,0.2,0.2,1)":"none";
              const players=(playerHoleData&&playerHoleData[h.hole])||[];
              return(
                <div key={h.hole} className="hcard" style={{width:300,minWidth:300,height:500,flexShrink:0}}>
                <div style={{width:"100%",height:"100%",perspective:is3D?1200:undefined}}>
                <div
                  onClick={()=>toggleFlip(h.hole)}
                  onTransitionEnd={(e)=>onFlipTransitionEnd(h.hole,e)}
                  style={is3D?{position:"relative",width:"100%",height:"100%",borderRadius:14,boxShadow:"0 2px 2px rgba(0,0,0,0.18)",cursor:"pointer",transformStyle:"preserve-3d",WebkitTransformStyle:"preserve-3d",willChange:"transform",transition:flipTransition,transform:`rotateY(${flipDeg}deg)`,WebkitTransform:`rotateY(${flipDeg}deg) translateZ(0)`} as any:{position:"relative",width:"100%",height:"100%",borderRadius:14,boxShadow:"0 2px 2px rgba(0,0,0,0.18)",cursor:"pointer"}}>
                  {/* ── FRONT ── */}
                  <div style={is3D
                    ?{position:"absolute",inset:0,borderRadius:14,overflow:"hidden",background:"#1a2e1a",backfaceVisibility:"hidden",WebkitBackfaceVisibility:"hidden",transform:"rotateY(0deg) translateZ(1px)",WebkitTransform:"rotateY(0deg) translateZ(1px)"} as any
                    :{position:"absolute",inset:0,borderRadius:14,overflow:"hidden",background:"#1a2e1a",display:isFlipped?"none":undefined}}>
                  {/* Background image or placeholder */}
                  {img
                    ?<img src={img.public_url} alt={`Hole ${h.hole}`} className="hcard-img" draggable={false} style={{position:"absolute",inset:0,zIndex:0,width:"100%",height:"100%",objectFit:"cover",filter:"brightness(0.9)"}}/>
                    :<div style={{position:"absolute",inset:0,zIndex:0,background:"linear-gradient(145deg,var(--green-900,#1a3a1a) 0%,var(--green-800,#224422) 50%,#1a2b1a 100%)"}}/>
                  }                  {/* Content */}
                  <div style={is3D
                    ?{position:"relative",zIndex:1,transform:"translateZ(0)",backfaceVisibility:"hidden",WebkitBackfaceVisibility:"hidden",padding:"18px 18px 22px",minHeight:500,display:"flex",flexDirection:"column",alignItems:"flex-start"} as any
                    :{position:"relative",zIndex:1,padding:"18px 18px 22px",minHeight:500,display:"flex",flexDirection:"column",alignItems:"flex-start"}}>
                    {/* Hole number top-left */}
                    <div style={{fontSize:72,fontWeight:900,color:"white",lineHeight:1,fontFamily:"var(--font-serif)",textShadow:"0 2px 8px rgba(0,0,0,0.5)"}}>
                      {h.hole}
                    </div>
                    {/* Stats bottom-left */}
                    <div style={{display:"flex",marginTop:20,flexDirection:"column",gap:16,width:"100%"}}>
                      <div style={{display:"flex",gap:24}}>
                        <div>
                          <div style={{fontSize:12,fontWeight:700,textAlign:"left",color:"white",letterSpacing:"0.07em",textTransform:"uppercase"}}>PAR</div>
                          <div style={{fontSize:30,fontWeight:900,textAlign:"left",color:"white",lineHeight:1}}>{h.par}</div>
                        </div>
                        
                      </div>
                      {(hasYards&&h.yards>0)&&<div><div>
                          <div style={{fontSize:12,fontWeight:700,textAlign:"left",color:"white",letterSpacing:"0.07em",textTransform:"uppercase"}}>YARDS</div>
                          <div style={{fontSize:30,fontWeight:900,textAlign:"left",color:"white",lineHeight:1}}>{h.yards}</div>
                        </div></div>}
                      <div>
                        <div style={{fontSize:12,fontWeight:700,textAlign:"left",color:"white",letterSpacing:"0.07em",textTransform:"uppercase"}}>AVG</div>
                        <div style={{fontSize:20,fontWeight:800,textAlign:"left",color:pm<0?"#68d391":"#fc8181",lineHeight:1}}>{fmtPlusMinus(pm)}</div>
                      </div>
                      <div>
                        <div style={{fontSize:12,fontWeight:700,textAlign:"left",color:"white",letterSpacing:"0.07em",textTransform:"uppercase"}}>RANK</div>
                        <div style={{fontSize:30,fontWeight:800,textAlign:"left",color:"white",lineHeight:1}}>{rank}</div>
                      </div>
                    </div>
                  </div>
                  {/* Admin upload button */}
                  {adminMode&&(
                    <div style={{position:"absolute",zIndex:2,top:12,right:12,display:"flex",gap:6}} onClick={(e)=>e.stopPropagation()}>
                      <label style={{padding:"6px 12px",borderRadius:8,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:12,fontWeight:600,color:"white",letterSpacing:"0.04em"}}>
                        {uploadingHole===h.hole?"Uploading...":"+ Photo"}
                        <input type="file" accept="image/*" style={{display:"none"}} disabled={uploadingHole!==null}
                          onChange={async(e)=>{const f=e.target.files?.[0];if(f)await uploadHoleImage(h.hole,f);e.target.value="";}}/>
                      </label>
                      {img&&<button style={{padding:"6px 10px",borderRadius:8,background:"rgba(180,0,0,0.7)",border:"none",cursor:"pointer",fontSize:12,fontWeight:600,color:"white"}}
                        onClick={()=>deleteHoleImage(h.hole)}>Remove</button>}
                    </div>
                  )}
                  {/* Tap hint */}
                  <div style={{position:"absolute",bottom:3,right:100,zIndex:2,fontSize:10,color:"rgba(255,255,255,0.55)",fontWeight:600,letterSpacing:"0.05em"}}>TAP FOR SCORES ⟳</div>
                  </div>
                  {/* ── BACK ── */}
                  <div className="hcard-back" style={is3D
                    ?{position:"absolute",inset:0,borderRadius:14,overflow:"hidden",background:"var(--green-900,#1a3a1a)",backfaceVisibility:"hidden",WebkitBackfaceVisibility:"hidden",transform:"rotateY(180deg) translateZ(1px)",WebkitTransform:"rotateY(180deg) translateZ(1px)",display:"flex",flexDirection:"column"} as any
                    :{position:"absolute",inset:0,borderRadius:14,overflow:"hidden",background:"var(--green-900,#1a3a1a)",display:isFlipped?"flex":"none",flexDirection:"column"}}>
                    <div style={{padding:"12px 16px 4px",borderBottom:"1px solid rgba(255,255,255,0.12)"}}>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <div style={{fontSize:28,fontWeight:900,color:"white",fontFamily:"var(--font-serif)",lineHeight:1}}>{h.hole}</div>
                        <div style={{fontSize:13,paddingTop:1,color:"rgba(255,255,255,0.6)",fontWeight:600}}>Par {h.par}{(hasYards&&h.yards>0)?` · ${h.yards} yds`:""}{h.strokeIndex>0?` · SI ${h.strokeIndex}`:""}</div>
                      </div>
                      <div style={{display:"flex",gap:16,marginTop:8,fontSize:10,color:"rgba(255,255,255,0.5)",fontWeight:700,letterSpacing:"0.07em",textTransform:"uppercase"}}>
                        <span style={{flex:1,textAlign:"left"}}>Player</span>
                        <span style={{width:30,textAlign:"center"}}>Gross</span>
                        <span style={{width:30,textAlign:"center"}}>Pts</span>
                      </div>
                    </div>
                    <div style={{flex:1,minHeight:0,flexDirection:"column",justifyContent:"center",padding:"2px 16px"}}>
                      {players.length===0
                        ?<div style={{color:"rgba(255,255,255,0.4)",fontSize:13,textAlign:"center"}}>No scores recorded</div>
                        :players.map((p:any,i:number)=>(
                          <div key={p.golfer_id} style={{display:"flex",alignItems:"center",gap:16,padding:"5px 0",borderBottom:i<players.length-1?"1px solid rgba(255,255,255,0.08)":"none",background:p.isSkinWinner?"rgba(212,168,67,0.15)":"transparent",borderRadius:p.isSkinWinner?6:0,marginLeft:p.isSkinWinner?-8:0,marginRight:p.isSkinWinner?-8:0,paddingLeft:p.isSkinWinner?8:0,paddingRight:p.isSkinWinner?8:0}}>
                            <span style={{flex:1,fontSize:15,fontWeight:p.isSkinWinner?800:600,color:p.isSkinWinner?"var(--gold-300,#d4a843)":"white",display:"flex",alignItems:"center",gap:6,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                              {p.isSkinWinner&&<span style={{fontSize:15,flexShrink:0}}>🏆</span>}
                              <span style={{overflow:"hidden",fontSize:15,textOverflow:"ellipsis"}}>{p.name}</span>
                            </span>
                            <span style={{width:30,fontSize:15,display:"flex",justifyContent:"center"}}><ScoreSymbol gross={p.gross} par={h.par}/></span>
                            <span style={{width:30,fontSize:15,textAlign:"center",fontWeight:800,color:p.isSkinWinner?"var(--gold-300,#d4a843)":"white"}}>{p.pts}</span>
                          </div>
                        ))
                      }
                    </div>
                    <div style={{padding:"2px 16px 3px",fontSize:10,color:"rgba(255,255,255,0.4)",fontWeight:600,letterSpacing:"0.05em",textAlign:"center"}}>TAP TO FLIP BACK ⟲</div>
                  </div>
                </div>
                </div>
                </div>
              );
            })}
          </div>
        </FlickCarousel>
      )}

      {/* ── Hole Stats table ── */}
      {view==="stats"&&(
        <div style={{overflowX:"auto",overflowY:"auto",maxHeight:500,WebkitOverflowScrolling:"touch",borderRadius:"var(--radius-md)",marginTop:23,overscrollBehavior:"none",marginBottom:20,border:"1px solid var(--border)",boxShadow:"var(--shadow-sm)"}}>
          <table style={{borderCollapse:"collapse",fontSize:13,width:"100%",minWidth:520,background:"var(--surface)"}}>
            <colgroup>
              <col style={{width:52,minWidth:52}}/>
              <col style={{width:44,minWidth:44}}/>
            </colgroup>
            <thead>
              <tr style={{background:"var(--green-900)"}}>
                {["HOLE","PAR","SI",hasYards?"YDS":null,"AVG PTS","+/−","EAGLE","BIRDIE","PAR","BOGEY","DBL+"].filter(Boolean).map((h:any,i:number)=>(
                  <th key={i} style={{color:"var(--gold-300,#d4a843)",fontWeight:700,padding:"7px 8px",textAlign:i===0?"left":"center",fontSize:11,letterSpacing:"0.06em",whiteSpace:"nowrap",borderBottom:"2px solid var(--gold-300,#d4a843)",position:"sticky",top:0,zIndex:i<2?12:10,background:"var(--green-900)",...(i===0?{left:0}:i===1?{left:52,boxShadow:"2px 0 0 0 rgba(212,168,67,0.3)"}:{})}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allRows.map((h:any,idx:number)=>{
                const isTotal=h.hole==="OUT"||h.hole==="IN"||h.hole==="TOT";
                const pm=h.plusMinus;
                const avgPts=typeof h.avgPts==="number"?h.avgPts.toFixed(2):h.avgPts;
                const rowBg=isTotal?"var(--green-50,#f0f7f0)":idx%2===0?"var(--surface)":"var(--surface2)";
                return(
                  <tr key={idx} style={{background:rowBg,borderBottom:"1px solid var(--border)"}}>
                    <td style={{padding:"8px 8px",fontWeight:isTotal?700:600,fontSize:isTotal?13:14,color:isTotal?"var(--green-800)":"var(--text-primary)",whiteSpace:"nowrap",position:"sticky",left:0,zIndex:2,background:rowBg}}>{h.hole}</td>
                    <td style={{padding:"8px 8px",textAlign:"center",fontWeight:isTotal?700:400,position:"sticky",left:52,zIndex:2,background:rowBg,boxShadow:"2px 0 0 0 var(--border)"}}>{h.par}</td>
                    <td style={{padding:"8px 8px",textAlign:"center",color:"var(--text-secondary)"}}>{isTotal?"—":h.strokeIndex>0?h.strokeIndex:"—"}</td>
                    {hasYards&&<td style={{padding:"8px 8px",textAlign:"center",color:"var(--text-secondary)"}}>{h.yards>0?h.yards:"—"}</td>}
                    <td style={{padding:"8px 8px",textAlign:"center",fontWeight:isTotal?700:500}}>{avgPts}</td>
                    <td style={{padding:"8px 8px",textAlign:"center",fontWeight:700,color:typeof pm==="number"?pmColor(pm):"var(--text-primary)"}}>{typeof pm==="number"?fmtPlusMinus(pm):pm}</td>
                    <td style={{padding:"8px 8px",textAlign:"center",color:h.eagles>0?"var(--gold-600,#b8860b)":"var(--text-muted)",fontWeight:h.eagles>0?700:400}}>{h.eagles||0}</td>
                    <td style={{padding:"8px 8px",textAlign:"center",color:h.birdies>0?"var(--green-700)":"var(--text-muted)",fontWeight:h.birdies>0?700:400}}>{h.birdies||0}</td>
                    <td style={{padding:"8px 8px",textAlign:"center",color:"var(--text-secondary)"}}>{h.pars||0}</td>
                    <td style={{padding:"8px 8px",textAlign:"center",color:h.bogeys>0?"var(--red-500,#e53e3e)":"var(--text-muted)"}}>{h.bogeys||0}</td>
                    <td style={{padding:"8px 8px",textAlign:"center",color:h.dblPlus>0?"var(--red-700,#c53030)":"var(--text-muted)",fontWeight:h.dblPlus>0?700:400}}>{h.dblPlus||0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Lightbox for hole image */}
    </div>
  );
}





// ============================================================
// WEATHER WIDGET  -- Open-Meteo, free, no API key required
//
// GPS accuracy note: we use exact course coordinates rather than
// the ZIP 92612 centroid (~33.6459,-117.8428). The ZIP centroid
// is 2.5-3 miles from either course -- at Open-Meteo's 1-2km
// grid resolution that is 2-3 grid cells, which can meaningfully
// differ in wind speed/direction near coastal Southern California.
// Exact GPS gives the best possible forecast for each course.
// ============================================================


// ─────────────────────────────────────────────────────────────
// Push Notification opt-in component
// Shown at the bottom of the Sign Up tab.
// Registers a Web Push subscription and stores it in Supabase.
// ─────────────────────────────────────────────────────────────
