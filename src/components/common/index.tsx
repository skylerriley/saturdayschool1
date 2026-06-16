import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import { scrollMainTop, formatDate } from "../../lib/formatters";

// ============================================================
// SCORE SYMBOL
// ============================================================
export function ScoreSymbol({gross,par}:{gross:number,par:number}){
  const diff=gross-par;
  let cls="sc-par";
  if(diff<=-2)cls="sc-eagle";
  else if(diff===-1)cls="sc-birdie";
  else if(diff===1)cls="sc-bogey";
  else if(diff===2)cls="sc-dbl";
  else if(diff>=3)cls="sc-triple";
  return <span className={`sc-score ${cls}`}>{gross}</span>;
}

// ============================================================
// SUB TAB PANEL
// ============================================================
export function SubTabPanel({tabs,value,onChange,renderTab,children}:{tabs:{id:string,label?:React.ReactNode}[];value:string;onChange?:(id:string)=>void;renderTab?:(id:string)=>React.ReactNode;children:React.ReactNode}){
  const prevRef=useRef(value);
  const [entranceDir,setEntranceDir]=useState<string|undefined>(undefined);
  const entranceSeqRef=useRef(0);
  const viaSwipeRef=useRef(false);
  const [bounce,setBounce]=useState<"left"|"right"|null>(null);
  const containerRef=useRef<HTMLDivElement>(null);
  const touchRef=useRef<{x:number,y:number,skip:boolean,width:number,locked:"h"|"v"|null}|null>(null);
  const [dragX,setDragX]=useState(0);
  const [adjId,setAdjId]=useState<string|null>(null);
  const [adjSide,setAdjSide]=useState<"left"|"right">("right");
  const [settling,setSettling]=useState(false);

  useLayoutEffect(()=>{
    const pi=tabs.findIndex(t=>t.id===prevRef.current);
    const ni=tabs.findIndex(t=>t.id===value);
    if(pi!==-1&&ni!==-1&&pi!==ni){
      if(viaSwipeRef.current){
        setEntranceDir(undefined);
      }else{
        const dir=ni>pi?"right":"left";
        entranceSeqRef.current++;
        setEntranceDir(`${dir}-${entranceSeqRef.current}`);
      }
    }
    viaSwipeRef.current=false;
    prevRef.current=value;
  },[value,tabs]);

  const onTouchStart=(e:React.TouchEvent)=>{
    if(!onChange){touchRef.current=null;return;}
    const pinching=e.touches.length>1;
    const zoomedIn=typeof window!=="undefined"&&!!window.visualViewport&&window.visualViewport.scale>1.01;
    if(pinching||zoomedIn){touchRef.current={x:0,y:0,skip:true,width:1,locked:null};return;}
    const t=e.touches[0];
    let el=e.target as HTMLElement|null;
    let skip=!!el?.closest("input,select,textarea");
    if(!skip){
      while(el&&el!==e.currentTarget){
        if(el.scrollWidth>el.clientWidth+2){skip=true;break;}
        el=el.parentElement;
      }
    }
    const width=containerRef.current?.getBoundingClientRect().width||1;
    touchRef.current={x:t.clientX,y:t.clientY,skip,width,locked:null};
  };

  const onTouchMove=(e:React.TouchEvent)=>{
    const start=touchRef.current;
    if(!start||start.skip)return;
    if(e.touches.length>1||(typeof window!=="undefined"&&!!window.visualViewport&&window.visualViewport.scale>1.01)){
      touchRef.current=null;
      setSettling(true);
      setDragX(0);
      setTimeout(()=>{setAdjId(null);setSettling(false);},220);
      return;
    }
    const t=e.touches[0];
    const dx=t.clientX-start.x;
    const dy=t.clientY-start.y;
    if(start.locked===null){
      if(Math.abs(dx)<8&&Math.abs(dy)<8)return;
      start.locked=Math.abs(dy)>Math.abs(dx)*1.2?"v":"h";
    }
    if(start.locked==="v")return;
    if(e.cancelable)e.preventDefault();
    const idx=tabs.findIndex(tb=>tb.id===value);
    const wantNext=dx<0;
    const adjIdx=wantNext?idx+1:idx-1;
    const hasAdj=adjIdx>=0&&adjIdx<tabs.length;
    const eff=hasAdj?dx:dx*0.35;
    const clamped=Math.max(-start.width,Math.min(start.width,eff));
    setSettling(false);
    setDragX(clamped);
    setAdjSide(wantNext?"right":"left");
    setAdjId(hasAdj?tabs[adjIdx].id:null);
  };

  const onTouchEnd=(e:React.TouchEvent)=>{
    const start=touchRef.current;touchRef.current=null;
    if(!start||start.skip)return;
    if(start.locked!=="h")return;
    const width=start.width;
    const threshold=Math.min(90,width*0.25);
    setSettling(true);
    if(Math.abs(dragX)>=threshold&&adjId){
      const target=dragX<0?-width:width;
      setDragX(target);
      const nextId=adjId;
      setTimeout(()=>{
        viaSwipeRef.current=true;
        onChange?.(nextId);
        setDragX(0);
        setAdjId(null);
        setSettling(false);
      },220);
    }else{
      const wasAtEdge=adjId===null&&Math.abs(dragX)>4;
      setDragX(0);
      if(wasAtEdge){
        setBounce(dragX<0?"left":"right");
        setTimeout(()=>setBounce(null),260);
      }
      setTimeout(()=>{setAdjId(null);setSettling(false);},220);
    }
  };

  const width=containerRef.current?.getBoundingClientRect().width||0;
  const isActive=dragX!==0||adjId!=null||settling;
  const currentStyle:React.CSSProperties|undefined=isActive?{
    transform:`translateX(${dragX}px)`,
    transition:settling?"transform 0.22s ease-out":"none",
  }:undefined;

  const adjTab=adjId?tabs.find(t=>t.id===adjId):null;
  const peekContent=adjId
    ?(renderTab?renderTab(adjId):(
      <div className="subtab-peek">
        <div className="subtab-peek-label">{adjTab?.label??adjId}</div>
        <div className="subtab-peek-skel">
          <div className="subtab-peek-bar" style={{width:"60%"}}/>
          <div className="subtab-peek-bar" style={{width:"85%"}}/>
          <div className="subtab-peek-bar" style={{width:"70%"}}/>
          <div className="subtab-peek-bar" style={{width:"40%"}}/>
        </div>
      </div>
    ))
    :null;

  const adjStyle:React.CSSProperties={
    position:"absolute",top:0,left:0,right:0,minHeight:"100%",
    transform:`translateX(${dragX+(adjSide==="right"?width:-width)}px)`,
    transition:settling?"transform 0.22s ease-out":"none",
    pointerEvents:"none",
  };

  return(
    <div
      ref={containerRef}
      className={`sub-pane${bounce?` sub-bounce-${bounce}`:""}`}
      data-dir={entranceDir}
      style={{position:"relative",overflowX:isActive?"hidden":"visible"}}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div style={currentStyle}>
        {children}
      </div>
      {peekContent&&<div style={adjStyle}>{peekContent}</div>}
    </div>
  );
}

// ============================================================
// COUNT UP
// ============================================================
export function CountUp({value,decimals=0,duration=600,prefix="",suffix=""}:{value:number,decimals?:number,duration?:number,prefix?:string,suffix?:string}){
  const [display,setDisplay]=useState(0);
  const ref=useRef<HTMLSpanElement>(null);
  const startedRef=useRef(false);

  useEffect(()=>{
    const el=ref.current;
    if(!el||typeof IntersectionObserver==="undefined"){setDisplay(value);return;}
    if(startedRef.current)return;
    const obs=new IntersectionObserver((entries)=>{
      for(const entry of entries){
        if(entry.isIntersecting&&!startedRef.current){
          startedRef.current=true;
          const start=performance.now();
          const tick=(now:number)=>{
            const t=Math.min(1,(now-start)/duration);
            const eased=1-Math.pow(1-t,3);
            setDisplay(value*eased);
            if(t<1)requestAnimationFrame(tick);
            else setDisplay(value);
          };
          requestAnimationFrame(tick);
          obs.disconnect();
        }
      }
    },{threshold:0.35});
    obs.observe(el);
    return()=>obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  useEffect(()=>{if(startedRef.current)setDisplay(value);},[value]);

  return <span ref={ref}>{prefix}{display.toFixed(decimals)}{suffix}</span>;
}

// ============================================================
// TOGGLE GROUP
// ============================================================
export function ToggleGroup(
{options,value,onChange,style}:{options:{value:string;label:React.ReactNode}[];value:string;onChange:(v:any)=>void;style?:React.CSSProperties}){
  const ref=useRef<HTMLDivElement>(null);
  const [pill,setPill]=useState({x:0,w:0});
  const [animate,setAnimate]=useState(false);

  const measure=useCallback(()=>{
    const el=ref.current;if(!el)return;
    const idx=options.findIndex(o=>o.value===value);
    const btn=el.querySelectorAll<HTMLElement>(".toggle-btn")[idx];
    if(btn)setPill({x:btn.offsetLeft,w:btn.offsetWidth});
  },[value,options]);

  useLayoutEffect(()=>{measure();},[measure]);

  useEffect(()=>{
    if(pill.w>0&&!animate){
      const id=requestAnimationFrame(()=>requestAnimationFrame(()=>setAnimate(true)));
      return()=>cancelAnimationFrame(id);
    }
  },[pill.w,animate]);

  useEffect(()=>{
    const onR=()=>measure();
    window.addEventListener("resize",onR);
    const t=setTimeout(measure,300);
    return()=>{window.removeEventListener("resize",onR);clearTimeout(t);};
  },[measure]);

  return(
    <div className="toggle-group has-pill" ref={ref} style={style}>
      <div className={`toggle-pill${animate?" animate":""}`} style={{width:pill.w,left:pill.x}}/>
      {options.map(o=>(
        <button key={o.value} type="button" className={`toggle-btn${value===o.value?" active":""}`} onClick={()=>onChange(o.value)}>
          <span className="tg-label">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

// ============================================================
// FINANCE VIEW
// ============================================================
export function FinanceView({golfers,leaderboard,events,charityDonations,setCharityDonations,showSuccess}:any){
  const allSeasonsList=[...new Set(events.map((e:any)=>e.season))].sort((a:any,b:any)=>b-a) as number[];
  const currentSeason=allSeasonsList[0]||new Date().getFullYear();
  const [donationSeason,setDonationSeason]=useState<number|"all">(currentSeason);
  const [selEventId,setSelEventId]=useState(events[0]?.event_id||null);
  const [newDonationAmt,setNewDonationAmt]=useState("");
  const [newDonationNote,setNewDonationNote]=useState("");
  const [newDonationDate,setNewDonationDate]=useState(new Date().toISOString().split("T")[0]);
  const [editDonationId,setEditDonationId]=useState<number|null>(null);
  const [editDonationAmt,setEditDonationAmt]=useState("");
  const [editDonationNote,setEditDonationNote]=useState("");
  const [editDonationDate,setEditDonationDate]=useState("");

  const entries=leaderboard.filter((e:any)=>e.event_id===selEventId);
  const paidIn=entries.filter((e:any)=>e.buy_in_paid).length;
  const skinsPaid=entries.filter((e:any)=>e.skins_paid).length;
  const charityFromRounds=leaderboard.filter((e:any)=>e.charity_paid).length*5;
  const extraDonations=charityDonations.reduce((s:number,d:any)=>s+Number(d.amount),0);
  const lifetimeCharity=charityFromRounds+extraDonations;

  const seasonEventIds=new Set(events.filter((e:any)=>donationSeason==="all"||e.season===donationSeason).map((e:any)=>e.event_id));
  const seasonCharityFromRounds=leaderboard.filter((e:any)=>e.charity_paid&&seasonEventIds.has(e.event_id)).length*5;
  const filteredDonations=donationSeason==="all"?charityDonations:charityDonations.filter((d:any)=>{
    const yr=d.date?parseInt(d.date.slice(0,4)):null;
    return yr===donationSeason;
  });
  const seasonExtraDonations=filteredDonations.reduce((s:number,d:any)=>s+Number(d.amount),0);
  const seasonCharity=seasonCharityFromRounds+seasonExtraDonations;

  const addDonation=()=>{
    if(!newDonationAmt)return;
    setCharityDonations((p:any)=>[...p,{id:Date.now(),amount:parseFloat(newDonationAmt),note:newDonationNote||"Donation",date:newDonationDate||new Date().toISOString().split("T")[0]}]);
    setNewDonationAmt(""); setNewDonationNote(""); setNewDonationDate(new Date().toISOString().split("T")[0]);
    showSuccess("Charity donation recorded");
    setTimeout(()=>scrollMainTop(),50);
  };
  const startEditDonation=(d:any)=>{setEditDonationId(d.id);setEditDonationAmt(String(d.amount));setEditDonationNote(d.note||"");setEditDonationDate(d.date||"");};
  const saveEditDonation=()=>{
    if(!editDonationAmt)return;
    setCharityDonations((p:any)=>p.map((d:any)=>d.id===editDonationId?{...d,amount:parseFloat(editDonationAmt),note:editDonationNote||"Donation",date:editDonationDate}:d));
    setEditDonationId(null);setEditDonationAmt("");setEditDonationNote("");setEditDonationDate("");
    showSuccess("Donation updated");
    setTimeout(()=>scrollMainTop(),50);
  };

  return(
    <div>
      <div className="charity-hero">
        <div className="charity-label">Lifetime Charity Pot</div>
        <div className="charity-amount">${lifetimeCharity.toLocaleString()}</div>
        <div className="charity-label" style={{marginTop:5}}>Rounds: ${charityFromRounds} · Donations: ${extraDonations.toFixed(0)}</div>
      </div>

      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
        <div className="card-title">Charity by Season</div>
        <select style={{fontSize:13,padding:"4px 8px",border:"1.5px solid var(--border-md)",borderRadius:"var(--radius-sm)",fontFamily:"var(--font-sans)"}} value={donationSeason} onChange={e=>setDonationSeason(e.target.value==="all"?"all":parseInt(e.target.value))}>
          <option value="all">All Seasons</option>
          {allSeasonsList.map(y=><option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <div className="card" style={{padding:"12px 16px",marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <span style={{fontSize:14,color:"var(--text-muted)"}}>{donationSeason==="all"?"All seasons":donationSeason+" season"} charity</span>
          <span style={{fontFamily:"var(--font-serif)",fontSize:28,color:"var(--green-700)"}}>${seasonCharity.toLocaleString()}</span>
        </div>
        <div className="info-row"><span className="info-key">From rounds ($5/player)</span><span className="info-val money">${seasonCharityFromRounds}</span></div>
        <div className="info-row"><span className="info-key">Extra donations</span><span className="info-val money">${seasonExtraDonations.toFixed(0)}</span></div>
      </div>

      <div className="card-title" style={{marginBottom:8}}>Donations ({donationSeason==="all"?"All":donationSeason})</div>
      {filteredDonations.length===0&&<div style={{fontSize:13,color:"var(--text-muted)",marginBottom:10}}>No donations recorded for this period.</div>}
      {filteredDonations.map((d:any)=>(
        <div key={d.id}>
          {editDonationId===d.id?(
            <div className="card" style={{padding:"12px 14px",marginBottom:8}}>
              <div style={{fontSize:13,fontWeight:700,color:"var(--green-800)",marginBottom:8}}>Edit Donation</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                <div className="form-group" style={{marginBottom:0}}><label className="form-label">Amount ($)</label><input className="form-input" type="number" value={editDonationAmt} onChange={e=>setEditDonationAmt(e.target.value)}/></div>
                <div className="form-group" style={{marginBottom:0}}><label className="form-label">Note</label><input className="form-input" value={editDonationNote} onChange={e=>setEditDonationNote(e.target.value)}/></div>
              </div>
              <div className="form-group" style={{marginBottom:8}}><label className="form-label">Date</label><input className="form-input" type="date" value={editDonationDate} onChange={e=>setEditDonationDate(e.target.value)}/></div>
              <div style={{display:"flex",gap:8}}>
                <button className="btn btn-primary" style={{flex:1}} onClick={saveEditDonation}>Save</button>
                <button className="btn btn-outline" onClick={()=>setEditDonationId(null)}>Cancel</button>
              </div>
            </div>
          ):(
            <div className="info-row">
              <span className="info-key">{d.note}</span>
              <span style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:12,color:"var(--text-muted)"}}>{d.date}</span>
                <span className="money">${Number(d.amount).toFixed(0)}</span>
                <button className="btn btn-sm btn-outline" onClick={()=>startEditDonation(d)}>Edit</button>
              </span>
            </div>
          )}
        </div>
      ))}
      <div className="card" style={{marginTop:10}}>
        <div className="card-title" style={{marginBottom:10}}>Add Donation</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
          <div className="form-group" style={{marginBottom:0}}><label className="form-label">Amount ($)</label><input className="form-input" type="number" min="0" placeholder="50" value={newDonationAmt} onChange={e=>setNewDonationAmt(e.target.value)}/></div>
          <div className="form-group" style={{marginBottom:0}}><label className="form-label">Note</label><input className="form-input" placeholder="e.g. Birthday" value={newDonationNote} onChange={e=>setNewDonationNote(e.target.value)}/></div>
        </div>
        <div className="form-group" style={{marginBottom:10}}><label className="form-label">Date</label><input className="form-input" type="date" value={newDonationDate} onChange={e=>setNewDonationDate(e.target.value)}/></div>
        <button className="btn btn-primary btn-full" onClick={addDonation} disabled={!newDonationAmt}>Record Donation</button>
      </div>

      <hr className="divider"/>
      <div className="form-group">
        <label className="form-label">Event Breakdown</label>
        <select className="form-select" value={selEventId||""} onChange={e=>setSelEventId(parseInt(e.target.value))}>
          {[...events].sort((a:any,b:any)=>new Date(b.date).getTime()-new Date(a.date).getTime()).map((ev:any)=><option key={ev.event_id} value={ev.event_id}>{formatDate(ev.date)} -- {ev.course_name}</option>)}
        </select>
      </div>
      <div className="stat-grid">
        <div className="stat-card"><div className="stat-value">${paidIn*20}</div><div className="stat-label">Stableford Pot</div></div>
        <div className="stat-card"><div className="stat-value">${skinsPaid*10}</div><div className="stat-label">Skins Pot</div></div>
        <div className="stat-card"><div className="stat-value">${entries.filter((e:any)=>e.charity_paid).length*5}</div><div className="stat-label">Charity This Event</div></div>
        <div className="stat-card"><div className="stat-value">${paidIn*20+skinsPaid*10+entries.filter((e:any)=>e.charity_paid).length*5}</div><div className="stat-label">Total Collected</div></div>
      </div>
    </div>
  );
}

// ============================================================
// SEASON SCRUBBER
// ============================================================
export function SeasonScrubber({value,setValue,max}:{
  value:number,setValue:(v:number)=>void,max:number
}){
  const prevRef=useRef(value);

  useEffect(()=>{
    if(value!==prevRef.current&&typeof navigator!=="undefined"&&"vibrate" in navigator){
      try{navigator.vibrate(6);}catch{}
    }
    prevRef.current=value;
  },[value]);

  if(max<2)return null;
  const pct=(value/max)*100;
  return(
    <div className="season-scrub">
      <div className="season-scrub-track">
        <div className="season-scrub-fill" style={{width:`${pct}%`}}/>
        <input
          className="season-scrub-slider"
          type="range"
          min={1}
          max={max}
          step={1}
          value={value}
          onChange={e=>setValue(parseInt(e.target.value))}
        />
      </div>
      <div className="season-scrub-badge">{value}/{max}</div>
    </div>
  );
}

// ============================================================
// FLICK CAROUSEL
// ============================================================
export function FlickCarousel({children,style,count}:{children:React.ReactNode;style?:React.CSSProperties;count?:number}){
  const wrapRef=useRef<HTMLDivElement>(null);
  const pillRef=useRef<HTMLDivElement>(null);
  const flingRaf=useRef<number|null>(null);
  const drag=useRef({active:false,startX:0,startScroll:0,lastX:0,lastT:0,vel:0,moved:false});
  const [dragging,setDragging]=useState(false);

  useEffect(()=>{
    const el=wrapRef.current;if(!el)return;
    const cards=Array.from(el.querySelectorAll<HTMLElement>(".hcard"));
    if(!cards.length)return;
    let raf:number|null=null;
    const update=()=>{
      raf=null;
      const rect=el.getBoundingClientRect();
      const center=rect.left+rect.width/2;
      cards.forEach(card=>{
        const r=card.getBoundingClientRect();
        const dist=(r.left+r.width/2-center)/rect.width;
        const c=Math.max(-1,Math.min(1,dist));
        const scale=1-Math.min(Math.abs(c)*0.06,0.05);
        card.style.transform=`scale(${scale})`;
        const img=card.querySelector<HTMLElement>(".hcard-img");
        if(img)img.style.transform=`translateX(${(-c*12).toFixed(1)}px) scale(1.10)`;
      });
      // Update indicator pill position directly (no re-render)
      if(pillRef.current&&el.scrollWidth>el.clientWidth){
        const pct=el.scrollLeft/(el.scrollWidth-el.clientWidth);
        const trackW=pillRef.current.parentElement!.clientWidth;
        const pillW=pillRef.current.offsetWidth;
        pillRef.current.style.transform=`translateX(${Math.round(pct*(trackW-pillW))}px)`;
      }
    };
    const onScrollEnd=()=>requestAnimationFrame(update);
    const onScroll=()=>{if(raf==null)raf=requestAnimationFrame(update);};
    el.addEventListener("scroll",onScroll,{passive:true});
    el.addEventListener("scrollend",onScrollEnd,{passive:true});
    update();
    return()=>{
      el.removeEventListener("scroll",onScroll);
      el.removeEventListener("scrollend",onScrollEnd);
      if(raf!=null)cancelAnimationFrame(raf);
    };
  },[children]);

  const stopFling=()=>{if(flingRaf.current!=null){cancelAnimationFrame(flingRaf.current);flingRaf.current=null;}};

  const snapToNearest=(el:HTMLElement)=>{
    const rect=el.getBoundingClientRect();
    const center=rect.left+rect.width/2;
    let best:HTMLElement|null=null,bestDist=Infinity;
    el.querySelectorAll<HTMLElement>(".hcard").forEach(card=>{
      const r=card.getBoundingClientRect();
      const d=Math.abs(r.left+r.width/2-center);
      if(d<bestDist){bestDist=d;best=card;}
    });
    if(best){
      const r=(best as HTMLElement).getBoundingClientRect();
      const target=el.scrollLeft+(r.left+r.width/2-center);
      el.scrollTo({left:Math.max(0,Math.min(target,el.scrollWidth-el.clientWidth)),behavior:"smooth"});
    }
  };

  const onPointerDown=(e:React.PointerEvent)=>{
    if(e.pointerType!=="mouse")return;
    const el=wrapRef.current;if(!el)return;
    stopFling();
    drag.current={active:true,startX:e.clientX,startScroll:el.scrollLeft,lastX:e.clientX,lastT:performance.now(),vel:0,moved:false};
  };
  const onPointerMove=(e:React.PointerEvent)=>{
    const d=drag.current;if(!d.active)return;
    const el=wrapRef.current;if(!el)return;
    const dx=e.clientX-d.startX;
    if(Math.abs(dx)>5&&!d.moved){
      d.moved=true;setDragging(true);
      try{el.setPointerCapture(e.pointerId);}catch{}
    }
    if(!d.moved)return;
    el.scrollLeft=d.startScroll-dx;
    const now=performance.now();
    const dt=now-d.lastT;
    if(dt>0){d.vel=0.8*d.vel+0.2*((e.clientX-d.lastX)/dt);d.lastX=e.clientX;d.lastT=now;}
  };
  const endDrag=(e:React.PointerEvent)=>{
    const d=drag.current;if(!d.active)return;
    d.active=false;setDragging(false);
    const el=wrapRef.current;if(!el)return;
    if(d.moved){try{el.releasePointerCapture(e.pointerId);}catch{}}
    if(!d.moved)return;
    let v=-d.vel*16;
    if(Math.abs(v)<2){snapToNearest(el);return;}
    v=Math.max(-90,Math.min(90,v));
    const step=()=>{
      el.scrollLeft+=v;v*=0.95;
      const atEdge=el.scrollLeft<=0||el.scrollLeft>=el.scrollWidth-el.clientWidth-1;
      if(Math.abs(v)>0.6&&!atEdge){flingRaf.current=requestAnimationFrame(step);}
      else{flingRaf.current=null;snapToNearest(el);}
    };
    flingRaf.current=requestAnimationFrame(step);
  };

  const onClickCapture=(e:React.MouseEvent)=>{
    if(drag.current.moved){e.preventDefault();e.stopPropagation();drag.current.moved=false;}
  };

  useEffect(()=>()=>stopFling(),[]);

  // Pill width as a fraction of the track: 1/count clamped to a readable range
  const pillPct=count&&count>1?Math.max(0.08,Math.min(0.5,1/count)):null;

  return(
    <div style={{position:"relative"}}>
      <div
        ref={wrapRef}
        className={`flick-carousel${dragging?" dragging":""}`}
        style={style}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
        onDragStart={(e)=>e.preventDefault()}
      >
        {children}
      </div>
      {pillPct!=null&&(
        <div style={{margin:"6px 16px 4px",height:4,borderRadius:2,background:"rgba(255,255,255,0.18)",position:"relative",overflow:"hidden"}}>
          <div
            ref={pillRef}
            style={{position:"absolute",top:0,left:0,height:"100%",width:`${pillPct*100}%`,borderRadius:2,background:"var(--gold-400,#c9a227)",willChange:"transform"}}
          />
        </div>
      )}
    </div>
  );
}