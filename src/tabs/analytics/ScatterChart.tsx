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
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(()=>{
    const el = sentinelRef.current; if(!el) return;
    const obs = new IntersectionObserver(([entry])=>{
      if(entry.isIntersecting){ setVisible(true); obs.disconnect(); }
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

  const config = {
    type:"scatter" as const,
    data:{
      datasets:[
        {
          type:"scatter" as const,
          label:"Golfers",
          data: points,
          backgroundColor: visible ? "#1a7340" : "transparent",
          pointRadius: 10,
          pointHoverRadius: 13,
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
    options:{
      responsive:true,maintainAspectRatio:false,
      animation:{
        duration: visible ? 900 : 0,
        easing: "easeOutQuart" as const,
        delay:(ctx:any)=>{
          if(ctx.type==="data"&&ctx.datasetIndex===0)return ctx.dataIndex*40;
          return 0;
        },
      },
      plugins:{
        legend:{display:true,labels:{color:"#6b5240",font:{size:11},boxWidth:16,usePointStyle:true}},
        tooltip:{callbacks:{
          label:(c:any)=>{
            if(c.datasetIndex===1)return "";
            return(c.raw.name+": HCP "+c.raw.x+" - "+c.raw.y.toFixed(1)+" pts avg");
          }
        }}
      },
      scales:{
        x:{title:{display:true,text:"Handicap Index",color:"#6b5240",font:{family:"DM Sans, sans-serif",size:13}},ticks:{color:"#6b5240"},grid:{color:"rgba(74,55,40,0.1)"}},
        y:{title:{display:true,text:"Avg Stableford Pts",color:"#6b5240",font:{family:"DM Sans, sans-serif",size:13}},ticks:{color:"#6b5240"},grid:{color:"rgba(74,55,40,0.1)"}}
      }
    }
  };

  const maxFlightWinPct=flightWinData?Math.max(...flightWinData.map((d:any)=>d.winPct),0):0;
  const flightYMax=Math.min(100,maxFlightWinPct+20);

  const flightConfig = flightWinData ? {
    type:"bar" as const,
    data:{
      labels:flightWinData.map((d:any)=>d.label),
      datasets:[{
        label:"Win %",
        data:flightWinData.map((d:any)=>d.winPct),
        backgroundColor:["#1a7340","#2a9356","#c47800","#8b4f1a","#5a3010"],
        borderRadius:6,
        borderSkipped:false as const,
      }]
    },
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},
        tooltip:{callbacks:{
          label:(c:any)=>{
            const d=flightWinData[c.dataIndex];
            return`${c.parsed.y}% win rate (${d.appearances} starts)`;
          }
        }}
      },
      scales:{
        x:{ticks:{color:"#6b5240",font:{family:"DM Sans, sans-serif",size:13}},grid:{display:false}},
        y:{min:0,max:flightYMax,title:{display:true,text:"Win %",color:"#6b5240",font:{family:"DM Sans, sans-serif",size:13}},ticks:{color:"#6b5240",callback:(v:any)=>v+"%"},grid:{color:"rgba(74,55,40,0.1)"}}
      }
    }
  } : null;

  const hasFlightData=flightWinData&&flightWinData.some((d:any)=>d.appearances>0);

  if(scatterData.length<2) return(
    <div>
      <div className="card-title" style={{marginBottom:5}}>Handicap Index vs Avg Performance</div>
      <div style={{textAlign:"center",padding:"40px 20px",color:"var(--text-muted)",fontSize:14}}>
        📊 This chart needs at least 2 golfers with rounds this season to display.
      </div>
    </div>
  );

  return(
    <div>
      <div ref={sentinelRef}/>
      <div className="card-title" style={{marginBottom:5}}>Handicap Index vs Avg Performance</div>
      <p style={{fontSize:14,color:"var(--text-muted)",marginBottom:6}}>Higher scores for a given HCP = outperforming handicap. Tap a dot for name.</p>
      
      <div style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(12px)",
        transition: "opacity 0.5s ease, transform 0.5s ease",
      }}>
        <ChartCanvas config={config} deps={[scatterData.length,scatterData.map((d:any)=>d.golfer.golfer_id).join(),visible]} height={270}/>
      </div>

      <div style={{marginTop:32}}>
        <div className="card-title" style={{marginBottom:4}}>Win % by Handicap Flight</div>
        <p style={{fontSize:14,color:"var(--text-muted)",marginBottom:12}}>1st or 2nd place finish counts as a win. Based on paid buy-in entries only.</p>
        {hasFlightData&&flightConfig?(
          <ChartCanvas config={flightConfig} deps={[JSON.stringify(flightWinData)]} height={240}/>
        ):(
          <div style={{textAlign:"center",padding:"32px 20px",color:"var(--text-muted)",fontSize:14}}>
            📊 No completed events with buy-in data this season yet.
          </div>
        )}
       
      </div>
    </div>
  );
}
