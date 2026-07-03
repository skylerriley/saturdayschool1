import { useRef, useEffect, useState } from "react";
import {
  Chart as ChartJS,
  LinearScale, PointElement, LineElement, ScatterController, LineController,
  Filler, Legend, Tooltip,
} from "chart.js";
ChartJS.register(LinearScale, PointElement, LineElement, ScatterController, LineController, Filler, Legend, Tooltip);
import { ChartCanvas } from "./ChartCanvas";

// Least-squares linear regression
function linReg(points: {x:number,y:number}[]) {
  const n = points.length;
  if (n < 2) return null;
  const sumX = points.reduce((s,p)=>s+p.x,0);
  const sumY = points.reduce((s,p)=>s+p.y,0);
  const sumXY = points.reduce((s,p)=>s+p.x*p.y,0);
  const sumX2 = points.reduce((s,p)=>s+p.x*p.x,0);
  const denom = n*sumX2 - sumX*sumX;
  if (denom === 0) return null;
  const m = (n*sumXY - sumX*sumY) / denom;
  const b = (sumY - m*sumX) / n;
  return { m, b };
}

// Pearson R for annotation
function pearsonR(points: {x:number,y:number}[]) {
  const n = points.length;
  if (n < 2) return 0;
  const mx = points.reduce((s,p)=>s+p.x,0)/n;
  const my = points.reduce((s,p)=>s+p.y,0)/n;
  const num = points.reduce((s,p)=>s+(p.x-mx)*(p.y-my),0);
  const den = Math.sqrt(
    points.reduce((s,p)=>s+(p.x-mx)**2,0)*
    points.reduce((s,p)=>s+(p.y-my)**2,0)
  );
  return den===0?0:num/den;
}

export function ScatterChart({scatterData,flightWinData}:any){
  const [visible, setVisible] = useState(false);
  const [barsVisible, setBarsVisible] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const flightCardRef = useRef<HTMLDivElement>(null);

  useEffect(()=>{
    const el = sentinelRef.current; if(!el) return;
    const obs = new IntersectionObserver(([entry])=>{
      if(entry.isIntersecting){ setVisible(true); obs.disconnect(); }
    },{threshold:0.2});
    obs.observe(el);
    return()=>obs.disconnect();
  },[]);

  useEffect(()=>{
    const el = flightCardRef.current; if(!el) return;
    const obs = new IntersectionObserver(([entry])=>{
      if(entry.isIntersecting){ setBarsVisible(true); obs.disconnect(); }
    },{threshold:0.2});
    obs.observe(el);
    return()=>obs.disconnect();
  },[]);

  const points: {x:number,y:number,name:string}[] = scatterData.map((d:any)=>({
    x: d.hcp,
    y: parseFloat(d.avg.toFixed(1)),
    name: d.golfer.first_name+" "+d.golfer.last_name,
  }));

  const reg = linReg(points);
  const r = pearsonR(points);
  const rLabel = r >= 0 ? `r = +${r.toFixed(2)}` : `r = ${r.toFixed(2)}`;

  // Regression line: two x endpoints covering data range
  const xVals = points.map(p=>p.x);
  const xMin = xVals.length ? Math.min(...xVals) - 1 : 0;
  const xMax = xVals.length ? Math.max(...xVals) + 1 : 30;
  const regLine = reg
    ? [{x:xMin,y:parseFloat((reg.m*xMin+reg.b).toFixed(2))},{x:xMax,y:parseFloat((reg.m*xMax+reg.b).toFixed(2))}]
    : [];

  const correlationColor = r < -0.3 ? "#c47800" : r > 0.3 ? "#dc2626" : "#888";
  const correlationLabel = Math.abs(r) > 0.5
    ? (r < 0 ? "Lower HCP → Higher Pts (strong)" : "Higher HCP → Higher Pts (strong)")
    : Math.abs(r) > 0.25
    ? (r < 0 ? "Slight negative trend" : "Slight positive trend")
    : "No clear correlation";

  const DOT_R = 10;
  // Per-dot opacity values + chart instance ref, both used in the plugin closure
  const dotOpacities = useRef<number[]>([]);
  const rafDots = useRef<number>(0);
  const chartRef = useRef<any>(null);

  useEffect(()=>{
    if(!visible)return;
    cancelAnimationFrame(rafDots.current);
    const n=points.length;
    dotOpacities.current=Array(n).fill(0);
    const STAGGER=60;
    const FADE=400;
    const start=performance.now();
    const tick=(now:number)=>{
      let done=true;
      for(let i=0;i<n;i++){
        const elapsed=now-start-i*STAGGER;
        if(elapsed<=0){done=false;continue;}
        const t=Math.min(1,elapsed/FADE);
        dotOpacities.current[i]=t*t*(3-2*t);
        if(t<1)done=false;
      }
      chartRef.current?.draw();
      if(!done)rafDots.current=requestAnimationFrame(tick);
    };
    rafDots.current=requestAnimationFrame(tick);
    return()=>cancelAnimationFrame(rafDots.current);
  },[visible,points.length]);

  const dotGradientPlugin = {
    id:"dotGradient",
    afterInit:(chart:any)=>{ chartRef.current=chart; },
    afterDatasetsDraw:(chart:any)=>{
      const meta=chart.getDatasetMeta(0);
      if(!meta||!visible)return;
      const ctx=chart.ctx;
      meta.data.forEach((pt:any,idx:number)=>{
        const {x,y}=pt.getProps(["x","y"],true);
        const opacity=dotOpacities.current[idx]??1;
        const r=pt.options?.radius??DOT_R;
        ctx.save();
        ctx.globalAlpha=opacity;
        const grad=ctx.createLinearGradient(x,y-r,x,y+r);
        grad.addColorStop(0,"#a8d8a8");
        grad.addColorStop(1,"#2d6a4f");
        ctx.beginPath();
        ctx.arc(x,y,r,0,Math.PI*2);
        ctx.fillStyle=grad;
        ctx.fill();
        ctx.restore();
      });
    },
  };

  const config = {
    type:"scatter" as const,
    data:{
      datasets:[
        {
          type:"scatter" as const,
          label:"Golfers",
          data: points,
          backgroundColor: "transparent",
          borderColor: "transparent",
          pointRadius: DOT_R,
          pointHoverRadius: DOT_R+3,
          order: 2,
        },
        ...(reg && regLine.length ? [{
          type:"line" as const,
          label:`Trend (${rLabel})`,
          data: regLine,
          borderColor: correlationColor,
          backgroundColor: "transparent",
          borderWidth: 2.5,
          borderDash: [8,5],
          pointRadius: 0,
          fill: false,
          tension: 0,
          order: 1,
        }] : []),
      ]
    },
    plugins:[dotGradientPlugin],
    options:{
      responsive:true,maintainAspectRatio:false,
      animation:{
        duration: 0,
      },
      plugins:{
        legend:{display:true,labels:{color:"rgba(255,255,255,0.6)",font:{size:11},boxWidth:16,usePointStyle:true}},
        tooltip:{callbacks:{
          label:(c:any)=>{
            if(c.datasetIndex===1)return "";
            return(c.raw.name+": HCP "+c.raw.x+" - "+c.raw.y.toFixed(1)+" pts avg");
          }
        }}
      },
      scales:{
        x:{title:{display:false},ticks:{color:"rgba(255,255,255,0.5)"},grid:{display:false}},
        y:{title:{display:false},ticks:{color:"rgba(255,255,255,0.5)"},grid:{display:false},max:35}
      }
    }
  };

  const hasFlightData=flightWinData&&flightWinData.some((d:any)=>d.appearances>0);
  const maxFlightPct=hasFlightData?Math.max(...flightWinData.map((d:any)=>d.winPct),1):1;
  // Flight fill colors by band index
  const FLIGHT_COLORS=["#155c32","#1a7340","#c47800","#9a5a00","#6b5240"];

  const darkCard={background:"var(--green-900)",borderRadius:"var(--radius-md)",padding:"16px"};
  const darkTitle={color:"#fff"};
  const darkSub={fontSize:14,color:"rgba(255,255,255,0.5)",marginBottom:6};
  const darkMuted={color:"rgba(255,255,255,0.4)"};

  if(scatterData.length<2) return(
    <div>
      <div style={darkCard}>
        <div className="card-title" style={{...darkTitle,marginBottom:5}}>Handicap Index vs Avg Performance</div>
        <div style={{textAlign:"center",padding:"40px 20px",color:"rgba(255,255,255,0.4)",fontSize:14}}>
          📊 This chart needs at least 2 golfers with rounds this season to display.
        </div>
      </div>
    </div>
  );

  return(
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div ref={sentinelRef}/>
      <div style={darkCard}>
        <div className="card-title" style={{...darkTitle,marginBottom:5}}>Handicap Index vs Avg Performance</div>
        <p style={{...darkSub,marginBottom:6}}>Higher scores for a given HCP = outperforming handicap. Tap a dot for name.</p>
        <div style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(12px)",
          transition: "opacity 0.5s ease, transform 0.5s ease",
        }}>
          <ChartCanvas config={config} deps={[scatterData.length,scatterData.map((d:any)=>d.golfer.golfer_id).join(),visible]} height={270}/>
        </div>
      </div>

      <div ref={flightCardRef} style={darkCard}>
        <div className="card-title" style={{...darkTitle,marginBottom:4}}>Win % by Handicap Flight</div>
        <p style={{...darkSub,marginBottom:12}}>1st or 2nd place finish counts as a win. Based on paid buy-in entries only.</p>
        {hasFlightData?(
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {flightWinData.map((d:any,i:number)=>{
              const fillW=barsVisible&&maxFlightPct>0?Math.min(90,d.winPct/maxFlightPct*90):0;
              return(
                <div key={d.label} style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{minWidth:60,fontSize:13,fontWeight:600,color:"rgba(255,255,255,0.6)"}}>{d.label}</div>
                  <div style={{flex:1,background:"rgba(255,255,255,0.08)",borderRadius:6,height:32,overflow:"hidden"}}>
                    <div style={{
                      width:`${fillW}%`,height:"100%",
                      background:FLIGHT_COLORS[i]||FLIGHT_COLORS[0],
                      borderRadius:6,
                      display:"flex",alignItems:"center",
                      minWidth:barsVisible&&d.winPct>0?40:0,
                      transition:"width 0.6s cubic-bezier(0.22,1,0.36,1)",
                    }}>
                      {d.winPct>0&&(
                        <span style={{fontSize:13,fontWeight:700,color:"#ffffff",paddingLeft:10,whiteSpace:"nowrap"}}>
                          {d.winPct}%
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{fontSize:11,...darkMuted,whiteSpace:"nowrap",minWidth:52,textAlign:"right"}}>
                    {d.appearances} starts
                  </div>
                </div>
              );
            })}
          </div>
        ):(
          <div style={{textAlign:"center",padding:"32px 20px",color:"rgba(255,255,255,0.4)",fontSize:14}}>
            📊 No completed events with buy-in data this season yet.
          </div>
        )}
      </div>
    </div>
  );
}
