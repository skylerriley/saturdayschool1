import { useState } from "react";
import { formatDate } from "../../lib/formatters";
import { computeScoringFingerprint } from "../../lib/scoringFingerprint";
import { ScoringFingerprintRadar } from "../../components/charts/ScoringFingerprintRadar";
import { CountUp, ScoreSymbol } from "../../App";
import { ChartCanvas } from "./ChartCanvas";
import { PairingHistory } from "../../components/analytics/PairingHistory";

export function GolferHistoryChart({golfer,rounds,seasonData,leaderboard,golfers,seasonEvents,holeScores,courses,signups}:any){
  const [expandedRound,setExpandedRound]=useState<number|null>(null);
  const avg=rounds.reduce((s:number,r:any)=>s+r.pts,0)/rounds.length;
  const best=Math.max(...rounds.map((r:any)=>r.pts));
  const worst=Math.min(...rounds.map((r:any)=>r.pts));
  const totalEarned=rounds.reduce((s:number,r:any)=>s+r.earned,0);
  const netEarnings=totalEarned-(rounds.length*20);

  const histConfig = {
    type:"line" as const,
    data:{
      labels:rounds.map((_:any,i:number)=>"R"+(i+1)),
      datasets:[
        {label:"Points",data:rounds.map((r:any)=>r.pts),borderColor:"#1a7340",backgroundColor:"rgba(45,90,45,0.08)",pointBackgroundColor:"#1a7340",pointRadius:5,fill:true,tension:0.3},
        {label:"Avg",data:Array(rounds.length).fill(parseFloat(avg.toFixed(1))),borderColor:"#c47800",borderDash:[5,4],pointRadius:0,fill:false}
      ]
    },
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},
        tooltip:{callbacks:{
          label:(c:any)=>(c.dataset.label==="Avg" ? ("Avg: "+c.parsed.y.toFixed(1)) : (c.parsed.y+" pts")),
          title:(items:any)=>{const r=rounds[items[0].dataIndex];return formatDate(r.date)+" - "+r.course.split(" ")[0];}
        }}
      },
      scales:{
        x:{ticks:{color:"#6b5240",font:{size:12},maxTicksLimit:12},grid:{display:false}},
        y:{min:Math.max(0,worst-5),ticks:{color:"#6b5240"},grid:{color:"rgba(74,55,40,0.1)"}}
      }
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

  return(
    <div>
      {/* Stat hero cards */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
        <div className="stat-card"><div className="stat-value" style={{fontSize:26}}><CountUp value={avg} decimals={1}/></div><div className="stat-label">Season Avg</div></div>
        <div className="stat-card"><div className="stat-value" style={{fontSize:26}}><CountUp value={rounds.length}/></div><div className="stat-label">Rounds Played</div></div>
        <div className="stat-card"><div className="stat-value" style={{color:"var(--gold-600)",fontSize:26}}><CountUp value={best}/></div><div className="stat-label">Best Round</div></div>
        <div className="stat-card"><div className="stat-value" style={{color:"var(--red-600)",fontSize:26}}><CountUp value={worst}/></div><div className="stat-label">Worst Round</div></div>
      </div>

      {/* Earnings summary */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
        <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",padding:"12px",textAlign:"center"}}>
          <div style={{fontSize:22,fontWeight:700,color:"var(--green-700)"}}><CountUp value={totalEarned} prefix="$"/></div>
          <div style={{fontSize:12,color:"var(--text-muted)",fontWeight:500}}>Stableford Earned</div>
        </div>
        <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",padding:"12px",textAlign:"center"}}>
          <div style={{fontSize:22,fontWeight:700,color:netEarnings>=0?"var(--green-700)":"var(--red-600)"}}><CountUp value={Math.abs(netEarnings)} prefix={netEarnings>=0?"+$":"-$"}/></div>
          <div style={{fontSize:12,color:"var(--text-muted)",fontWeight:500}}>Net (−Entry Fees)</div>
        </div>
      </div>

      {/* Trend indicator */}
      {rounds.length>3&&(
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,padding:"10px 14px",background:"var(--surface)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)"}}>
          <span style={{fontSize:20}}>{trend>0?"📈":trend<0?"📉":"➡️"}</span>
          <div>
            <div style={{fontSize:14,fontWeight:600,color:trend>0?"var(--green-700)":trend<0?"var(--red-600)":"var(--text-muted)"}}>
              {trend>0?"Trending up":trend<0?"Trending down":"Holding steady"} {Math.abs(trend)>0.1?`(${trend>0?"+":""}${trend.toFixed(1)} pts recent vs early)`:""}</div>
            <div style={{fontSize:12,color:"var(--text-muted)"}}>Based on comparing first vs last rounds this season</div>
          </div>
        </div>
      )}

      {/* Scoring Fingerprint */}
      {(()=>{
        const fp=computeScoringFingerprint(golfer.golfer_id,seasonEvents,leaderboard,holeScores,courses);
        // Compute league average fingerprint across all non-guest golfers with hole data
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
          <div style={{
            background:"var(--green-900)",
            borderRadius:"var(--radius-md)",
            padding:16,
            marginBottom:16,
          }}>
            <div style={{fontSize:10,letterSpacing:"0.12em",textTransform:"uppercase",color:"rgba(255,255,255,0.4)",fontWeight:700,marginBottom:10}}>
              Scoring fingerprint
            </div>
            <ScoringFingerprintRadar
              datasets={[
                ...(leagueAvgFp?[{label:"League avg",color:"rgba(255,255,255,0.2)",fill:"rgba(255,255,255,0.05)",values:leagueAvgFp,dashed:true}]:[]),
                {label:golferName,color:"#7dc07d",fill:"rgba(125,200,125,0.18)",values:fp},
              ]}
              darkMode
            />
            {/* Legend */}
            <div style={{display:"flex",gap:16,justifyContent:"center",marginTop:8,flexWrap:"wrap"}}>
              {leagueAvgFp&&(
                <div style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:"rgba(255,255,255,0.4)"}}>
                  <div style={{width:14,height:3,background:"rgba(255,255,255,0.2)",borderRadius:2}}/>
                  League avg
                </div>
              )}
              <div style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:"rgba(255,255,255,0.6)"}}>
                <div style={{width:10,height:10,borderRadius:"50%",background:"#7dc07d"}}/>
                {golferName}
              </div>
            </div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.3)",marginTop:6,textAlign:"center"}}>
              Avg Stableford pts per hole category · {fp.sampleSize} round{fp.sampleSize===1?"":"s"}
            </div>
          </div>
        );
      })()}

      {/* Charts */}
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:8}}>
        <div style={{fontSize:15,fontWeight:700,color:"var(--green-700)"}}>{golfer.first_name} {golfer.last_name} -- Round History</div>
        <span style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:"var(--text-muted)"}}>
          <span style={{width:14,height:3,background:"#1a7340",display:"inline-block",borderRadius:2}}></span>Pts
          <span style={{width:14,height:3,background:"#c47800",display:"inline-block",borderRadius:2,marginLeft:4}}></span>Avg
        </span>
      </div>
      <ChartCanvas config={histConfig} deps={[golfer.golfer_id,rounds.length]} height={210} style={{marginBottom:16}}/>



      {/* Course Breakdown */}
      {courseBreakdown.length>0&&(
        <div style={{marginTop:20}}>
          <div className="card-title" style={{marginBottom:8}}>Performance by Course</div>
          <div style={{background:"var(--surface)",borderRadius:"var(--radius-md)",border:"1px solid var(--border)",overflow:"hidden"}}>
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

      {/* Rival & Twin */}
      {(rivalStats.rival||rivalStats.twin)&&(
        <div style={{marginTop:20,marginBottom:20}}>
          
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {rivalStats.rival&&(
              <div style={{background:"rgba(192,32,32,0.07)",border:"1.5px solid rgba(192,32,32,0.25)",borderRadius:"var(--radius-md)",padding:"14px 12px",textAlign:"center"}}>
                <div style={{fontSize:15,fontWeight:700,color:"var(--red-600)",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:6}}>Rival</div>
                
                <div style={{fontSize:18,fontWeight:700,marginBottom:4}}>{rivalStats.rival.g.first_name} {rivalStats.rival.g.last_name}</div>
                <div style={{fontSize:12,color:"var(--text-muted)",lineHeight:1.6}}>
                  Beats you {rivalStats.rival.beats}/{rivalStats.rival.total} events<br/>
                  <span style={{color:"var(--red-500)",fontWeight:600}}>{Math.round(rivalStats.rival.beats/rivalStats.rival.total*100)}% win rate vs you</span>
                </div>
              </div>
            )}
            {rivalStats.twin&&(
              <div style={{background:"rgba(26,115,64,0.07)",border:"1.5px solid rgba(26,115,64,0.25)",borderRadius:"var(--radius-md)",padding:"14px 12px",textAlign:"center"}}>
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
      
            {/* Per-round list */}
            <div className="card-title" style={{marginBottom:8}}>Round-by-Round</div>
      <div style={{background:"var(--surface)",borderRadius:"var(--radius-md)",border:"1px solid var(--border)"}}>
        {/* Header row */}
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
                      {/* FRONT NINE */}
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
                      {/* BACK NINE */}
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

      <PairingHistory
        golfer={golfer}
        signups={signups}
        seasonEvents={seasonEvents}
        leaderboard={leaderboard}
        golfers={golfers}
      />
        </div>

  )
}
