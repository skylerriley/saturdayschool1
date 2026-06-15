import { useState, useEffect } from "react";
import { ToggleGroup } from "../../components/common";
import { golferName, formatDate } from "../../lib/formatters";
import { supabase, sendPush } from "../../lib/supabaseClient";
import { assignLateAdd, runPairingEngine } from "../../lib/golfMath";
import { useWeather } from "../../hooks/useWeather";
import { wmoToDesc, degToCompass } from "../../components/weather/weatherUtils";

export function RSVPTab({golfers,courses,events,setEvents,signups,setSignups,showSuccess,showError,adminMode,scrollToTop,dbUpsertGolfer,setGolfers,initialSubTab}:any){
  const upcomingEvents=[...events].filter((e:any)=>e.status!=="Completed").sort((a:any,b:any)=>new Date(a.date).getTime()-new Date(b.date).getTime());
  const [selEventId,setSelEventId]=useState<number>(upcomingEvents[0]?.event_id||0);
  const [subTab,setSubTab]=useState(()=>{
    if(initialSubTab&&["rsvp","pairings"].includes(initialSubTab)) return initialSubTab;
    return "rsvp";
  });
  const [pairingsConfirmed,setPairingsConfirmed]=useState(false);
  const [pairingsChanged,setPairingsChanged]=useState(false);
  const [moving,setMoving]=useState<{signup_id:number,gid:number,fromTee:string}|null>(null);
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

  // Pairing view
  const pairingsByTee = selEvent?.tee_times
    ?selEvent.tee_times.map((tt:string)=>({teeTime:tt,players:eventSignups.filter((s:any)=>s.assigned_tee_time===tt&&s.attending==="Yes"&&!s.in_waiting_room)}))
    :[];
  const hasPairings=pairingsByTee.some((g:any)=>g.players.length>0);
  const waitingRoom=eventSignups.filter((s:any)=>s.in_waiting_room&&s.attending==="Yes");
  useEffect(()=>{setPairingsConfirmed(false);setPairingsChanged(false);setMoving(null);},[selEventId]);

  if(upcomingEvents.length===0)return<div className="empty-state"><div className="empty-text">No upcoming events</div></div>;

  const movePlayer=(signup_id:number,toTee:string)=>{
    setSignups((p:any)=>p.map((s:any)=>s.signup_id===signup_id?{...s,assigned_tee_time:toTee}:s));
    if(signup_id<1e12)
      supabase.from("event_signups").update({assigned_tee_time:toTee},{signup_id}).catch(()=>{});
    setMoving(null);
  };

  // Swap all players between two tee times
  const swapGroups=(teeA:string,teeB:string)=>{
    if(!selEvent)return;
    setSignups((p:any)=>p.map((s:any)=>{
      if(s.event_id!==selEvent.event_id||s.attending!=="Yes"||s.in_waiting_room)return s;
      if(s.assigned_tee_time===teeA){
        if(s.signup_id<1e12)supabase.from("event_signups").update({assigned_tee_time:teeB},{signup_id:s.signup_id}).catch(()=>{});
        return{...s,assigned_tee_time:teeB};
      }
      if(s.assigned_tee_time===teeB){
        if(s.signup_id<1e12)supabase.from("event_signups").update({assigned_tee_time:teeA},{signup_id:s.signup_id}).catch(()=>{});
        return{...s,assigned_tee_time:teeA};
      }
      return s;
    }));
    setPairingsChanged(true);
  };

  const allPairingEmails=golfers.filter((g:any)=>!g.is_guest&&g.email_address).map((g:any)=>g.email_address);

  const buildPairingBody=()=>{
    if(!selEvent)return"";
    const nl="\n";
    let b="Pairings for "+formatDate(selEvent.date)+" @ "+selEvent.course_name+nl+nl;
    pairingsByTee.filter((g:any)=>g.players.length>0).forEach((grp:any,i:number)=>{
      b+="Group "+(i+1)+" - Tee: "+grp.teeTime+nl;
      grp.players.forEach((su:any)=>{
        const gl=golfers.find((x:any)=>x.golfer_id===su.golfer_id);
        b+="  * "+(gl?gl.first_name+" "+gl.last_name:"Guest")+(gl?.is_guest?" (Guest)":"")+nl;
      });
      b+=nl;
    });
    return b;
  };
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
                if(a.created_at&&b.created_at)return new Date(a.created_at).getTime()-new Date(b.created_at).getTime();
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
                    >EARLY</button>
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
        <>
          {/* Generate / Re-generate button */}
          {adminMode&&selEvent&&(
            <button
              className="btn btn-gold btn-full"
              style={{marginBottom:14,fontWeight:700}}
              onClick={()=>{
                const attending=eventSignups.filter((s:any)=>s.attending==="Yes");
                if(attending.length<2){alert("Need at least 2 players confirmed In to generate pairings.");return;}
                const attendees=attending.map((s:any)=>({golfer_id:s.golfer_id,sponsor_golfer_id:s.sponsor_golfer_id,early_tee_request:!!s.early_tee_request}));
                const newPairings=runPairingEngine(attendees,selEvent.tee_times||[]);
                const teeByGolfer:Record<number,string>={};
                newPairings.forEach((grp:any)=>grp.players.forEach((pid:number)=>{teeByGolfer[pid]=grp.teeTime;}));
                const updatedSignups=eventSignups.map((s:any)=>
                  teeByGolfer[s.golfer_id]!==undefined?{...s,assigned_tee_time:teeByGolfer[s.golfer_id]}:s
                );
                setSignups((su:any)=>su.map((s:any)=>{
                  const u=updatedSignups.find((x:any)=>x.signup_id===s.signup_id);
                  return u||s;
                }));
                updatedSignups.filter((s:any)=>teeByGolfer[s.golfer_id]).forEach((s:any)=>{
                  if(s.signup_id<1e12)
                    supabase.from("event_signups").update({assigned_tee_time:s.assigned_tee_time},{signup_id:s.signup_id}).catch(()=>{});
                });
                setEvents((ev:any)=>ev.map((e:any)=>e.event_id===selEvent.event_id?{...e,status:"Pairings Set"}:e));
                setMoving(null);setPairingsConfirmed(false);setPairingsChanged(true);
              }}
            >🎲 {hasPairings?"Re-generate Pairings":"Generate Pairings"}</button>
          )}

          {/* Move hint */}
          {adminMode&&hasPairings&&(
            <div style={{fontSize:13,color:"var(--text-muted)",marginBottom:8}}>
              {moving
                ?<span style={{color:"var(--gold-700)",fontWeight:600}}>
                    Moving {golferName(golfers,moving.gid).split(" ")[0]} -- tap a group to move them there
                    {" "}<button style={{background:"none",border:"none",color:"var(--red-600)",cursor:"pointer",fontSize:13,fontWeight:600}} onClick={()=>setMoving(null)}>Cancel</button>
                  </span>
                :"Tap a player name to move them to another group"}
            </div>
          )}

          {/* Pairing groups */}
          {!hasPairings
            ?<div className="empty-state"><div className="empty-text">Pairings not yet set</div><div className="empty-sub">{adminMode?"Tap Generate Pairings above":"Check back after the admin sets pairings"}</div></div>
            :(()=>{
              const activeGroups=pairingsByTee.filter((g:any)=>g.players.length>0);
              return activeGroups.map((group:any,gi:number)=>{
              const isDropTarget=adminMode&&moving&&moving.fromTee!==group.teeTime;
              return(
                <div
                  key={gi}
                  className="pairing-card"
                  style={isDropTarget?{borderColor:"var(--green-400)",cursor:"pointer"}:{}}
                  onClick={()=>{if(isDropTarget&&moving)movePlayer(moving.signup_id,group.teeTime);}}
                >
                  <div className="pairing-header" style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <div>
                      <span className="pairing-time">⏱ {group.teeTime} </span>
                      <span className="pairing-group">
                        Group {gi+1} · {group.players.length} players
                        {isDropTarget?" -- tap to move here":""}
                      </span>
                    </div>
                    {adminMode&&activeGroups.length>1&&!moving&&(
                      <div style={{display:"flex",gap:4}}>
                        {gi>0&&<button onClick={(e:any)=>{e.stopPropagation();swapGroups(group.teeTime,activeGroups[gi-1].teeTime);}} style={{background:"var(--green-700)",color:"white",border:"none",borderRadius:4,padding:"2px 8px",fontSize:11,cursor:"pointer",fontWeight:700}}>▲</button>}
                        {gi<activeGroups.length-1&&<button onClick={(e:any)=>{e.stopPropagation();swapGroups(group.teeTime,activeGroups[gi+1].teeTime);}} style={{background:"var(--green-700)",color:"white",border:"none",borderRadius:4,padding:"2px 8px",fontSize:11,cursor:"pointer",fontWeight:700}}>▼</button>}
                      </div>
                    )}
                  </div>
                  <div className="pairing-body">
                    {group.players.map((su:any)=>{
                      const g=golfers.find((x:any)=>x.golfer_id===su.golfer_id);
                      const isMoving=moving?.signup_id===su.signup_id;
                      return(
                        <div
                          key={su.signup_id}
                          className="pairing-player"
                          style={{background:isMoving?"var(--gold-50)":undefined,cursor:adminMode?"pointer":"default"}}
                          onClick={(e:any)=>{
                            e.stopPropagation();
                            if(!adminMode)return;
                            if(moving&&moving.signup_id===su.signup_id){setMoving(null);return;}
                            if(!moving)setMoving({signup_id:su.signup_id,gid:su.golfer_id,fromTee:group.teeTime});
                          }}
                        >
                          <div>
                            <span style={{fontWeight:500,color:isMoving?"var(--gold-700)":undefined}}>
                              {g?`${g.first_name} ${g.last_name}`:"Guest"}{isMoving?" ✋":""}
                            </span>
                            {su.early_tee_request&&<span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:16,height:16,borderRadius:"50%",background:"var(--gold-600)",color:"white",fontSize:8,fontWeight:800,lineHeight:1,marginLeft:5,flexShrink:0}}>E</span>}
                            {su.is_guest_entry&&<span style={{fontSize:11,fontWeight:600,background:"var(--gold-100)",borderRadius:4,padding:"1px 5px",marginLeft:6,color:"var(--gold-800)"}}>guest</span>}
                          </div>
                          <span className="pairing-hcp" style={{color:"var(--text-muted)",fontSize:13}}>HCP {g?.current_handicap_index?.toFixed(1)??""}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            });
            })()
          }

          {/* Waiting room — players confirmed Yes but no tee time available */}
          {waitingRoom.length>0&&(
            <div style={{marginTop:14,border:"2px dashed var(--gold-300)",borderRadius:"var(--radius-md)",padding:"12px 14px",background:"var(--gold-50)"}}>
              <div style={{fontSize:13,fontWeight:700,color:"var(--gold-700)",marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
                🕐 Waiting Room <span style={{fontSize:11,fontWeight:500,color:"var(--gold-600)"}}>({waitingRoom.length} player{waitingRoom.length!==1?"s":""} · waiting for a spot to open)</span>
              </div>
              {waitingRoom.map((su:any)=>{
                const g=golfers.find((x:any)=>x.golfer_id===su.golfer_id);
                return(
                  <div key={su.signup_id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid var(--gold-100)"}}>
                    <span style={{fontWeight:500,fontSize:14}}>{g?`${g.first_name} ${g.last_name}`:"Guest"}
                      {su.is_guest_entry&&<span style={{fontSize:11,fontWeight:600,background:"var(--gold-100)",borderRadius:4,padding:"1px 5px",marginLeft:6,color:"var(--gold-800)"}}>guest</span>}
                    </span>
                    {adminMode&&(
                      <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"flex-end"}}>
                        {pairingsByTee.filter((g:any)=>g.players.length<4).map((grp:any)=>(
                          <button key={grp.teeTime}
                            style={{fontSize:11,padding:"3px 8px",background:"var(--green-50)",border:"1px solid var(--green-300)",borderRadius:6,cursor:"pointer",color:"var(--green-700)",fontWeight:600}}
                            onClick={()=>{
                              setSignups((p:any)=>p.map((s:any)=>s.signup_id===su.signup_id?{...s,assigned_tee_time:grp.teeTime,in_waiting_room:false}:s));
                              if(su.signup_id<1e12)supabase.from("event_signups").update({assigned_tee_time:grp.teeTime,in_waiting_room:false},{signup_id:su.signup_id}).catch(()=>{});
                            }}
                          >→ {grp.teeTime}</button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              <div style={{fontSize:11,color:"var(--gold-600)",marginTop:8,fontStyle:"italic"}}>
                If a player drops out, use their tee time slot to move a waiting room player in.
              </div>
            </div>
          )}

          {/* Confirm + Email + Push Notification */}
          {adminMode && hasPairings && (
  <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:12}}>
    <button
      className="btn btn-primary"
      style={{opacity:(pairingsConfirmed&&!pairingsChanged)?0.45:1,cursor:(pairingsConfirmed&&!pairingsChanged)?"default":"pointer"}}
      disabled={pairingsConfirmed&&!pairingsChanged}
      onClick={() => {
        setEvents((p:any) => p.map((e:any) => e.event_id===selEvent?.event_id ? {...e, status:"Pairings Set"} : e));
        setPairingsConfirmed(true);
        setPairingsChanged(false);
        showSuccess("Pairings confirmed");
        scrollToTop();
      }}
    >
      {pairingsConfirmed&&!pairingsChanged ? "✓ Pairings Saved" : pairingsConfirmed ? "↻ Update Pairings" : "Confirm Pairings"}
    </button>

    <div style={{display:"flex",gap:8}}>
      <a
        href={"mailto:?cc="+allPairingEmails.join(",")+"&subject="+encodeURIComponent("Pairings - "+selEvent.course_name)+"&body="+encodeURIComponent(buildPairingBody())+"%0D%0A View pairings in the app: https://saturdayschool.vercel.app/?tab=rsvp%26subtab=pairings"}
        className="btn btn-outline"
        style={{flex:1,textDecoration:"none"}}
      >✉ Email Pairings</a>

      <button
        className="btn btn-outline"
        style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}
        onClick={async () => {
          try {
            await sendPush(
              "Pairings are set",
              `Check the pairings for the upcoming round @ ${selEvent?.course_name} on ${formatDate(selEvent?.date)}`,
              "/?tab=rsvp&subtab=pairings"
            );
            showSuccess("Pairings notification sent!");
            scrollToTop();
          } catch {
            showError("Failed to send push notification");
          }
        }}
      >🔔 Notify</button>
    </div>
  </div>
)}
        </>
      )}
      {/* ── Push notification opt-in moved to Settings tab ── */}
    </div>
  );
}

// ============================================================
// SCORE ENTRY  (#4a up to 4 golfers at once, #5a skins warning)
// ============================================================
