import { useState, useRef, useEffect, useCallback } from "react";
import { ScoreSymbol, ToggleGroup } from "../../components/common";
import { golferName, formatDate, teeBoxesForCourse, scrollMainTop } from "../../lib/formatters";
import { calcPlayingHandicap, calcHoleNetScore, calcStablefordPoints, calcHoleScores } from "../../lib/golfMath";
import { supabase, SUPABASE_URL, SUPABASE_KEY } from "../../lib/supabaseClient";

const emptyScorer=()=>({golferId:"",courseId:"",totalPts:"",grossScores:Array(18).fill(""),submitted:false,started:false,summaryId:null as number|null});

export function ScoreEntryTab({golfers,courses,events,signups,setSignups,leaderboard,setLeaderboard,holeScores,setHoleScores,setEvents,dbUpsertHoleScore,scoreMode,setScoreMode,scoreEventId,setScoreEventId,scorers,setScorers,showSuccess,showScoreMsg,scoreMsg}:any){
  // State is lifted to App so it survives tab navigation
  const mode=scoreMode;
  const setMode=setScoreMode;
  const selEventId=scoreEventId;
  const setSelEventId=setScoreEventId;
  // scorers/setScorers are passed directly from App

  // Track in-flight leaderboard inserts per "eid:gid" key.
  // Prevents duplicate INSERT when user types quickly on first hole.
  const pendingLbInsert=useRef<Record<string,Array<(id:number)=>void>>>({});

  // ── Offline write queue ──────────────────────────────────────
  // Stores hole-score upserts that failed or couldn't be sent
  // due to no connectivity. Flushed automatically when online.
  const offlineQueue=useRef<Array<{row:any,retries:number}>>([]);
  const flushingRef=useRef(false);

  const flushOfflineQueue=useCallback(async()=>{
    if(flushingRef.current||offlineQueue.current.length===0)return;
    if(!navigator.onLine)return;
    flushingRef.current=true;
    const pending=[...offlineQueue.current];
    offlineQueue.current=[];
    for(const item of pending){
      try{
        await dbUpsertHoleScore(item.row);
      }catch{
        // re-queue if still failing (up to 5 retries)
        if(item.retries<5) offlineQueue.current.push({row:item.row,retries:item.retries+1});
      }
    }
    flushingRef.current=false;
  },[dbUpsertHoleScore]);

  // Auto-flush when the browser regains connectivity
  useEffect(()=>{
    const handler=()=>{
      if(offlineQueue.current.length>0) flushOfflineQueue();
    };
    window.addEventListener("online",handler);
    return()=>window.removeEventListener("online",handler);
  },[flushOfflineQueue]);

  // Queued write: writes immediately if online, queues if offline
  const queueHoleWrite=useCallback((row:any)=>{
    if(navigator.onLine){
      dbUpsertHoleScore(row).catch(()=>{
        offlineQueue.current.push({row,retries:0});
      });
    }else{
      // Replace any existing queued entry for same summary_id+hole
      offlineQueue.current=offlineQueue.current.filter(
        q=>!(q.row.summary_id===row.summary_id&&q.row.hole_number===row.hole_number)
      );
      offlineQueue.current.push({row,retries:0});
    }
  },[dbUpsertHoleScore]);

  // Connection status indicator shown during score entry
  const [isOnline,setIsOnline]=useState(()=>navigator.onLine);
  const [queuedCount,setQueuedCount]=useState(0);
  useEffect(()=>{
    const up=()=>{setIsOnline(true);flushOfflineQueue().then(()=>setQueuedCount(offlineQueue.current.length));};
    const down=()=>setIsOnline(false);
    window.addEventListener("online",up);
    window.addEventListener("offline",down);
    return()=>{window.removeEventListener("online",up);window.removeEventListener("offline",down);};
  },[flushOfflineQueue]);
  // Keep queuedCount in sync after flushes
  useEffect(()=>{
    const id=setInterval(()=>setQueuedCount(offlineQueue.current.length),2000);
    return()=>clearInterval(id);
  },[]);


  const activeEvents=events.filter((e:any)=>e.status==="Pairings Set"||e.status==="In-Progress");
  const selEvent=events.find((e:any)=>e.event_id===parseInt(selEventId));
  const availableTees=selEvent?courses.filter((c:any)=>c.course_name===selEvent.course_name):[];

  // ── Group / tee-time selection ────────────────────────────────
  const [selectedGroup,setSelectedGroup]=useState("");

  // On initial load, if scorers were already restored (e.g. from the
  // app-level auto-restore effect on refresh) before this component had a
  // chance to set selectedGroup, figure out which tee-time group those
  // golfers belong to so the "Select Your Group" picker shows it as
  // selected — otherwise it looks like the group selection was lost.
  const groupRestoreRef=useRef(false);
  useEffect(()=>{
    if(groupRestoreRef.current)return;
    if(!selEventId||mode!=="hole")return;
    const activeScorerGolferIds=scorers.filter((s:any)=>s.golferId&&s.started).map((s:any)=>parseInt(s.golferId));
    if(!activeScorerGolferIds.length)return;
    groupRestoreRef.current=true;
    const eid=parseInt(selEventId);
    const matchSignup=signups.find((s:any)=>s.event_id===eid&&activeScorerGolferIds.includes(s.golfer_id)&&s.assigned_tee_time);
    if(matchSignup)setSelectedGroup(matchSignup.assigned_tee_time);
    else{
      // No matching group found — reset scorers so user must pick a group first
      setScorers([emptyScorer()]);
    }
  },[selEventId,mode,scorers,signups]);


  // ── Slide-to-submit state ────────────────────────────────────
  const [slideSubmitX,setSlideSubmitX]=useState(0);
  const [slideFinalizeX,setSlideFinalizeX]=useState(0);
  const slideSubmitRef=useRef<HTMLDivElement|null>(null);
  const slideFinalizeRef=useRef<HTMLDivElement|null>(null);
  const slidingSubmit=useRef(false);
  const slidingFinalize=useRef(false);
  const SLIDE_THRESHOLD=280;
  const SLIDE_FINALIZE_THRESHOLD=320;
  const [showFinalizeConfirm,setShowFinalizeConfirm]=useState(false);

  // ── Score entry modal (hole-by-hole "+" tap) ────────────────────
  const [scoreModal,setScoreModal]=useState<{scorerIdx:number,holeIdx:number}|null>(null);
  // ── Which golfer setup cards are expanded (once scoring started, default collapsed) ──
  const [expandedScorers,setExpandedScorers]=useState<Record<number,boolean>>({});
  // ── Collapse event/group/player-row section ──
  const [setupCollapsed,setSetupCollapsed]=useState(false);


  // Build groups from signups: one group per tee time, golfers attending Yes.
  // Golfers attending "Yes" but without an assigned tee time (e.g. pairings
  // were only generated for some groups so far) still need to be selectable
  // for scoring -- bucket them under "Unassigned" so they show as an option.
  const eventSignupsForGroup=selEvent
    ?signups.filter((s:any)=>s.event_id===selEvent.event_id&&s.attending==="Yes")
    :[];
  const groupedByTee:{[tee:string]:any[]}={};
  eventSignupsForGroup.forEach((s:any)=>{
    // Normalize to HH:MM -- Postgres time columns often come back as
    // "08:00:00" while selEvent.tee_times are stored as "08:00", which
    // would otherwise create duplicate tiles (one with golfers, one without).
    const tee=s.assigned_tee_time?String(s.assigned_tee_time).slice(0,5):"Unassigned";
    if(!groupedByTee[tee])groupedByTee[tee]=[];
    groupedByTee[tee].push(s);
  });
  const sortedTeeTimes=Array.from(new Set([
    ...Object.keys(groupedByTee).filter(t=>t!=="Unassigned"),
    ...(selEvent?.tee_times||[]).map((t:string)=>t.slice(0,5))
  ])).sort().concat(groupedByTee["Unassigned"]?["Unassigned"]:[]);
  const hasGroups=sortedTeeTimes.length>0;

  // Check skins eligibility warning for this event
  const eventEntries=leaderboard.filter((r:any)=>r.event_id===selEvent?.event_id);
  const hasMixedEntry=eventEntries.length>0&&eventEntries.some((r:any)=>r.entry_type==="Total Only");

  const addScorer=()=>{if(scorers.length<4)setScorers(p=>[...p,emptyScorer()]);};
  const removeScorer=(idx:number)=>setScorers(p=>p.filter((_,i)=>i!==idx));

  // Fully deletes a player's hole-by-hole entry for this event — removes
  // their leaderboard row and any hole_scores from the DB (no-show or
  // mis-entered player). This is destructive, unlike removeScorer which
  // just removes the local card.
  const deleteScorerEntry=async(idx:number)=>{
    const scorer=scorers[idx];
    if(!scorer)return;
    const g=golfers.find((x:any)=>x.golfer_id===parseInt(scorer.golferId));
    const name=g?`${g.first_name} ${g.last_name}`:`Golfer ${idx+1}`;
    if(!window.confirm(`Delete ${name}'s scores for this event? This cannot be undone.`))return;
    const realSid=scorer.summaryId;
    if(realSid&&realSid<1e12){
      // Remove hole scores + leaderboard row from DB
      try{await supabase.from("hole_scores").delete({summary_id:realSid});}catch{}
      try{await supabase.from("event_leaderboard").delete({summary_id:realSid});}catch{}
      setHoleScores((hs:any)=>hs.filter((h:any)=>h.summary_id!==realSid));
      setLeaderboard((p:any)=>p.filter((r:any)=>r.summary_id!==realSid));
    }
    // Remove the card entirely (or reset to empty if it's the only one)
    setScorers((p:any)=>p.length>1?p.filter((_:any,i:number)=>i!==idx):[emptyScorer()]);
    setExpandedScorers((p:any)=>{const n={...p};delete n[idx];return n;});
    showSuccess(`${name}'s entry deleted`);
  };

  // Creates the leaderboard row in DB immediately so every subsequent hole
  // write has a real summary_id — no async race conditions.
  const startScoring=async(idx:number)=>{
    const scorer=scorers[idx];
    if(!scorer.golferId||!scorer.courseId||!selEventId)return;
    const gid=parseInt(scorer.golferId);
    const eid=parseInt(selEventId);
    const course=courses.find((c:any)=>c.course_id===parseInt(scorer.courseId));
    const g=golfers.find((x:any)=>x.golfer_id===gid);
    if(!g||!course)return;
    const phcp=calcPlayingHandicap(g.current_handicap_index,course.tee_slope,course.tee_rating,course.par);

    // Check if a row already exists (resume case)
    const existing=leaderboard.find((r:any)=>r.event_id===eid&&r.golfer_id===gid);
    if(existing&&existing.summary_id<1e12){
      // Already have a real row — restore hole scores and mark started
      const hs=holeScores.filter((h:any)=>h.summary_id===existing.summary_id).sort((a:any,b:any)=>a.hole_number-b.hole_number);
      const gross=Array(18).fill("");
      hs.forEach((h:any)=>{gross[h.hole_number-1]=String(h.gross_score);});
      setScorers(p=>p.map((s,i)=>i===idx?{...s,grossScores:gross,started:true,summaryId:existing.summary_id}:s));
      setExpandedScorers(p=>({...p,[idx]:false}));
      // Make sure the signup row has the tee box recorded so a future
      // refresh can restore courseId without falling back to a default.
      setSignups((su:any)=>{
        const su2=su.map((s:any)=>s.event_id===eid&&s.golfer_id===gid?{...s,tee_box_course_id:parseInt(scorer.courseId),playing_handicap:phcp}:s);
        const mySu=su2.find((s:any)=>s.event_id===eid&&s.golfer_id===gid);
        if(mySu?.signup_id&&mySu.signup_id<1e12)
          supabase.from("event_signups").update({tee_box_course_id:parseInt(scorer.courseId),playing_handicap:phcp},{signup_id:mySu.signup_id}).catch(()=>{});
        return su2;
      });
      // Flip event to In-Progress if needed
      setEvents((evs:any)=>evs.map((ev:any)=>ev.event_id===eid&&ev.status==="Pairings Set"?{...ev,status:"In-Progress"}:ev));
      return;
    }

    // INSERT a 0-point placeholder row to get the real summary_id before any holes
    const placeholder:any={
      event_id:eid, golfer_id:gid,
      season:selEvent?.season||new Date().getFullYear(),
      entry_type:"Hole-by-Hole", total_stableford_points:0,
      buy_in_paid:true, skins_paid:true, charity_paid:true,
      weekly_payout_won:0, skins_payout_won:0
    };
    try{
      const rows=await supabase.from("event_leaderboard").insert(placeholder);
      if(!rows||!rows[0])throw new Error("No row returned");
      const realId:number=rows[0].summary_id;
      // Patch local leaderboard state with the real row
      setLeaderboard((p:any)=>[...p.filter((r:any)=>!(r.event_id===eid&&r.golfer_id===gid)),{...placeholder,summary_id:realId}]);
      // Mark scorer as started with the real summary_id
      setScorers(p=>p.map((s,i)=>i===idx?{...s,started:true,summaryId:realId}:s));
      setExpandedScorers(p=>({...p,[idx]:false}));
      // Write tee box to signup so restore works
      setSignups((su:any)=>{
        const su2=su.map((s:any)=>s.event_id===eid&&s.golfer_id===gid?{...s,tee_box_course_id:parseInt(scorer.courseId),playing_handicap:phcp}:s);
        const mySu=su2.find((s:any)=>s.event_id===eid&&s.golfer_id===gid);
        if(mySu?.signup_id&&mySu.signup_id<1e12)
          supabase.from("event_signups").update({tee_box_course_id:parseInt(scorer.courseId),playing_handicap:phcp},{signup_id:mySu.signup_id}).catch(()=>{});
        return su2;
      });
      // Flip event to In-Progress
      setEvents((evs:any)=>evs.map((ev:any)=>ev.event_id===eid&&ev.status==="Pairings Set"?{...ev,status:"In-Progress"}:ev));
    }catch(e:any){
      showSuccess("Error starting scoring: "+(e?.message||"unknown"));
    }
  };

  const updateScorer=(idx:number,field:string,val:any)=>{
    setScorers(p=>{
      // When changing golfer, reset started/summaryId so a fresh startScoring runs
      const base=p.map((s,i)=>i===idx
        ?(field==="golferId"?{...s,[field]:val,started:false,summaryId:null,grossScores:Array(18).fill("")}:{...s,[field]:val})
        :s
      );

      // When a golfer is selected in H-H mode, restore their data if they have
      // existing hole scores. Only set started:true if they have ≥1 hole score
      // (otherwise leave started:false so Start Scoring button still appears).
      if(field==="golferId"&&val&&mode==="hole"&&selEventId){
        const eid=parseInt(selEventId);
        const gid=parseInt(val);
        const existing=leaderboard.find((r:any)=>r.event_id===eid&&r.golfer_id===gid&&r.entry_type==="Hole-by-Hole");
        if(existing&&existing.summary_id<1e12){
          const signup=signups.find((s:any)=>s.event_id===eid&&s.golfer_id===gid&&s.tee_box_course_id);
          let courseId=signup?.tee_box_course_id?String(signup.tee_box_course_id):"";
          if(!courseId&&availableTees.length)courseId=String(availableTees[0].course_id);
          const hs=holeScores.filter((h:any)=>h.summary_id===existing.summary_id).sort((a:any,b:any)=>a.hole_number-b.hole_number);
          const gross=Array(18).fill("");
          hs.forEach((h:any)=>{gross[h.hole_number-1]=String(h.gross_score);});
          // Only auto-start if they have actual hole scores; otherwise let
          // the user press Start Scoring so startScoring() can handle it cleanly
          const hasHoles=hs.length>0;
          return base.map((s,i)=>i===idx
            ?{...s,golferId:val,courseId,grossScores:gross,started:hasHoles,summaryId:hasHoles?existing.summary_id:null}
            :s
          );
        }
      }
      return base;
    });

    // Persist tee box selection to the signup row immediately — don't wait
    // for a hole score to be entered, otherwise it's only saved lazily via
    // updateGross's doSignupWrite and gets lost if the user picks a tee box
    // then refreshes before scoring anything.
    if(field==="courseId"&&val&&mode==="hole"&&selEventId){
      const scorer=scorers[idx];
      if(scorer?.golferId){
        const eid=parseInt(selEventId);
        const gid=parseInt(scorer.golferId);
        const course=courses.find((c:any)=>c.course_id===parseInt(val));
        const g=golfers.find((x:any)=>x.golfer_id===gid);
        const phcp=g&&course?calcPlayingHandicap(g.current_handicap_index,course.tee_slope,course.tee_rating,course.par):null;
        setSignups((su:any)=>{
          const su2=su.map((s:any)=>s.event_id===eid&&s.golfer_id===gid?{...s,tee_box_course_id:parseInt(val),playing_handicap:phcp}:s);
          const mySu=su2.find((s:any)=>s.event_id===eid&&s.golfer_id===gid);
          if(mySu?.signup_id&&mySu.signup_id<1e12)
            supabase.from("event_signups").update({tee_box_course_id:parseInt(val),playing_handicap:phcp},{signup_id:mySu.signup_id}).catch(()=>{});
          return su2;
        });
      }
    }
  };
  const updateGross=(idx:number,hole:number,val:string)=>{
    // -- Step 1: update React state immediately so UI is responsive --
    const currentScorer=scorers[idx];
    if(!currentScorer)return;
    const newGross=[...currentScorer.grossScores]; newGross[hole]=val;
    const updatedScorer={...currentScorer,grossScores:newGross};
    setScorers(scorers.map((s,i)=>i===idx?updatedScorer:s));

    if(!updatedScorer.golferId||!updatedScorer.courseId)return;
    const gid=parseInt(updatedScorer.golferId);
    const eid=parseInt(selEventId);
    if(!eid)return;
    const course=courses.find((c:any)=>c.course_id===parseInt(updatedScorer.courseId));
    const g=golfers.find((x:any)=>x.golfer_id===gid);
    if(!g||!course)return;

    const phcp=calcPlayingHandicap(g.current_handicap_index,course.tee_slope,course.tee_rating,course.par);
    const grossVal=parseInt(val);

    // Compute running total from the updated gross array
    const holeCalcs=calcHoleScores(newGross,phcp,course);
    const runningPts=holeCalcs.reduce((s:number,h:any)=>s+(h.points??0),0);

    // -- Step 2: update holeScores state for LIVE scorecard --
    // Use real summary_id if the leaderboard row exists in DB, otherwise use a
    // stable temp id keyed by eid+gid so local state is always populated immediately.
    const existing=leaderboard.find((r:any)=>r.event_id===eid&&r.golfer_id===gid);
    const tempSid:number=existing?.summary_id||(Date.now()+gid);
    // Always update local holeScores state immediately so the LIVE tab reflects each
    // keystroke regardless of whether the DB leaderboard row exists yet.
    if(val&&!isNaN(grossVal)&&grossVal>=2){
      const net=calcHoleNetScore(grossVal,phcp,course.hole_stroke_indices[hole]);
      const pts=calcStablefordPoints(net,course.hole_pars[hole]);
      const holeRow={score_id:tempSid*100+hole,summary_id:tempSid,hole_number:hole+1,gross_score:grossVal,net_score:net,stableford_points:pts};
      setHoleScores((hs:any)=>[...hs.filter((h:any)=>!(h.summary_id===tempSid&&h.hole_number===hole+1)),holeRow]);
      // If we already have a real DB row, write via the queue (handles offline).
      if(existing?.summary_id&&existing.summary_id<1e12){
        queueHoleWrite({...holeRow,summary_id:existing.summary_id,score_id:existing.summary_id*100+hole});
        setQueuedCount(offlineQueue.current.length);
      }
    } else if(!val){
      setHoleScores((hs:any)=>hs.filter((h:any)=>!(h.summary_id===tempSid&&h.hole_number===hole+1)));
    }

    // -- Step 3: update leaderboard running total state --
    const liveEntry:any={
      summary_id:tempSid,event_id:eid,golfer_id:gid,
      season:selEvent?.season||new Date().getFullYear(),
      entry_type:"Hole-by-Hole",total_stableford_points:runningPts,
      buy_in_paid:true,skins_paid:true,charity_paid:true,
      weekly_payout_won:0,skins_payout_won:0
    };
    setLeaderboard((prev:any)=>[
      ...prev.filter((r:any)=>!(r.event_id===eid&&r.golfer_id===gid)),
      liveEntry
    ]);

    // -- Step 4: flip event to In-Progress --
    setEvents((evs:any)=>evs.map((ev:any)=>
      ev.event_id===eid&&ev.status==="Pairings Set"?{...ev,status:"In-Progress"}:ev
    ));

    // -- Step 5: DB writes -- correct sequence --
    const doHoleWrite=(realSid:number)=>{
      if(!val||isNaN(grossVal))return;
      const net=calcHoleNetScore(grossVal,phcp,course.hole_stroke_indices[hole]);
      const pts=calcStablefordPoints(net,course.hole_pars[hole]);
      const payload={summary_id:realSid,hole_number:hole+1,gross_score:grossVal,net_score:net,stableford_points:pts};
      const holeRow={score_id:realSid*100+hole,...payload};
      // Update local state immediately
      setHoleScores((hs:any)=>[...hs.filter((h:any)=>!(h.summary_id===realSid&&h.hole_number===hole+1)),holeRow]);
      // Write via queue — handles offline gracefully
      queueHoleWrite(payload);
      setQueuedCount(offlineQueue.current.length);
    };

    const doSignupWrite=(realSid:number)=>{
      // Persist tee box + playing HCP on the signup row so auto-restore works
      setSignups((su:any)=>{
        const su2=su.map((s:any)=>
          s.event_id===eid&&s.golfer_id===gid
            ?{...s,tee_box_course_id:parseInt(updatedScorer.courseId),playing_handicap:phcp}
            :s
        );
        const mySu=su2.find((s:any)=>s.event_id===eid&&s.golfer_id===gid);
        if(mySu&&mySu.signup_id&&mySu.signup_id<1e12){
          supabase.from("event_signups").update(
            {tee_box_course_id:parseInt(updatedScorer.courseId),playing_handicap:phcp},
            {signup_id:mySu.signup_id}
          ).catch(()=>{});
        }
        return su2;
      });
    };

    // startScoring() guarantees a real summary_id exists before any hole is entered.
    // So we always take the direct-write path — no inserts, no queuing, no races.
    if(!existing||existing.summary_id>=1e12){
      // Safety fallback: scorer started before DB row was ready — skip write,
      // the hole will be written when state catches up on next keystroke.
      return;
    }
    const realSid=existing.summary_id;
    // Strip summary_id and created_at from body — summary_id goes only
    // in the WHERE clause. Sending PK in PATCH body causes a 400.
    const {summary_id:_sid,created_at:_ca,...lbRest}=liveEntry;
    supabase.from("event_leaderboard").update(lbRest,{summary_id:realSid}).catch(()=>{});
    doHoleWrite(realSid);
    doSignupWrite(realSid);
  };

  const handleSubmitAll=()=>{
    let count=0;
    scorers.forEach(scorer=>{
      if(!scorer.golferId||!scorer.courseId)return;
      const gid=parseInt(scorer.golferId);
      const eid=parseInt(selEventId);
      const course=courses.find((c:any)=>c.course_id===parseInt(scorer.courseId));
      const g=golfers.find((x:any)=>x.golfer_id===gid);
      if(!g||!course)return;
      const phcp=calcPlayingHandicap(g.current_handicap_index,course.tee_slope,course.tee_rating,course.par);

      if(mode==="hole"){
        // Scores already written to DB hole-by-hole as user types.
        // Submit finalises the leaderboard total with the real summary_id.
        const realSid=scorer.summaryId;
        if(!realSid||realSid>=1e12)return; // startScoring not yet called
        const holeCalcs=calcHoleScores(scorer.grossScores,phcp,course);
        // Allow pts=0 (all pickup holes) — only skip if no holes entered at all
        const holesEntered=scorer.grossScores.some((v:string)=>!!v);
        if(!holesEntered)return;
        const pts=holeCalcs.reduce((s:number,h:any)=>s+(h.points??0),0);
        const existing=leaderboard.find((r:any)=>r.summary_id===realSid);
        const updatedEntry={
          ...(existing||{}),
          summary_id:realSid,event_id:eid,golfer_id:gid,
          season:selEvent?.season||new Date().getFullYear(),
          entry_type:"Hole-by-Hole",total_stableford_points:pts,
          buy_in_paid:true,skins_paid:true,charity_paid:true,
          weekly_payout_won:existing?.weekly_payout_won||0,
          skins_payout_won:existing?.skins_payout_won||0
        };
        setLeaderboard((p:any)=>[...p.filter((r:any)=>r.summary_id!==realSid),updatedEntry]);
        const {summary_id:_sid2,created_at:_ca2,...lbRest2}=updatedEntry;
        supabase.from("event_leaderboard").update(lbRest2,{summary_id:realSid}).catch(()=>{});
        count++;
      }else{
        // Total-only mode
        const pts=parseInt(scorer.totalPts);
        if(!pts||pts<0)return;
        const newSummaryId=Date.now()+gid;
        const newEntry={summary_id:newSummaryId,event_id:eid,golfer_id:gid,season:selEvent?.season||2026,entry_type:"Total Only",total_stableford_points:pts,buy_in_paid:true,skins_paid:false,charity_paid:true,weekly_payout_won:0,skins_payout_won:0};
        const alreadyIn=leaderboard.some((r:any)=>r.event_id===eid&&r.golfer_id===gid);
        if(alreadyIn){setLeaderboard((p:any)=>p.map((r:any)=>r.event_id===eid&&r.golfer_id===gid?newEntry:r));}
        else{setLeaderboard((p:any)=>[...p,newEntry]);}
        count++;
      }
    });
    if(count>0){
      showSuccess(`${count} score${count>1?"s":""} submitted`);
      // Reset scorers so the next group can be entered
      setScorers([emptyScorer()]);
    }
  };

  // canSubmit: hole-by-hole requires started+at least one hole entered;
  // total-only requires a points value
  // canSubmit: hole-by-hole requires the 18th hole entered (round complete);
  // total-only requires a points value
  const readyToSubmitCount=scorers.filter(s=>{
    if(!s.golferId||!s.courseId)return false;
    if(mode==="total")return!!s.totalPts;
    // hole-by-hole: must have 18th hole entered (index 17)
    return!!s.summaryId&&s.summaryId<1e12&&!!s.grossScores[17];
  }).length;
  const canSubmit=readyToSubmitCount>0;

  return(
    <div>
      <div className="section-title">Score Entry</div>
      <div className="section-sub">Enter scores for today's round</div>

      <ToggleGroup
        options={[{value:"hole",label:"Hole by Hole"},{value:"total",label:"Total Only"}]}
        value={mode}
        onChange={setMode}
      />

      {/* ── Collapsible setup section: always in DOM, hidden via overflow ── */}
      <div style={{overflow:"hidden",transition:"height 0.25s ease",height:setupCollapsed?"0":"auto"}}>
      <div className="form-group">
            <label className="form-label">Event</label>
            <select className="form-select" value={selEventId} onChange={e=>{setSelEventId(e.target.value);setScorers([emptyScorer()]);setSelectedGroup("");}}>
              <option value="">Select event…</option>
              {activeEvents.map((ev:any)=><option key={ev.event_id} value={ev.event_id}>{formatDate(ev.date)} -- {ev.course_name}</option>)}
            </select>
          </div>

          {/* ── Group / tee-time picker (hole-by-hole mode only) ─────── */}
          {selEvent&&hasGroups&&(
            <div className="form-group">
              <label className="form-label">Select Group to Score</label>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:8,marginBottom:4}}>
                {sortedTeeTimes.map(tee=>{
                  const members=groupedByTee[tee]||[];
                  const names=members.map((s:any)=>{const g=golfers.find((x:any)=>x.golfer_id===s.golfer_id);return g?g.first_name:"?";});
                  const startedCount=members.filter((s:any)=>{
                    const entry=leaderboard.find((r:any)=>r.event_id===selEvent.event_id&&r.golfer_id===s.golfer_id&&r.entry_type==="Hole-by-Hole"&&r.summary_id<1e12);
                    return entry&&holeScores.some((h:any)=>h.summary_id===entry.summary_id);
                  }).length;
                  const hasInProgress=startedCount>0;
                  const isSelected=selectedGroup===tee;
                  return(
                    <button
                      key={tee}
                      onClick={()=>{
                        if(isSelected){setSelectedGroup("");setScorers([emptyScorer()]);setExpandedScorers({});setScoreModal(null);return;}
                        setSelectedGroup(tee);
                        setExpandedScorers({});
                        setScoreModal(null);
                        // Pre-populate scorers from this group
                        const groupScorers=members.map((s:any)=>{
                          const eid=selEvent.event_id;
                          const gid=s.golfer_id;
                          let courseId=s.tee_box_course_id?String(s.tee_box_course_id):"";
                          if(!courseId&&availableTees.length)courseId=String(availableTees[0].course_id);
                          if(mode==="hole"){
                            const existing=leaderboard.find((r:any)=>r.event_id===eid&&r.golfer_id===gid&&r.entry_type==="Hole-by-Hole"&&r.summary_id<1e12);
                            if(existing){
                              const hs=holeScores.filter((h:any)=>h.summary_id===existing.summary_id).sort((a:any,b:any)=>a.hole_number-b.hole_number);
                              const gross=Array(18).fill("");
                              hs.forEach((h:any)=>{gross[h.hole_number-1]=String(h.gross_score);});
                              const hasHoles=hs.length>0;
                              return{golferId:String(gid),courseId,totalPts:"",grossScores:gross,submitted:false,started:hasHoles,summaryId:hasHoles?existing.summary_id:null};
                            }
                            return{...emptyScorer(),golferId:String(gid),courseId};
                          }else{
                            // Total Only mode -- prefill existing total points if already scored
                            const existing=leaderboard.find((r:any)=>r.event_id===eid&&r.golfer_id===gid&&r.entry_type==="Total Only");
                            return{...emptyScorer(),golferId:String(gid),courseId,totalPts:existing?String(existing.total_stableford_points):""};
                          }
                        });
                        setScorers(groupScorers.length?groupScorers:[emptyScorer()]);
                        if(hasInProgress){setSetupCollapsed(true);scrollMainTop();}
                      }}
                      style={{
                        padding:"10px 8px",borderRadius:"var(--radius-md)",border:`2px solid ${isSelected?"var(--green-600)":"var(--border)"}`,
                        background:isSelected?"var(--green-50)":"var(--surface)",cursor:"pointer",textAlign:"left",position:"relative"
                      }}
                    >
                      <div style={{fontWeight:700,fontSize:16,color:"var(--green-800)",marginBottom:3}}>{tee}</div>
                      <div style={{fontSize:11,color:"var(--text-secondary)",lineHeight:1.4}}>{names.length?names.join(", "):"No golfers assigned"}</div>
                      {hasInProgress
                        ?<div style={{marginTop:4,fontSize:10,fontWeight:700,color:"var(--gold-700)"}}>↩ In Progress · {startedCount}/{members.length} started</div>
                        :members.length>0
                          ?<div style={{marginTop:4,fontSize:10,fontWeight:700,color:"var(--text-muted)"}}>Not started yet</div>
                          :null
                      }
                    </button>
                  );
                })}
              </div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:6}}>
                {selectedGroup&&<div style={{fontSize:12,display:"none",color:"var(--text-muted)"}}>Tap another group to switch, or tap "{selectedGroup}" again to deselect and enter manually.</div>}
                <button className="btn btn-sm btn-outline" onClick={()=>{setSelectedGroup("");setScorers([emptyScorer()]);setExpandedScorers({});setScoreModal(null);}}>+ Score a different group / start fresh</button>
              </div>
            </div>
          )}

          {/* Resume banner -- shown when a prior H×H session is restored from DB */}
          {selEventId&&mode==="hole"&&scorers.some((s:any)=>s.summaryId&&s.grossScores.some((v:string)=>!!v))&&(
            <div style={{display:"none",alignItems:"center",gap:10,padding:"10px 14px",background:"var(--green-50)",border:"1.5px solid var(--green-200)",borderRadius:"var(--radius-md)",marginBottom:12}}>
              <span style={{display:"none",fontSize:18}}>↩</span>
              <div>
                <div style={{display:"none",fontWeight:700,fontSize:14,color:"var(--green-800)"}}>Scoring Session restored{selectedGroup?` · Group ${selectedGroup}`:""}</div>
                <div style={{fontSize:12,display:"none",color:"var(--green-700)"}}>Scores from your last session have been reloaded. Continue entering from where you left off.</div>
              </div>
            </div>
          )}

          {selEvent&&hasMixedEntry&&mode==="total"&&(
            <div className="skins-warning"><span>⚠</span><span>This event already has hole-by-hole entries. Submitting total-only scores will prevent skins from being calculated.</span></div>
          )}

      {/* Add Another Golfer — above cards */}
      {selEvent&&scorers.length<4&&(
        <button className="btn btn-outline btn-full" style={{marginBottom:10}} onClick={addScorer}>+ Add Another Golfer ({scorers.length}/4)</button>
      )}

      {/* Scorer setup cards */}
      {selEvent&&scorers.map((scorer,idx)=>{
        const g=golfers.find((x:any)=>x.golfer_id===parseInt(scorer.golferId));
        const course=courses.find((c:any)=>c.course_id===parseInt(scorer.courseId));
        const phcp=g&&course?calcPlayingHandicap(g.current_handicap_index,course.tee_slope,course.tee_rating,course.par):null;
        const holeCalcs=g&&course&&mode==="hole"?calcHoleScores(scorer.grossScores,phcp??0,course):[];
        const calcTotal=holeCalcs.reduce((s:number,h:any)=>s+(h.points??0),0);
        const alreadyIn=selEvent&&scorer.golferId?leaderboard.some((r:any)=>r.event_id===selEvent.event_id&&r.golfer_id===parseInt(scorer.golferId)):false;

        const existingLbEntry=selEvent&&scorer.golferId?leaderboard.find((r:any)=>r.event_id===selEvent.event_id&&r.golfer_id===parseInt(scorer.golferId)&&r.entry_type==="Hole-by-Hole"):null;
        const holesIn=scorer.grossScores.filter((v:string)=>!!v).length;
        const roundComplete=holesIn===18;
        const isResuming=mode==="hole"&&scorer.golferId&&scorer.grossScores.some((v:string)=>!!v)&&
          !!existingLbEntry&&!roundComplete;

        const isExpanded=!!expandedScorers[idx];

        // Collapsed mini row once scoring has started (hole-by-hole mode)
        if(mode==="hole"&&scorer.started&&!isExpanded){
          return(
            <div key={idx} className="scorer-row-mini" onClick={()=>setExpandedScorers(p=>({...p,[idx]:true}))}>
              <div>
                <div className="name">{g?`${g.first_name} ${g.last_name}`:`Golfer ${idx+1}`}</div>
                <div className="sub">{course?.tee_box_name||""} · HCP {phcp} · {holesIn}/18 holes · {calcTotal} pts</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                {roundComplete&&<span style={{fontSize:11,fontWeight:700,background:"var(--green-100)",color:"var(--green-800)",border:"1px solid var(--green-300)",borderRadius:12,padding:"2px 9px",letterSpacing:"0.04em"}}>✓ 18/18</span>}
                <button className="btn btn-sm btn-danger" onClick={e=>{e.stopPropagation();deleteScorerEntry(idx);}}>Delete</button>
                <span className="chev">▾ Expand</span>
              </div>
            </div>
          );
        }

        return(
          <div key={idx} className={`scorer-card${scorer.golferId?" active-scorer":""}`}>
            <div className="scorer-header">
              <span className="scorer-num">Golfer {idx+1}</span>
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                {roundComplete&&<span style={{fontSize:11,fontWeight:700,background:"var(--green-100)",color:"var(--green-800)",border:"1px solid var(--green-300)",borderRadius:12,padding:"2px 9px",letterSpacing:"0.04em"}}>✓ Complete · 18/18</span>}
                {isResuming&&<span style={{fontSize:11,fontWeight:700,background:"var(--gold-100)",color:"var(--gold-800)",border:"1px solid var(--gold-300)",borderRadius:12,padding:"2px 9px",letterSpacing:"0.04em"}}>↩ Resuming · {holesIn}/18</span>}
                {mode==="hole"&&scorer.started&&<button className="btn btn-sm btn-outline" onClick={()=>setExpandedScorers(p=>({...p,[idx]:false}))}>▾ Minimize</button>}
                {mode==="hole"&&scorer.started&&<button className="btn btn-sm btn-danger" onClick={()=>deleteScorerEntry(idx)}>Delete</button>}
                {idx>0&&<button className="btn btn-sm btn-danger" onClick={()=>removeScorer(idx)}>Remove</button>}
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <div className="form-group" style={{marginBottom:0}}>
                <label className="form-label">Golfer</label>
                <select className="form-select" value={scorer.golferId} onChange={e=>updateScorer(idx,"golferId",e.target.value)}>
                  <option value="">Select…</option>
                  {golfers.filter((g:any)=>g.status==="Active").map((g:any)=><option key={g.golfer_id} value={g.golfer_id}>{g.first_name} {g.last_name}{g.is_guest?" (G)":""}</option>)}
                </select>
              </div>
              <div className="form-group" style={{marginBottom:0}}>
                <label className="form-label">Tee Box</label>
                <select className="form-select" value={scorer.courseId} onChange={e=>updateScorer(idx,"courseId",e.target.value)}>
                  <option value="">Select…</option>
                  {availableTees.map((t:any)=><option key={t.course_id} value={t.course_id}>{t.tee_box_name}</option>)}
                </select>
              </div>
            </div>
            {g&&course&&(
              <div style={{marginTop:8,fontSize:13,display:"flex",gap:12,alignItems:"center"}}>
                <span style={{color:"var(--text-muted)"}}>Playing HCP:</span>
                <span style={{fontWeight:700,fontSize:17,color:"var(--green-700)"}}>{phcp}</span>
                {alreadyIn&&<span style={{color:"var(--gold-700)",fontSize:12}}>⚠ Will overwrite</span>}
              </div>
            )}
            {g&&course&&mode==="hole"&&scorer.started&&(
              <div style={{marginTop:8,display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:12,fontWeight:700,background:"var(--green-100)",color:"var(--green-800)",borderRadius:12,padding:"3px 10px"}}>
                  🟢 Live · Hole by Hole
                </span>
                {isResuming&&<span style={{fontSize:11,fontWeight:700,background:"var(--gold-100)",color:"var(--gold-800)",border:"1px solid var(--gold-300)",borderRadius:12,padding:"2px 9px"}}>↩ Resumed · {holesIn}/18</span>}
                {roundComplete&&<span style={{fontSize:11,fontWeight:700,background:"var(--green-100)",color:"var(--green-800)",border:"1px solid var(--green-300)",borderRadius:12,padding:"2px 9px"}}>✓ Complete · 18/18</span>}
              </div>
            )}
            {mode==="total"&&(
              <div className="form-group" style={{marginBottom:0,marginTop:10}}>
                <label className="form-label">Stableford Points</label>
                <input className="form-input" type="number" min="0" max="72" placeholder="e.g. 36" value={scorer.totalPts} onChange={e=>updateScorer(idx,"totalPts",e.target.value)}/>
              </div>
            )}
          </div>
        );
      })}

      {/* Shared Start Scoring button — shown when H×H mode, at least one scorer
           is ready (golfer+tee selected) but not yet started */}
      {mode==="hole"&&selEvent&&scorers.some(s=>s.golferId&&s.courseId&&!s.started)&&(()=>{
        // Only count golfers that haven't started AND don't have a complete round
        const notStartedScorers=scorers.filter(s=>{
          if(!s.golferId||!s.courseId||s.started)return false;
          const gid=parseInt(s.golferId);
          const existingEntry=leaderboard.find((r:any)=>r.event_id===selEvent.event_id&&r.golfer_id===gid&&r.entry_type==="Hole-by-Hole");
          if(!existingEntry)return true; // new scorer, needs start
          const existingHoles=holeScores.filter((h:any)=>h.summary_id===existingEntry.summary_id);
          return existingHoles.length<18; // incomplete round can be resumed
        });
        if(!notStartedScorers.length)return null;
        const readyCount=notStartedScorers.length;
        const anyResume=notStartedScorers.some(s=>
          leaderboard.some((r:any)=>r.event_id===selEvent.event_id&&r.golfer_id===parseInt(s.golferId)&&r.entry_type==="Hole-by-Hole"));
        const allResume=notStartedScorers.every(s=>
          leaderboard.some((r:any)=>r.event_id===selEvent.event_id&&r.golfer_id===parseInt(s.golferId)&&r.entry_type==="Hole-by-Hole"));
        const label=allResume?"↩ Resume Scoring":anyResume?"▶ Start / Resume Scoring":"▶ Start Scoring";
        const sub=readyCount>1?` (${readyCount} golfers)`:"";
        return(
          <button
            className="btn btn-primary btn-full"
            style={{marginTop:4,marginBottom:8,fontWeight:700,fontSize:16,padding:"15px"}}
            onClick={async()=>{
              for(let i=0;i<scorers.length;i++){
                if(scorers[i].golferId&&scorers[i].courseId&&!scorers[i].started)
                  await startScoring(i);
              }
            }}
          >
            {label}{sub}
          </button>
        );
      })()}
      </div>{/* end collapsible setup section */}

      {/* ── Chevron toggle — always visible once an event is selected ── */}
      {selEvent&&(
        <button
          onClick={()=>setSetupCollapsed(c=>{if(!c)scrollMainTop();return!c;})}
          style={{
            display:"flex",alignItems:"center",justifyContent:"center",gap:6,
            width:"100%",padding:"7px 0",marginBottom:8,
            background:"none",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",
            color:"var(--text-muted)",fontSize:13,fontWeight:600,cursor:"pointer",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{transform:setupCollapsed?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.2s"}}>
            <polyline points="18 15 12 9 6 15"/>
          </svg>
          {setupCollapsed?"Show event & group selection":"Hide event & group selection"}
        </button>
      )}

      {/* 3: Unified stacked H×H table -- one row per hole, one column per golfer */}
      {mode==="hole"&&selEvent&&scorers.some(s=>s.golferId&&s.courseId&&s.started)&&(()=>{
        const activeScorersFull=scorers
          .map((s,origIdx)=>({...s,origIdx}))
          .filter(s=>s.golferId&&s.courseId&&s.started)
          .map(s=>{
            const g=golfers.find((x:any)=>x.golfer_id===parseInt(s.golferId));
            const course=courses.find((c:any)=>c.course_id===parseInt(s.courseId));
            const phcp=g&&course?calcPlayingHandicap(g.current_handicap_index,course.tee_slope,course.tee_rating,course.par):0;
            const holeCalcs=g&&course?calcHoleScores(s.grossScores,phcp,course):[];
            return{...s,g,course,phcp,holeCalcs};
          });
        if(!activeScorersFull.length)return null;
        const refCourse=activeScorersFull[0].course;
        const ptsClass=(pts:number|null)=>{if(pts===null||pts===undefined)return"";if(pts>=4)return"pts-eagle";if(pts===3)return"pts-birdie";if(pts===2)return"pts-par";if(pts===1)return"pts-bogey";return"pts-zero";};
        return(
          <div style={{marginTop:8}}>
            <div className="card-title" style={{marginBottom:8}}>Score Sheet</div>
            <div className="score-grid">
              <table className="score-table" style={{minWidth:`${80+activeScorersFull.length*52}px`}}>
                <thead>
                  <tr>
                    <th style={{width:36}}>Hole</th>
                    <th style={{width:32}}>Par</th>
                    <th style={{width:28,color:"var(--green-300)",fontSize:11}}>SI</th>
                    {activeScorersFull.map((s,i)=>(
                      <th key={i} style={{minWidth:48}}>
                        {s.g?.first_name||`P${i+1}`}
                        <div style={{fontSize:9,fontWeight:400,opacity:0.8}}>{s.course?.tee_box_name} · {s.phcp}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({length:18},(_,holeIdx)=>{
                    const holeRow=(
                      <tr key={`h${holeIdx}`} style={holeIdx===8?{borderBottom:"3px solid var(--green-600)"}:{}}>
                        <td style={{fontWeight:600}}>{holeIdx+1}</td>
                        <td>{refCourse?.hole_pars[holeIdx]}</td>
                        <td style={{color:"var(--text-muted)",fontSize:12}}>{refCourse?.hole_stroke_indices?.[holeIdx]??""}</td>
                        {activeScorersFull.map((s,si)=>{
                          const h=s.holeCalcs[holeIdx]||{} as {points?:number|null,gross?:number|null,par?:number};
                          const pts=h.points;
                          const gross=s.grossScores[holeIdx];
                          const par=refCourse?.hole_pars?.[holeIdx]??4;
                          return(
                            <td key={si} className={`score-input-cell ${ptsClass(pts)}`} style={{padding:"3px 2px",textAlign:"center"}}>
                              {gross?(
                                <div style={{position:"relative",display:"inline-flex",alignItems:"flex-start",justifyContent:"center"}} onClick={()=>setScoreModal({scorerIdx:s.origIdx,holeIdx})}>
                                  <div className="score-tap-cell filled"><ScoreSymbol gross={parseInt(gross)} par={par}/></div>
                                  {pts!=null&&<span style={{fontSize:11,fontWeight:700,color:"var(--green-700)",lineHeight:1,marginLeft:1,marginTop:1,flexShrink:0}}>{pts}</span>}
                                </div>
                              ):(
                                <div className="score-tap-cell" onClick={()=>setScoreModal({scorerIdx:s.origIdx,holeIdx})}>+</div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                    // After hole 9: show front 9 subtotal
                    if(holeIdx===8){
                      const subtotalRow=(
                        <tr key="front9" style={{background:"var(--green-100)",borderTop:"2px solid var(--green-600)"}}>
                          <td colSpan={3} style={{fontWeight:700,fontSize:15,textAlign:"left",paddingLeft:6,color:"var(--green-800)",textTransform:"uppercase",letterSpacing:"0.05em"}}>F9</td>
                          {activeScorersFull.map((s,si)=>{
                            const front9pts=s.holeCalcs.slice(0,9).reduce((sum:number,h:any)=>sum+(h.points??0),0);
                            const front9gross=s.grossScores.slice(0,9).reduce((sum:number,v:string)=>sum+(parseInt(v)||0),0);
                            const hasAny=s.grossScores.slice(0,9).some((v:string)=>!!v);
                            return(
                              <td key={si} style={{textAlign:"center",verticalAlign:"middle"}}>
                                {hasAny?(
                                  <span style={{display:"inline-flex",alignItems:"baseline",gap:2}}>
                                    <span style={{fontWeight:700,fontSize:19,color:"var(--green-800)"}}>{front9gross}</span>
                                    <span style={{fontSize:16,fontWeight:700,color:"var(--green-700)",lineHeight:1,alignSelf:"flex-start",marginTop:1}}>{front9pts}</span>
                                  </span>
                                ):""}
                              </td>
                            );
                          })}
                        </tr>
                      );
                      return[holeRow,subtotalRow];
                    }
                    // After hole 18: show back 9 subtotal just before total row
                    if(holeIdx===17){
                      const subtotalRow=(
                        <tr key="back9" style={{background:"var(--green-100)",borderTop:"1px solid var(--green-400)"}}>
                          <td colSpan={3} style={{fontWeight:700,fontSize:15,textAlign:"left",paddingLeft:6,color:"var(--green-800)",textTransform:"uppercase",letterSpacing:"0.05em"}}>B9</td>
                          {activeScorersFull.map((s,si)=>{
                            const back9pts=s.holeCalcs.slice(9,18).reduce((sum:number,h:any)=>sum+(h.points??0),0);
                            const back9gross=s.grossScores.slice(9,18).reduce((sum:number,v:string)=>sum+(parseInt(v)||0),0);
                            const hasAny=s.grossScores.slice(9,18).some((v:string)=>!!v);
                            return(
                              <td key={si} style={{textAlign:"center",verticalAlign:"middle"}}>
                                {hasAny?(
                                  <span style={{display:"inline-flex",alignItems:"baseline",gap:2}}>
                                    <span style={{fontWeight:700,fontSize:19,color:"var(--green-800)"}}>{back9gross}</span>
                                    <span style={{fontSize:16,fontWeight:700,color:"var(--green-700)",lineHeight:1,alignSelf:"flex-start",marginTop:1}}>{back9pts}</span>
                                  </span>
                                ):""}
                              </td>
                            );
                          })}
                        </tr>
                      );
                      return[holeRow,subtotalRow];
                    }
                    return holeRow;
                  })}
                  <tr style={{background:"var(--green-50)",borderTop:"2px solid var(--green-600)"}}>
                    <td colSpan={3} style={{fontWeight:700,textAlign:"left",paddingLeft:6,fontSize:15,textTransform:"uppercase"}}>Total</td>
                    {activeScorersFull.map((s,si)=>{
                      const totalPts=s.holeCalcs.reduce((sum:number,h:any)=>sum+(h.points??0),0);
                      const totalGross=s.grossScores.reduce((sum:number,v:string)=>sum+(parseInt(v)||0),0);
                      const hasAny=s.grossScores.some((v:string)=>!!v);
                      return(
                        <td key={si} style={{textAlign:"center",verticalAlign:"middle"}}>
                          {hasAny?(
                            <span style={{display:"inline-flex",alignItems:"baseline",gap:2}}>
                              <span style={{fontWeight:700,fontSize:19,color:"var(--green-700)"}}>{totalGross}</span>
                              <span style={{fontSize:16,fontWeight:700,color:"var(--green-600)",lineHeight:1,alignSelf:"flex-start",marginTop:1}}>{totalPts}</span>
                            </span>
                          ):""}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* ── Slide-to-Submit ── */}
      {(()=>{
        const label=canSubmit
          ?`Slide to Submit (${readyToSubmitCount})`
          :"Slide to Submit";
        const pct=Math.min(slideSubmitX/SLIDE_THRESHOLD,1);
        const confirmed=pct>=1;
        const thumbSize=44+pct*16;
        return(
          <div
            style={{marginTop:4,position:"relative",height:56,borderRadius:28,background:canSubmit?"var(--green-800)":"var(--border-md)",overflow:"hidden",touchAction:"none",userSelect:"none",opacity:canSubmit?1:0.55,cursor:canSubmit?"pointer":"not-allowed"}}
            ref={slideSubmitRef}
            onPointerDown={e=>{
              if(!canSubmit)return;
              e.currentTarget.setPointerCapture(e.pointerId);
              slidingSubmit.current=true;
              setSlideSubmitX(0);
            }}
            onPointerMove={e=>{
              if(!slidingSubmit.current||!canSubmit)return;
              const rect=slideSubmitRef.current?.getBoundingClientRect();
              if(!rect)return;
              setSlideSubmitX(Math.max(0,e.clientX-rect.left-26));
            }}
            onPointerUp={()=>{
              if(!slidingSubmit.current)return;
              slidingSubmit.current=false;
              if(slideSubmitX>=SLIDE_THRESHOLD){
                handleSubmitAll();
              }
              setSlideSubmitX(0);
            }}
            onPointerCancel={()=>{slidingSubmit.current=false;setSlideSubmitX(0);}}
          >
            {/* track fill */}
            <div style={{position:"absolute",inset:0,background:"var(--green-600)",width:`${pct*100}%`,transition:slidingSubmit.current?"none":"width 0.3s ease"}}/>
            {/* thumb — golf ball */}
            <div style={{
              position:"absolute",
              top:"50%",left:4+slideSubmitX,
              width:thumbSize,height:thumbSize,
              transform:"translateY(-50%)",
              borderRadius:"50%",
              background:"white",
              display:"flex",alignItems:"center",justifyContent:"center",
              transition:slidingSubmit.current?"none":"left 0.3s ease",
              boxShadow:"0 2px 10px rgba(0,0,0,0.35)",
            }}>
              {confirmed
                ? <svg width={thumbSize*0.55} height={thumbSize*0.55} viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                : <svg width={thumbSize*0.82} height={thumbSize*0.82} viewBox="0 0 100 100" fill="none">
                    <circle cx="50" cy="50" r="44" stroke="black" strokeWidth="8"/>
                    <circle cx="62" cy="38" r="5" fill="black"/>
                    <circle cx="54" cy="52" r="5" fill="black"/>
                    <circle cx="68" cy="54" r="5" fill="black"/>
                    <circle cx="46" cy="65" r="5" fill="black"/>
                    <circle cx="60" cy="67" r="5" fill="black"/>
                  </svg>
              }
            </div>
            {/* label — truly centered, no padding offset */}
            <div style={{
              position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:15,fontWeight:700,color:"white",letterSpacing:"0.02em",
              opacity:1-pct*0.7,pointerEvents:"none"
            }}>
              {label}
            </div>
          </div>
        );
      })()}

      {/* ── Finalize confirmation modal ── */}
      {showFinalizeConfirm&&selEvent&&(
        <div style={{position:"fixed",inset:0,zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.55)",padding:24}}>
          <div style={{background:"var(--surface)",borderRadius:"var(--radius-lg)",padding:28,maxWidth:340,width:"100%",boxShadow:"0 8px 40px rgba(0,0,0,0.35)"}}>
            <div style={{fontSize:20,fontWeight:800,color:"var(--green-900)",marginBottom:8}}>Finalize Event?</div>
            <p style={{fontSize:14,color:"var(--text-secondary)",lineHeight:1.6,marginBottom:20}}>
              This will mark <strong>{selEvent.event_name||"this event"}</strong> as <strong>Completed</strong>, locking all scores and calculating payouts. This cannot be undone.
            </p>
            <div style={{display:"flex",gap:10}}>
              <button
                onClick={()=>setShowFinalizeConfirm(false)}
                style={{flex:1,padding:"12px 0",borderRadius:"var(--radius-md)",border:"1.5px solid var(--border)",background:"var(--surface)",fontSize:15,fontWeight:700,color:"var(--text-secondary)",cursor:"pointer"}}
              >Cancel</button>
              <button
                onClick={()=>{
                  setShowFinalizeConfirm(false);
                  setEvents((p:any)=>p.map((e:any)=>e.event_id===selEvent.event_id?{...e,status:"Completed"}:e));
                  setScoreEventId("");
                  setScorers([emptyScorer()]);
                  showSuccess("Event finalized and marked Completed!");
                  // Fire-and-forget: generate AI recap server-side after event is finalized.
                  // Does not block or affect the UI -- failure is silent to golfers.
                  fetch(`${SUPABASE_URL}/functions/v1/generate-event-recap`,{
                    method:"POST",
                    headers:{"Content-Type":"application/json","Authorization":"Bearer "+SUPABASE_KEY},
                    body:JSON.stringify({event_id:selEvent.event_id}),
                  }).catch((_:any)=>{});
                }}
                style={{flex:1,padding:"12px 0",borderRadius:"var(--radius-md)",border:"none",background:"#78350f",fontSize:15,fontWeight:700,color:"white",cursor:"pointer"}}
              >Yes, Finalize</button>
            </div>
          </div>
        </div>
      )}

      {/* Finalize Event — shown once the event is In-Progress and has scored entries */}
      {selEvent&&(selEvent.status==="In-Progress"||selEvent.status==="Pairings Set")&&
       leaderboard.filter((r:any)=>r.event_id===selEvent.event_id).length>0&&(
        <div style={{marginTop:24,borderTop:"2px solid var(--border)",paddingTop:18}}>
          <div style={{fontSize:13,fontWeight:700,color:"var(--text-muted)",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:6}}>Finalize Event</div>
          <p style={{fontSize:14,color:"var(--text-secondary)",marginBottom:14,lineHeight:1.5}}>
            All scores entered? Mark this event <strong>Completed</strong> to lock it in, calculate payouts, and move it off the active scoring list.
            <br/><span style={{fontSize:13,color:"var(--text-muted)"}}>{leaderboard.filter((r:any)=>r.event_id===selEvent.event_id).length} score{leaderboard.filter((r:any)=>r.event_id===selEvent.event_id).length!==1?"s":""} recorded.</span>
          </p>
          {/* ── Slide-to-Finalize ── */}
          {(()=>{
            const pct=Math.min(slideFinalizeX/SLIDE_FINALIZE_THRESHOLD,1);
            const confirmed=pct>=1;
            return(
              <div
                style={{position:"relative",height:56,borderRadius:28,background:"#78350f",overflow:"hidden",touchAction:"none",userSelect:"none"}}
                ref={slideFinalizeRef}
                onPointerDown={e=>{
                  e.currentTarget.setPointerCapture(e.pointerId);
                  slidingFinalize.current=true;
                  setSlideFinalizeX(0);
                }}
                onPointerMove={e=>{
                  if(!slidingFinalize.current)return;
                  const rect=slideFinalizeRef.current?.getBoundingClientRect();
                  if(!rect)return;
                  setSlideFinalizeX(Math.max(0,e.clientX-rect.left-26));
                }}
                onPointerUp={()=>{
                  if(!slidingFinalize.current)return;
                  slidingFinalize.current=false;
                  if(slideFinalizeX>=SLIDE_FINALIZE_THRESHOLD){
                    setShowFinalizeConfirm(true);
                  }
                  setSlideFinalizeX(0);
                }}
                onPointerCancel={()=>{slidingFinalize.current=false;setSlideFinalizeX(0);}}
              >
                <div style={{position:"absolute",inset:0,background:"#d97706",width:`${pct*100}%`,transition:slidingFinalize.current?"none":"width 0.3s ease"}}/>
                {/* thumb — golf ball */}
                {(()=>{const ts=44+pct*16;return(
                <div style={{
                  position:"absolute",top:"50%",left:4+slideFinalizeX,
                  width:ts,height:ts,transform:"translateY(-50%)",
                  borderRadius:"50%",background:"white",
                  display:"flex",alignItems:"center",justifyContent:"center",
                  transition:slidingFinalize.current?"none":"left 0.3s ease",
                  boxShadow:"0 2px 10px rgba(0,0,0,0.35)"
                }}>
                  {confirmed
                    ? <svg width={ts*0.55} height={ts*0.55} viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    : <svg width={ts*0.82} height={ts*0.82} viewBox="0 0 100 100" fill="none">
                        <circle cx="50" cy="50" r="44" stroke="black" strokeWidth="8"/>
                        <circle cx="62" cy="38" r="5" fill="black"/>
                        <circle cx="54" cy="52" r="5" fill="black"/>
                        <circle cx="68" cy="54" r="5" fill="black"/>
                        <circle cx="46" cy="65" r="5" fill="black"/>
                        <circle cx="60" cy="67" r="5" fill="black"/>
                      </svg>
                  }
                </div>);})()}
                <div style={{
                  position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:15,fontWeight:700,color:"white",letterSpacing:"0.02em",
                  opacity:1-pct*0.7,pointerEvents:"none"
                }}>
                  Slide to Finalize
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Bottom status bar: connectivity + queued writes ── */}
      {mode==="hole"&&selEvent&&(
        <div style={{marginTop:16,display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderRadius:"var(--radius-md)",background:isOnline?"var(--green-50)":"#fff8e1",border:`1px solid ${isOnline?"var(--green-200)":"#ffe082"}`,fontSize:12,color:isOnline?"var(--green-800)":"#7c6500"}}>
          <span style={{width:8,height:8,borderRadius:"50%",background:isOnline?"var(--green-500)":"#f59e0b",display:"inline-block",flexShrink:0}}/>
          {isOnline
            ?(queuedCount>0?`Online — syncing ${queuedCount} queued score${queuedCount>1?"s":""}…`:"Online — scores saving in real time")
            :`Offline — ${queuedCount>0?`${queuedCount} score${queuedCount>1?"s":""} queued, will sync when reconnected`:"scores will queue when entered"}`
          }
        </div>
      )}

      {/* ── Bottom toast (confirmation / error) — no page jump ── */}
      {scoreMsg&&(
        <div style={{marginTop:10,padding:"12px 16px",borderRadius:"var(--radius-md)",background:scoreMsg.ok?"var(--green-50)":"var(--red-100)",border:`1px solid ${scoreMsg.ok?"var(--green-300)":"var(--red-400)"}`,color:scoreMsg.ok?"var(--green-800)":"var(--red-600)",fontSize:14,display:"flex",alignItems:"center",gap:8}}>
          <span>{scoreMsg.ok?"✓":"⚠"}</span>{scoreMsg.text}
        </div>
      )}
      {/* ── Score entry modal (tap a hole cell to score it) ── */}
      {scoreModal&&(()=>{
        const s=scorers[scoreModal.scorerIdx];
        if(!s)return null;
        const g=golfers.find((x:any)=>x.golfer_id===parseInt(s.golferId));
        const course=courses.find((c:any)=>c.course_id===parseInt(s.courseId));
        const par=course?.hole_pars?.[scoreModal.holeIdx]??4;
        const currentVal=s.grossScores[scoreModal.holeIdx];
        const pick=(val:number)=>{
          updateGross(scoreModal.scorerIdx,scoreModal.holeIdx,String(val));
          setScoreModal(null);
        };
        const clearScore=()=>{
          updateGross(scoreModal.scorerIdx,scoreModal.holeIdx,"");
          setScoreModal(null);
        };
        return(
          <div className="modal-overlay" onClick={()=>setScoreModal(null)}>
            <div className="modal-sheet" style={{paddingBottom:124}} onClick={e=>e.stopPropagation()}>
              <div className="score-modal-title">Hole {scoreModal.holeIdx+1} · Par {par}</div>
              <div className="score-modal-name">{g?`${g.first_name} ${g.last_name}`:"Golfer"}</div>
              <div className="score-btn-grid">
                {Array.from({length:9},(_,i)=>i+1).map(n=>(
                  <div key={n} className="score-pick-btn" onClick={()=>pick(n)} style={{outline:currentVal===String(n)?"2px solid var(--green-500)":undefined}}>
                    <ScoreSymbol gross={n} par={par}/>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",gap:8,marginBottom:0}}>
                {currentVal&&(
                  <button className="btn btn-danger" style={{flex:1}} onClick={clearScore}>Clear Score</button>
                )}
                <button className="btn btn-outline" style={{flex:1}} onClick={()=>setScoreModal(null)}>Cancel</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
