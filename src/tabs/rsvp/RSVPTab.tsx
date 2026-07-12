import { useState, useEffect, useRef } from "react";
import { Sun } from "lucide-react";
import { ToggleGroup, GlassPicker } from "../../components/common";
import { PairingPanel } from "../../components/common/PairingPanel";
import { golferName, formatDate, eventPickerLabel, shortCourseName } from "../../lib/formatters";
import { supabase, sendPush, reportWriteError } from "../../lib/supabaseClient";
import { assignLateAdd } from "../../lib/golfMath";
import { useWeather } from "../../hooks/useWeather";
import { wmoToDesc, degToCompass } from "../../components/weather/weatherUtils";
import { WeatherAmbience, getWeatherCardBg } from "../../components/WeatherAmbience";
import { useWeatherReady } from "../../hooks/useWeatherReady";
import { BEZEL_OUTER_SHADOW, CHIP_BEZEL, BEZEL_SUBTAB_RAISED, BADGE_DEPRESSED_BEZEL, bezelRimOverlay } from "../leaderboard/bezelStyles";

const swipeEarlyStyles = `
.rsvp-swipe-outer {
  position: relative;
  border-top: 0.5px solid var(--border);
  overflow: hidden;
  /* Force a stacking context + compositor layer so overflow: hidden clips
     during momentum scroll on iOS — without this the gold panel bleeds. */
  -webkit-transform: translateZ(0);
  transform: translateZ(0);
  -webkit-mask-image: -webkit-radial-gradient(white, black);
}
.rsvp-swipe-bg {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 80px;
  background: #c9a227;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.06em;
  pointer-events: none;
  user-select: none;
  /* Start hidden; only revealed as the row slides left */
  transform: translateX(100%);
  transition: transform 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}
.rsvp-swipe-outer.swiping .rsvp-swipe-bg,
.rsvp-swipe-outer.open .rsvp-swipe-bg {
  transform: translateX(0);
}
.rsvp-swipe-row {
  display: flex;
  align-items: center;
  padding: 10px 14px;
  background: var(--surface);
  gap: 8px;
  position: relative;
  transition: transform 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  touch-action: pan-y;
  user-select: none;
  will-change: transform;
  border-top: none;
}
.rsvp-swipe-row.early-active {
  background: color-mix(in srgb, #c9a227 6%, var(--surface));
}
.early-badge {
  display: flex;
  align-items: center;
  gap: 3px;
  background: rgba(201, 162, 39, 0.15);
  border: 1px solid rgba(201, 162, 39, 0.4);
  border-radius: 12px;
  padding: 2px 8px;
  font-size: 10px;
  font-weight: 700;
  color: #8a6b10;
  white-space: nowrap;
  flex-shrink: 0;
}
.early-tee-hint {
  font-size: 14px;
  color: var(--color-text-secondary, #888);
  text-align: center;
  padding: 4px 16px 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
}
`;

if (typeof document !== "undefined" && !document.getElementById("swipe-early-styles")) {
  const styleEl = document.createElement("style");
  styleEl.id = "swipe-early-styles";
  styleEl.textContent = swipeEarlyStyles;
  document.head.appendChild(styleEl);
}

function useSwipeEarly(onToggle: () => void, enabled: boolean, threshold = 75) {
  const rowRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef<number>(0);
  const startYRef = useRef<number>(0);
  // null = undecided, true = horizontal swipe, false = vertical scroll
  const directionRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const el = rowRef.current;
    const outer = el?.parentElement;
    if (!el || !outer) return;

    function onStart(e: TouchEvent | MouseEvent) {
      startXRef.current = 'touches' in e ? e.touches[0].clientX : e.clientX;
      startYRef.current = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
      directionRef.current = null;
    }

    function onMove(e: TouchEvent | MouseEvent) {
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
      const dx = clientX - startXRef.current;
      const dy = clientY - startYRef.current;

      // Decide direction on first move that exceeds a small dead zone
      if (directionRef.current === null && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
        directionRef.current = Math.abs(dx) > Math.abs(dy);
      }

      // Not yet decided or determined to be a vertical scroll — do nothing
      if (!directionRef.current) return;

      if (dx < 0) {
        el.style.transform = `translateX(${Math.max(dx, -80)}px)`;
        outer.classList.add('swiping');
        if (e.cancelable) e.preventDefault();
      }
    }

    function onEnd(e: TouchEvent | MouseEvent) {
      if (directionRef.current !== true) {
        directionRef.current = null;
        return;
      }
      directionRef.current = null;
      const clientX = 'changedTouches' in e
        ? (e as TouchEvent).changedTouches[0].clientX
        : (e as MouseEvent).clientX;
      const dx = clientX - startXRef.current;
      el.style.transition = 'transform 0.25s cubic-bezier(0.25,0.46,0.45,0.94)';
      el.style.transform = 'translateX(0)';
      outer.classList.remove('swiping');
      setTimeout(() => { if (el) el.style.transition = ''; }, 300);
      if (dx < -threshold) onToggle();
    }

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);

    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('mousedown', onStart);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
    };
  }, [onToggle, enabled, threshold]);

  return rowRef;
}

interface SwipeMemberRowProps {
  signup: any;
  golfer: any;
  isEarly: boolean;
  isMe: boolean;
  editable: boolean;
  myGuests: any[];
  allGolfers: any[];
  onToggleEarly: () => void;
  onToggleAttending: (val: string) => void;
  onToggleGuestAttending: (guestSignupId: number, guestGolferId: number, val: string, current: string) => void;
}

function SwipeMemberRow({ signup, golfer, isEarly, isMe, editable, myGuests, allGolfers, onToggleEarly, onToggleAttending, onToggleGuestAttending }: SwipeMemberRowProps) {
  // Swipe-for-early and In/Out toggles only work on rows the viewer owns.
  const swipeEnabled = editable && signup.attending === "Yes";
  const rowRef = useSwipeEarly(onToggleEarly, swipeEnabled);

  return (
    <div>
      <div className="rsvp-swipe-outer">
        {swipeEnabled && (
          <div className="rsvp-swipe-bg">
            <Sun size={20} strokeWidth={2.5} />
            <span>{isEarly ? 'REMOVE' : 'EARLY'}</span>
          </div>
        )}
        <div ref={rowRef} className={`rsvp-swipe-row${isEarly ? ' early-active' : ''}${isMe ? ' me-row' : ''}`}>
          {/* Member's own name is centered + heavier; the EARLY badge is pulled out
              of flow so it doesn't push the name off-center. */}
          <div className="rsvp-name" style={{display:"flex",alignItems:"center",gap:6,flex:1,...(isMe?{justifyContent:"center",fontWeight:700,fontSize:17}:{})}}>
            {golfer.first_name} {golfer.last_name}
          </div>
          {isEarly && (
            <span className="early-badge" style={isMe?{position:"absolute",right:14,top:"50%",transform:"translateY(-50%)"}:undefined}><Sun size={11} strokeWidth={2.5} style={{flexShrink:0}} /> EARLY ✓</span>
          )}
          {/* The identified member gets large In/Out on a dedicated row below (see
              .rsvp-my-actions); everyone else keeps the inline toggles here. */}
          {!isMe && (
            <div className="rsvp-actions" style={{display:"flex",alignItems:"center",gap:4,...(editable?{}:{opacity:0.55})}}>
              <button className={`rsvp-btn yes${signup.attending === "Yes" ? " active" : ""}`} disabled={!editable} onClick={() => onToggleAttending("Yes")}>In</button>
              <button className={`rsvp-btn no${signup.attending === "No" ? " active" : ""}`} disabled={!editable} onClick={() => onToggleAttending("No")}>Out</button>
            </div>
          )}
        </div>
      </div>
      {isMe && (
        <div className={`rsvp-my-actions${isMe ? ' me-row' : ''}`} style={editable?undefined:{opacity:0.55}}>
          <button className={`rsvp-btn rsvp-btn-lg yes${signup.attending === "Yes" ? " active" : ""}`} disabled={!editable} onClick={() => onToggleAttending("Yes")}>In</button>
          <button className={`rsvp-btn rsvp-btn-lg no${signup.attending === "No" ? " active" : ""}`} disabled={!editable} onClick={() => onToggleAttending("No")}>Out</button>
        </div>
      )}
      {myGuests.map((gs: any) => {
        const gg = allGolfers.find((x: any) => x.golfer_id === gs.golfer_id);
        return (
          <div key={gs.signup_id} className="rsvp-row" style={{paddingLeft:20,paddingRight:14,background:"var(--gold-50)"}}>
            <div className="rsvp-name" style={{fontSize:15,color:"var(--gold-800)",flex:1,minWidth:0}}>↳ {gg ? `${gg.first_name} ${gg.last_name}` : "Guest"} <span style={{fontSize:11,fontWeight:600,background:"var(--gold-100)",borderRadius:4,padding:"1px 5px"}}>guest</span></div>
            <div className="rsvp-actions" style={editable?undefined:{opacity:0.55}}>
              <button className={`rsvp-btn yes${gs.attending === "Yes" ? " active" : ""}`} disabled={!editable} onClick={() => onToggleGuestAttending(gs.signup_id, gs.golfer_id, "Yes", gs.attending)}>In</button>
              <button className={`rsvp-btn no${gs.attending === "No" ? " active" : ""}`} disabled={!editable} onClick={() => onToggleGuestAttending(gs.signup_id, gs.golfer_id, "No", gs.attending)}>Out</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Shared glass-bezel surface used by the subtab pills app-wide: light earth
// background, no border, layered drop shadow + inset top-highlight/bottom-shadow.
const GLASS_BEZEL_SHADOW="0 1px 1px rgba(0,0,0,0.04),0 4px 8px -2px rgba(0,0,0,0.10),0 8px 16px -6px rgba(0,0,0,0.10),inset 0 1px 0 rgba(255,255,255,0.9),inset 0 -1px 0 rgba(0,0,0,0.06)";

// Matches the Sponsor GlassPicker trigger exactly, so the guest inputs share its
// frosted-glass surface whether filled in or empty (see .glass-picker-btn).
const GLASS_PICKER_SURFACE:React.CSSProperties={
  border:"1px solid rgba(255,255,255,0.35)",
  background:"linear-gradient(180deg,rgba(255,255,255,0.55),rgba(255,255,255,0.28))",
  WebkitBackdropFilter:"blur(18px) saturate(180%)",
  backdropFilter:"blur(18px) saturate(180%)",
  boxShadow:"0 1px 2px rgba(28,20,16,0.06),0 6px 16px rgba(28,20,16,0.08),inset 0 1px 0 rgba(255,255,255,0.6)",
};

export function RSVPTab({golfers,courses,events,setEvents,signups,setSignups,showSuccess,showError,adminMode,memberGolferId,scrollToTop,dbUpsertGolfer,setGolfers,initialSubTab,needsIdentify,onRequestIdentify}:any){
  const upcomingEvents=[...events].filter((e:any)=>e.status!=="Completed").sort((a:any,b:any)=>new Date(a.date).getTime()-new Date(b.date).getTime());
  const [selEventId,setSelEventId]=useState<number>(upcomingEvents[0]?.event_id||0);
  const [subTab,setSubTab]=useState(()=>{
    if(initialSubTab&&["rsvp","pairings"].includes(initialSubTab)) return initialSubTab;
    return "rsvp";
  });
  const [guestName,setGuestName]=useState("");
  // Default the guest's sponsor to the identified member (they're the one most
  // likely bringing a guest). Only when they're a valid active, non-guest golfer
  // — mirrors the sponsor picker's own filter below. Empty otherwise.
  const [guestSponsor,setGuestSponsor]=useState(()=>{
    const me=golfers.find((g:any)=>g.golfer_id===memberGolferId);
    return me&&!me.is_guest&&me.status==="Active"?String(memberGolferId):"";
  });
  const [guestHcp,setGuestHcp]=useState("18");
  const [guestSelectedId,setGuestSelectedId]=useState<number|null>(null); // null = create new; number = reuse existing
  const [guestSaving,setGuestSaving]=useState(false); // blocks double-taps while the insert is in flight

  // Re-validate the selection if the chosen event disappears (e.g. finalized
  // while this tab is open) — a stale selEvent crashed downstream renders.
  useEffect(()=>{
    if(upcomingEvents.length&&!upcomingEvents.some((e:any)=>e.event_id===selEventId)){
      setSelEventId(upcomingEvents[0].event_id);
    }
  },[events,selEventId]);

  const cardRef=useRef<HTMLDivElement>(null);
  const [cardHeight,setCardHeight]=useState(340);

  const selEvent=events.find((e:any)=>e.event_id===selEventId);
  const eventSignups=signups.filter((s:any)=>s.event_id===selEventId);
  const firstTeeTimes=(selEvent?.tee_times||[]).slice().sort();
  const earliestTee=firstTeeTimes[0]||undefined;
  const {wx:forecastWx}=useWeather(selEvent?.course_name||"",selEvent?.date||"",earliestTee);
  const wxReady=useWeatherReady(forecastWx,350,selEventId);

  useEffect(()=>{
    if(cardRef.current)setCardHeight(cardRef.current.offsetHeight);
  },[selEventId,forecastWx]);

  // Keep the sponsor defaulted to the member when they identify while this tab
  // is already open (lazy init above only covers the first mount). Only fills an
  // empty field so an in-progress selection is never clobbered.
  useEffect(()=>{
    const me=golfers.find((g:any)=>g.golfer_id===memberGolferId);
    if(me&&!me.is_guest&&me.status==="Active"){
      setGuestSponsor((cur:string)=>cur===""?String(memberGolferId):cur);
    }
  },[memberGolferId,golfers]);

  // Sign-up scroll prompt: an unidentified visitor can read the top of the page
  // (event summary + read-only field), but the moment they scroll the interactive
  // sign-up area into view we ask who they are. The sentinel sits just above the
  // "Member Sign Ups" list; when it enters the viewport we fire onRequestIdentify
  // once. Re-armed whenever identity is still needed (e.g. after "Just browsing").
  const foldSentinelRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!needsIdentify||!onRequestIdentify)return;
    const el=foldSentinelRef.current;
    if(!el||typeof IntersectionObserver==="undefined")return;
    // Only prompt once the sentinel has genuinely scrolled INTO view after
    // starting off-screen — so a short page that shows the sentinel from the
    // start (e.g. a tall desktop viewport) doesn't prompt before any scroll.
    let wasOffscreen=false;
    const io=new IntersectionObserver((entries)=>{
      for(const e of entries){
        if(!e.isIntersecting){wasOffscreen=true;}
        else if(wasOffscreen){onRequestIdentify();}
      }
    },{rootMargin:"0px 0px -25% 0px"});
    io.observe(el);
    return ()=>io.disconnect();
  },[needsIdentify,onRequestIdentify,subTab,selEventId]);

  const yesCount=eventSignups.filter((s:any)=>s.attending==="Yes").length;
  const noCount=eventSignups.filter((s:any)=>s.attending==="No").length;
  const unconfCount=eventSignups.filter((s:any)=>s.attending==="Unconfirmed").length;

  // 2b) Toggle: clicking the already-active button resets to Unconfirmed
  const updateAttending=(signup_id:number,val:string,gid:number,current:string)=>{
    const next=current===val?"Unconfirmed":val;
    const now=new Date().toISOString();
    setSignups((p:any)=>p.map((s:any)=>{
      if(s.signup_id!==signup_id)return s;
      const clearEarly=next!=="Yes";
      const updated={...s,attending:next,rsvp_updated_at:now,...(clearEarly?{early_tee_request:false}:{})};
      // Guard: skip DB writes if the signup or its event haven't been persisted yet
      // (signup_id >= 1e12 = temp signup, event_id >= 1e12 = temp event still inserting)
      const canWrite=s.signup_id<1e12&&!(s.event_id>=1e12);
      // Auto-assign tee time when going Yes on a Pairings Set event
      if(next==="Yes"&&!s.assigned_tee_time&&!s.in_waiting_room&&selEvent?.status==="Pairings Set"&&selEvent.tee_times?.length){
        const currentYes=p.filter((x:any)=>x.event_id===selEvent.event_id&&x.signup_id!==signup_id);
        const tee=assignLateAdd(currentYes,selEvent.tee_times);
        if(tee){
          updated.assigned_tee_time=tee;updated.in_waiting_room=false;
          if(canWrite)
            supabase.from("event_signups").update({attending:next,assigned_tee_time:tee,in_waiting_room:false,rsvp_updated_at:now},{signup_id:s.signup_id}).catch(reportWriteError("RSVP save"));
        }else{
          updated.in_waiting_room=true;
          if(canWrite)
            supabase.from("event_signups").update({attending:next,in_waiting_room:true,rsvp_updated_at:now},{signup_id:s.signup_id}).catch(reportWriteError("RSVP save"));
        }
      } else {
        if(canWrite)
          supabase.from("event_signups").update({attending:next,rsvp_updated_at:now,...(clearEarly?{early_tee_request:false}:{})},{signup_id:s.signup_id}).catch(reportWriteError("RSVP save"));
      }
      return updated;
    }));
    showSuccess(next==="Unconfirmed"?`RSVP cleared for ${golferName(golfers,gid)}`:`RSVP updated for ${golferName(golfers,gid)}`);
    scrollToTop();
  };

  const toggleEarlyTee=(signup_id:number)=>{
    setSignups((p:any)=>p.map((s:any)=>{
      if(s.signup_id!==signup_id)return s;
      const next=!s.early_tee_request;
      const canWrite=s.signup_id<1e12&&!(s.event_id>=1e12);
      if(canWrite)
        supabase.from("event_signups").update({early_tee_request:next},{signup_id:s.signup_id}).catch(reportWriteError("Early tee request save"));
      return{...s,early_tee_request:next};
    }));
  };

  const addGuest=async()=>{
    if(!guestName.trim()||!guestSponsor)return;
    if(guestSaving)return; // double-tap creates duplicate golfer + signup rows
    setGuestSaving(true);
    try{
    const [fn,...rest]=guestName.trim().split(" ");
    const ln=rest.join(" ")||"Guest";
    // Number.isFinite guard: `||18` would coerce a scratch guest's 0 to 18
    const parsedGuestHcp=parseFloat(guestHcp);
    const hcp=Number.isFinite(parsedGuestHcp)?parsedGuestHcp:18;

    // Step 1: Either reuse an existing guest record or insert a new one
    let realGolferId:number|null=null;
    if(guestSelectedId!==null){
      // Reuse existing guest — update their handicap for this event if it changed
      realGolferId=guestSelectedId;
      const existing=golfers.find((g:any)=>g.golfer_id===guestSelectedId);
      if(existing&&existing.current_handicap_index!==hcp){
        supabase.from("golfers").update({current_handicap_index:hcp},{golfer_id:guestSelectedId}).catch(reportWriteError("Guest handicap save"));
        setGolfers((p:any)=>p.map((g:any)=>g.golfer_id===guestSelectedId?{...g,current_handicap_index:hcp}:g));
      }
    }else{
      // Create a brand-new guest record
      try{
        const guestPayload={first_name:fn,last_name:ln,email_address:"",current_handicap_index:hcp,is_guest:true,status:"Active"};
        const [inserted]=await supabase.from("golfers").insert(guestPayload);
        if(!inserted?.golfer_id)throw new Error("No golfer_id returned");
        realGolferId=inserted.golfer_id;
        setGolfers((p:any)=>[...p,{...guestPayload,golfer_id:realGolferId}]);
      }catch(e:any){
        showError("Failed to add guest: "+(e?.message||String(e)));
        return;
      }
    }

    // Step 2: Determine tee time assignment before building the new signup row
    const currentSignups=signups.filter((x:any)=>x.event_id===selEventId);
    const sponsorId=parseInt(guestSponsor);

    // Guests go in the same group as their sponsor when pairings are set.
    // Find sponsor's current tee time first.
    let assignedTee:string|null=null;
    let inWaiting=false;

    if(selEvent?.status==="Pairings Set"&&selEvent.tee_times?.length){
      const sponsorSignup=currentSignups.find((s:any)=>s.golfer_id===sponsorId&&s.attending==="Yes"&&s.assigned_tee_time&&!s.in_waiting_room);
      if(sponsorSignup){
        const sponsorTee=sponsorSignup.assigned_tee_time;
        const sponsorGroupCount=currentSignups.filter((s:any)=>s.assigned_tee_time===sponsorTee&&s.attending==="Yes"&&!s.in_waiting_room).length;
        if(sponsorGroupCount<4){
          // Sponsor's group has space — put guest with sponsor
          assignedTee=sponsorTee;
        }else{
          // Sponsor's group is full (4+) — bump the last-added non-sponsor member
          // to the latest available tee time, put guest with sponsor
          const membersInGroup=currentSignups.filter((s:any)=>s.assigned_tee_time===sponsorTee&&s.attending==="Yes"&&!s.in_waiting_room&&s.golfer_id!==sponsorId);
          const toMove=membersInGroup[membersInGroup.length-1]; // last added non-sponsor
          if(toMove){
            const newTee=assignLateAdd(currentSignups,selEvent.tee_times);
            if(newTee){
              // Move that player to the next available spot
              setSignups((p:any)=>p.map((s:any)=>s.signup_id===toMove.signup_id?{...s,assigned_tee_time:newTee}:s));
              if(toMove.signup_id<1e12&&!(toMove.event_id>=1e12))
                supabase.from("event_signups").update({assigned_tee_time:newTee},{signup_id:toMove.signup_id}).catch(reportWriteError("Tee time move"));
            }
          }
          assignedTee=sponsorTee;
        }
      }else{
        // Sponsor not yet in a group — use latest available tee time
        assignedTee=assignLateAdd(currentSignups,selEvent.tee_times);
        inWaiting=!assignedTee;
      }
    }

    // Step 3: Build and persist the signup row
    const newSignup={
      signup_id:Date.now()+1,event_id:selEventId,golfer_id:realGolferId,
      attending:"Yes",assigned_tee_time:assignedTee,in_waiting_room:inWaiting,
      tee_box_course_id:null,playing_handicap:null,
      is_guest_entry:true,sponsor_golfer_id:sponsorId,
      rsvp_updated_at:new Date().toISOString()
    };
    // Insert to DB (golfer row now exists so FK is satisfied)
    supabase.from("event_signups").insert({
      event_id:selEventId,golfer_id:realGolferId,attending:"Yes",
      assigned_tee_time:assignedTee,in_waiting_room:inWaiting,
      tee_box_course_id:null,playing_handicap:null,
      is_guest_entry:true,sponsor_golfer_id:sponsorId,
      rsvp_updated_at:new Date().toISOString()
    }).catch((e:any)=>showError("Signup save failed: "+(e?.message||String(e))));
    // Update local state directly (not via setSignups setter) so it's immediate
    setSignups((p:any)=>[...p,newSignup]);

    setGuestName(""); setGuestSponsor(""); setGuestHcp("18"); setGuestSelectedId(null);
    showSuccess(`Guest ${fn} ${ln} added`);
    scrollToTop();
    }finally{
      setGuestSaving(false);
    }
  };

  const buildReminderBody=()=>{
    if(!selEvent)return"";
    const sortByTime=(a:any,b:any)=>{
      if(!a.rsvp_updated_at&&!b.rsvp_updated_at)return 0;
      if(!a.rsvp_updated_at)return 1;
      if(!b.rsvp_updated_at)return -1;
      return new Date(a.rsvp_updated_at).getTime()-new Date(b.rsvp_updated_at).getTime();
    };
    const signupLabel=(s:any)=>{
      const g=golfers.find((gl:any)=>gl.golfer_id===s.golfer_id);
      const name=golferName(golfers,s.golfer_id);
      return g?.is_guest?`${name} (Guest)`:name;
    };
    const going=eventSignups.filter((s:any)=>s.attending==="Yes").sort(sortByTime).map(signupLabel);
    const out=eventSignups.filter((s:any)=>s.attending==="No").sort(sortByTime).map(signupLabel);
    const unconf=eventSignups.filter((s:any)=>s.attending==="Unconfirmed").map(signupLabel);
    return`Reminder to sign up for ${formatDate(selEvent.date)} @ ${selEvent.course_name}\nTee times: ${selEvent.tee_times.join(", ")}\n\n✅ Going (${going.length}):\n${going.map((n:string)=>`  * ${n}`).join("\n")}\n\n❓ No response yet (${unconf.length}):\n${unconf.map((n:string)=>`  * ${n}`).join("\n")}\n\n❌ Not attending (${out.length}):\n${out.map((n:string)=>`  * ${n}`).join("\n")}\n\nSign up in the app: https://saturdayschool.vercel.app/?tab=rsvp`;
  };

  if(upcomingEvents.length===0)return<div className="empty-state"><div className="empty-text">No upcoming events</div></div>;

  const allEmails=golfers.filter((g:any)=>!g.is_guest&&g.email_address).map((g:any)=>g.email_address);
  // selEvent can still be briefly undefined while the re-validation effect runs
  const mailtoLink=selEvent?`mailto:?cc=${allEmails.join(",")}&subject=Reminder ${selEvent.course_name} ${(selEvent.tee_times||[]).join(", ")}&body=${encodeURIComponent(buildReminderBody())}`:"";
  const wxBg = getWeatherCardBg(forecastWx?.code);

  const isJuly4 = selEvent?.date ? selEvent.date.slice(5) === "07-04" : false;
  // Small repeating white-star-on-navy tile for the status pill background
  const july4StarBg = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Crect width='16' height='16' fill='%233C3B6E'/%3E%3Ctext x='8' y='12' font-size='10' text-anchor='middle' fill='%23FFFFFF'%3E%E2%98%85%3C/text%3E%3C/svg%3E\")";

  return(
    <div style={{position:"relative"}}>
      <div aria-hidden="true" style={{
        position:"absolute", left:-12, right:-12, top:-86, height:570,
        background:wxBg||"transparent", transition:"background 0.4s ease, opacity 0.4s ease",
        opacity:wxReady?1:0,
        WebkitMaskImage:"linear-gradient(to bottom, black 0%, black 55%, transparent 100%)",
        maskImage:"linear-gradient(to bottom, black 0%, black 55%, transparent 100%)",
        pointerEvents:"none", zIndex:0,
        overflow:"hidden",
      }}>
        <WeatherAmbience weatherCode={forecastWx?.code} cardHeight={570} />
      </div>
      <div style={{position:"relative",zIndex:1}}>
      <div className="section-title">Sign Up</div>
      <div className="section-sub">RSVP for upcoming rounds</div>

      <div className="form-group">
        <label className="form-label">Select Event</label>
        <GlassPicker
          value={selEventId}
          onChange={(v)=>setSelEventId(parseInt(String(v)))}
          options={upcomingEvents.map((ev:any)=>({value:ev.event_id,label:eventPickerLabel(ev)}))}
        />
      </div>

      {/* Event summary card -- status, tee times, and inline weather row */}
      {selEvent&&(
        <div ref={cardRef} className="card" style={{padding:"12px 16px",marginBottom:16,position:"relative",boxShadow:BEZEL_OUTER_SHADOW}}>
          <div style={bezelRimOverlay("var(--radius-lg)","light")}/>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
            <div style={{fontWeight:700,fontSize:17}}>{shortCourseName(selEvent.course_name)}</div>
            <div style={{display:"flex",gap:4,flexWrap:"wrap",justifyContent:"flex-end"}}>
              <span className="pill pill-green" style={{boxShadow:CHIP_BEZEL}}>✓ {yesCount}</span>
              {noCount>0&&<span className="pill pill-red" style={{boxShadow:CHIP_BEZEL}}>✗ {noCount}</span>}
              {unconfCount>0&&<span className="pill pill-gray" style={{boxShadow:CHIP_BEZEL}}>? {unconfCount}</span>}
            </div>
          </div>
          <div className="info-row"><span className="info-key">Status</span><span className="pill pill-gold" style={isJuly4&&selEvent.status==="Upcoming"?{backgroundImage:`linear-gradient(rgba(0,0,0,0.35),rgba(0,0,0,0.35)),${july4StarBg}`,backgroundSize:"auto,16px 16px",backgroundColor:"#3C3B6E",color:"#FFFFFF",border:"2px solid #B22234",fontWeight:800,boxShadow:CHIP_BEZEL}:{boxShadow:CHIP_BEZEL}}>{selEvent.status}</span></div>
          <div className="info-row">
            <span className="info-key">Tee Times</span>
            <span className="info-val" style={{textAlign:"right"}}>
              {selEvent.tee_times.map((t:string,i:number)=>(
                <span key={i} style={{display:"inline-block",background:"var(--green-50)",border:"1px solid var(--green-100)",borderRadius:6,padding:"2px 8px",marginLeft:4,fontSize:14,fontWeight:600,color:"var(--green-700)",boxShadow:CHIP_BEZEL}}>{t}</span>
              ))}
            </span>
          </div>
          {(()=>{
            const fieldSignups=[...eventSignups.filter((s:any)=>s.attending==="Yes")]
              .sort((a:any,b:any)=>{
                const aTime=a.rsvp_updated_at?new Date(a.rsvp_updated_at).getTime():0;
                const bTime=b.rsvp_updated_at?new Date(b.rsvp_updated_at).getTime():0;
                if(aTime&&bTime)return aTime-bTime;
                if(aTime)return -1;
                if(bTime)return 1;
                return (a.signup_id||0)-(b.signup_id||0);
              });
            if(fieldSignups.length===0)return null;
            // Count first-name occurrences across ALL golfers in the database to disambiguate
            const firstNameCounts:Record<string,number>={};
            golfers.forEach((g:any)=>{
              firstNameCounts[g.first_name]=(firstNameCounts[g.first_name]||0)+1;
            });
            const displayNames=fieldSignups.map((s:any)=>{
              const g=golfers.find((gl:any)=>gl.golfer_id===s.golfer_id);
              if(!g)return null;
              const name=firstNameCounts[g.first_name]>1?`${g.first_name} ${g.last_name.charAt(0)}.`:g.first_name;
              return{name,early:!!s.early_tee_request,isGuest:!!g.is_guest};
            }).filter(Boolean) as {name:string,early:boolean,isGuest:boolean}[];
            return(
              <div className="info-row" style={{alignItems:"flex-start"}}>
                <span className="info-key" style={{paddingTop:3}}>Field</span>
                <span className="info-val" style={{textAlign:"right",display:"flex",flexWrap:"wrap",gap:4,justifyContent:"flex-end"}}>
                  {displayNames.map((d,i:number)=>(
                    <span key={i} style={{display:"inline-flex",alignItems:"center",gap:5,background:"var(--green-50)",border:"1px solid var(--green-100)",borderRadius:14,padding:"3px 10px",fontSize:13,fontWeight:600,color:"var(--green-700)",boxShadow:CHIP_BEZEL}}>
                      {d.name}
                      {d.isGuest&&<span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:16,height:16,borderRadius:"50%",background:"var(--green-700)",color:"white",fontSize:9,fontWeight:800,lineHeight:1,flexShrink:0,boxShadow:BADGE_DEPRESSED_BEZEL}}>G</span>}
                      {d.early&&<span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:16,height:16,borderRadius:"50%",background:"var(--gold-600)",color:"white",fontSize:8,fontWeight:800,lineHeight:1,flexShrink:0,boxShadow:BADGE_DEPRESSED_BEZEL}}>E</span>}
                    </span>
                  ))}
                </span>
              </div>
            );
          })()}
          {(()=>{
            const d=forecastWx?wmoToDesc(forecastWx.code):null;
            return(
              <div className="info-row" style={{marginTop:2,paddingTop:8}}>
                <span className="info-key">Forecast</span>
                <span className="info-val" style={{flex:1}}>
                  <span style={{
                    display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",justifyContent:"flex-end",
                    filter:wxReady?"blur(0px)":"blur(6px)",
                    transition:"filter 0.35s ease",
                    pointerEvents:wxReady?"auto":"none",
                  }}>
                    {d?<>
                      <span style={{fontSize:18,lineHeight:1}}>{d.emoji}</span>
                      <span style={{fontWeight:600,fontSize:14,color:"var(--text-primary)"}}>{forecastWx.temp}°F</span>
                      <span style={{fontSize:13,color:"var(--text-secondary)"}}>{d.label}</span>
                      <span style={{fontSize:13,color:"var(--text-muted)"}}>{forecastWx.wind} mph {degToCompass(forecastWx.windDeg)}</span>
                    </>:wxReady&&<span style={{fontSize:14,color:"var(--text-muted)"}}>TBD</span>}
                  </span>
                </span>
              </div>
            );
          })()}
        </div>
      )}

      {/* #3b - two sub-tabs: RSVP | View Pairings */}
      <ToggleGroup
        options={[{value:"rsvp",label:"Who's in"},{value:"pairings",label:"Pairings"}]}
        value={subTab}
        onChange={setSubTab}
      />

      {subTab==="rsvp"&&(
        <>
          {/* Fold sentinel — scrolling this into view prompts an unidentified
              visitor to say who they are before they interact below. */}
          {needsIdentify&&<div ref={foldSentinelRef} aria-hidden="true" style={{height:1,width:"100%"}}/>}
          <div className="card-title" style={{marginBottom:4}}>Member Sign Ups</div>
          <div className="early-tee-hint">
            Swipe name left <svg width="16" height="14" viewBox="0 0 16 14" fill="none" xmlns="http://www.w3.org/2000/svg" style={{flexShrink:0}}><line x1="15" y1="7" x2="1" y2="7" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/><polyline points="7,1 1,7 7,13" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg> for an early tee time 
          </div>
          {[...eventSignups.filter((s:any)=>!s.is_guest_entry)]
          .sort((a:any,b:any)=>{
            // Signed-in member (and their nested guests) float to the top so
            // they never have to scroll to find themselves
            if(a.golfer_id===memberGolferId&&b.golfer_id!==memberGolferId)return -1;
            if(b.golfer_id===memberGolferId&&a.golfer_id!==memberGolferId)return 1;
            const ga=golfers.find((x:any)=>x.golfer_id===a.golfer_id);
            const gb=golfers.find((x:any)=>x.golfer_id===b.golfer_id);
            if(!ga||!gb)return 0;
            return (ga.last_name||"").localeCompare(gb.last_name||"") || (ga.first_name||"").localeCompare(gb.first_name||"");
          }).map((signup:any)=>{
            const g=golfers.find((x:any)=>x.golfer_id===signup.golfer_id);
            if(!g)return null;
            const myGuests=eventSignups.filter((s:any)=>s.is_guest_entry&&s.sponsor_golfer_id===g.golfer_id);
            // Once a member has identified themselves (and isn't in admin mode),
            // only their own row + their guests stay editable; everyone else's
            // In/Out is display-only. Admins edit anyone. Unidentified visitors
            // (needsIdentify) get a fully read-only field until they say who they
            // are — the scroll sentinel below prompts them to identify.
            const editable=adminMode||(!needsIdentify&&(!memberGolferId||g.golfer_id===memberGolferId));
            return(
              <SwipeMemberRow
                key={signup.signup_id}
                signup={signup}
                golfer={g}
                isEarly={!!signup.early_tee_request}
                isMe={g.golfer_id===memberGolferId}
                editable={editable}
                myGuests={myGuests}
                allGolfers={golfers}
                onToggleEarly={()=>toggleEarlyTee(signup.signup_id)}
                onToggleAttending={(val:string)=>updateAttending(signup.signup_id,val,g.golfer_id,signup.attending)}
                onToggleGuestAttending={(gsId:number,gsGolferId:number,val:string,cur:string)=>updateAttending(gsId,val,gsGolferId,cur)}
              />
            );
          })}

          <hr className="divider"/>
          <div className="card-title" style={{marginBottom:10}}>Add Guest</div>

          {/* ── Quick-pick: reuse the permanent Guest 1/2/3 placeholders ── */}
          {(()=>{
            const placeholders=golfers.filter((g:any)=>g.is_guest&&/^Guest [123]$/.test(`${g.first_name} ${g.last_name}`))
              .sort((a:any,b:any)=>(`${a.first_name} ${a.last_name}`).localeCompare(`${b.first_name} ${b.last_name}`));
            if(!placeholders.length)return null;
            return(
              <div style={{marginBottom:14}}>
                <div style={{fontSize:12,fontWeight:600,color:"var(--text-muted)",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.05em"}}>Quick Add</div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {placeholders.map((g:any)=>{
                    const label=`${g.first_name} ${g.last_name}`;
                    const isActive=guestSelectedId===g.golfer_id;
                    return(
                      <button key={g.golfer_id}
                        onClick={()=>{
                          if(isActive){setGuestName("");setGuestSelectedId(null);setGuestHcp("18");}
                          // Carry the stored handicap into the form — leaving the "18"
                          // default would overwrite the guest's real index on save
                          else{setGuestName(label);setGuestSelectedId(g.golfer_id);setGuestHcp(String(g.current_handicap_index??18));}
                        }}
                        style={{padding:"8px 15px",borderRadius:"var(--radius-md)",
                          border:isActive?"2px solid var(--gold-500)":"none",
                          background:isActive?"var(--gold-50)":"var(--surface)",color:isActive?"var(--gold-800)":"var(--text-primary)",
                          fontWeight:isActive?700:500,fontSize:14,cursor:"pointer",transition:"all .15s",
                          boxShadow:isActive?undefined:GLASS_BEZEL_SHADOW}}>
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* ── Name input with fuzzy typeahead ── */}
          {(()=>{
            // Fuzzy scorer: returns 0–1. Checks if all chars of needle appear in order in haystack,
            // with bonus for consecutive matches and prefix match.
            const fuzzyScore=(needle:string,haystack:string):number=>{
              const n=needle.toLowerCase().replace(/\s+/g," ").trim();
              const h=haystack.toLowerCase();
              if(!n)return 0;
              if(h===n)return 1;
              if(h.startsWith(n))return 0.95;
              let ni=0,consecutive=0,score=0;
              for(let hi=0;hi<h.length&&ni<n.length;hi++){
                if(h[hi]===n[ni]){score+=1+consecutive*0.3;consecutive++;ni++;}
                else consecutive=0;
              }
              if(ni<n.length)return 0; // not all chars found
              return Math.min(score/(n.length*1.5),0.89);
            };

            const query=guestName.trim();
            // Only show suggestions when user is typing a custom name (not a quick-pick selection)
            const namedGuests=golfers.filter((g:any)=>g.is_guest&&!/^Guest [123]$/.test(`${g.first_name} ${g.last_name}`));
            const suggestions=query.length>=2&&guestSelectedId===null
              ? namedGuests
                  .map((g:any)=>({g,score:fuzzyScore(query,`${g.first_name} ${g.last_name}`)}))
                  .filter(x=>x.score>0.35)
                  .sort((a:any,b:any)=>b.score-a.score)
                  .slice(0,5)
              : [];
            const hasStrongMatch=suggestions.some(x=>x.score>=0.65);

            return(
              <div className="form-group" style={{marginBottom:suggestions.length?4:undefined}}>
                <label className="form-label">Guest Full Name</label>
                <input className="form-input glass-bezel" placeholder="First Last" autoComplete="off"
                  style={GLASS_PICKER_SURFACE}
                  value={guestName}
                  onChange={e=>{setGuestName(e.target.value);setGuestSelectedId(null);}}/>

                {/* Suggestions list */}
                {suggestions.length>0&&(
                  <div style={{border:"1px solid var(--border)",borderRadius:"var(--radius-md)",marginTop:4,overflow:"hidden",background:"var(--surface)"}}>
                    {hasStrongMatch&&(
                      <div style={{padding:"6px 10px",fontSize:12,color:"var(--gold-700)",background:"var(--gold-50)",borderBottom:"1px solid var(--border)",fontWeight:600}}>
                        ⚠️ Existing guest found — select one below or clear the name to create new
                      </div>
                    )}
                    {suggestions.map(({g,score}:any)=>(
                      <div key={g.golfer_id}
                        onClick={()=>{setGuestName(`${g.first_name} ${g.last_name}`);setGuestSelectedId(g.golfer_id);setGuestHcp(String(g.current_handicap_index));}}
                        style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                          padding:"9px 12px",cursor:"pointer",borderBottom:"1px solid var(--border)",
                          background:guestSelectedId===g.golfer_id?"var(--gold-50)":undefined,
                          transition:"background .1s"}}
                        onMouseEnter={e=>(e.currentTarget.style.background="var(--surface2)")}
                        onMouseLeave={e=>(e.currentTarget.style.background=guestSelectedId===g.golfer_id?"var(--gold-50)":"")}>
                        <div>
                          <span style={{fontWeight:600,fontSize:14}}>{g.first_name} {g.last_name}</span>
                          <span style={{fontSize:12,color:"var(--text-muted)",marginLeft:8}}>HCP {g.current_handicap_index}</span>
                        </div>
                        <span style={{fontSize:11,color:score>=0.65?"var(--gold-700)":"var(--text-muted)",fontWeight:600}}>
                          {score>=0.85?"Strong match":score>=0.65?"Likely match":"Possible match"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Confirmation badge when an existing guest is selected */}
                {guestSelectedId!==null&&!/^Guest [123]$/.test(guestName)&&(
                  <div style={{marginTop:5,fontSize:12,color:"var(--green-700)",fontWeight:600}}>
                    ✓ Using existing record — no duplicate will be created
                  </div>
                )}
              </div>
            );
          })()}

          <div className="form-group">
            <label className="form-label">Sponsor (Member bringing guest)</label>
            <GlassPicker
              value={guestSponsor}
              onChange={(v)=>setGuestSponsor(String(v))}
              options={[
                {value:"",label:"Select member…"},
                ...golfers.filter((g:any)=>!g.is_guest&&g.status==="Active").sort((a:any,b:any)=>a.last_name.localeCompare(b.last_name)).map((g:any)=>({value:String(g.golfer_id),label:`${g.first_name} ${g.last_name}`}))
              ]}
            />
          </div>
          <div className="form-group"><label className="form-label">Guest Handicap Index</label><input className="form-input glass-bezel" style={GLASS_PICKER_SURFACE} type="number" step="0.1" min="0" max="54" value={guestHcp} onChange={e=>setGuestHcp(e.target.value)}/></div>

          {/* Button is blocked when there's a strong fuzzy match but no selection made */}
          {(()=>{
            const query=guestName.trim();
            const namedGuests=golfers.filter((g:any)=>g.is_guest&&!/^Guest [123]$/.test(`${g.first_name} ${g.last_name}`));
            const fuzzyScore=(needle:string,haystack:string):number=>{
              const n=needle.toLowerCase().replace(/\s+/g," ").trim();const h=haystack.toLowerCase();
              if(!n)return 0;if(h===n)return 1;if(h.startsWith(n))return 0.95;
              let ni=0,consecutive=0,score=0;
              for(let hi=0;hi<h.length&&ni<n.length;hi++){if(h[hi]===n[ni]){score+=1+consecutive*0.3;consecutive++;ni++;}else consecutive=0;}
              if(ni<n.length)return 0;return Math.min(score/(n.length*1.5),0.89);
            };
            const hasStrongUnpicked=guestSelectedId===null&&query.length>=2&&
              namedGuests.some((g:any)=>fuzzyScore(query,`${g.first_name} ${g.last_name}`)>=0.65);
            const canSubmit=query&&guestSponsor&&!hasStrongUnpicked&&!guestSaving;
            return(
              <button className="btn btn-gold btn-full" disabled={!canSubmit} onClick={addGuest}>
                {guestSaving?"Adding…":guestSelectedId!==null?"+ Add Guest to Event (existing record)":"+ Add Guest to Event"}
              </button>
            );
          })()}

          {adminMode && (
  <>
    <hr className="divider"/>
    <div className="card-title" style={{marginBottom:6}}>Send Reminder</div>
    <p style={{fontSize:14,color:"var(--text-muted)",marginBottom:10}}>
      Notify the group about the upcoming event and remind them to sign up.
    </p>
    <div style={{display:"flex",gap:8}}>
      <a href={mailtoLink} className="btn btn-outline" style={{flex:1,textDecoration:"none",display:"flex",alignItems:"center",justifyContent:"center",gap:6,border:"none",background:"var(--earth-50)",boxShadow:BEZEL_SUBTAB_RAISED}}>
        ✉ Email
      </a>
      <button
        className="btn btn-outline"
        style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,border:"none",background:"var(--earth-50)",boxShadow:BEZEL_SUBTAB_RAISED}}
        onClick={async () => {
          try {
            await sendPush(
              "Sign up reminder",
              `${formatDate(selEvent?.date)} @ ${selEvent?.course_name} ${selEvent?.tee_times}`,
              "/?tab=rsvp"
            );
            showSuccess("Push notification sent!");
            scrollToTop();
          } catch {
            showError("Failed to send push notification");
          }
        }}
      >
        🔔 Notify
      </button>
    </div>
  </>
)}
        </>
      )}

      {subTab==="pairings"&&(
        <PairingPanel
          golfers={golfers}
          events={events}
          setEvents={setEvents}
          signups={signups}
          setSignups={setSignups}
          selEventId={selEventId}
          adminMode={adminMode}
          showSuccess={showSuccess}
          showError={showError}
          scrollToTop={scrollToTop}
        />
      )}
      {/* ── Push notification opt-in moved to Settings tab ── */}
      </div>
    </div>
  );
}

// ============================================================
// SCORE ENTRY  (#4a up to 4 golfers at once, #5a skins warning)
// ============================================================
