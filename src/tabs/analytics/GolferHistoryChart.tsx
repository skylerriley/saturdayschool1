import { useState, useRef, useLayoutEffect, useEffect, useCallback } from "react";

import { computeScoringFingerprint } from "../../lib/scoringFingerprint";
import { ScoringFingerprintRadar } from "../../components/charts/ScoringFingerprintRadar";
import { CountUp, ScoreSymbol } from "../../App";
import { ChartCanvas } from "./ChartCanvas";
import { PairingHistory } from "../../components/analytics/PairingHistory";
import { Chart as ChartJS } from "chart.js";

function RoundScrubber({config,deps,height=160,rounds,winFlags,avgPtsSpanRef,subLabelRef,baseAvg}:{
  config:object,deps:any[],height:number,
  rounds:{pts:number,date:string,course:string}[],
  winFlags:boolean[],
  avgPtsSpanRef:React.RefObject<HTMLSpanElement>,
  subLabelRef:React.RefObject<HTMLSpanElement>,
  baseAvg:number,
}){
  const overlayRef=useRef<HTMLCanvasElement>(null);
  const chartCanvasRef=useRef<HTMLCanvasElement>(null);
  const wrapperRef=useRef<HTMLDivElement>(null);
  const outerRef=useRef<HTMLDivElement>(null);
  const activeIdx=useRef<number|null>(null);
  const tweenRef=useRef<{from:number,to:number,start:number,raf:number}|null>(null);
  const currentValRef=useRef<number>(baseAvg);

  const writeNum=(v:number)=>{
    currentValRef.current=v;
    if(avgPtsSpanRef.current)avgPtsSpanRef.current.textContent=v.toFixed(1);
  };

  const tweenTo=useCallback((target:number)=>{
    if(tweenRef.current)cancelAnimationFrame(tweenRef.current.raf);
    const from=currentValRef.current;
    if(Math.abs(target-from)<0.05){writeNum(target);return;}
    const start=performance.now();
    const tick=(now:number)=>{
      const t=Math.min(1,(now-start)/120);
      const e=1-(1-t)*(1-t)*(1-t);
      writeNum(parseFloat((from+(target-from)*e).toFixed(2)));
      if(t<1){tweenRef.current!.raf=requestAnimationFrame(tick);}
      else tweenRef.current=null;
    };
    tweenRef.current={from,to:target,start,raf:requestAnimationFrame(tick)};
  },[]);

  useEffect(()=>{if(activeIdx.current===null)tweenTo(baseAvg);},[baseAvg]);

  const drawOverlay=useCallback(()=>{
    const overlay=overlayRef.current;
    const chartCanvas=chartCanvasRef.current;
    if(!overlay||!chartCanvas)return;
    const chart=ChartJS.getChart(chartCanvas);
    if(!chart)return;
    const dpr=window.devicePixelRatio||1;
    const w=overlay.offsetWidth,h=overlay.offsetHeight;
    overlay.width=w*dpr;overlay.height=h*dpr;
    const ctx=overlay.getContext("2d");
    if(!ctx)return;
    ctx.clearRect(0,0,overlay.width,overlay.height);
    const idx=activeIdx.current;
    if(idx===null||idx<0||idx>=rounds.length)return;
    ctx.scale(dpr,dpr);
    const xScale=chart.scales["x"];
    const yScale=chart.scales["y"];
    if(!xScale||!yScale)return;
    const x=xScale.getPixelForValue(idx);
    const y=yScale.getPixelForValue(rounds[idx].pts);
    // Hairline
    ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);
    ctx.strokeStyle="rgba(255,255,255,0.15)";ctx.lineWidth=1;
    ctx.setLineDash([3,3]);ctx.stroke();ctx.setLineDash([]);
    // Win glow
    if(winFlags[idx]){
      ctx.beginPath();ctx.arc(x,y,14,0,Math.PI*2);
      ctx.fillStyle="rgba(232,160,32,0.18)";ctx.fill();
    }
    // Dot
    ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);
    ctx.fillStyle=winFlags[idx]?"#e8a020":"#7dc07d";ctx.fill();
    // Date label
    const r=rounds[idx];
    const label=new Date(r.date+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})
      +" · "+r.course.replace(" Golf Club","").replace("Golf Course","").split(" ").slice(0,2).join(" ");
    ctx.font=`600 11px 'DM Sans',sans-serif`;
    const tw=ctx.measureText(label).width;
    const lx=Math.min(Math.max(x-tw/2,4),w-tw-4);
    ctx.fillStyle="rgba(255,255,255,0.55)";ctx.fillText(label,lx,13);
  },[rounds,winFlags]);

  const pixelToIdx=useCallback((clientX:number)=>{
    const c=chartCanvasRef.current;if(!c)return null;
    const chart=ChartJS.getChart(c);if(!chart)return null;
    const xScale=chart.scales["x"];if(!xScale)return null;
    const rect=c.getBoundingClientRect();
    const relX=clientX-rect.left;
    let best=0,bestDist=Infinity;
    for(let i=0;i<rounds.length;i++){
      const d=Math.abs(xScale.getPixelForValue(i)-relX);
      if(d<bestDist){bestDist=d;best=i;}
    }
    return best;
  },[rounds]);

  const handleMove=useCallback((clientX:number)=>{
    const idx=pixelToIdx(clientX);if(idx===null)return;
    const changed=idx!==activeIdx.current;
    activeIdx.current=idx;drawOverlay();
    if(changed){
      tweenTo(parseFloat(rounds[idx].pts.toFixed(1)));
      if(subLabelRef.current)subLabelRef.current.textContent="event pts";
    }
  },[pixelToIdx,drawOverlay,rounds,tweenTo,subLabelRef]);

  const handleEnd=useCallback(()=>{
    activeIdx.current=null;
    const overlay=overlayRef.current;
    if(overlay){const ctx=overlay.getContext("2d");if(ctx)ctx.clearRect(0,0,overlay.width,overlay.height);}
    if(subLabelRef.current)subLabelRef.current.textContent="avg pts / round";
    tweenTo(baseAvg);
  },[tweenTo,baseAvg]);

  useEffect(()=>{
    const el=wrapperRef.current;if(!el)return;
    const canvas=el.querySelector("canvas");
    if(canvas)(chartCanvasRef as any).current=canvas;
  });

  useEffect(()=>{drawOverlay();},[...deps]);

  useEffect(()=>{
    const el=outerRef.current;if(!el)return;
    let active=false;
    const onStart=(e:TouchEvent)=>{if(e.touches.length>1)return;e.stopPropagation();active=true;handleMove(e.touches[0].clientX);};
    const onMove=(e:TouchEvent)=>{if(!active||e.touches.length>1)return;if(e.cancelable)e.preventDefault();handleMove(e.touches[0].clientX);};
    const onEnd=()=>{if(active)handleEnd();active=false;};
    el.addEventListener("touchstart",onStart,{passive:false});
    el.addEventListener("touchmove",onMove,{passive:false});
    el.addEventListener("touchend",onEnd,{passive:true});
    el.addEventListener("touchcancel",onEnd,{passive:true});
    return()=>{el.removeEventListener("touchstart",onStart);el.removeEventListener("touchmove",onMove);el.removeEventListener("touchend",onEnd);el.removeEventListener("touchcancel",onEnd);};
  },[handleMove,handleEnd]);

  return(
    <div ref={outerRef} style={{position:"relative",userSelect:"none",WebkitUserSelect:"none" as any,cursor:"crosshair"}}
      onMouseMove={e=>handleMove(e.clientX)} onMouseLeave={handleEnd}>
      <div ref={wrapperRef}><ChartCanvas config={config} deps={deps} height={height}/></div>
      <canvas ref={overlayRef} style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",pointerEvents:"none"}}/>
    </div>
  );
}

const GOLFER_SUBTABS=[
  {id:"overview",label:"OVERVIEW"},
  {id:"performance",label:"PERFORMANCE"},
  {id:"pairings",label:"PAIRINGS"},
];

function GolferSubNav({view,setView}:{view:string;setView:(v:string)=>void}){
  const btnRefs=useRef<(HTMLButtonElement|null)[]>([]);
  const [inkStyle,setInkStyle]=useState<{left:number;width:number}|null>(null);

  useLayoutEffect(()=>{
    const idx=GOLFER_SUBTABS.findIndex(t=>t.id===view);
    const el=btnRefs.current[idx];
    if(!el)return;
    const parent=el.parentElement;
    if(!parent)return;
    const parentRect=parent.getBoundingClientRect();
    const elRect=el.getBoundingClientRect();
    setInkStyle({left:elRect.left-parentRect.left,width:elRect.width});
  },[view]);

  return(
    <div style={{position:"relative",display:"flex",gap:20,marginBottom:16,paddingBottom:0}}>
      {GOLFER_SUBTABS.map((t,i)=>(
        <button
          key={t.id}
          ref={el=>{btnRefs.current[i]=el;}}
          onClick={()=>setView(t.id)}
          style={{
            background:"none",border:"none",cursor:"pointer",
            padding:"0 4px 12px",
            fontSize:12,fontWeight:700,
            color:view===t.id?"var(--text-primary)":"var(--text-muted)",
            WebkitTapHighlightColor:"transparent",
            transition:"color 0.2s",
            letterSpacing:"0.07em",
            textTransform:"uppercase",
          }}
        >
          {t.label}
        </button>
      ))}
      {/* Track line */}
      <div style={{
        position:"absolute",bottom:0,left:0,right:0,
        height:1,background:"var(--border)",
      }}/>
      {/* Ink indicator */}
      {inkStyle&&(
        <div style={{
          position:"absolute",bottom:0,
          left:inkStyle.left,
          width:inkStyle.width,
          height:2,
          background:"var(--green-700)",
          borderRadius:2,
          transition:"left 0.28s cubic-bezier(0.4,0,0.2,1), width 0.28s cubic-bezier(0.4,0,0.2,1)",
        }}/>
      )}
    </div>
  );
}

export function GolferHistoryChart({golfer,rounds,seasonData,leaderboard,golfers,seasonEvents,holeScores,courses,signups}:any){
  const [expandedRound,setExpandedRound]=useState<number|null>(null);
  const [golferSubTab,setGolferSubTab]=useState("overview");
  const [donutKey,setDonutKey]=useState(0);
  useEffect(()=>{ setDonutKey(k=>k+1); },[golfer.golfer_id]);
  const avg=rounds.reduce((s:number,r:any)=>s+r.pts,0)/rounds.length;
  const best=Math.max(...rounds.map((r:any)=>r.pts));
  const worst=Math.min(...rounds.map((r:any)=>r.pts));
  const totalEarned=rounds.reduce((s:number,r:any)=>s+r.earned,0);
  const netEarnings=totalEarned-(rounds.length*20);

  // -- Gross score averages from hole-by-hole data --
  const grossAvgStats=(()=>{
    // Accumulate per-round totals so we average round scores, not individual holes
    const f9Totals:number[]=[], b9Totals:number[]=[], totalTotals:number[]=[];
    const f9ParTotals:number[]=[], b9ParTotals:number[]=[];
    const parBuckets:{[k:number]:{gross:number[],pts:number[]}}={3:{gross:[],pts:[]},4:{gross:[],pts:[]},5:{gross:[],pts:[]}};
    rounds.forEach((r:any)=>{
      const lbEntry=leaderboard.find((lb:any)=>lb.event_id===r.eid&&lb.golfer_id===golfer.golfer_id);
      if(!lbEntry||lbEntry.entry_type!=="Hole-by-Hole")return;
      const hs=holeScores.filter((h:any)=>h.summary_id===lbEntry.summary_id).sort((a:any,b:any)=>a.hole_number-b.hole_number);
      if(!hs.length)return;
      const course=courses.find((c:any)=>c.course_name===r.course);
      const pars:number[]=course?.hole_pars||[];
      let f9=0,b9=0,f9par=0,b9par=0,f9count=0,b9count=0;
      hs.forEach((h:any)=>{
        if(h.gross_score==null)return;
        const par=pars[h.hole_number-1]||0;
        if(h.hole_number<=9){f9+=h.gross_score;f9par+=par;f9count++;}
        else{b9+=h.gross_score;b9par+=par;b9count++;}
        if(par===3||par===4||par===5){
          parBuckets[par].gross.push(h.gross_score);
          if(h.stableford_points!=null)parBuckets[par].pts.push(h.stableford_points);
        }
      });
      if(f9count>0){f9Totals.push(f9);f9ParTotals.push(f9par);}
      if(b9count>0){b9Totals.push(b9);b9ParTotals.push(b9par);}
      if(f9count>0&&b9count>0)totalTotals.push(f9+b9);
    });
    const mean=(arr:number[])=>arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:null;
    const f9=mean(f9Totals), b9=mean(b9Totals), total=mean(totalTotals);
    const f9par=mean(f9ParTotals), b9par=mean(b9ParTotals);
    const totalDelta=(f9!=null&&f9par!=null&&b9!=null&&b9par!=null)?((f9+b9)-(f9par+b9par)):null;
    return{
      f9, b9, total, totalDelta,
      f9delta:(f9!=null&&f9par!=null)?f9-f9par:null,
      b9delta:(b9!=null&&b9par!=null)?b9-b9par:null,
      par3gross:mean(parBuckets[3].gross),par3pts:mean(parBuckets[3].pts),
      par4gross:mean(parBuckets[4].gross),par4pts:mean(parBuckets[4].pts),
      par5gross:mean(parBuckets[5].gross),par5pts:mean(parBuckets[5].pts),
      hasData:f9Totals.length>0||b9Totals.length>0,
    };
  })();

  // Distance bucket stats from hole-by-hole data
  const distanceBuckets=(()=>{
    const par3Buckets=[
      {label:"100",min:100,max:149,gross:[] as number[]},
      {label:"150",min:150,max:199,gross:[] as number[]},
      {label:"200",min:200,max:249,gross:[] as number[]},
      {label:"250+",min:250,max:Infinity,gross:[] as number[]},
    ];
    const par4Buckets=[
      {label:"300",min:0,max:349,gross:[] as number[]},
      {label:"350",min:350,max:399,gross:[] as number[]},
      {label:"400",min:400,max:449,gross:[] as number[]},
      {label:"450+",min:450,max:Infinity,gross:[] as number[]},
    ];
    const par5Buckets=[
      {label:"450",min:450,max:499,gross:[] as number[]},
      {label:"500",min:500,max:549,gross:[] as number[]},
      {label:"550+",min:550,max:Infinity,gross:[] as number[]},
    ];
    rounds.forEach((r:any)=>{
      const lbEntry=leaderboard.find((lb:any)=>lb.event_id===r.eid&&lb.golfer_id===golfer.golfer_id);
      if(!lbEntry||lbEntry.entry_type!=="Hole-by-Hole")return;
      const hs=holeScores.filter((h:any)=>h.summary_id===lbEntry.summary_id);
      if(!hs.length)return;
      const course=courses.find((c:any)=>c.course_name===r.course);
      const pars:number[]=course?.hole_pars||[];
      const yards:number[]=course?.hole_yards||[];
      hs.forEach((h:any)=>{
        if(h.gross_score==null)return;
        const idx=h.hole_number-1;
        const par=pars[idx]||0;
        const yds=yards[idx]||0;
        if(!yds)return;
        const buckets=par===3?par3Buckets:par===4?par4Buckets:par===5?par5Buckets:null;
        if(!buckets)return;
        const b=buckets.find(bk=>yds>=bk.min&&yds<=bk.max);
        if(b)b.gross.push(h.gross_score);
      });
    });
    const mean=(arr:number[])=>arr.length?arr.reduce((a:number,n:number)=>a+n,0)/arr.length:null;
    return{
      par3:par3Buckets.map(b=>({label:b.label,avg:mean(b.gross),count:b.gross.length})),
      par4:par4Buckets.map(b=>({label:b.label,avg:mean(b.gross),count:b.gross.length})),
      par5:par5Buckets.map(b=>({label:b.label,avg:mean(b.gross),count:b.gross.length})),
      hasData:[...par3Buckets,...par4Buckets,...par5Buckets].some(b=>b.gross.length>0),
    };
  })();

  const winFlags=rounds.map((r:any)=>r.won===true);

  const avgPtsSpanRef=useRef<HTMLSpanElement>(null);
  const roundSubLabelRef=useRef<HTMLSpanElement>(null);

  const histConfig = {
    type:"line" as const,
    data:{
      labels:rounds.map((_:any,i:number)=>i),
      datasets:[
        {
          label:"Points",
          data:rounds.map((r:any)=>r.pts),
          borderColor:"#7dc07d",
          backgroundColor:(ctx:any)=>{
            const chart=ctx.chart;
            const {chartArea}=chart;
            if(!chartArea)return"rgba(125,192,125,0.08)";
            const grad=chart.ctx.createLinearGradient(0,chartArea.top,0,chartArea.bottom);
            grad.addColorStop(0,"rgba(125,192,125,0.22)");
            grad.addColorStop(1,"rgba(125,192,125,0.01)");
            return grad;
          },
          pointRadius:rounds.map((_:any,i:number)=>winFlags[i]?4:0),
          pointBackgroundColor:rounds.map((_:any,i:number)=>winFlags[i]?"#e8a020":"transparent"),
          pointBorderColor:"transparent",
          pointBorderWidth:0,
          pointHoverRadius:0,
          fill:true,tension:0.4,borderWidth:2,
        },
        {label:"Avg",data:Array(rounds.length).fill(parseFloat(avg.toFixed(1))),borderColor:"rgba(232,160,32,0.55)",borderDash:[5,4],pointRadius:0,pointHoverRadius:0,fill:false,borderWidth:1.5}
      ]
    },
    options:{responsive:true,maintainAspectRatio:false,
      animation:{duration:0},
      plugins:{legend:{display:false},tooltip:{enabled:false}},
      scales:{
        x:{display:false},
        y:{display:false,min:Math.max(0,worst-4),max:best+3}
      },
      layout:{padding:{left:0,right:0,top:16,bottom:0}},
    }
  };

  // Running avg line for trend arrow
  // rounds is oldest-first; recent = last 2 entries, early = first 2 entries
  const trend=rounds.length>2?(rounds[rounds.length-1].pts+rounds[rounds.length-2].pts)/2-(rounds[0].pts+rounds[1].pts)/2:0;

  // -- Course breakdown --
  const courseBreakdown=(()=>{
    const map2:Record<string,{pts:number[],ranks:number[],players:number[]}>={}; 
    rounds.forEach((r:any)=>{
      if(!map2[r.course])map2[r.course]={pts:[],ranks:[],players:[]};
      map2[r.course].pts.push(r.pts);
      map2[r.course].ranks.push(r.rank);
      map2[r.course].players.push(r.players);
    });
    return Object.entries(map2).map(([course,d])=>({
      course:course.replace(" Golf Club","").replace("Golf Course",""),
      rounds:d.pts.length,
      avgPts:d.pts.reduce((a:number,b:number)=>a+b,0)/d.pts.length,
      avgRank:d.ranks.reduce((a:number,b:number)=>a+b,0)/d.ranks.length,
      avgField:d.players.reduce((a:number,b:number)=>a+b,0)/d.players.length,
    })).sort((a,b)=>b.avgPts-a.avgPts);
  })();

  // -- Rival & Twin --
  const rivalStats=(()=>{
    const gid=golfer.golfer_id;
    const opp:Record<number,{beats:number,loses:number,ties:number}>={};
    if(!leaderboard||!seasonEvents)return{rival:null,twin:null};
    seasonEvents.forEach((ev:any)=>{
      const mine=leaderboard.find((r:any)=>r.event_id===ev.event_id&&r.golfer_id===gid);
      if(!mine)return;
      leaderboard.filter((r:any)=>r.event_id===ev.event_id&&r.golfer_id!==gid&&r.buy_in_paid).forEach((o:any)=>{
        if(!opp[o.golfer_id])opp[o.golfer_id]={beats:0,loses:0,ties:0};
        if(o.total_stableford_points>mine.total_stableford_points)opp[o.golfer_id].beats++;
        else if(mine.total_stableford_points>o.total_stableford_points)opp[o.golfer_id].loses++;
        else opp[o.golfer_id].ties++;
      });
    });
    const ents=Object.entries(opp)
      .filter(([,v])=>(v.beats+v.loses+v.ties)>=2)
      .map(([id,v])=>({id:parseInt(id),...v,total:v.beats+v.loses+v.ties}));
    const rival=ents.length?[...ents].sort((a,b)=>(b.beats/b.total)-(a.beats/a.total))[0]:null;
    const twin=ents.filter(e=>e.ties>0).length?[...ents].sort((a,b)=>(b.ties/b.total)-(a.ties/a.total))[0]:null;
    const rG=rival?golfers.find((g:any)=>g.golfer_id===rival.id):null;
    const tG=twin?golfers.find((g:any)=>g.golfer_id===twin.id):null;
    return{rival:rG?{g:rG,...rival}:null,twin:(tG&&tG.golfer_id!==rG?.golfer_id)?{g:tG,...twin}:null};
  })();

  // ── Scoring fingerprint (computed once, used in OVERVIEW tab) ──
  const fp=computeScoringFingerprint(golfer.golfer_id,seasonEvents,leaderboard,holeScores,courses);
  const leagueGolferIds=[...new Set(
    leaderboard
      .filter((r:any)=>seasonEvents.some((e:any)=>e.event_id===r.event_id))
      .map((r:any)=>r.golfer_id)
  )].filter((gid:any)=>!golfers.find((g:any)=>g.golfer_id===gid)?.is_guest);
  const leagueFingerprints=leagueGolferIds
    .map((gid:any)=>computeScoringFingerprint(gid,seasonEvents,leaderboard,holeScores,courses))
    .filter((f:any)=>f.sampleSize>=1);
  const leagueAvgFp=leagueFingerprints.length?{
    par3:leagueFingerprints.reduce((s:number,f:any)=>s+f.par3,0)/leagueFingerprints.length,
    par4:leagueFingerprints.reduce((s:number,f:any)=>s+f.par4,0)/leagueFingerprints.length,
    par5:leagueFingerprints.reduce((s:number,f:any)=>s+f.par5,0)/leagueFingerprints.length,
    front9:leagueFingerprints.reduce((s:number,f:any)=>s+f.front9,0)/leagueFingerprints.length,
    back9:leagueFingerprints.reduce((s:number,f:any)=>s+f.back9,0)/leagueFingerprints.length,
    consistency:leagueFingerprints.reduce((s:number,f:any)=>s+f.consistency,0)/leagueFingerprints.length,
    sampleSize:leagueFingerprints.length,
  }:null;
  const golferName=`${golfer.first_name} ${golfer.last_name}`;

  return(
    <div>
      <GolferSubNav view={golferSubTab} setView={setGolferSubTab}/>

      {/* ── OVERVIEW ──────────────────────────────────────── */}
      {golferSubTab==="overview"&&(
        <>
          {/* Stat hero cards */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
            <div className="stat-card"><div className="stat-value" style={{fontSize:26}}><CountUp value={avg} decimals={1}/></div><div className="stat-label">Season Avg</div></div>
            <div className="stat-card"><div className="stat-value" style={{fontSize:26}}><CountUp value={rounds.length}/></div><div className="stat-label">Rounds Played</div></div>
            <div className="stat-card"><div className="stat-value" style={{color:"var(--gold-600)",fontSize:26}}><CountUp value={best}/></div><div className="stat-label">Best Round</div></div>
            <div className="stat-card"><div className="stat-value" style={{color:"var(--red-600)",fontSize:26}}><CountUp value={worst}/></div><div className="stat-label">Worst Round</div></div>
          </div>

          {/* Earnings summary */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
            <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",padding:"12px",textAlign:"center",boxShadow:"var(--shadow-sm)"}}>
              <div style={{fontSize:22,fontWeight:700,color:"var(--green-700)"}}><CountUp value={totalEarned} prefix="$"/></div>
              <div style={{fontSize:12,color:"var(--text-muted)",fontWeight:500}}>Stableford Earned</div>
            </div>
            <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",padding:"12px",textAlign:"center",boxShadow:"var(--shadow-sm)"}}>
              <div style={{fontSize:22,fontWeight:700,color:netEarnings>=0?"var(--green-700)":"var(--red-600)"}}><CountUp value={Math.abs(netEarnings)} prefix={netEarnings>=0?"+$":"-$"}/></div>
              <div style={{fontSize:12,color:"var(--text-muted)",fontWeight:500}}>Net (−Entry Fees)</div>
            </div>
          </div>

          {/* Trend indicator */}
          {rounds.length>3&&(
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,padding:"10px 14px",background:"var(--surface)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",boxShadow:"var(--shadow-sm)"}}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={trend>0?"var(--green-700)":trend<0?"var(--red-600)":"var(--text-muted)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {trend>0
                  ?<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
                  :trend<0
                  ?<polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/>
                  :<line x1="5" y1="12" x2="19" y2="12"/>
                }
                {trend>0&&<polyline points="17 6 23 6 23 12"/>}
                {trend<0&&<polyline points="17 18 23 18 23 12"/>}
              </svg>
              <div>
                <div style={{fontSize:14,fontWeight:600,color:trend>0?"var(--green-700)":trend<0?"var(--red-600)":"var(--text-muted)"}}>
                  {trend>0?"Trending up":trend<0?"Trending down":"Holding steady"} {Math.abs(trend)>0.1?`(${trend>0?"+":""}${trend.toFixed(1)} pts recent vs early)`:""}</div>
                <div style={{fontSize:12,color:"var(--text-muted)"}}>Based on comparing first vs last rounds this season</div>
              </div>
            </div>
          )}

          {/* Scoring Fingerprint */}
          <div style={{background:"var(--green-900)",borderRadius:"var(--radius-md)",padding:16,marginBottom:16}}>
            <div style={{fontSize:14,letterSpacing:"0.12em",textTransform:"uppercase",color:"rgba(255,255,255,0.4)",fontWeight:700,marginBottom:10}}>
              Scoring fingerprint
            </div>
            <ScoringFingerprintRadar
              datasets={[
                ...(leagueAvgFp?[{label:"League avg",color:"rgba(212,168,67,0.75)",fill:"rgba(212,168,67,0.08)",values:leagueAvgFp,dashed:true}]:[]),
                {label:golferName,color:"#7dc07d",fill:"rgba(125,200,125,0.18)",values:fp},
              ]}
              darkMode
            />
            <div style={{display:"flex",gap:16,justifyContent:"center",marginTop:8,flexWrap:"wrap"}}>
              {leagueAvgFp&&(
                <div style={{display:"flex",alignItems:"center",gap:5,fontSize:13,color:"rgba(255,255,255,0.55)"}}>
                  <div style={{width:14,height:3,background:"rgba(212,168,67,0.75)",borderRadius:2}}/>
                  League avg
                </div>
              )}
              <div style={{display:"flex",alignItems:"center",gap:5,fontSize:13,color:"rgba(255,255,255,0.6)"}}>
                <div style={{width:10,height:10,borderRadius:"50%",background:"#7dc07d"}}/>
                {golferName}
              </div>
            </div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.3)",marginTop:6,textAlign:"center"}}>
              Avg Stableford pts per hole category · {fp.sampleSize} round{fp.sampleSize===1?"":"s"}
            </div>
          </div>

          {/* Rival & Twin */}
          {(rivalStats.rival||rivalStats.twin)&&(
            <div style={{marginBottom:16}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                {rivalStats.rival&&(
                  <div style={{background:"rgba(192,32,32,0.07)",border:"1.5px solid rgba(192,32,32,0.25)",borderRadius:"var(--radius-md)",padding:"14px 12px",textAlign:"center",boxShadow:"var(--shadow-sm)"}}>
                    <div style={{fontSize:15,fontWeight:700,color:"var(--red-600)",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:6}}>Rival</div>
                    <div style={{fontSize:18,fontWeight:700,marginBottom:4}}>{rivalStats.rival.g.first_name} {rivalStats.rival.g.last_name}</div>
                    <div style={{fontSize:12,color:"var(--text-muted)",lineHeight:1.6}}>
                      Beats you {rivalStats.rival.beats}/{rivalStats.rival.total} events<br/>
                      <span style={{color:"var(--red-500)",fontWeight:600}}>{Math.round(rivalStats.rival.beats/rivalStats.rival.total*100)}% win rate vs you</span>
                    </div>
                  </div>
                )}
                {rivalStats.twin&&(
                  <div style={{background:"rgba(26,115,64,0.07)",border:"1.5px solid rgba(26,115,64,0.25)",borderRadius:"var(--radius-md)",padding:"14px 12px",textAlign:"center",boxShadow:"var(--shadow-sm)"}}>
                    <div style={{fontSize:15,fontWeight:700,color:"var(--green-700)",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:6}}>Twin</div>
                    <div style={{fontSize:18,fontWeight:700,marginBottom:4}}>{rivalStats.twin.g.first_name} {rivalStats.twin.g.last_name}</div>
                    <div style={{fontSize:12,color:"var(--text-muted)",lineHeight:1.6}}>
                      Tied scores {rivalStats.twin.ties}/{rivalStats.twin.total} events<br/>
                      <span style={{color:"var(--green-600)",fontWeight:600}}>{Math.round(rivalStats.twin.ties/rivalStats.twin.total*100)}% match rate</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── PERFORMANCE ───────────────────────────────────── */}
      {golferSubTab==="performance"&&(
        <>
          {/* Avg score summary */}
          {grossAvgStats.hasData&&(
            <div style={{marginBottom:16,background:"var(--green-900)",borderRadius:"var(--radius-md)",padding:"16px 12px"}}>
              <div style={{fontSize:14,fontWeight:700,letterSpacing:"0.12em",textTransform:"uppercase",color:"rgba(255,255,255,0.4)",marginBottom:14}}>Avg Scores</div>

              {/* Donut + flanking stats */}
              {(()=>{
                const f9=grossAvgStats.f9??0;
                const b9=grossAvgStats.b9??0;
                const total=f9+b9||1;
                const f9Frac=f9/total;
                const SIZE=160,CX=80,CY=80,R=62,STROKE=18;
                const CIRC=2*Math.PI*R;
                const f9Dash=f9Frac*CIRC;
                const b9Dash=CIRC-f9Dash;
                const GAP=5;
                const f9Color="#7dc07d";
                const b9Color="#c47800";
                const totalDelta=grossAvgStats.totalDelta;
                return(
                  <div style={{display:"flex",alignItems:"center",gap:0}}>
                    {/* Front 9 stat — left */}
                    <div style={{flex:"0 0 80px",textAlign:"center"}}>
                      <div style={{fontSize:12,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",color:f9Color,marginBottom:5}}>Front 9</div>
                      <div style={{fontSize:24,fontWeight:700,color:"white",lineHeight:1,fontVariantNumeric:"tabular-nums"}}>
                        {grossAvgStats.f9!=null?grossAvgStats.f9.toFixed(1):"—"}
                      </div>
                      {grossAvgStats.f9delta!=null&&(
                        <div style={{fontSize:13,fontWeight:700,color:"rgba(255,255,255,0.45)",marginTop:3}}>
                          {grossAvgStats.f9delta>0?"+":""}{grossAvgStats.f9delta.toFixed(1)}
                        </div>
                      )}
                    </div>

                    {/* Donut — flex-grow so it claims the center space */}
                    <div style={{flex:1,display:"flex",justifyContent:"center"}}>
                      <svg key={donutKey} width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
                        <defs>
                          <linearGradient id="donut-b9-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#e8a020"/>
                            <stop offset="100%" stopColor="#c47800"/>
                          </linearGradient>
                          <linearGradient id="donut-f9-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#a8dba8"/>
                            <stop offset="100%" stopColor="#4a9b6f"/>
                          </linearGradient>
                          {/* strokeDashoffset keyframes: sweep from full-hidden to final position */}
                          <style>{`
                            @keyframes donut-b9-draw {
                              from { stroke-dashoffset: ${CIRC/4+CIRC}; opacity: 0; }
                              to   { stroke-dashoffset: ${CIRC/4}; opacity: 1; }
                            }
                            @keyframes donut-f9-draw {
                              from { stroke-dashoffset: ${CIRC/4-b9Dash+CIRC}; opacity: 0; }
                              to   { stroke-dashoffset: ${CIRC/4-b9Dash}; opacity: 1; }
                            }
                          `}</style>
                        </defs>
                        {/* Track */}
                        <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={STROKE}/>
                        {/* Back 9 arc */}
                        <circle
                          cx={CX} cy={CY} r={R}
                          fill="none" stroke="url(#donut-b9-grad)" strokeWidth={STROKE} strokeLinecap="round"
                          strokeDasharray={`${Math.max(0,b9Dash-GAP)} ${CIRC-(b9Dash-GAP)}`}
                          strokeDashoffset={CIRC/4}
                          style={{animation:"donut-b9-draw 0.8s cubic-bezier(0.4,0,0.2,1) both"}}
                        />
                        {/* Front 9 arc */}
                        <circle
                          cx={CX} cy={CY} r={R}
                          fill="none" stroke="url(#donut-f9-grad)" strokeWidth={STROKE} strokeLinecap="round"
                          strokeDasharray={`${Math.max(0,f9Dash-GAP)} ${CIRC-(f9Dash-GAP)}`}
                          strokeDashoffset={CIRC/4-b9Dash}
                          style={{animation:"donut-f9-draw 0.8s cubic-bezier(0.4,0,0.2,1) 0.15s both"}}
                        />
                        {/* Center text */}
                        <text x={CX} y={CY-(totalDelta!=null?22:14)} textAnchor="middle" dominantBaseline="middle"
                          fontSize={11} fontWeight={700} fill="rgba(255,255,255,0.4)" fontFamily="'DM Sans',sans-serif"
                          style={{textTransform:"uppercase",letterSpacing:"0.08em"}}>
                          18 HOLES
                        </text>
                        <text x={CX} y={CY+(totalDelta!=null?2:6)} textAnchor="middle" dominantBaseline="middle"
                          fontSize={29} fontWeight={700} fill="white" fontFamily="'DM Sans',sans-serif">
                          {grossAvgStats.total!=null?grossAvgStats.total.toFixed(1):"—"}
                        </text>
                        {totalDelta!=null&&(
                          <text x={CX} y={CY+26} textAnchor="middle" dominantBaseline="middle"
                            fontSize={13} fontWeight={700} fill="rgba(255,255,255,0.45)" fontFamily="'DM Sans',sans-serif">
                            {totalDelta>0?"+":""}{totalDelta.toFixed(1)}
                          </text>
                        )}
                      </svg>
                    </div>

                    {/* Back 9 stat — right */}
                    <div style={{flex:"0 0 80px",textAlign:"center"}}>
                      <div style={{fontSize:12,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",color:b9Color,marginBottom:5}}>Back 9</div>
                      <div style={{fontSize:24,fontWeight:700,color:"white",lineHeight:1,fontVariantNumeric:"tabular-nums"}}>
                        {grossAvgStats.b9!=null?grossAvgStats.b9.toFixed(1):"—"}
                      </div>
                      {grossAvgStats.b9delta!=null&&(
                        <div style={{fontSize:13,fontWeight:700,color:"rgba(255,255,255,0.45)",marginTop:3}}>
                          {grossAvgStats.b9delta>0?"+":""}{grossAvgStats.b9delta.toFixed(1)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Par type breakdown */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginTop:14}}>
                {([
                  {label:"Par 3",gross:grossAvgStats.par3gross,pts:grossAvgStats.par3pts,leagueAvg:leagueAvgFp?.par3??null},
                  {label:"Par 4",gross:grossAvgStats.par4gross,pts:grossAvgStats.par4pts,leagueAvg:leagueAvgFp?.par4??null},
                  {label:"Par 5",gross:grossAvgStats.par5gross,pts:grossAvgStats.par5pts,leagueAvg:leagueAvgFp?.par5??null},
                ] as any[]).map((b:any)=>{
                  const isStrength=b.pts!=null&&b.leagueAvg!=null&&b.pts>b.leagueAvg;
                  const isWeakness=b.pts!=null&&b.leagueAvg!=null&&b.pts<b.leagueAvg;
                  return(
                  <div key={b.label} style={{background:"rgba(255,255,255,0.06)",borderRadius:"var(--radius-sm,6px)",padding:"10px 8px",textAlign:"center"}}>
                    <div style={{fontSize:12,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",color:"rgba(255,255,255,0.4)",marginBottom:4}}>{b.label}</div>
                    {b.gross!=null?(
                      <>
                        <div style={{fontSize:24,fontWeight:700,color:"white",lineHeight:1,fontVariantNumeric:"tabular-nums"}}>{b.gross.toFixed(1)}</div>
                        {(isStrength||isWeakness)&&(
                          <div style={{fontSize:9,fontWeight:800,letterSpacing:"0.08em",textTransform:"uppercase",marginTop:4,color:isStrength?"#7dc07d":"#e07070"}}>
                            {isStrength?"Strength":"Weakness"}
                          </div>
                        )}
                        {b.pts!=null&&(
                          <div style={{fontSize:11,color:"rgba(255,255,255,0.4)",marginTop:2}}>{b.pts.toFixed(1)} pts avg</div>
                        )}
                      </>
                    ):(
                      <div style={{fontSize:16,color:"rgba(255,255,255,0.3)"}}>—</div>
                    )}
                  </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Distance breakdown bar chart */}
          {distanceBuckets.hasData&&(()=>{
            const Y_MAX=8;
            const BAR_H=140;
            const sections=[
              {title:"Par 3",color:"#7dc07d",barGrad:"linear-gradient(to top,#4a9b6f,#a8dba8)",buckets:distanceBuckets.par3},
              {title:"Par 4",color:"#4a9b6f",barGrad:"linear-gradient(to top,#2d6a4f,#7dc07d)",buckets:distanceBuckets.par4},
              {title:"Par 5",color:"#c47800",barGrad:"linear-gradient(to top,#a05c00,#e8a020)",buckets:distanceBuckets.par5},
            ].filter(s=>s.buckets.some(b=>b.avg!=null));
            return(
              <div style={{marginBottom:20}}>
                <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.12em",textTransform:"uppercase",color:"rgba(255,255,255,0.4)",marginBottom:0}}/>
                <div style={{background:"var(--green-900)",borderRadius:"var(--radius-md)",padding:"16px 12px 12px"}}>
                  <div style={{fontSize:14,fontWeight:700,letterSpacing:"0.12em",textTransform:"uppercase",color:"rgba(255,255,255,0.4)",marginBottom:14}}>Scoring by Distance</div>
                  <div style={{display:"flex",alignItems:"flex-end",gap:0}}>
                    {sections.map((sec,si)=>{
                      const activeBuckets=sec.buckets.filter(b=>b.avg!=null);
                      return(
                        <div key={sec.title} style={{display:"flex",flex:activeBuckets.length,minWidth:0,gap:0}}>
                          {/* Divider between groups */}
                          {si>0&&(
                            <div style={{width:1,background:"rgba(255,255,255,0.1)",alignSelf:"stretch",marginBottom:32,flexShrink:0,marginTop:0}}/>
                          )}
                          <div style={{display:"flex",flex:1,flexDirection:"column",minWidth:0}}>
                            {/* Bars row */}
                            <div style={{display:"flex",alignItems:"flex-end",gap:3,height:BAR_H,paddingLeft:si>0?6:0,paddingRight:si<sections.length-1?6:0}}>
                              {activeBuckets.map(b=>{
                                const heightPx=Math.max(3,Math.min(1,(b.avg as number)/Y_MAX)*BAR_H);
                                return(
                                  <div key={b.label} style={{display:"flex",flexDirection:"column",alignItems:"center",flex:1,minWidth:0,justifyContent:"flex-end",height:BAR_H}}>
                                    <div style={{fontSize:14,fontWeight:700,color:"rgba(255,255,255,0.85)",marginBottom:3,fontVariantNumeric:"tabular-nums",lineHeight:1,whiteSpace:"nowrap"}}>
                                      {(b.avg as number).toFixed(1)}
                                    </div>
                                    <div style={{width:"75%",height:heightPx,background:sec.barGrad,borderRadius:"3px 3px 0 0",opacity:0.9}}/>
                                  </div>
                                );
                              })}
                            </div>
                            {/* X labels row */}
                            <div style={{display:"flex",gap:3,paddingLeft:si>0?6:0,paddingRight:si<sections.length-1?6:0,marginTop:4}}>
                              {activeBuckets.map(b=>(
                                <div key={b.label} style={{flex:1,minWidth:0,textAlign:"center",fontSize:12,color:"rgba(255,255,255,0.35)",fontWeight:600,letterSpacing:"0.03em"}}>
                                  {b.label}
                                </div>
                              ))}
                            </div>
                            {/* Group label */}
                            <div style={{textAlign:"center",marginTop:6,fontSize:14,fontWeight:700,letterSpacing:"0.07em",textTransform:"uppercase",color:sec.color,paddingLeft:si>0?6:0,paddingRight:si<sections.length-1?6:0}}>
                              {sec.title}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Round history chart */}
          <div style={{background:"var(--green-900)",borderRadius:"var(--radius-md)",padding:"14px 0 12px",marginBottom:16}}>
            {/* Header */}
            <div style={{display:"flex",alignItems:"center",padding:"0 14px",marginBottom:4}}>
              <div style={{flex:1}}/>
              <div style={{fontSize:14,fontWeight:700,letterSpacing:"0.12em",textTransform:"uppercase",color:"rgba(255,255,255,0.4)"}}>Round History</div>
              <div style={{flex:1,display:"flex",justifyContent:"flex-end"}}>
                {winFlags.some(Boolean)&&(
                  <span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11,color:"rgba(255,255,255,0.4)"}}>
                    <span style={{width:7,height:7,borderRadius:"50%",background:"#e8a020",display:"inline-block"}}/>Win
                  </span>
                )}
              </div>
            </div>
            {/* Big scrubbing number */}
            <div style={{padding:"0 14px",marginBottom:2}}>
              <span ref={avgPtsSpanRef} style={{fontSize:44,fontWeight:700,fontVariantNumeric:"tabular-nums",lineHeight:1,color:"white"}}>
                {avg.toFixed(1)}
              </span>
            </div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.35)",padding:"0 14px",marginBottom:8}}><span ref={roundSubLabelRef}>avg pts / round</span></div>
            {/* Chart — bleeds to card edges */}
            <div style={{margin:"0 0"}}>
              <RoundScrubber
                config={histConfig}
                deps={[golfer.golfer_id,rounds.length]}
                height={160}
                rounds={rounds}
                winFlags={winFlags}
                avgPtsSpanRef={avgPtsSpanRef}
                subLabelRef={roundSubLabelRef}
                baseAvg={parseFloat(avg.toFixed(1))}
              />
            </div>
          </div>

          {/* Course Breakdown */}
          {courseBreakdown.length>0&&(
            <div style={{marginTop:8,marginBottom:16}}>
              <div className="card-title" style={{marginBottom:8}}>Performance by Course</div>
              <div style={{background:"var(--surface)",borderRadius:"var(--radius-md)",border:"1px solid var(--border)",overflow:"hidden",boxShadow:"var(--shadow-sm)"}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 48px 64px 72px",padding:"8px 12px",background:"var(--green-900)"}}>
                  {["Course","Rds","Avg Pts","Avg Finish"].map((h:string,i:number)=>(
                    <div key={i} style={{fontSize:11,fontWeight:700,color:"var(--gold-300)",letterSpacing:"0.06em",textTransform:"uppercase",textAlign:i>0?"center":"left"}}>{h}</div>
                  ))}
                </div>
                {courseBreakdown.map((c:any,i:number)=>(
                  <div key={c.course} style={{display:"grid",gridTemplateColumns:"1fr 48px 64px 72px",padding:"10px 12px",borderBottom:"1px solid var(--border)",background:i%2===1?"var(--surface2)":"transparent",alignItems:"center"}}>
                    <div style={{fontSize:14,fontWeight:600}}>{c.course}</div>
                    <div style={{textAlign:"center",fontSize:14,color:"var(--text-muted)"}}>{c.rounds}</div>
                    <div style={{textAlign:"center",fontWeight:700,fontSize:16,color:"var(--green-700)"}}>{c.avgPts.toFixed(1)}</div>
                    <div style={{textAlign:"center",fontSize:14}}>
                      {c.avgRank.toFixed(1)}<span style={{fontSize:11,color:"var(--text-muted)"}}>/{c.avgField.toFixed(0)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Per-round list */}
          <div className="card-title" style={{marginBottom:8}}>Round-by-Round</div>
          <div style={{background:"var(--surface)",borderRadius:"var(--radius-md)",border:"1px solid var(--border)",boxShadow:"var(--shadow-sm)"}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 48px 64px 52px",background:"var(--green-900)",padding:"9px 10px",borderRadius:"var(--radius-md) var(--radius-md) 0 0"}}>
              <div style={{color:"var(--gold-300)",fontSize:12,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase"}}>Date / Course</div>
              <div style={{color:"var(--gold-300)",fontSize:12,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",textAlign:"center"}}>Pts</div>
              <div style={{color:"var(--gold-300)",fontSize:12,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",textAlign:"center"}}>Rank</div>
              <div style={{color:"var(--gold-300)",fontSize:12,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",textAlign:"right"}}>$</div>
            </div>
            {[...rounds].reverse().map((r:any,i:number)=>{
              const dt=new Date(r.date+"T00:00:00");
              const shortDate=dt.toLocaleDateString("en-US",{month:"short",day:"numeric"});
              const courseShort=r.course.replace(" Golf Club","").replace(" GC","").replace("Golf Course","").split(" ").slice(0,2).join(" ");
              const lbEntry=leaderboard.find((lb:any)=>lb.event_id===r.eid&&lb.golfer_id===golfer.golfer_id);
              const hasHbh=lbEntry?.entry_type==="Hole-by-Hole";
              const isExpanded=expandedRound===r.eid;
              const hbhScores=hasHbh?holeScores.filter((hs:any)=>hs.summary_id===lbEntry.summary_id).sort((a:any,b:any)=>a.hole_number-b.hole_number):[];
              const course=courses.find((c:any)=>c.course_name===r.course);
              const front9=hbhScores.slice(0,9);
              const back9=hbhScores.slice(9,18);
              const front9Gross=front9.reduce((s:number,h:any)=>s+(h.gross_score||0),0);
              const back9Gross=back9.reduce((s:number,h:any)=>s+(h.gross_score||0),0);
              const front9Pts=front9.reduce((s:number,h:any)=>s+(h.stableford_points||0),0);
              const back9Pts=back9.reduce((s:number,h:any)=>s+(h.stableford_points||0),0);
              const f9pars=course?.hole_pars?.slice(0,9)||[];
              const b9pars=course?.hole_pars?.slice(9,18)||[];
              const totPar=(course?.hole_pars||[]).reduce((a:number,b:number)=>a+b,0)||"";
              const totGross=front9Gross+back9Gross||"";
              const totPts=front9Pts+back9Pts;
              const rowBg=i%2===1?"var(--surface2)":"var(--surface)";
              return(
                <div key={r.eid}>
                  <div
                    style={{display:"grid",gridTemplateColumns:"1fr 48px 64px 52px",padding:"10px 10px",background:rowBg,borderTop:"1px solid var(--border)",cursor:hasHbh?"pointer":"default",alignItems:"center"}}
                    onClick={()=>{if(hasHbh)setExpandedRound(isExpanded?null:r.eid);}}
                  >
                    <div>
                      <div style={{fontWeight:600,fontSize:15,color:"var(--text-primary)",alignItems:"center",gap:6}}>
                        {shortDate}
                        {hasHbh&&<span style={{fontSize:11,color:"var(--green-700)",fontWeight:700}}>{isExpanded?"▲":"▼"}</span>}
                      </div>
                      <div style={{fontSize:13,color:"var(--text-muted)",marginTop:1}}>{courseShort}</div>
                    </div>
                    <div style={{textAlign:"center",fontWeight:700,color:"var(--green-700)",fontSize:18}}>{r.pts}</div>
                    <div style={{textAlign:"center",fontSize:14,color:"var(--text-muted)"}}>{r.rank}<span style={{fontSize:11}}>/{r.players}</span></div>
                    <div style={{textAlign:"right",fontWeight:700,fontSize:15,color:r.earned>0?"var(--gold-600)":"var(--text-muted)"}}>{r.earned>0?`$${r.earned.toFixed(0)}`:"--"}</div>
                  </div>
                  {isExpanded&&hbhScores.length>0&&course&&(
                    <div className="lb-detail" style={{padding:"10px 5px"}}>
                      <div className="scorecard-wrap">
                        <table className="scorecard-table">
                          <colgroup>
                            <col style={{width:"10%"}}/>
                            {Array.from({length:9},(_,ci)=><col key={ci} style={{width:"7%"}}/>)}
                            <col style={{width:"7%"}}/>
                            <col style={{width:"7%"}}/>
                          </colgroup>
                          <thead>
                            <tr>
                              <th className="label-col" style={{textTransform:"uppercase"}}>HOLE</th>
                              {[1,2,3,4,5,6,7,8,9].map(hNum=><th key={hNum}>{hNum}</th>)}
                              <th className="total-col">OUT</th>
                              <th className="total-col" style={{background:"var(--surface2)",color:"transparent",userSelect:"none"}}>TOT</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td className="label-col" style={{textTransform:"uppercase",fontSize:12}}>PAR</td>
                              {f9pars.map((p:number,pi:number)=><td key={pi} style={{color:"var(--text-muted)",fontSize:13}}>{p}</td>)}
                              <td className="total-col">{f9pars.reduce((a:number,b:number)=>a+b,0)||""}</td>
                              <td className="total-col" style={{background:"var(--surface2)"}}></td>
                            </tr>
                            {front9.length>0&&<tr>
                              <td className="label-col" style={{textTransform:"uppercase",fontSize:12}}>SCORE</td>
                              {front9.map((h:any,hi:number)=>{const par=f9pars[hi];return<td key={hi}>{h.gross_score&&par!=null?<ScoreSymbol gross={h.gross_score} par={par}/>:""}</td>;})}
                              <td className="total-col">{front9Gross||""}</td>
                              <td className="total-col" style={{background:"var(--surface2)"}}></td>
                            </tr>}
                            {front9.length>0&&<tr>
                              <td className="label-col" style={{textTransform:"uppercase",color:"var(--text-muted)",fontSize:12}}>PTS</td>
                              {front9.map((h:any,hi:number)=><td key={hi} style={{fontSize:15,color:"var(--text-muted)"}}>{h.stableford_points!=null?h.stableford_points:""}</td>)}
                              <td className="total-col" style={{color:"var(--green-700)"}}>{front9Pts}</td>
                              <td className="total-col" style={{background:"var(--surface2)"}}></td>
                            </tr>}
                          </tbody>
                          <tbody>
                            <tr style={{borderTop:"2px solid var(--border-md)"}}>
                              <th className="label-col" style={{textTransform:"uppercase",background:"var(--green-900)",color:"var(--gold-300)",fontWeight:700,fontSize:11,padding:"5px 3px 5px 8px",textAlign:"left",whiteSpace:"nowrap"}}>HOLE</th>
                              {[10,11,12,13,14,15,16,17,18].map(hNum=><th key={hNum} style={{background:"var(--green-900)",color:"var(--gold-300)",fontWeight:700,fontSize:11,padding:"5px 3px",textAlign:"center"}}>{hNum}</th>)}
                              <th className="total-col" style={{background:"var(--green-900)",color:"var(--gold-300)",fontWeight:700,fontSize:11,padding:"5px 3px"}}>IN</th>
                              <th className="total-col" style={{background:"var(--green-900)",color:"var(--gold-300)",fontWeight:700,fontSize:11,padding:"5px 3px"}}>TOT</th>
                            </tr>
                            <tr>
                              <td className="label-col" style={{textTransform:"uppercase",fontSize:12}}>PAR</td>
                              {b9pars.map((p:number,pi:number)=><td key={pi} style={{color:"var(--text-muted)",fontSize:14}}>{p}</td>)}
                              <td className="total-col">{b9pars.reduce((a:number,b:number)=>a+b,0)||""}</td>
                              <td className="total-col">{totPar}</td>
                            </tr>
                            {back9.length>0&&<tr>
                              <td className="label-col" style={{textTransform:"uppercase",fontSize:12}}>SCORE</td>
                              {back9.map((h:any,hi:number)=>{const par=b9pars[hi];return<td key={hi}>{h.gross_score&&par!=null?<ScoreSymbol gross={h.gross_score} par={par}/>:""}</td>;})}
                              <td className="total-col">{back9Gross||""}</td>
                              <td className="total-col">{totGross}</td>
                            </tr>}
                            {back9.length>0&&<tr>
                              <td className="label-col" style={{textTransform:"uppercase",color:"var(--text-muted)",fontSize:12}}>PTS</td>
                              {back9.map((h:any,hi:number)=><td key={hi} style={{fontSize:15,color:"var(--text-muted)"}}>{h.stableford_points!=null?h.stableford_points:""}</td>)}
                              <td className="total-col" style={{color:"var(--green-700)"}}>{back9Pts}</td>
                              <td className="total-col" style={{color:"var(--green-700)",fontWeight:700}}>{totPts}</td>
                            </tr>}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── PAIRINGS ──────────────────────────────────────── */}
      {golferSubTab==="pairings"&&(
        <PairingHistory
          golfer={golfer}
          signups={signups}
          seasonEvents={seasonEvents}
          leaderboard={leaderboard}
          golfers={golfers}
        />
      )}
    </div>
  )
}
