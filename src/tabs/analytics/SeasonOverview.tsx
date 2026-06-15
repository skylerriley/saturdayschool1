import { CountUp } from "../../App";
import { formatDate } from "../../lib/formatters";
import { ChartCanvas } from "./ChartCanvas";

export function SeasonOverview({seasonData,seasonEvents,season,leaderboard,golfers}:any){
  const totalRounds=seasonData.reduce((s:number,d:any)=>s+d.rounds,0);
  const allPts=seasonData.flatMap((d:any)=>d.allPts);
  const seasonAvg=allPts.length?allPts.reduce((a:number,b:number)=>a+b,0)/allPts.length:0;
  const highScoreEntry=allPts.length?Math.max(...allPts):0;
  const highScorer=seasonData.find((d:any)=>d.best===highScoreEntry);
  const winLeader=seasonData.length?[...seasonData].sort((a:any,b:any)=>b.wins-a.wins)[0]:null;

  // Win tally -- bar chart data
  const winData=[...seasonData].filter((d:any)=>d.wins>0).sort((a:any,b:any)=>b.wins-a.wins);

  // Most improved: compare first half vs second half of rounds
  const improvedData=seasonData.map((d:any)=>{
    if(d.allPts.length<4)return null;
    const half=Math.floor(d.allPts.length/2);
    const firstHalfAvg=d.allPts.slice(0,half).reduce((a:number,b:number)=>a+b,0)/half;
    const secondHalfAvg=d.allPts.slice(half).reduce((a:number,b:number)=>a+b,0)/(d.allPts.length-half);
    return{golfer:d.golfer,delta:secondHalfAvg-firstHalfAvg};
  }).filter(Boolean).sort((a:any,b:any)=>b.delta-a.delta);
  const mostImproved=improvedData[0];

  // Earnings leader
  const earningsLeader=seasonData.length?[...seasonData].sort((a:any,b:any)=>b.earned-a.earned)[0]:null;

  // Per-event scoring trend
  const eventTrend=seasonEvents
    .sort((a:any,b:any)=>new Date(a.date).getTime()-new Date(b.date).getTime())
    .map((ev:any)=>{
      const entries=leaderboard.filter((r:any)=>r.event_id===ev.event_id&&!golfers.find((g:any)=>g.golfer_id===r.golfer_id)?.is_guest);
      const avg=entries.length?entries.reduce((s:number,r:any)=>s+r.total_stableford_points,0)/entries.length:0;
      return{date:ev.date,avg,course:ev.course_name};
    });

  const trendConfig = {
    type:"line" as const,
    data:{
      labels:eventTrend.map((_:any,i:number)=>"Rd "+(i+1)),
      datasets:[{
        label:"Field Avg",
        data:eventTrend.map((e:any)=>parseFloat(e.avg.toFixed(1))),
        borderColor:"#1a7340",backgroundColor:"rgba(26,115,64,0.08)",
        pointBackgroundColor:"#1a7340",pointRadius:5,fill:true,tension:0.35
      }]
    },
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},
        tooltip:{callbacks:{
          label:(c:any)=>(" "+c.parsed.y.toFixed(1)+" pts avg"),
          title:(items:any)=>{const ev=eventTrend[items[0].dataIndex];return formatDate(ev.date);}
        }}
      },
      scales:{
        x:{ticks:{color:"#6b5240",font:{size:12}},grid:{display:false}},
        y:{beginAtZero:false,min:24,ticks:{color:"#6b5240"},grid:{color:"rgba(74,55,40,0.1)"}}
      }
    }
  };

  const winsConfig = {
    type:"bar" as const,
    data:{
      labels:winData.map((d:any)=>d.golfer.first_name),
      datasets:[
        {label:"Wins",data:winData.map((d:any)=>d.wins),backgroundColor:"#c47800",borderRadius:5},
        {label:"2nds",data:winData.map((d:any)=>d.seconds),backgroundColor:"rgba(26,115,64,0.45)",borderRadius:5}
      ]
    },
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:true,labels:{color:"#6b5240",font:{size:12}}}},
      scales:{
        x:{ticks:{color:"#6b5240",font:{size:12}},grid:{display:false}},
        y:{ticks:{color:"#6b5240",stepSize:1},grid:{color:"rgba(74,55,40,0.1)"},beginAtZero:true}
      }
    }
  };

  return(
    <div>
      {/* Season stat cards */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
        <div className="stat-card"><div className="stat-value"><CountUp value={seasonEvents.length}/></div><div className="stat-label">Events Played</div></div>
        <div className="stat-card"><div className="stat-value"><CountUp value={totalRounds}/></div><div className="stat-label">Total Rounds</div></div>
        <div className="stat-card"><div className="stat-value" style={{fontSize:24}}><CountUp value={seasonAvg} decimals={1}/></div><div className="stat-label">Field Avg Pts</div></div>
        <div className="stat-card"><div className="stat-value" style={{color:"var(--gold-600)",fontSize:24}}><CountUp value={highScoreEntry}/></div><div className="stat-label">High Score</div></div>
      </div>

      {/* Hero highlight cards */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
        {highScorer&&(
          <div style={{background:"linear-gradient(135deg,var(--gold-900),var(--gold-700))",borderRadius:"var(--radius-md)",padding:"14px 12px",textAlign:"center",color:"white"}}>
            <div style={{fontSize:22}}>🏆</div>
            <div style={{fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase",opacity:0.8,marginTop:2}}>High Score</div>
            <div style={{fontSize:16,fontWeight:700,marginTop:4}}>{highScorer.golfer.first_name}</div>
            <div style={{fontSize:26,fontWeight:700,color:"var(--gold-300)",lineHeight:1}}>{highScoreEntry} pts</div>
          </div>
        )}
        {winLeader&&winLeader.wins>0&&(
          <div style={{background:"linear-gradient(135deg,var(--green-900),var(--green-700))",borderRadius:"var(--radius-md)",padding:"14px 12px",textAlign:"center",color:"white"}}>
            <div style={{fontSize:22}}>🥇</div>
            <div style={{fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase",opacity:0.8,marginTop:2}}>Win Leader</div>
            <div style={{fontSize:16,fontWeight:700,marginTop:4}}>{winLeader.golfer.first_name}</div>
            <div style={{fontSize:26,fontWeight:700,color:"var(--green-300)",lineHeight:1}}>{winLeader.wins} win{winLeader.wins>1?"s":""}</div>
          </div>
        )}
        {earningsLeader&&earningsLeader.earned>0&&(
          <div style={{background:"linear-gradient(135deg,var(--earth-800),var(--earth-600))",borderRadius:"var(--radius-md)",padding:"14px 12px",textAlign:"center",color:"white"}}>
            <div style={{fontSize:22}}>💰</div>
            <div style={{fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase",opacity:0.8,marginTop:2}}>Earnings Leader</div>
            <div style={{fontSize:16,fontWeight:700,marginTop:4}}>{earningsLeader.golfer.first_name}</div>
            <div style={{fontSize:26,fontWeight:700,color:"var(--gold-300)",lineHeight:1}}>${earningsLeader.earned.toFixed(0)}</div>
          </div>
        )}
        {mostImproved&&mostImproved.delta>0&&(
          <div style={{background:"linear-gradient(135deg,#1a56a0,#1a73a0)",borderRadius:"var(--radius-md)",padding:"14px 12px",textAlign:"center",color:"white"}}>
            <div style={{fontSize:22}}>📈</div>
            <div style={{fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase",opacity:0.8,marginTop:2}}>Most Improved</div>
            <div style={{fontSize:16,fontWeight:700,marginTop:4}}>{mostImproved.golfer.first_name}</div>
            <div style={{fontSize:26,fontWeight:700,color:"#9fd4f7",lineHeight:1}}>+{mostImproved.delta.toFixed(1)} pts</div>
            <div style={{fontSize:10,opacity:0.7,marginTop:4}}>2nd half avg vs 1st half</div>
          </div>
        )}
      </div>

      {/* Scoring trend */}
      {eventTrend.length>1&&(
        <div className="card" style={{marginBottom:12}}>
          <div className="card-title" style={{marginBottom:10}}>Field Scoring Trend</div>
          <ChartCanvas config={trendConfig} deps={[season,eventTrend.length]} height={190}/>
        </div>
      )}
      {eventTrend.length<=1&&seasonEvents.length>0&&(
        <div className="card" style={{marginBottom:12,textAlign:"center",padding:"20px",color:"var(--text-muted)",fontSize:14}}>
          📊 Scoring trend chart will appear once 2+ events are completed this season.
        </div>
      )}

      {/* Win tally */}
      {winData.length>0&&(
        <div className="card" style={{marginBottom:12}}>
          <div className="card-title" style={{marginBottom:10}}>Wins &amp; 2nd Place Finishes</div>
          <ChartCanvas config={winsConfig} deps={[season,winData.length]} height={190}/>
        </div>
      )}
      {winData.length===0&&seasonEvents.length>0&&(
        <div className="card" style={{marginBottom:12,textAlign:"center",padding:"20px",color:"var(--text-muted)",fontSize:14}}>
          🏆 Win tallies will appear once scoring is entered for this season.
        </div>
      )}

    </div>
  );
}
