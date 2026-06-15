import { ChartCanvas } from "./ChartCanvas";

export function ScatterChart({scatterData,flightWinData}:any){
  const config = {
    type:"scatter" as const,
    data:{
      datasets:[{
        label:"Golfers",
        data:scatterData.map((d:any)=>({x:d.hcp,y:parseFloat(d.avg.toFixed(1)),name:d.golfer.first_name+" "+d.golfer.last_name})),
        backgroundColor:"#1a7340",pointRadius:10,pointHoverRadius:13
      }]
    },
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},
        tooltip:{callbacks:{label:(c:any)=>(c.raw.name+": HCP "+c.raw.x+" - "+c.raw.y.toFixed(1)+" pts avg")}}
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
      <div className="card-title" style={{marginBottom:5}}>Handicap Index vs Avg Performance</div>
      <p style={{fontSize:14,color:"var(--text-muted)",marginBottom:12}}>Higher scores for a given HCP = outperforming handicap. Tap a dot for name.</p>
      <ChartCanvas config={config} deps={[scatterData.length,scatterData.map((d:any)=>d.golfer.golfer_id).join()]} height={270}/>

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
