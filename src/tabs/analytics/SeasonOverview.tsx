import { CountUp } from "../../App";
import { formatDate } from "../../lib/formatters";
import { ChartCanvas } from "./ChartCanvas";

// Color stops for heatmap: delta relative to player personal avg
// Positive = green, negative = red, 0 = neutral
const HEAT_STOPS=[
  {d:-6,bg:"#991b1b",text:"#ffffff"},
  {d:-4,bg:"#dc2626",text:"#ffffff"},
  {d:-2,bg:"#f87171",text:"#1c1410"},
  {d:-1,bg:"#fecaca",text:"#1c1410"},
  {d: 0,bg:"#f8f8f6",text:"#1c1410"},
  {d: 1,bg:"#bbf7d0",text:"#1c1410"},
  {d: 2,bg:"#4ade80",text:"#1c1410"},
  {d: 4,bg:"#16a34a",text:"#ffffff"},
  {d: 6,bg:"#166534",text:"#ffffff"},
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
  // For text: use white if both stops are white-text, dark otherwise
  const text=lo.text==="#ffffff"&&hi.text==="#ffffff"?"#ffffff":"#1c1410";
  return{bg,text};
}

function FormHeatmap({seasonEvents,leaderboard,golfers,season}:any){
  // Sort events chronologically
  const sortedEvents=[...seasonEvents].sort((a:any,b:any)=>new Date(a.date).getTime()-new Date(b.date).getTime());

  // Build per-player round data, filter to players with >=3 rounds
  type PlayerRow={golfer:any;avg:number;rounds:{[eid:number]:number}};
  const rows:PlayerRow[]=[];
  const eligibleGolfers=golfers.filter((g:any)=>!g.is_guest);
  for(const g of eligibleGolfers){
    const myEntries=leaderboard.filter((r:any)=>r.golfer_id===g.golfer_id&&sortedEvents.some((e:any)=>e.event_id===r.event_id));
    if(myEntries.length<3)continue;
    const roundMap:{[eid:number]:number}={};
    for(const e of myEntries){roundMap[e.event_id]=e.total_stableford_points;}
    const total=myEntries.reduce((s:number,r:any)=>s+r.total_stableford_points,0);
    const avg=total/myEntries.length;
    rows.push({golfer:g,avg,rounds:roundMap});
  }

  // Sort by season average descending
  rows.sort((a,b)=>b.avg-a.avg);

  if(rows.length===0||sortedEvents.length===0){
    return(
      <div style={{color:"var(--text-muted)",fontSize:13,textAlign:"center",padding:"20px 0"}}>
        Not enough data for heatmap (need players with 3+ rounds).
      </div>
    );
  }

  // Cell sizing
  const numCols=sortedEvents.length;
  const cellSize=numCols>16?Math.max(20,Math.floor(480/numCols)):28;
  const gap=2;
  const nameColW=100;

  // Month abbreviations for header
  const MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  function fmtColDate(dateStr:string){
    const d=new Date(dateStr+"T12:00:00");
    return MONTHS[d.getMonth()]+" "+d.getDate();
  }

  return(
    <div>
      {/* Scrollable grid wrapper */}
      <div style={{overflowX:"auto",overflowY:"visible",WebkitOverflowScrolling:undefined as any}}>
        <div style={{minWidth:nameColW+numCols*(cellSize+gap)+20,paddingBottom:8}}>

          {/* Header row: blank corner + date labels */}
          <div style={{display:"flex",alignItems:"flex-end",marginBottom:gap,paddingLeft:nameColW+gap}}>
            {sortedEvents.map((ev:any)=>(
              <div
                key={ev.event_id}
                title={ev.course_name}
                style={{
                  width:cellSize,
                  minWidth:cellSize,
                  marginRight:gap,
                  fontSize:11,
                  color:"var(--text-secondary)",
                  textAlign:"center",
                  transform:"rotate(-45deg)",
                  transformOrigin:"bottom left",
                  whiteSpace:"nowrap",
                  height:50,
                  display:"flex",
                  alignItems:"flex-end",
                  paddingBottom:2,
                  boxSizing:"border-box" as const,
                }}
              >
                {fmtColDate(ev.date)}
              </div>
            ))}
          </div>

          {/* Data rows */}
          {rows.map((row)=>{
            const initLast=(row.golfer.first_name?.[0]||"")+"."+" "+(row.golfer.last_name||"");
            return(
              <div key={row.golfer.golfer_id} style={{display:"flex",alignItems:"center",marginBottom:gap}}>
                {/* Sticky name */}
                <div style={{
                  width:nameColW,
                  minWidth:nameColW,
                  fontSize:12,
                  color:"var(--text-primary)",
                  whiteSpace:"nowrap",
                  overflow:"hidden",
                  textOverflow:"ellipsis",
                  paddingRight:6,
                  position:"sticky",
                  left:0,
                  zIndex:2,
                  background:"var(--bg)",
                  lineHeight:`${cellSize}px`,
                  fontWeight:500,
                }}>
                  {initLast}
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
                          width:cellSize,
                          height:cellSize,
                          minWidth:cellSize,
                          marginRight:gap,
                          borderRadius:3,
                          background:"var(--surface)",
                          border:"1px solid var(--border)",
                          flexShrink:0,
                          backgroundImage:"repeating-linear-gradient(45deg,var(--border) 0,var(--border) 1px,transparent 0,transparent 50%)",
                          backgroundSize:"6px 6px",
                        }}
                      />
                    );
                  }
                  const delta=pts-row.avg;
                  const {bg,text}=interpColor(delta);
                  const label=pts.toString();
                  return(
                    <div
                      key={ev.event_id}
                      title={`${row.golfer.first_name} ${row.golfer.last_name}: ${pts} pts (${delta>=0?"+":""}${delta.toFixed(1)} vs avg ${row.avg.toFixed(1)})`}
                      style={{
                        width:cellSize,
                        height:cellSize,
                        minWidth:cellSize,
                        marginRight:gap,
                        borderRadius:3,
                        background:bg,
                        color:text,
                        fontSize:10,
                        display:"flex",
                        alignItems:"center",
                        justifyContent:"center",
                        flexShrink:0,
                        cursor:"default",
                        fontWeight:500,
                        lineHeight:1,
                      }}
                    >
                      {cellSize>=24?label:""}
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
        <span style={{fontSize:10,color:"var(--text-secondary)",whiteSpace:"nowrap"}}>Below avg</span>
        <div style={{display:"flex",gap:1}}>
          {HEAT_STOPS.map((s,i)=>(
            <div key={i} style={{width:16,height:12,background:s.bg,borderRadius:2}}/>
          ))}
        </div>
        <span style={{fontSize:10,color:"var(--text-secondary)",whiteSpace:"nowrap"}}>Above avg</span>
      </div>
      <div style={{textAlign:"center",fontSize:10,color:"var(--text-muted)",marginTop:3}}>
        Color relative to each player's personal {season} season average
      </div>
    </div>
  );
}

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

      {/* Form Heatmap */}
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
