// -- Season Overview Dashboard ---------------------------------
import { dedupeLeaderboard } from "../../lib/seasonStats";

// ── Champions View ────────────────────────────────────────────────────────────
export function ChampionsView({golfers,leaderboard,events}:any){
  const currentYear=new Date().getFullYear();
  const finishedSeasons=[...new Set(
    events.filter((e:any)=>e.status==="Completed"&&e.season<currentYear).map((e:any)=>e.season)
  )].sort((a:any,b:any)=>b-a) as number[];

  const gName=(gid:number)=>{
    const g=golfers.find((g:any)=>g.golfer_id===gid);
    return g?`${g.first_name} ${g.last_name}`:"Unknown";
  };

  type ChampEntry={golfer_id:number;avg:number;rounds:number};
  type SeasonChamps={season:number;seasonAvg:ChampEntry[];top15:ChampEntry[]};

  const rows:SeasonChamps[]=finishedSeasons.map(season=>{
    const completedIds=new Set(
      events.filter((e:any)=>e.season===season&&e.status==="Completed").map((e:any)=>e.event_id)
    );
    const byG:Record<number,number[]>={};
    dedupeLeaderboard(leaderboard.filter((r:any)=>completedIds.has(r.event_id))).forEach((r:any)=>{
      const g=golfers.find((gl:any)=>gl.golfer_id===r.golfer_id);
      if(!g||g.is_guest)return;
      if(!byG[r.golfer_id])byG[r.golfer_id]=[];
      byG[r.golfer_id].push(r.total_stableford_points);
    });
    const saData=Object.entries(byG)
      .map(([gid,r])=>({golfer_id:parseInt(gid),avg:r.reduce((a:number,b:number)=>a+b,0)/r.length,rounds:r.length}))
      .filter(r=>r.rounds>=15).sort((a,b)=>b.avg-a.avg);
    const topSA=saData[0]?.avg;
    const seasonAvgChamps=topSA!=null?saData.filter(r=>Math.abs(r.avg-topSA)<0.0001):[];
    const t15Data=Object.entries(byG)
      .map(([gid,r])=>{const top=[...r].sort((a:number,b:number)=>b-a).slice(0,15);return{golfer_id:parseInt(gid),avg:top.reduce((a:number,b:number)=>a+b,0)/top.length,rounds:r.length};})
      .filter(r=>r.rounds>=15).sort((a,b)=>b.avg-a.avg);
    const topT15=t15Data[0]?.avg;
    const top15Champs=topT15!=null?t15Data.filter(r=>Math.abs(r.avg-topT15)<0.0001):[];
    return{season,seasonAvg:seasonAvgChamps,top15:top15Champs};
  });

  if(rows.length===0){
    return(
      <div style={{textAlign:"center",color:"var(--text-muted)",padding:48,fontSize:15}}>
        <div style={{fontSize:40,marginBottom:12}}>🏆</div>
        No completed prior seasons yet. Champions will appear here at the end of each season.
      </div>
    );
  }

  const ChampBlock=({champs,label,isTied}:{champs:ChampEntry[];label:string;isTied:boolean})=>(
    <div style={{padding:"18px 20px",borderBottom:"1px solid rgba(255,255,255,0.08)"}}>
      {/* Category label */}
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
        <div style={{height:1,flex:1,background:"rgba(212,168,67,0.25)"}}/>
        <div style={{fontSize:10,fontWeight:800,letterSpacing:"0.12em",color:"var(--gold-400,#c9973a)",textTransform:"uppercase"}}>{label}</div>
        <div style={{height:1,flex:1,background:"rgba(212,168,67,0.25)"}}/>
      </div>
      {champs.length===0
        ?<div style={{fontSize:13,color:"rgba(255,255,255,0.35)",textAlign:"center",padding:"8px 0"}}>No qualified players</div>
        :champs.map((c,i)=>(
          <div key={c.golfer_id} style={{display:"flex",alignItems:"center",gap:14,marginBottom:i<champs.length-1?14:0}}>
            {/* Trophy icon */}
            <div style={{width:44,height:44,borderRadius:"50%",background:"linear-gradient(135deg,#d4a843 0%,#8b6914 100%)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:"0 2px 8px rgba(212,168,67,0.4)"}}>
              <span style={{fontSize:22,lineHeight:1}}>🏆</span>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:21,fontWeight:800,color:"white",fontFamily:"var(--font-serif)",lineHeight:1.15,letterSpacing:"-0.01em"}}>{gName(c.golfer_id)}</div>
              <div style={{display:"flex",alignItems:"baseline",gap:6,marginTop:4,flexWrap:"wrap"}}>
                <span style={{fontSize:16,fontWeight:700,color:"var(--gold-300,#d4a843)"}}>{c.avg.toFixed(2)}</span>
                <span style={{fontSize:12,color:"rgba(255,255,255,0.45)",fontWeight:500}}>pts avg · {c.rounds} rounds{isTied?" · Tied":""}</span>
              </div>
            </div>
          </div>
        ))
      }
    </div>
  );

  return(
    <div style={{marginTop:8}}>
      <div style={{fontSize:12,color:"var(--text-muted)",marginBottom:20,textAlign:"center",letterSpacing:"0.03em"}}>
        Min. 15 rounds to qualify · Ties recognized
      </div>

      {rows.map(({season,seasonAvg,top15})=>(
        <div key={season} style={{textAlign:"left",marginBottom:20,borderRadius:14,overflow:"hidden",boxShadow:"var(--shadow-md)",border:"1px solid rgba(212,168,67,0.2)"}}>

          {/* Season banner */}
          <div style={{background:"linear-gradient(135deg,var(--green-900,#1a3a1a) 0%,#0f2010 60%,#1a2e10 100%)",padding:"20px 20px 16px",position:"relative",overflow:"hidden"}}>
            {/* Decorative background number */}
            <div style={{position:"absolute",right:-8,top:-16,fontSize:120,fontWeight:900,color:"rgba(255,255,255,0.04)",fontFamily:"var(--font-serif)",lineHeight:1,userSelect:"none",pointerEvents:"none"}}>{season}</div>
            <div style={{position:"relative"}}>
              <div style={{fontSize:11,fontWeight:700,letterSpacing:"0.15em",color:"var(--gold-400,#c9973a)",textTransform:"uppercase",marginBottom:4}}>Saturday School</div>
              <div style={{fontFamily:"var(--font-serif)",fontSize:32,fontWeight:900,color:"white",lineHeight:1,letterSpacing:"-0.02em"}}>{season} Champions</div>
            </div>
          </div>

          {/* Champion blocks — stacked */}
          <div style={{background:"linear-gradient(180deg,#1c2e1c 0%,#162416 100%)"}}>
            <ChampBlock champs={seasonAvg} label="Season Average" isTied={seasonAvg.length>1}/>
            <div style={{padding:"18px 20px"}}>
              {/* Category label */}
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                <div style={{height:1,flex:1,background:"rgba(212,168,67,0.25)"}}/>
                <div style={{fontSize:10,fontWeight:800,letterSpacing:"0.12em",color:"var(--gold-400,#c9973a)",textTransform:"uppercase"}}>Top 15 Average</div>
                <div style={{height:1,flex:1,background:"rgba(212,168,67,0.25)"}}/>
              </div>
              {top15.length===0
                ?<div style={{fontSize:13,color:"rgba(255,255,255,0.35)",textAlign:"center",padding:"8px 0"}}>No qualified players</div>
                :top15.map((c,i)=>(
                  <div key={c.golfer_id} style={{display:"flex",alignItems:"center",gap:14,marginBottom:i<top15.length-1?14:0}}>
                    <div style={{width:44,height:44,borderRadius:"50%",background:"linear-gradient(135deg,#a8c080 0%,#4a7028 100%)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:"0 2px 8px rgba(74,112,40,0.4)"}}>
                      <span style={{fontSize:22,lineHeight:1}}>🏆</span>
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:21,fontWeight:800,color:"white",fontFamily:"var(--font-serif)",lineHeight:1.15,letterSpacing:"-0.01em"}}>{gName(c.golfer_id)}</div>
                      <div style={{display:"flex",alignItems:"baseline",gap:6,marginTop:4,flexWrap:"wrap"}}>
                        <span style={{fontSize:16,fontWeight:700,color:"#a8d878"}}>{c.avg.toFixed(2)}</span>
                        <span style={{fontSize:12,color:"rgba(255,255,255,0.45)",fontWeight:500}}>pts avg · {c.rounds} rounds{top15.length>1?" · Tied":""}</span>
                      </div>
                    </div>
                  </div>
                ))
              }
            </div>
          </div>

        </div>
      ))}
    </div>
  );
}
