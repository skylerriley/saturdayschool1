import { useState, useEffect } from "react";
import { ToggleGroup } from "../../components/common";
import { PairingPanel } from "../../components/common/PairingPanel";
import { golferName, formatDate } from "../../lib/formatters";
import { supabase, sendPush } from "../../lib/supabaseClient";
import { assignLateAdd } from "../../lib/golfMath";
import { useWeather } from "../../hooks/useWeather";
import { wmoToDesc, degToCompass } from "../../components/weather/weatherUtils";

export function RSVPTab({golfers,courses,events,setEvents,signups,setSignups,showSuccess,showError,adminMode,scrollToTop,dbUpsertGolfer,setGolfers,initialSubTab}:any){
  const upcomingEvents=[...events].filter((e:any)=>e.status!=="Completed").sort((a:any,b:any)=>new Date(a.date).getTime()-new Date(b.date).getTime());
  const [selEventId,setSelEventId]=useState<number>(upcomingEvents[0]?.event_id||0);
  const [subTab,setSubTab]=useState(()=>{
    if(initialSubTab&&["rsvp","pairings"].includes(initialSubTab)) return initialSubTab;
    return "rsvp";
  });
  const [guestName,setGuestName]=useState("");
  const [guestSponsor,setGuestSponsor]=useState("");
  const [guestHcp,setGuestHcp]=useState("18");
  const [guestSelectedId,setGuestSelectedId]=useState<number|null>(null); // null = create new; number = reuse existing

  const selEvent=events.find((e:any)=>e.event_id===selEventId);
  const eventSignups=signups.filter((s:any)=>s.event_id===selEventId);
  const {wx:forecastWx}=useWeather(selEvent?.course_name||"",selEvent?.date||"");
  const yesCount=eventSignups.filter((s:any)=>s.attending==="Yes").length;
  const noCount=eventSignups.filter((s:any)=>s.attending==="No").length;
  const unconfCount=eventSignups.filter((s:any)=>s.attending==="Unconfirmed").length;

  // 2b) Toggle: clicking the already-active button resets to Unconfirmed
  const updateAttending=(signup_id:number,val:string,gid:number,current:string)=>{
    const next=current===val?"Unconfirmed":val;
    const now=new Date().toISOString();
    setSignups((p:any)=>p.map((s:any)=>{
      if(s.signup_id!==signup_id)return s;
      const updated={...s,attending:next,rsvp_updated_at:now};
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
            supabase.from("event_signups").update({attending:next,assigned_tee_time:tee,in_waiting_room:false,rsvp_updated_at:now},{signup_id:s.signup_id}).catch(()=>{});
        }else{
          updated.in_waiting_room=true;
          if(canWrite)
            supabase.from("event_signups").update({attending:next,in_waiting_room:true,rsvp_updated_at:now},{signup_id:s.signup_id}).catch(()=>{});
        }
      } else {
        if(canWrite)
          supabase.from("event_signups").update({attending:next,rsvp_updated_at:now},{signup_id:s.signup_id}).catch(()=>{});
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
        supabase.from("event_signups").update({early_tee_request:next},{signup_id:s.signup_id}).catch(()=>{});
      return{...s,early_tee_request:next};
    }));
  };

  const addGuest=async()=>{
    if(!guestName.trim()||!guestSponsor)return;
    const [fn,...rest]=guestName.trim().split(" ");
    const ln=rest.join(" ")||"Guest";
    const hcp=parseFloat(guestHcp)||18;

    // Step 1: Either reuse an existing guest record or insert a new one
    let realGolferId:number|null=null;
    if(guestSelectedId!==null){
      // Reuse existing guest — update their handicap for this event if it changed
      realGolferId=guestSelectedId;
      const existing=golfers.find((g:any)=>g.golfer_id===guestSelectedId);
      if(existing&&existing.current_handicap_index!==hcp){
        supabase.from("golfers").update({current_handicap_index:hcp},{golfer_id:guestSelectedId}).catch(()=>{});
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
                supabase.from("event_signups").update({assigned_tee_time:newTee},{signup_id:toMove.signup_id}).catch(()=>{});
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
  };

  const buildReminderBody=()=>{
    if(!selEvent)return"";
    const sortByTime=(a:any,b:any)=>{
      if(!a.rsvp_updated_at&&!b.rsvp_updated_at)return 0;
      if(!a.rsvp_updated_at)return 1;
      if(!b.rsvp_updated_at)return -1;
      return new Date(a.rsvp_updated_at).getTime()-new Date(b.rsvp_updated_at).getTime();
    };
    const going=eventSignups.filter((s:any)=>s.attending==="Yes").sort(sortByTime).map((s:any)=>golferName(golfers,s.golfer_id));
    const out=eventSignups.filter((s:any)=>s.attending==="No").sort(sortByTime).map((s:any)=>golferName(golfers,s.golfer_id));
    const unconf=eventSignups.filter((s:any)=>s.attending==="Unconfirmed").map((s:any)=>golferName(golfers,s.golfer_id));
    return`Reminder to sign up for ${formatDate(selEvent.date)} @ ${selEvent.course_name}\nTee times: ${selEvent.tee_times.join(", ")}\n\n✅ Going (${going.length}):\n${going.map((n:string)=>`  * ${n}`).join("\n")}\n\n❓ No response yet (${unconf.length}):\n${unconf.map((n:string)=>`  * ${n}`).join("\n")}\n\n❌ Not attending (${out.length}):\n${out.map((n:string)=>`  * ${n}`).join("\n")}\n\nSign up in the app: https://saturdayschool.vercel.app/?tab=rsvp`;
  };

  const allEmails=golfers.filter((g:any)=>!g.is_guest&&g.email_address).map((g:any)=>g.email_address);
  const mailtoLink=`mailto:?cc=${allEmails.join(",")}&subject=Reminder ${selEvent.course_name} ${selEvent.tee_times.join(", ")}&body=${encodeURIComponent(buildReminderBody())}`;

  if(upcomingEvents.length===0)return<div className="empty-state"><div className="empty-text">No upcoming events</div></div>;
  return(
    <div>
      <div className="section-title">Sign Up</div>
      <div className="section-sub">RSVP for upcoming rounds</div>

      <div className="form-group">
        <label className="form-label">Select Event</label>
        <select className="form-select" value={selEventId} onChange={e=>setSelEventId(parseInt(e.target.value))}>
          {upcomingEvents.map((ev:any)=><option key={ev.event_id} value={ev.event_id}>{formatDate(ev.date)} -- {ev.course_name}</option>)}
        </select>
      </div>

      {/* Event summary card -- status, tee times, and inline weather row */}
      {selEvent&&(
        <div className="card" style={{padding:"12px 16px",marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
            <div style={{fontWeight:700,fontSize:17}}>{selEvent.course_name}</div>
            <div style={{display:"flex",gap:4,flexWrap:"wrap",justifyContent:"flex-end"}}>
              <span className="pill pill-green">✓ {yesCount}</span>
              {noCount>0&&<span className="pill pill-red">✗ {noCount}</span>}
              {unconfCount>0&&<span className="pill pill-gray">? {unconfCount}</span>}
            </div>
          </div>
          <div className="info-row"><span className="info-key">Status</span><span className="pill pill-gold">{selEvent.status}</span></div>
          <div className="info-row">
            <span className="info-key">Tee Times</span>
            <span className="info-val" style={{textAlign:"right"}}>
              {selEvent.tee_times.map((t:string,i:number)=>(
                <span key={i} style={{display:"inline-block",background:"var(--green-50)",border:"1px solid var(--green-100)",borderRadius:6,padding:"2px 8px",marginLeft:4,fontSize:14,fontWeight:600,color:"var(--green-700)"}}>{t}</span>
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
              return{name,early:!!s.early_tee_request};
            }).filter(Boolean) as {name:string,early:boolean}[];
            return(
              <div className="info-row" style={{alignItems:"flex-start"}}>
                <span className="info-key" style={{paddingTop:3}}>Field</span>
                <span className="info-val" style={{textAlign:"right",display:"flex",flexWrap:"wrap",gap:4,justifyContent:"flex-end"}}>
                  {displayNames.map((d,i:number)=>(
                    <span key={i} style={{display:"inline-flex",alignItems:"center",gap:5,background:"var(--green-50)",border:"1px solid var(--green-100)",borderRadius:14,padding:"3px 10px",fontSize:13,fontWeight:600,color:"var(--green-700)"}}>
                      {d.name}
                      {d.early&&<span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:16,height:16,borderRadius:"50%",background:"var(--gold-600)",color:"white",fontSize:8,fontWeight:800,lineHeight:1,flexShrink:0}}>E</span>}
                    </span>
                  ))}
                </span>
              </div>
            );
          })()}
          {(()=>{
            if(forecastWx){
              const d=wmoToDesc(forecastWx.code);
              return(
                <div className="info-row" style={{marginTop:2,paddingTop:8}}>
                  <span className="info-key">Forecast</span>
                  <span className="info-val" style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",justifyContent:"flex-end"}}>
                    <span style={{fontSize:18,lineHeight:1}}>{d.emoji}</span>
                    <span style={{fontWeight:600,fontSize:14,color:"var(--text-primary)"}}>{forecastWx.temp}°F</span>
                    <span style={{fontSize:13,color:"var(--text-secondary)"}}>{d.label}</span>
                    <span style={{fontSize:13,color:"var(--text-muted)"}}>{forecastWx.wind} mph {degToCompass(forecastWx.windDeg)}</span>
                  </span>
                </div>
              );
            }
            return(
              <div className="info-row" style={{marginTop:2,paddingTop:8}}>
                <span className="info-key">Forecast</span>
                <span className="info-val" style={{fontSize:14,color:"var(--text-muted)",fontStyle:"italic"}}>TBD</span>
              </div>
            );
          })()}
        </div>
      )}

      {/* #3b - two sub-tabs: RSVP | View Pairings */}
      <ToggleGroup
        options={[{value:"rsvp",label:"RSVP"},{value:"pairings",label:"View Pairings"}]}
        value={subTab}
        onChange={setSubTab}
      />

      {subTab==="rsvp"&&(
        <>
          <div className="card-title" style={{marginBottom:10}}>Member RSVPs</div>
          {[...eventSignups.filter((s:any)=>!s.is_guest_entry)].sort((a:any,b:any)=>{
            const ga=golfers.find((x:any)=>x.golfer_id===a.golfer_id);
            const gb=golfers.find((x:any)=>x.golfer_id===b.golfer_id);
            if(!ga||!gb)return 0;
            return (ga.first_name||"").localeCompare(gb.first_name||"");
          }).map((signup:any)=>{
            const g=golfers.find((x:any)=>x.golfer_id===signup.golfer_id);
            if(!g)return null;
            const myGuests=eventSignups.filter((s:any)=>s.is_guest_entry&&s.sponsor_golfer_id===g.golfer_id);
            return(
              <div key={signup.signup_id}>
                <div className="rsvp-row">
                  <div className="rsvp-name" style={{display:"flex",alignItems:"center",gap:6}}>{g.first_name} {g.last_name}
                    <button
                      onClick={()=>toggleEarlyTee(signup.signup_id)}
                      style={{padding:"3px 8px",fontSize:10,fontWeight:700,letterSpacing:"0.06em",borderRadius:4,border:`1.5px solid ${signup.early_tee_request?"var(--gold-600)":"var(--border-md)"}`,background:signup.early_tee_request?"var(--gold-100)":"transparent",color:signup.early_tee_request?"var(--gold-800)":"var(--text-muted)",cursor:"pointer",whiteSpace:"nowrap"}}
                    >{signup.early_tee_request?"EARLY✓":"E?"}</button>
                    {myGuests.length>0&&<span style={{fontSize:12,color:"var(--gold-700)"}}>+{myGuests.length} guest{myGuests.length>1?"s":""}</span>}
                  </div>
                  <div className="rsvp-actions" style={{display:"flex",alignItems:"center",gap:4}}>
                    <button className={`rsvp-btn yes${signup.attending==="Yes"?" active":""}`} onClick={()=>updateAttending(signup.signup_id,"Yes",g.golfer_id,signup.attending)}>In</button>
                    <button className={`rsvp-btn no${signup.attending==="No"?" active":""}`} onClick={()=>updateAttending(signup.signup_id,"No",g.golfer_id,signup.attending)}>Out</button>
                  </div>
                </div>
                {myGuests.map((gs:any)=>{
                  const gg=golfers.find((x:any)=>x.golfer_id===gs.golfer_id);
                  return(
                    <div key={gs.signup_id} className="rsvp-row" style={{paddingLeft:20,background:"var(--gold-50)"}}>
                      <div className="rsvp-name" style={{fontSize:15,color:"var(--gold-800)"}}>↳ {gg?`${gg.first_name} ${gg.last_name}`:"Guest"} <span style={{fontSize:11,fontWeight:600,background:"var(--gold-100)",borderRadius:4,padding:"1px 5px"}}>guest</span></div>
                      <div className="rsvp-actions">
                        <button className={`rsvp-btn yes${gs.attending==="Yes"?" active":""}`} onClick={()=>updateAttending(gs.signup_id,"Yes",gs.golfer_id,gs.attending)}>In</button>
                        <button className={`rsvp-btn no${gs.attending==="No"?" active":""}`} onClick={()=>updateAttending(gs.signup_id,"No",gs.golfer_id,gs.attending)}>Out</button>
                      </div>
                    </div>
                  );
                })}
              </div>
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
                          if(isActive){setGuestName("");setGuestSelectedId(null);}
                          else{setGuestName(label);setGuestSelectedId(g.golfer_id);}
                        }}
                        style={{padding:"7px 14px",borderRadius:"var(--radius-md)",border:`2px solid ${isActive?"var(--gold-500)":"var(--border)"}`,
                          background:isActive?"var(--gold-50)":"var(--surface)",color:isActive?"var(--gold-800)":"var(--text-primary)",
                          fontWeight:isActive?700:500,fontSize:14,cursor:"pointer",transition:"all .15s"}}>
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
                <input className="form-input" placeholder="First Last"
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
            <select className="form-select" value={guestSponsor} onChange={e=>setGuestSponsor(e.target.value)}>
              <option value="">Select member…</option>
              {golfers.filter((g:any)=>!g.is_guest&&g.status==="Active").map((g:any)=><option key={g.golfer_id} value={g.golfer_id}>{g.first_name} {g.last_name}</option>)}
            </select>
          </div>
          <div className="form-group"><label className="form-label">Guest Handicap Index</label><input className="form-input" type="number" step="0.1" min="0" max="54" value={guestHcp} onChange={e=>setGuestHcp(e.target.value)}/></div>

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
            const canSubmit=query&&guestSponsor&&!hasStrongUnpicked;
            return(
              <button className="btn btn-gold btn-full" disabled={!canSubmit} onClick={addGuest}>
                {guestSelectedId!==null?"+ Add Guest to Event (existing record)":"+ Add Guest to Event"}
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
      <a href={mailtoLink} className="btn btn-outline" style={{flex:1,textDecoration:"none",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
        ✉ Email
      </a>
      <button
        className="btn btn-outline"
        style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}
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
  );
}

// ============================================================
// SCORE ENTRY  (#4a up to 4 golfers at once, #5a skins warning)
// ============================================================
