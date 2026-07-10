import { useState, useEffect } from "react";
import { SUPABASE_URL, SUPABASE_KEY, VAPID_PUBLIC_KEY } from "../../lib/supabaseClient";
import { ToggleGroup } from "../../components/common";
import { ProfileView } from "./ProfileView";
import { BEZEL_OUTER_SHADOW, bezelRimOverlay } from "../leaderboard/bezelStyles";

function PushNotificationButton(){
  const [state,setState]=useState<"idle"|"requesting"|"granted"|"denied"|"unsupported">("idle");
  const [msg,setMsg]=useState("");

  useEffect(()=>{
    if(!("Notification" in window)||!("serviceWorker" in navigator)){
      setState("unsupported");return;
    }
    if(Notification.permission==="granted")setState("granted");
    else if(Notification.permission==="denied")setState("denied");
  },[]);

  const subscribe=async()=>{
    if(!("Notification" in window)||!("serviceWorker" in navigator)){
      setState("unsupported");return;
    }
    setState("requesting");
    try{
      const perm=await Notification.requestPermission();
      if(perm!=="granted"){setState("denied");setMsg("Notifications blocked. You can enable them in your browser settings.");return;}

      let reg=await navigator.serviceWorker.getRegistration("/");
      if(!reg) reg=await navigator.serviceWorker.register("/sw.js");

      const vapidKeyRaw = VAPID_PUBLIC_KEY || (window as any).__VAPID_PUBLIC_KEY__ || "";
      if (!vapidKeyRaw) { setState("granted"); setMsg("Notifications enabled! (VAPID key not configured — admin will push manually)"); return; }

      const padding = "=".repeat((4 - vapidKeyRaw.length % 4) % 4);
      const base64 = (vapidKeyRaw + padding).replace(/-/g, "+").replace(/_/g, "/");
      const rawData = atob(base64);
      const vapidKey = new Uint8Array([...rawData].map(c => c.charCodeAt(0)));

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKey,
      });
      const subJson=sub.toJSON() as any;

      await fetch(SUPABASE_URL+"/rest/v1/push_subscriptions",{
        method:"POST",
        headers:{
          "apikey":SUPABASE_KEY,
          "Authorization":"Bearer "+SUPABASE_KEY,
          "Content-Type":"application/json",
          "Prefer":"resolution=merge-duplicates,return=representation",
        },
        body:JSON.stringify({
          endpoint:subJson.endpoint,
          p256dh:subJson.keys?.p256dh||"",
          auth:subJson.keys?.auth||"",
          user_agent:navigator.userAgent.slice(0,200),
        }),
      });

      setState("granted");
      setMsg("You're subscribed! You'll get notified when pairings drop, scoring starts, and results are in.");
    }catch(e:any){
      setState("idle");
      setMsg("Something went wrong: "+(e?.message||String(e)));
      console.warn("Push subscribe error:",e);
    }
  };

  if(state==="unsupported")return null;

  return(
    <div style={{marginTop:24,padding:"16px",borderRadius:"var(--radius-md)",border:"1px solid var(--border)",background:"var(--surface2)"}}>
      <div style={{fontSize:13,fontWeight:700,color:"var(--text-secondary)",marginBottom:6,display:"flex",alignItems:"center",gap:6}}>
        🔔 Stay in the loop
      </div>
      <p style={{fontSize:13,color:"var(--text-muted)",marginBottom:12,lineHeight:1.6}}>
        Get notified when pairings are set, scoring starts, and the final results are in.
        {state==="denied"&&<span style={{color:"var(--red-500)",display:"block",marginTop:4}}>Notifications are blocked. Enable them in your browser or device settings.</span>}
      </p>
      {state==="granted"?(
        <div style={{display:"flex",alignItems:"center",gap:8,fontSize:13,color:"var(--green-700)",fontWeight:600}}>
          <span>✓</span> Notifications enabled
        </div>
      ):(
        <button
          className="btn btn-outline"
          style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}
          onClick={subscribe}
          disabled={state==="requesting"||state==="denied"}
        >
          {state==="requesting"
            ?<><span style={{width:14,height:14,border:"2px solid var(--border)",borderTopColor:"var(--green-700)",borderRadius:"50%",display:"inline-block",animation:"spin 0.8s linear infinite"}}/>Enabling…</>
            :"🔔 Enable Notifications"}
        </button>
      )}
      {msg&&<p style={{fontSize:12,color:"var(--text-muted)",marginTop:8,lineHeight:1.5}}>{msg}</p>}
      {state==="idle"&&<div style={{marginTop:10,padding:"10px 12px",background:"var(--surface)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)"}}>
        <div style={{fontSize:12,fontWeight:700,color:"var(--text-secondary)",marginBottom:4}}>📱 iPhone / iOS users</div>
        <p style={{fontSize:12,color:"var(--text-muted)",lineHeight:1.6,margin:0}}>
          Push notifications on iOS require the app to be added to your Home Screen first. Tap the <strong>Share</strong> button in Safari, then choose <strong>Add to Home Screen</strong>. Once installed, open Saturday School from your Home Screen and enable notifications here.
        </p>
      </div>}
    </div>
  );
}

export function SettingsTab({golfers=[],memberGolferId=null,onChangeMember,events=[],leaderboard=[],holeScores=[],signups=[],onNavigateSeason,onNavigateTop15,onNavigateLastRound,onNavigateRsvp,onNavigateGroup,onNavigateH2H,onNavigateAnalytics}:any){
  const [changelogOpen,setChangelogOpen]=useState(false);
  const memberGolfer=memberGolferId!=null?golfers.find((g:any)=>g.golfer_id===memberGolferId):null;
  // Default to Profile when an identity is set — that's the personal landing spot
  const [subTab,setSubTab]=useState(memberGolfer?"profile":"settings");
  const memberList=golfers.filter((g:any)=>!g.is_guest&&(g.status==null||g.status==="Active"))
    .sort((a:any,b:any)=>(a.first_name||"").localeCompare(b.first_name||"")||(a.last_name||"").localeCompare(b.last_name||""));
  const completedSeasons=events.filter((e:any)=>e.status==="Completed").map((e:any)=>e.season);
  const season=completedSeasons.length?Math.max(...completedSeasons):new Date().getFullYear();
  const profileHeader=subTab==="profile"&&memberGolfer;
  const versions=[
    {
      version:"v5.0.0 The Keymaker",
      date:"July 8, 2026",
      sections:[
        {type:"NEW",items:["Your Profile — pick your name to personalize the app: time-of-day greeting in the header, gold highlights on your rows across leaderboards, RSVP, and analytics","Season snapshot on your profile — season average, Top 15 standing with week-over-week rank change, last round, and next-event RSVP status","Offline mode — the app now works without a signal: reads are cached, and your score edits queue up and sync automatically when you're back online","Pending-sync pill showing queued changes and offline state","Side-game lens in Score Entry — swap the score sheet to Nines (3-ball 5/3/1) or Sixes (2v2 best-ball skins)","Saturday Handicap — WHS-style handicap engine with a course handicap trend chart","By-golfer course handicap trend on analytics"]},
        {type:"IMPROVED",items:["Win % now shows true probability (sums to 100%) — the house vig only applies to payout odds","Analytics dropdowns refreshed with a frosted-glass picker","Deep links throughout — profile cards jump you straight to your standings, last round, and next event","Persistent admin login — unlock survives a force-quit until you log out","Pairing engine group sizing and late-add tee-time handling","Reduced-motion support and smoother weather wind animation"]},
        {type:"FIXED",items:["Odds bugs — guest player odds, front-end display, and stale/duplicate calculations","Payout and skins de-duplication edge cases","RSVP crash and event-detail load bugs","Plus-handicap (better-than-scratch) scoring","Tzedakah / charity card edits now save","Weather timing and data-refresh race conditions","Deleting an event now also clears its leaderboard rows"]}
      ]
    },
    {
      version:"v4.0.0 Seraph",
      date:"July 1, 2026",
      sections:[
        {type:"NEW",items:["Full analytics overhaul — by-golfer deep stats UI","Win probability chart","Hole streaks chart","Scoring fingerprint radar re-added","Weekly AI recap — Gemini-powered round summary","Weekly AI insights on by-golfer view","Tzedakah / charity card","4th of July easter egg"]},
        {type:"IMPROVED",items:["Analytics visual refresh — typography, shadows, animations","Points gained analytics view","Pairings and analytics layout upgrades"]},
        {type:"FIXED",items:["Visibility bugs","General formatting and bug fixes"]}
      ]
    },
    {
      version:"v3.5.0 The Architect",
      date:"June 28, 2026",
      sections:[
        {type:"NEW",items:["Weekly event detail page with spring animations","Skins won tracker on leaderboard","Upcoming event odds — matchups, groups & field view","Pairings history on analytics tab","Player drawers with expanded stats","Weather ambience system (WeatherAmbience component)","Weather-ready state on RSVP tab sign-up row"]},
        {type:"IMPROVED",items:["Score entry upgrade — streamlined input flow","Leaderboard post-round formatting","Field strength meter refinements","Pairing history tooltip","Scroll behavior fixes across tabs","Loading and linking QOL throughout app"]},
        {type:"FIXED",items:["Odds display bugs","Weather ambience timing and skeleton","RSVP weather row layout"]}
      ]
    },
    {
      version:"v3.0.0 The Oracle",
      date:"June 19, 2026",
      sections:[
        {type:"NEW",items:["Upcoming event leaderboard — live preview before round","Player drawer detail on upcoming tab","Weekly feed on leaderboard tab","Event alert banner","Pull-to-refresh gesture","Field strength bar — handicap distribution visual","Nav tab reorder and spring animation polish"]},
        {type:"IMPROVED",items:["Splash screen animation speed and full-screen image","Weather modal hourly formatting","Subtab scroll freeze fix","Header and nav padding refinements","Analytics tracking enhancements","Sign-up field sorting and early tee-time button behavior","Pairings parity and group-balance improvements"]},
        {type:"FIXED",items:["Upcoming leaderboard formatting edge cases","Odds calculation bugs","Nav indicator alignment (multiple passes)","Subtab CSS freezing on scroll"]}
      ]
    },
    {
      version:"v2.5.0 Smith",
      date:"June 14, 2026",
      sections:[
        {type:"NEW",items:["Early sign up","Drag to refresh","Navigation animations","Course Overview Stats","Upcoming Event Tab","H2H Score Groups"]},
        {type:"IMPROVED",items:["H2H Score entry","General quality updates"]},
        {type:"FIXED",items:["H2H Score entry behavior","Live leaderboard","App crashes"]}
      ]
    },
    {
      version:"v2.0.1 Neo",
      date:"June 7, 2026",
      sections:[
        {type:"NEW",items:["Machine Learning Field Odds system","Admin Course Lookup API","Push notifications infrastructure","Settings tab — notification management","Admin → Message tab — Custom push and email blast tool","Weather Modal — Hourly weather view on Live Leaderboard","Group/tee-time picker in score entry","Guest player deduplication"]},
        {type:"IMPROVED",items:["TONY.AI H2H odds, Guest player ML odds, Weather Modal UI, Live skins calculation","Analytics"]},
        {type:"FIXED",items:["Score correction bugs, Live skins"]}
      ]
    },
    {
      version:"v1.5.3 Trinity",
      date:"June 1, 2026",
      sections:[
        {type:"NEW",items:["Live leaderboard, Custom splash screen, PWA favicon & home screen icon, Expanded Analytics dashboards, Admin: Clear Pairings","H2H odds","TONY.AI picks engine — Gemini-powered pre-round winner pick and H2H matchup pick"]},
        {type:"IMPROVED",items:["Email (mailto) functions, Sign Up tab, Leaderboard tie position display"]},
        {type:"FIXED",items:["Leaderboard bug, 2023 Season data, Weekly $$$ column, missing skins calculation"]}
      ]
    },
    {
      version:"v1.0.1-beta Morpheus",
      date:"May 25, 2026",
      sections:[
        {type:"NEW",items:["Initial app build","Design System — mobile first & color palette","Leaderboards — Season Avg, Top 15 Avg, and Weekly","Score Entry, Analytics, Sign Up, Admin functionality","Database backend integration","Historical Data import 2021–2026","App icon design"]}
      ]
    }
  ];
  const typeColor:any={NEW:"var(--green-700)",IMPROVED:"#1a6fa8",FIXED:"#b94040"};
  const typeBg:any={NEW:"var(--green-50)",IMPROVED:"#eaf4fb",FIXED:"#fdf0f0"};
  return(
    <div className="tab-content">
      <div className="section-title" style={{marginBottom:4}}>{profileHeader?`Welcome, ${memberGolfer.first_name}`:"Settings"}</div>
      <p style={{fontSize:14,color:"var(--text-muted)",marginBottom:14}}>{profileHeader?`Your ${season} season at a glance`:"Manage your app preferences."}</p>

      <ToggleGroup
        options={[{value:"profile",label:"Profile"},{value:"settings",label:"Settings"}]}
        value={subTab}
        onChange={setSubTab}
      />

      {subTab==="profile"&&(
        memberGolfer?(
          <ProfileView
            golfer={memberGolfer}
            golfers={golfers}
            events={events}
            leaderboard={leaderboard}
            holeScores={holeScores}
            signups={signups}
            onNavigateSeason={onNavigateSeason}
            onNavigateTop15={onNavigateTop15}
            onNavigateLastRound={onNavigateLastRound}
            onNavigateRsvp={onNavigateRsvp}
            onNavigateGroup={onNavigateGroup}
            onNavigateH2H={onNavigateH2H}
            onNavigateAnalytics={onNavigateAnalytics}
          />
        ):(
          <div className="card" style={{padding:24,textAlign:"center",position:"relative",boxShadow:BEZEL_OUTER_SHADOW}}>
            <div style={bezelRimOverlay("var(--radius-lg)","light")}/>
            <div style={{fontSize:15,fontWeight:700,marginBottom:6}}>No profile selected</div>
            <p style={{fontSize:13,color:"var(--text-muted)",marginBottom:14,lineHeight:1.6}}>Pick your name to see your standings, last round, and next event at a glance.</p>
            <select
              value=""
              onChange={e=>onChangeMember&&onChangeMember(e.target.value?parseInt(e.target.value,10):null)}
              style={{width:"100%",padding:"12px 14px",fontSize:15,fontWeight:600,borderRadius:"var(--radius-md)",border:"1px solid var(--border)",background:"var(--surface2)",color:"var(--text-primary)",appearance:"none",WebkitAppearance:"none"}}
            >
              <option value="">Choose your name…</option>
              {memberList.map((g:any)=>(
                <option key={g.golfer_id} value={g.golfer_id}>{g.first_name} {g.last_name}</option>
              ))}
            </select>
          </div>
        )
      )}

      {subTab==="settings"&&(<>
      <div className="card" style={{padding:20,marginBottom:16,position:"relative",boxShadow:BEZEL_OUTER_SHADOW}}>
        <div style={bezelRimOverlay("var(--radius-lg)","light")}/>
        <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>Your Profile</div>
        <p style={{fontSize:13,color:"var(--text-muted)",marginBottom:12,lineHeight:1.6}}>
          Pick your name to get a personal greeting and have your rows highlighted on leaderboards and sign-up lists.
        </p>
        <select
          value={memberGolferId??""}
          onChange={e=>onChangeMember&&onChangeMember(e.target.value?parseInt(e.target.value,10):null)}
          style={{width:"100%",padding:"12px 14px",fontSize:15,fontWeight:600,borderRadius:"var(--radius-md)",border:"1px solid var(--border)",background:"var(--surface2)",color:"var(--text-primary)",appearance:"none",WebkitAppearance:"none"}}
        >
          <option value="">Not set — just browsing</option>
          {memberList.map((g:any)=>(
            <option key={g.golfer_id} value={g.golfer_id}>{g.first_name} {g.last_name}</option>
          ))}
        </select>
        {memberGolferId!=null&&(
          <div style={{display:"flex",alignItems:"center",gap:6,fontSize:13,color:"var(--green-700)",fontWeight:600,marginTop:10}}>
            <span>✓</span> Your rows are highlighted across the app
          </div>
        )}
      </div>
      <div className="card" style={{padding:20,marginBottom:16,position:"relative",boxShadow:BEZEL_OUTER_SHADOW}}>
        <div style={bezelRimOverlay("var(--radius-lg)","light")}/>
        <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>Push Notifications</div>
        <p style={{fontSize:13,color:"var(--text-muted)",marginBottom:16,lineHeight:1.6}}>
          Enable notifications to get alerts when pairings are set, scoring starts, and results are in.
        </p>
        <PushNotificationButton/>
      </div>
      <div style={{borderRadius:"var(--radius-lg)",boxShadow:BEZEL_OUTER_SHADOW}}>
      <div className="card" style={{padding:0,overflow:"hidden",position:"relative",boxShadow:"none",marginBottom:0}}>
        <div style={bezelRimOverlay("var(--radius-lg)","light")}/>
        <button
          onClick={()=>setChangelogOpen(o=>!o)}
          style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 20px",background:"none",border:"none",cursor:"pointer",textAlign:"left"}}
        >
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:18}}>📋</span>
            <div>
              <div style={{fontSize:15,fontWeight:700,color:"var(--text-primary)"}}>Version History</div>
              <div style={{fontSize:12,color:"var(--text-muted)",marginTop:1}}>v5.0.0 · July 8, 2026</div>
            </div>
          </div>
          <span style={{fontSize:18,color:"var(--text-muted)",transition:"transform 0.2s",display:"inline-block",transform:changelogOpen?"rotate(180deg)":"rotate(0deg)"}}>▾</span>
        </button>
        {changelogOpen&&(
          <div style={{borderTop:"1px solid var(--border-color)",padding:"16px 20px",display:"flex",flexDirection:"column",gap:20}}>
            {versions.map((v,vi)=>(
              <div key={vi}>
                <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:10}}>
                  <span style={{fontSize:14,fontWeight:700,color:"var(--green-800)",fontFamily:"monospace"}}>{v.version}</span>
                  <span style={{fontSize:12,color:"var(--text-muted)"}}>{v.date}</span>
                </div>
                {v.sections.map((sec,si)=>(
                  <div key={si} style={{marginBottom:8}}>
                    <div style={{fontSize:12,textAlign:"left",fontWeight:700,letterSpacing:"0.08em",padding:"2px 8px",borderRadius:4,marginBottom:6,background:typeBg[sec.type],color:typeColor[sec.type]}}>{sec.type}</div>
                    <ul style={{margin:0,textAlign:"left",padding:"0 0 0 25px",display:"flex",flexDirection:"column",gap:4}}>
                      {sec.items.map((item,ii)=>(
                        <li key={ii} style={{fontSize:13,color:"var(--text-secondary)",lineHeight:1.5}}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ))}
                {vi<versions.length-1&&<div style={{borderBottom:"1px solid var(--border-color)",marginTop:12}}/>}
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
      </>)}
    </div>
  );
}
