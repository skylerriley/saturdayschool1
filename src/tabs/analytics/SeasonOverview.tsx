import { useState as useStateOv, useRef, useEffect, useCallback } from "react";
import { Trophy, Banknote, Star } from "lucide-react";
import { CountUp } from "../../App";
import { formatDate } from "../../lib/formatters";
import { ChartCanvas } from "./ChartCanvas";
import {
  Chart as ChartJS,
  CategoryScale, LinearScale,
  PointElement, LineElement,
  LineController,
  Filler, Legend, Tooltip,
} from "chart.js";
ChartJS.register(CategoryScale,LinearScale,PointElement,LineElement,LineController,Filler,Legend,Tooltip);

// ── Heatmap color palette (restyled) ─────────────────────────
const HEAT_STOPS=[
  {d:-6,bg:"#e8917a",text:"#ffffff"},
  {d:-4,bg:"#f4b8a0",text:"#1c1410"},
  {d:-2,bg:"#f8d4c0",text:"#1c1410"},
  {d: 0,bg:"#ede8df",text:"#1c1410"},
  {d: 2,bg:"#c0dca8",text:"#1c1410"},
  {d: 4,bg:"#5aaa5a",text:"#ffffff"},
  {d: 6,bg:"#2d6a2d",text:"#ffffff"},
];

function hexToRgb(hex:string):{r:number;g:number;b:number}{
  const n=parseInt(hex.slice(1),16);
  return{r:(n>>16)&255,g:(n>>8)&255,b:n&255};
}

function interpColor(delta:number):{bg:string;text:string}{
  const stops=HEAT_STOPS;
  if(delta<=-6)return{bg:stops[0].bg,text:stops[0].text};
  if(delta>=6)return{bg:stops[stops.length-1].bg,text:stops[stops.length-1].text};
  let lo=stops[0],hi=stops[stops.length-1];
  for(let i=0;i<stops.length-1;i++){
    if(delta>=stops[i].d&&delta<=stops[i+1].d){lo=stops[i];hi=stops[i+1];break;}
  }
  const span=hi.d-lo.d;
  const t=span===0?0:(delta-lo.d)/span;
  const a=hexToRgb(lo.bg),b=hexToRgb(hi.bg);
  const r=Math.round(a.r+(b.r-a.r)*t);
  const g=Math.round(a.g+(b.g-a.g)*t);
  const bv=Math.round(a.b+(b.b-a.b)*t);
  const bg=`rgb(${r},${g},${bv})`;
  const text=lo.text==="#ffffff"&&hi.text==="#ffffff"?"#ffffff":"#1c1410";
  return{bg,text};
}

function FormHeatmap({seasonEvents,leaderboard,golfers,season}:any){
  const [deselected,setDeselected]=useStateOv<Set<number>>(()=>new Set());

  const togglePlayer=(gid:number)=>{
    setDeselected(prev=>{
      const next=new Set(prev);
      if(next.has(gid))next.delete(gid);else next.add(gid);
      return next;
    });
  };

  const sortedEvents=[...seasonEvents].sort((a:any,b:any)=>new Date(a.date).getTime()-new Date(b.date).getTime());

  type PlayerRow={golfer:any;avg:number;rounds:{[eid:number]:number}};
  const allRows:PlayerRow[]=[];
  const eligibleGolfers=golfers.filter((g:any)=>!g.is_guest);
  for(const g of eligibleGolfers){
    const myEntries=leaderboard.filter((r:any)=>r.golfer_id===g.golfer_id&&sortedEvents.some((e:any)=>e.event_id===r.event_id));
    if(myEntries.length<3)continue;
    const roundMap:{[eid:number]:number}={};
    for(const e of myEntries){roundMap[e.event_id]=e.total_stableford_points;}
    const total=myEntries.reduce((s:number,r:any)=>s+r.total_stableford_points,0);
    const avg=total/myEntries.length;
    allRows.push({golfer:g,avg,rounds:roundMap});
  }

  allRows.sort((a,b)=>b.avg-a.avg);
  const activeRows=allRows.filter(r=>!deselected.has(r.golfer.golfer_id));
  const mutedRows=allRows.filter(r=>deselected.has(r.golfer.golfer_id));
  const rows=[...activeRows,...mutedRows];

  if(rows.length===0||sortedEvents.length===0){
    return(
      <div style={{color:"var(--text-muted)",fontSize:13,textAlign:"center",padding:"20px 0"}}>
        Not enough data for heatmap (need players with 3+ rounds).
      </div>
    );
  }

  const numCols=sortedEvents.length;
  const cellSize=numCols>14?Math.max(28,Math.floor(520/numCols)):36;
  const gap=3;
  const nameColW=116;

  return(
    <div>
      <div style={{overflowX:"auto",overflowY:"visible",WebkitOverflowScrolling:undefined as any}}>
        <div style={{minWidth:nameColW+numCols*(cellSize+gap)+20,paddingBottom:8}}>

          {/* Header: round numbers */}
          <div style={{display:"flex",alignItems:"flex-end",marginBottom:gap,paddingLeft:nameColW+gap}}>
            {sortedEvents.map((ev:any,idx:number)=>(
              <div
                key={ev.event_id}
                style={{
                  width:cellSize,minWidth:cellSize,marginRight:gap,
                  fontSize:8,color:"var(--text-muted)",textAlign:"center",
                  height:20,display:"flex",alignItems:"flex-end",justifyContent:"center",
                  boxSizing:"border-box" as const,
                }}
              >
                {idx+1}
              </div>
            ))}
          </div>

          {/* Data rows */}
          {rows.map((row)=>{
            const isMuted=deselected.has(row.golfer.golfer_id);
            // First name + last initial (e.g. "Tyler R.")
            const displayName=`${row.golfer.first_name||""} ${(row.golfer.last_name||"").charAt(0).toUpperCase()}.`;
            return(
              <div
                key={row.golfer.golfer_id}
                style={{
                  display:"flex",alignItems:"center",marginBottom:gap,
                  opacity:isMuted?0.35:1,
                  transition:"opacity 0.25s ease",
                }}
              >
                {/* Clickable name — checkbox + first name last initial */}
                <div
                  onClick={()=>togglePlayer(row.golfer.golfer_id)}
                  title={isMuted?"Click to show":"Click to hide"}
                  style={{
                    width:nameColW,minWidth:nameColW,
                    fontSize:13,
                    color:isMuted?"var(--text-muted)":"var(--text-primary)",
                    whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",
                    paddingRight:6,
                    position:"sticky",left:0,zIndex:2,
                    background:"var(--bg)",
                    lineHeight:`${cellSize}px`,
                    fontWeight:isMuted?400:600,
                    cursor:"pointer",userSelect:"none",
                    display:"flex",alignItems:"center",gap:5,
                  }}
                >
                  <span style={{
                    display:"inline-flex",alignItems:"center",justifyContent:"center",
                    width:14,height:14,borderRadius:3,flexShrink:0,
                    background:isMuted?"transparent":"var(--green-700)",
                    border:`1.5px solid ${isMuted?"var(--border)":"var(--green-700)"}`,
                    transition:"all 0.2s",
                  }}>
                    {!isMuted&&<svg width="9" height="9" viewBox="0 0 9 9"><polyline points="1.5,4.5 3.5,6.5 7.5,2.5" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </span>
                  <span style={{overflow:"hidden",textOverflow:"ellipsis"}}>{displayName}</span>
                </div>
                {/* Cells */}
                {sortedEvents.map((ev:any)=>{
                  const pts=row.rounds[ev.event_id];
                  const played=pts!==undefined;
                  if(!played){
                    return(
                      <div
                        key={ev.event_id}
                        title="Did not play"
                        style={{
                          width:cellSize,height:cellSize,minWidth:cellSize,marginRight:gap,
                          borderRadius:4,background:"var(--surface)",border:"1px solid var(--border)",
                          flexShrink:0,
                          backgroundImage:"repeating-linear-gradient(45deg,var(--border) 0,var(--border) 1px,transparent 0,transparent 50%)",
                          backgroundSize:"6px 6px",
                        }}
                      />
                    );
                  }
                  const delta=pts-row.avg;
                  const {bg,text}=interpColor(isMuted?0:delta);
                  return(
                    <div
                      key={ev.event_id}
                      title={`${row.golfer.first_name} ${row.golfer.last_name}: ${pts} pts (${delta>=0?"+":""}${delta.toFixed(1)} vs avg ${row.avg.toFixed(1)})`}
                      style={{
                        width:cellSize,height:cellSize,minWidth:cellSize,marginRight:gap,
                        borderRadius:4,
                        background:isMuted?"var(--surface)":bg,
                        color:isMuted?"var(--text-muted)":text,
                        fontSize:cellSize>=32?13:11,
                        display:"flex",alignItems:"center",justifyContent:"center",
                        flexShrink:0,cursor:"default",fontWeight:600,lineHeight:1,
                        border:isMuted?"1px solid var(--border)":"none",
                        transition:"background 0.25s,color 0.25s",
                      }}
                    >
                      {cellSize>=26?pts.toString():""}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,marginTop:10}}>
        <span style={{fontSize:11,color:"var(--text-secondary)",whiteSpace:"nowrap"}}>Cold</span>
        <div style={{display:"flex",gap:2}}>
          {HEAT_STOPS.map((s,i)=>(
            <div key={i} style={{width:18,height:14,background:s.bg,borderRadius:2}}/>
          ))}
        </div>
        <span style={{fontSize:11,color:"var(--text-secondary)",whiteSpace:"nowrap"}}>Hot</span>
      </div>
      <div style={{textAlign:"center",fontSize:11,color:"var(--text-muted)",marginTop:3}}>
        Color relative to each player's personal {season} season average · tap name to hide/show
      </div>
    </div>
  );
}

// ── Stock-ticker style scrubbing chart ───────────────────────
function TrendScrubber({
  config,
  deps,
  height=120,
  points,
  lineColor,
  onScrub,
  avgSpanRef,   // ref to the <span> DOM node for the big number — we write directly to avoid re-renders
  baseAvg,      // value to show when not scrubbing (for the tween-back animation)
}:{
  config:object,
  deps:any[],
  height:number,
  points:{avg:number,date:string,season:number}[],
  lineColor:string,
  onScrub:(idx:number|null,label:string|null)=>void,
  avgSpanRef:React.RefObject<HTMLSpanElement>,
  baseAvg:number,
}){
  const overlayRef=useRef<HTMLCanvasElement>(null);
  const chartCanvasRef=useRef<HTMLCanvasElement>(null);
  const activeIdx=useRef<number|null>(null);
  const wrapperRef=useRef<HTMLDivElement>(null);

  // Animation state for smooth number tween
  const tweenRef=useRef<{from:number,to:number,start:number,raf:number}|null>(null);
  const currentDisplayRef=useRef<number>(baseAvg);

  const writeNumber=(v:number)=>{
    currentDisplayRef.current=v;
    if(avgSpanRef.current)avgSpanRef.current.textContent=v.toFixed(1);
  };

  const tweenTo=useCallback((target:number)=>{
    if(tweenRef.current){cancelAnimationFrame(tweenRef.current.raf);}
    const from=currentDisplayRef.current;
    if(Math.abs(target-from)<0.05){writeNumber(target);return;}
    const duration=120;
    const startTime=performance.now();
    const tick=(now:number)=>{
      const t=Math.min(1,(now-startTime)/duration);
      // ease-out cubic
      const e=1-(1-t)*(1-t)*(1-t);
      writeNumber(parseFloat((from+(target-from)*e).toFixed(2)));
      if(t<1){
        tweenRef.current!.raf=requestAnimationFrame(tick);
      } else {
        tweenRef.current=null;
      }
    };
    tweenRef.current={from,to:target,start:startTime,raf:requestAnimationFrame(tick)};
  },[avgSpanRef]);

  // Keep baseAvg in sync when band changes
  useEffect(()=>{
    if(activeIdx.current===null)tweenTo(baseAvg);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[baseAvg]);

  const drawOverlay=useCallback(()=>{
    const overlay=overlayRef.current;
    const chartCanvas=chartCanvasRef.current;
    if(!overlay||!chartCanvas)return;
    const chart=ChartJS.getChart(chartCanvas);
    if(!chart)return;
    const dpr=window.devicePixelRatio||1;
    const w=overlay.offsetWidth;
    const h=overlay.offsetHeight;
    overlay.width=w*dpr;
    overlay.height=h*dpr;
    const ctx=overlay.getContext("2d");
    if(!ctx)return;
    ctx.clearRect(0,0,overlay.width,overlay.height);
    const idx=activeIdx.current;
    if(idx===null||idx<0||idx>=points.length)return;
    ctx.scale(dpr,dpr);
    const xScale=chart.scales["x"];
    const yScale=chart.scales["y"];
    if(!xScale||!yScale)return;
    const x=xScale.getPixelForValue(idx);
    const y=yScale.getPixelForValue(points[idx].avg);
    // Vertical hairline
    ctx.beginPath();
    ctx.moveTo(x,0);
    ctx.lineTo(x,h);
    ctx.strokeStyle="rgba(0,0,0,0.15)";
    ctx.lineWidth=1;
    ctx.setLineDash([3,3]);
    ctx.stroke();
    ctx.setLineDash([]);
    // Dot
    ctx.beginPath();
    ctx.arc(x,y,5,0,Math.PI*2);
    ctx.fillStyle=lineColor;
    ctx.fill();
    ctx.strokeStyle="#fff";
    ctx.lineWidth=2;
    ctx.stroke();
    // Date label at top of hairline
    const p=points[idx];
    const label=p?.date
      ?new Date(p.date+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})
      :String(p?.season||"");
    ctx.font=`600 11px 'DM Sans', sans-serif`;
    const tw=ctx.measureText(label).width;
    const lx=Math.min(Math.max(x-tw/2,4),w-tw-4);
    ctx.fillStyle="#1c1410";
    ctx.fillText(label,lx,13);
  },[points,lineColor]);

  const pixelToIdx=useCallback((clientX:number)=>{
    const chartCanvas=chartCanvasRef.current;
    if(!chartCanvas)return null;
    const chart=ChartJS.getChart(chartCanvas);
    if(!chart)return null;
    const xScale=chart.scales["x"];
    if(!xScale)return null;
    const rect=chartCanvas.getBoundingClientRect();
    const relX=clientX-rect.left;
    let best=0,bestDist=Infinity;
    for(let i=0;i<points.length;i++){
      const px=xScale.getPixelForValue(i);
      const d=Math.abs(px-relX);
      if(d<bestDist){bestDist=d;best=i;}
    }
    return best;
  },[points]);

  const handleMove=useCallback((clientX:number)=>{
    const idx=pixelToIdx(clientX);
    if(idx===null)return;
    const changed=idx!==activeIdx.current;
    activeIdx.current=idx;
    drawOverlay();
    if(changed){
      const p=points[idx];
      tweenTo(parseFloat(p.avg.toFixed(1)));
      const label=p?.date
        ?new Date(p.date+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})
        :String(p?.season||"");
      onScrub(idx,label);
    }
  },[pixelToIdx,drawOverlay,onScrub,points,tweenTo]);

  const handleEnd=useCallback(()=>{
    activeIdx.current=null;
    const overlay=overlayRef.current;
    if(overlay){
      const ctx=overlay.getContext("2d");
      if(ctx)ctx.clearRect(0,0,overlay.width,overlay.height);
    }
    tweenTo(baseAvg);
    onScrub(null,null);
  },[onScrub,tweenTo,baseAvg]);

  // Find the ChartCanvas's inner <canvas> after each render
  useEffect(()=>{
    const wrapper=wrapperRef.current;
    if(!wrapper)return;
    const canvas=wrapper.querySelector("canvas");
    if(canvas)(chartCanvasRef as any).current=canvas;
  });

  useEffect(()=>{
    drawOverlay();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[...deps]);

  // The outer wrapper acts as a touch dead zone for SubTabPanel — any touch that
  // starts inside the chart area is fully owned by the scrubber.
  // stopPropagation() on the native touchstart prevents the event from ever
  // reaching the React root where SubTabPanel's delegated onTouchMove lives.
  const outerRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const el=outerRef.current;
    if(!el)return;
    let active=false;

    const onStart=(e:TouchEvent)=>{
      if(e.touches.length>1)return;
      // Stop bubbling so SubTabPanel never sees this touch sequence
      e.stopPropagation();
      active=true;
      handleMove(e.touches[0].clientX);
    };
    const onMove=(e:TouchEvent)=>{
      if(!active||e.touches.length>1)return;
      if(e.cancelable)e.preventDefault();
      handleMove(e.touches[0].clientX);
    };
    const onEnd=()=>{
      if(active)handleEnd();
      active=false;
    };

    el.addEventListener("touchstart",onStart,{passive:false});
    el.addEventListener("touchmove",onMove,{passive:false});
    el.addEventListener("touchend",onEnd,{passive:true});
    el.addEventListener("touchcancel",onEnd,{passive:true});
    return()=>{
      el.removeEventListener("touchstart",onStart);
      el.removeEventListener("touchmove",onMove);
      el.removeEventListener("touchend",onEnd);
      el.removeEventListener("touchcancel",onEnd);
    };
  },[handleMove,handleEnd]);

  return(
    <div
      ref={outerRef}
      style={{position:"relative",userSelect:"none",WebkitUserSelect:"none" as any,cursor:"crosshair"}}
      onMouseMove={e=>handleMove(e.clientX)}
      onMouseLeave={handleEnd}
    >
      <div ref={wrapperRef}>
        <ChartCanvas config={config} deps={deps} height={height}/>
      </div>
      <canvas
        ref={overlayRef}
        style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",pointerEvents:"none"}}
      />
    </div>
  );
}

// ── Arc canvas for Events Played tile ────────────────────────
function ArcProgress({played,total=52}:{played:number,total?:number}){
  const canvasRef=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    const c=canvasRef.current;
    if(!c)return;
    const dpr=window.devicePixelRatio||1;
    const W=80,H=48;
    c.width=W*dpr;
    c.height=H*dpr;
    const ctx=c.getContext("2d");
    if(!ctx)return;
    ctx.scale(dpr,dpr);
    const cx=W/2,cy=H-4,r=34,lw=9;
    // Track
    ctx.beginPath();
    ctx.arc(cx,cy,r,Math.PI,2*Math.PI);
    ctx.strokeStyle="rgba(93,175,138,0.22)";
    ctx.lineWidth=lw;
    ctx.lineCap="round";
    ctx.stroke();
    const frac=Math.min(1,Math.max(0,played/total));
    if(frac<=0)return;
    // Animate fill
    const duration=800;
    const start=performance.now();
    const draw=(now:number)=>{
      const t=Math.min(1,(now-start)/duration);
      // ease-out cubic
      const ease=1-(1-t)*(1-t)*(1-t);
      const currentFrac=frac*ease;
      ctx.clearRect(0,0,W,H);
      // Redraw track
      ctx.beginPath();
      ctx.arc(cx,cy,r,Math.PI,2*Math.PI);
      ctx.strokeStyle="rgba(93,175,138,0.22)";
      ctx.lineWidth=lw;
      ctx.lineCap="round";
      ctx.stroke();
      // Draw fill arc
      ctx.beginPath();
      ctx.arc(cx,cy,r,Math.PI,Math.PI+Math.PI*currentFrac);
      ctx.strokeStyle="#155c32";
      ctx.lineWidth=lw;
      ctx.lineCap="round";
      ctx.stroke();
      if(t<1)requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  },[played,total]);
  return <canvas ref={canvasRef} style={{width:80,height:48,display:"block",margin:"4px auto 0"}}/>;
}

export function SeasonOverview({seasonData,seasonEvents,season,leaderboard,golfers,events}:any){
  const totalRounds=seasonData.reduce((s:number,d:any)=>s+d.rounds,0);
  const allPts=seasonData.flatMap((d:any)=>d.allPts);
  const highScoreEntry=allPts.length?Math.max(...allPts):0;
  const highScorer=seasonData.find((d:any)=>d.best===highScoreEntry);
  const winLeader=seasonData.length?[...seasonData].sort((a:any,b:any)=>b.wins-a.wins)[0]:null;

  const winData=[...seasonData].filter((d:any)=>d.wins>0).sort((a:any,b:any)=>b.wins-a.wins);

  const earningsLeader=seasonData.length?[...seasonData].sort((a:any,b:any)=>b.earned-a.earned)[0]:null;

  // ── golfers/event stats ──────────────────────────────────────
  const eventsPlayed=seasonEvents.length;
  const golfersPerEvent=eventsPlayed>0?totalRounds/eventsPlayed:0;
  const priorSeason=season-1;
  // Deduplicate prior season the same way calcSeasonLeaderData does:
  // one entry per golfer per event (keep highest score), excluding guests.
  const priorDeduped:(()=>any[])=(()=>{
    const seen=new Map<string,any>();
    leaderboard.filter((r:any)=>r.season===priorSeason&&!golfers.find((g:any)=>g.golfer_id===r.golfer_id)?.is_guest)
      .forEach((r:any)=>{
        const key=`${r.golfer_id}:${r.event_id}`;
        const ex=seen.get(key);
        if(!ex||r.total_stableford_points>ex.total_stableford_points)seen.set(key,r);
      });
    return [...seen.values()];
  });
  const priorRows=priorDeduped();
  const priorUniqueEvents=[...new Set(priorRows.map((r:any)=>r.event_id))];
  const priorGolfersPerEvent=priorUniqueEvents.length>0?priorRows.length/priorUniqueEvents.length:null;
  const deltaPct=priorGolfersPerEvent!=null?golfersPerEvent-priorGolfersPerEvent:null;

  // ── Field Scoring Trend ──────────────────────────────────────
  // Band selector looks back from the selected season end date using ALL leaderboard data.
  // We build a full multi-season event trend from the leaderboard prop (which contains all seasons).
  const [trendBand,setTrendBand]=useStateOv<"all"|"5Y"|"1Y"|"YTD"|"1M">("YTD");

  // Build a trend point for every completed event up to and including selSeason,
  // using the leaderboard's season field and event dates from the parent.
  // SeasonOverview only gets seasonEvents (current season); for cross-season history
  // we reconstruct event dates from leaderboard entries using season + event_id grouping.
  // We derive a proxy date from the leaderboard's season field since we don't have events prop.
  // Strategy: use seasonEvents for current season; for prior seasons derive from leaderboard rows.
  // The leaderboard has a `season` field. We group by event_id, compute avg, and use the
  // season year as a proxy date (Jan 1 of that year — ordering is what matters for the chart).

  const buildMultiSeasonTrend=()=>{
    // Group all leaderboard entries by event_id
    const evMap:Record<number,{pts:number[],season:number}>={};
    leaderboard.forEach((r:any)=>{
      if(!r.event_id)return;
      if(!evMap[r.event_id])evMap[r.event_id]={pts:[],season:r.season||season};
      if(!golfers.find((g:any)=>g.golfer_id===r.golfer_id)?.is_guest){
        evMap[r.event_id].pts.push(r.total_stableford_points);
        evMap[r.event_id].season=r.season||evMap[r.event_id].season;
      }
    });
    // Build a date lookup from all events across all seasons
    const dateByEid:Record<number,string>={};
    (events||[]).forEach((ev:any)=>{if(ev.event_id&&ev.date)dateByEid[ev.event_id]=ev.date;});
    // Build trend array sorted chronologically
    return Object.entries(evMap)
      .filter(([,v])=>v.pts.length>0&&v.season<=season)
      .map(([eid,v])=>{
        const avg=v.pts.reduce((a:number,b:number)=>a+b,0)/v.pts.length;
        const date=dateByEid[parseInt(eid)]||`${v.season}-01-01`;
        return{eid:parseInt(eid),avg,season:v.season,date};
      })
      .sort((a,b)=>{
        if(a.season!==b.season)return a.season-b.season;
        return new Date(a.date).getTime()-new Date(b.date).getTime();
      });
  };

  const fullTrend=buildMultiSeasonTrend();

  // Season end date: Dec 31 of the viewed season
  const seasonEndDate=new Date(season,11,31);

  const sliceByBand=(band:string)=>{
    if(band==="all")return fullTrend;
    if(band==="5Y"){
      const cutSeason=season-5;
      return fullTrend.filter((e:any)=>e.season>cutSeason);
    }
    if(band==="1Y"){
      const cutoff=new Date(seasonEndDate);
      cutoff.setFullYear(cutoff.getFullYear()-1);
      return fullTrend.filter((e:any)=>new Date(e.date+"T12:00:00")>=cutoff||e.season>=season-1);
    }
    if(band==="YTD"){
      // Year-to-date within the viewed season
      return fullTrend.filter((e:any)=>e.season===season);
    }
    if(band==="1M"){
      return fullTrend.slice(-4);
    }
    return fullTrend;
  };

  const eventTrend=sliceByBand(trendBand);
  // For "no data" fallback detection, use the current-season-only events
  const currentSeasonTrend=fullTrend.filter((e:any)=>e.season===season);

  const overallLeagueAvg=eventTrend.length?parseFloat((eventTrend.reduce((s:number,e:any)=>s+e.avg,0)/eventTrend.length).toFixed(1)):0;

  // Current season field avg — constant reference line shown on all band views
  const currentSeasonAvg=currentSeasonTrend.length
    ?parseFloat((currentSeasonTrend.reduce((s:number,e:any)=>s+e.avg,0)/currentSeasonTrend.length).toFixed(1))
    :null;

  const trendDelta=(()=>{
    if(eventTrend.length<2)return null;
    const half=Math.floor(eventTrend.length/2);
    const recent=eventTrend.slice(half);
    const early=eventTrend.slice(0,half);
    const rAvg=recent.reduce((s:number,e:any)=>s+e.avg,0)/recent.length;
    const eAvg=early.reduce((s:number,e:any)=>s+e.avg,0)/early.length;
    return rAvg-eAvg;
  })();

  const trendUp=trendDelta!=null&&trendDelta>0;

  // Scrub — handled imperatively via DOM refs (avoids React re-render per drag tick)
  const avgSpanRef=useRef<HTMLSpanElement>(null);
  const scrubLabelRef=useRef<HTMLSpanElement>(null);
  const scrubSubRef=useRef<HTMLSpanElement>(null);
  const isScrubbing=useRef(false);

  const handleScrub=(idx:number|null,label:string|null)=>{
    isScrubbing.current=idx!==null;
    if(scrubLabelRef.current){
      scrubLabelRef.current.textContent=idx!==null&&label?label:"";
      scrubLabelRef.current.style.display=idx!==null&&label?"":"none";
    }
    if(scrubSubRef.current){
      scrubSubRef.current.textContent=idx!==null?"event avg":"Field avg pts / event";
    }
    // delta chip: hide while scrubbing
    const deltaChip=scrubSubRef.current?.parentElement?.parentElement?.querySelector(".trend-delta-chip") as HTMLElement|null;
    if(deltaChip)deltaChip.style.display=idx!==null?"none":"";
  };

  // Show the season-avg reference line on all bands when the view avg differs from the season avg.
  // On YTD/1M the line is still useful as a stable reference even if most points are current-season.
  const showSeasonRef=currentSeasonAvg!=null&&eventTrend.length>1;

  const trendConfig = {
    type:"line" as const,
    data:{
      labels:eventTrend.map((_:any,i:number)=>String(i+1)),
      datasets:[
        {
          label:"Field Avg",
          data:eventTrend.map((e:any)=>parseFloat(e.avg.toFixed(1))),
          borderColor:trendUp?"#1a7340":"#c47800",
          backgroundColor:trendUp?"rgba(26,115,64,0.10)":"rgba(196,120,0,0.08)",
          pointBackgroundColor:trendUp?"#1a7340":"#c47800",
          pointRadius:eventTrend.map((_:any,i:number)=>i===eventTrend.length-1?6:0),
          fill:true,tension:0.35,order:1,borderWidth:2.5,
        },
        ...(showSeasonRef?[{
          label:`${season} avg`,
          data:Array(eventTrend.length).fill(currentSeasonAvg),
          borderColor:"rgba(232,200,74,0.85)",
          backgroundColor:"transparent",
          borderDash:[4,3],
          borderWidth:2,
          pointRadius:0,
          fill:false,
          tension:0,
          order:2,
        }]:[]),
      ]
    },
    options:{responsive:true,maintainAspectRatio:false,
      layout:{padding:{left:0,right:0,top:6,bottom:0}},
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{
          label:(c:any)=>{
            if(c.datasetIndex===1)return(`${season} season avg: ${c.parsed.y.toFixed(1)} pts`);
            return(" "+c.parsed.y.toFixed(1)+" pts avg");
          },
          title:(items:any)=>{
            const ev=eventTrend[items[0].dataIndex];
            return ev?.date?formatDate(ev.date):`${ev?.season||""} Rd ${items[0].dataIndex+1}`;
          }
        }}
      },
      scales:{
        x:{display:false},
        y:{display:false,beginAtZero:false,min:Math.max(0,(overallLeagueAvg||24)-8)}
      }
    }
  };

  // ── Win leader badge data ────────────────────────────────────
  const winLeaderBadges=(()=>{
    if(!winLeader||!winLeader.wins)return[];
    const sorted=[...seasonEvents].sort((a:any,b:any)=>new Date(a.date).getTime()-new Date(b.date).getTime());
    return sorted.map((ev:any,idx:number)=>{
      const entry=leaderboard.filter((r:any)=>r.event_id===ev.event_id&&r.golfer_id===winLeader.golfer.golfer_id);
      if(!entry.length)return null;
      const allPaid=leaderboard.filter((r:any)=>r.event_id===ev.event_id&&r.buy_in_paid).sort((a:any,b:any)=>b.total_stableford_points-a.total_stableford_points);
      const topPts=allPaid[0]?.total_stableford_points;
      const won=entry[0].total_stableford_points===topPts;
      return{round:idx+1,won,played:true};
    });
  })();
  const playedBadges=winLeaderBadges.filter(Boolean);

  const maxWins=winData.length?Math.max(...winData.map((d:any)=>d.wins)):1;

  return(
    <div>
      {/* ── Stat tiles ─────────────────────────────────────── */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>

        {/* Events Played */}
        <div className="stat-card" style={{textAlign:"center"}}>
          <div className="stat-value" style={{color:"var(--green-700)",fontVariantNumeric:"tabular-nums"}}>
            <CountUp value={seasonEvents.length}/>
          </div>
          <div className="stat-label">Events Played</div>
          <div style={{fontSize:11,color:"var(--text-muted)",marginTop:2}}>of 52 this season</div>
          <ArcProgress played={eventsPlayed} total={52}/>
        </div>

        {/* Total Rounds */}
        <div className="stat-card" style={{textAlign:"center"}}>
          <div className="stat-value"><CountUp value={totalRounds}/></div>
          <div className="stat-label">Total Rounds</div>
          {eventsPlayed>0&&(
            <>
              <div style={{fontSize:11,color:"var(--text-muted)",marginTop:4}}>
                ~{golfersPerEvent.toFixed(1)} golfers/event
              </div>
              {deltaPct!=null&&(
                <div style={{
                  display:"inline-flex",alignItems:"center",gap:3,marginTop:4,
                  padding:"2px 7px",borderRadius:20,fontSize:11,fontWeight:700,
                  background:deltaPct>0?"rgba(21,92,50,0.12)":"rgba(192,32,32,0.10)",
                  color:deltaPct>0?"var(--green-700)":"var(--red-600)",
                }}>
                  {deltaPct>0?"↑":"↓"}{Math.abs(deltaPct).toFixed(1)} vs {priorSeason}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Hero highlight cards ────────────────────────────── */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
        {highScorer&&(
          <div style={{background:"linear-gradient(135deg,var(--gold-900),var(--gold-700))",borderRadius:"var(--radius-md)",padding:"14px 12px",textAlign:"center",color:"white"}}>
            <div style={{display:"flex",justifyContent:"center",marginBottom:2}}><Trophy size={22} strokeWidth={2}/></div>
            <div style={{fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase",opacity:0.8,marginTop:2}}>High Score</div>
            <div style={{fontSize:16,fontWeight:700,marginTop:4}}>{highScorer.golfer.first_name}</div>
            <div style={{fontSize:26,fontWeight:700,color:"var(--gold-300)",lineHeight:1}}>{highScoreEntry} pts</div>
          </div>
        )}
        {earningsLeader&&earningsLeader.earned>0&&(
          <div style={{background:"linear-gradient(135deg,var(--earth-800),var(--earth-700))",borderRadius:"var(--radius-md)",padding:"14px 12px",textAlign:"center",color:"white"}}>
            <div style={{display:"flex",justifyContent:"center",marginBottom:2}}><Banknote size={22} strokeWidth={2}/></div>
            <div style={{fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase",opacity:0.8,marginTop:2}}>Earnings Leader</div>
            <div style={{fontSize:16,fontWeight:700,marginTop:4}}>{earningsLeader.golfer.first_name}</div>
            <div style={{fontSize:26,fontWeight:700,color:"var(--gold-300)",lineHeight:1}}>${earningsLeader.earned.toFixed(0)}</div>
          </div>
        )}
      </div>

      {/* ── Win Leader — full-width dark hero ──────────────── */}
      {winLeader&&winLeader.wins>0&&(
        <div style={{
          position:"relative",overflow:"hidden",
          background:"var(--green-900)",
          borderRadius:"var(--radius-md)",
          padding:"16px 14px 14px",
          marginBottom:16,
          color:"white",
        }}>
          {/* Background trophy texture */}
          <div style={{
            position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",
            opacity:0.06,pointerEvents:"none",userSelect:"none",lineHeight:1,
            color:"white",
          }}>
            <Trophy size={56} strokeWidth={1.5}/>
          </div>

          <div style={{fontSize:10,letterSpacing:"0.12em",textTransform:"uppercase",color:"rgba(255,255,255,0.45)",fontWeight:700}}>
            Win leader
          </div>
          <div style={{fontSize:15,fontWeight:500,color:"rgba(255,255,255,0.75)",marginTop:2}}>
            {winLeader.golfer.first_name} {winLeader.golfer.last_name}
          </div>
          <div style={{fontSize:38,fontWeight:700,color:"#7dc07d",lineHeight:1.05,margin:"2px 0 10px"}}>
            {winLeader.wins}
            <span style={{fontSize:16,fontWeight:500,color:"rgba(255,255,255,0.45)",marginLeft:6}}>
              win{winLeader.wins>1?"s":""}
            </span>
          </div>

          {/* Round badges — spread evenly across full width, auto-size */}
          {playedBadges.length>0&&(
            <div style={{
              display:"flex",flexWrap:"wrap",gap:4,marginBottom:10,
              justifyContent:"flex-start",
            }}>
              {playedBadges.map((b:any,i:number)=>{
                // Auto-size: target 2 rows. Each badge gets 1/(ceil(n/2)) of width minus gaps.
                // Use flex basis so they naturally reflow; min-size 24px, max 34px.
                const n=playedBadges.length;
                const perRow=Math.ceil(n/2);
                const basisPct=Math.floor(100/perRow)-1;
                return(
                  <div
                    key={i}
                    title={b.won?"Won this round":"Played, didn't win"}
                    style={{
                      flex:`1 1 ${basisPct}%`,
                      maxWidth:34,minWidth:24,
                      aspectRatio:"1",
                      borderRadius:7,
                      display:"flex",alignItems:"center",justifyContent:"center",
                      fontSize:10,fontWeight:700,
                      background:b.won?"#7dc07d":"rgba(255,255,255,0.10)",
                      color:b.won?"var(--green-900)":"rgba(255,255,255,0.3)",
                    }}
                  >
                    {b.round}
                  </div>
                );
              })}
            </div>
          )}

          {/* Legend */}
          <div style={{display:"flex",gap:12,alignItems:"center"}}>
            <div style={{display:"flex",alignItems:"center",gap:5,fontSize:10,color:"rgba(255,255,255,0.45)"}}>
              <div style={{width:12,height:12,borderRadius:3,background:"#7dc07d"}}/>Won
            </div>
            <div style={{display:"flex",alignItems:"center",gap:5,fontSize:10,color:"rgba(255,255,255,0.45)"}}>
              <div style={{width:12,height:12,borderRadius:3,background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.2)"}}/>Played
            </div>
          </div>
        </div>
      )}

      {/* ── Field Scoring Trend — stock ticker style ─────── */}
      {eventTrend.length>1&&(
        <div className="card" style={{marginBottom:12}}>
          <div className="card-title" style={{marginBottom:6}}>Field Scoring Trend</div>
          <div style={{display:"flex",alignItems:"flex-end",gap:10,marginBottom:2}}>
            {/* avgSpanRef is written directly by TrendScrubber's tween — no React re-render per tick */}
            <span ref={avgSpanRef} style={{
              fontSize:44,fontWeight:700,fontVariantNumeric:"tabular-nums",lineHeight:1,
              color:"var(--text-primary)",
            }}>
              {overallLeagueAvg.toFixed(1)}
            </span>
            {trendDelta!=null&&(
              <span className="trend-delta-chip" style={{
                display:"inline-flex",alignItems:"center",gap:3,
                padding:"3px 8px",borderRadius:20,fontSize:12,fontWeight:700,
                background:trendUp?"rgba(21,92,50,0.12)":"rgba(192,32,32,0.10)",
                color:trendUp?"var(--green-700)":"var(--red-600)",
                marginBottom:2,
              }}>
                {trendUp?"↑":"↓"}{Math.abs(trendDelta).toFixed(1)} recent
              </span>
            )}
            {/* Scrub event label — shown/hidden imperatively */}
            <span ref={scrubLabelRef} style={{fontSize:13,color:"var(--text-muted)",fontWeight:500,display:"none"}}/>
          </div>
          <div style={{fontSize:11,color:"var(--text-muted)",marginBottom:8,textAlign:"left"}}>
            <span ref={scrubSubRef}>Field avg pts / event</span>
          </div>

          {/* Negative margins bleed the chart to card edges (card has ~16px horiz padding) */}
          <div style={{margin:"0 -16px"}}>
            <TrendScrubber
              config={trendConfig}
              deps={[season,eventTrend.length,trendBand,trendUp,currentSeasonAvg,showSeasonRef]}
              height={120}
              points={eventTrend}
              lineColor={trendUp?"#1a7340":"#c47800"}
              onScrub={handleScrub}
              avgSpanRef={avgSpanRef}
              baseAvg={overallLeagueAvg}
            />
          </div>

          {/* Band selector */}
          <div style={{display:"flex",gap:4,marginTop:10}}>
            {(["1M","YTD","1Y","5Y","MAX"] as const).map(b=>{
              const key=(b==="MAX"?"all":b) as "all"|"5Y"|"1Y"|"YTD"|"1M";
              const active=trendBand===key;
              return(
                <button
                  key={b}
                  onClick={()=>setTrendBand(key)}
                  style={{
                    flex:1,padding:"5px 0",borderRadius:7,border:"none",cursor:"pointer",
                    fontSize:11,fontWeight:700,
                    background:active?"var(--green-900)":"transparent",
                    color:active?"#ffffff":"var(--text-muted)",
                    transition:"all 0.15s",
                  }}
                >
                  {b}
                </button>
              );
            })}
          </div>
          {/* Reference line legend — only shown when the dotted line appears */}
          {showSeasonRef&&(
            <div style={{display:"flex",alignItems:"center",gap:6,marginTop:8,justifyContent:"flex-end"}}>
              <svg width="22" height="8" style={{flexShrink:0}}>
                <line x1="0" y1="4" x2="22" y2="4" stroke="rgba(232,200,74,0.85)" strokeWidth="1.5" strokeDasharray="4 3"/>
              </svg>
              <span style={{fontSize:11,color:"var(--text-muted)"}}>{season} season avg ({currentSeasonAvg} pts)</span>
            </div>
          )}
        </div>
      )}
      {eventTrend.length<=1&&currentSeasonTrend.length>1&&(
        <div className="card" style={{marginBottom:12,textAlign:"center",padding:"20px",color:"var(--text-muted)",fontSize:14}}>
          No events match this time window — try a wider band.
        </div>
      )}
      {currentSeasonTrend.length<=1&&seasonEvents.length>0&&(
        <div className="card" style={{marginBottom:12,textAlign:"center",padding:"20px",color:"var(--text-muted)",fontSize:14}}>
          Scoring trend chart will appear once 2+ events are completed this season.
        </div>
      )}

      {/* ── Wins & 2nd Place — HTML div bars ─────────────── */}
      {winData.length>0&&(
        <div className="card" style={{marginBottom:12}}>
          <div style={{display:"flex",gap:14,alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:13,fontWeight:700,letterSpacing:"0.07em",textTransform:"uppercase",color:"var(--green-700)",flex:1}}>
              Wins &amp; 2nd Place
            </div>
            <div style={{display:"flex",gap:10,alignItems:"center"}}>
              <div style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:"var(--text-secondary)"}}>
                <div style={{width:10,height:10,borderRadius:2,background:"#c47800"}}/>Wins
              </div>
              <div style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:"var(--text-secondary)"}}>
                <div style={{width:10,height:10,borderRadius:2,background:"rgba(26,115,64,0.45)"}}/>2nds
              </div>
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {winData.map((d:any)=>{
              const winFrac=d.wins/maxWins;
              const secFrac=d.seconds/maxWins;
              const label=`${d.wins}W·${d.seconds}S`;
              return(
                <div key={d.golfer.golfer_id} style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{minWidth:54,fontSize:13,fontWeight:600,color:"var(--text-primary)",whiteSpace:"nowrap"}}>
                    {d.golfer.first_name}
                  </div>
                  <div style={{flex:1,display:"flex",height:22,borderRadius:5,overflow:"hidden"}}>
                    {d.wins>0&&(
                      <div style={{width:`${winFrac*82}%`,background:"#c47800",minWidth:8,transition:"width 0.4s ease"}}/>
                    )}
                    {d.seconds>0&&(
                      <div style={{width:`${secFrac*82}%`,background:"rgba(26,115,64,0.45)",minWidth:8,transition:"width 0.4s ease"}}/>
                    )}
                  </div>
                  <div style={{fontSize:12,fontWeight:700,color:"var(--text-secondary)",whiteSpace:"nowrap",minWidth:40,textAlign:"right"}}>
                    {label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {winData.length===0&&seasonEvents.length>0&&(
        <div className="card" style={{marginBottom:12,textAlign:"center",padding:"20px",color:"var(--text-muted)",fontSize:14}}>
          Win tallies will appear once scoring is entered for this season.
        </div>
      )}

      {/* ── Form Heatmap ─────────────────────────────────── */}
      {seasonEvents.length>0&&(
        <div>
          <div style={{fontSize:13,fontWeight:600,color:"var(--green-700)",letterSpacing:"0.05em",margin:"20px 0 8px",textTransform:"uppercase"}}>Form Heatmap</div>
          <div className="card" style={{marginBottom:12,padding:"12px 8px"}}>
            <FormHeatmap seasonEvents={seasonEvents} leaderboard={leaderboard} golfers={golfers} season={season}/>
          </div>
        </div>
      )}
    </div>
  );
}
