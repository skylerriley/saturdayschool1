import { useRef, useEffect } from "react";

// Sparkline for a course: small canvas showing round-by-round avg trend
function Sparkline({data,color="#7dc07d",height=44}:{data:number[],color?:string,height?:number}){
  const canvasRef=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    const c=canvasRef.current;
    if(!c||data.length<2)return;
    const dpr=window.devicePixelRatio||1;
    const w=c.offsetWidth||120;
    c.width=w*dpr;
    c.height=height*dpr;
    const ctx=c.getContext("2d");
    if(!ctx)return;
    ctx.scale(dpr,dpr);
    const mn=Math.min(...data),mx=Math.max(...data);
    const range=mx-mn||1;
    const pad=4;
    const xStep=(w-pad*2)/(data.length-1);
    const yFor=(v:number)=>height-pad-(v-mn)/range*(height-pad*2);
    // Fill under line
    ctx.beginPath();
    ctx.moveTo(pad,yFor(data[0]));
    data.forEach((v,i)=>ctx.lineTo(pad+i*xStep,yFor(v)));
    ctx.lineTo(pad+(data.length-1)*xStep,height);
    ctx.lineTo(pad,height);
    ctx.closePath();
    ctx.fillStyle="rgba(125,192,125,0.15)";
    ctx.fill();
    // Line
    ctx.beginPath();
    ctx.moveTo(pad,yFor(data[0]));
    data.forEach((v,i)=>ctx.lineTo(pad+i*xStep,yFor(v)));
    ctx.strokeStyle=color;
    ctx.lineWidth=1.5;
    ctx.lineJoin="round";
    ctx.stroke();
    // Last dot
    const lx=pad+(data.length-1)*xStep;
    const ly=yFor(data[data.length-1]);
    ctx.beginPath();
    ctx.arc(lx,ly,3,0,Math.PI*2);
    ctx.fillStyle=color;
    ctx.fill();
  },[data,color,height]);
  return <canvas ref={canvasRef} style={{width:"100%",height,display:"block"}}/>;
}

export function CourseChart({courseAvgs,holeScores,events,courses,leaderboard,golfers}:any){

  // Build per-hole averages across all rounds for each course
  const holeAvgByCourse=(()=>{
    const map:Record<string,Record<number,number[]>>={};
    if(!holeScores||!events||!leaderboard)return {} as Record<string,{hole:number,avgPts:number,rounds:number}[]>;
    const evCourseMap:Record<number,string>={};
    events.forEach((e:any)=>{evCourseMap[e.event_id]=(e.course_name||'').trim();});
    const summaryEvMap:Record<number,number>={};
    leaderboard.forEach((r:any)=>{summaryEvMap[r.summary_id]=r.event_id;});
    const courseIdToName:Record<number,string>={};
    if(courses){courses.forEach((c:any)=>{courseIdToName[c.course_id]=c.course_name;});}
    holeScores.forEach((h:any)=>{
      let course:string|undefined=undefined;
      const eid=summaryEvMap[h.summary_id];
      if(eid)course=evCourseMap[eid];
      if(!course)return;
      if(!map[course])map[course]={};
      if(!map[course][h.hole_number])map[course][h.hole_number]=[];
      if(h.stableford_points!=null)map[course][h.hole_number].push(h.stableford_points);
    });
    const result:Record<string,{hole:number,avgPts:number,rounds:number}[]>={};
    Object.entries(map).forEach(([course,holes])=>{
      result[course]=Array.from({length:18},(_,i)=>{
        const arr=holes[i+1]||[];
        return{hole:i+1,avgPts:arr.length?arr.reduce((a:number,b:number)=>a+b,0)/arr.length:NaN,rounds:arr.length};
      });
    });
    return result;
  })();

  // Build per-event sparkline data for each course (round-by-round field avg)
  const courseSparklines:(Record<string,number[]>)=(()=>{
    const result:Record<string,number[]>={};
    if(!events||!leaderboard)return result;
    courseAvgs.forEach((c:any)=>{
      const evs=[...events.filter((e:any)=>e.course_name===c.name&&e.status==="Completed")]
        .sort((a:any,b:any)=>new Date(a.date).getTime()-new Date(b.date).getTime());
      const avgs=evs.map((ev:any)=>{
        const entries=leaderboard.filter((r:any)=>r.event_id===ev.event_id&&!golfers?.find((g:any)=>g.golfer_id===r.golfer_id)?.is_guest);
        return entries.length?entries.reduce((s:number,r:any)=>s+r.total_stableford_points,0)/entries.length:null;
      }).filter((v:any)=>v!=null) as number[];
      result[c.name]=avgs;
    });
    return result;
  })();

  // Course tile config — first two courses get hero tiles, rest fall back to info rows
  const TILE_CONFIGS=[
    {bg:"var(--green-900)",numColor:"#7dc07d",sparkColor:"#7dc07d"},
    {bg:"#4a2e05",numColor:"#e8c84a",sparkColor:"#e8c84a"},
  ];

  return(
    <div>
      <div className="card-title" style={{marginBottom:4}}>Stableford Averages by Course</div>
      <p style={{fontSize:13,color:"var(--text-muted)",marginBottom:12}}>Field average stableford points per course this season.</p>

      {/* Hero tiles — side by side, dark */}
      {courseAvgs.length>0&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}}>
          {courseAvgs.slice(0,2).map((c:any,i:number)=>{
            const tile=TILE_CONFIGS[i]||TILE_CONFIGS[0];
            const sparkData=courseSparklines[c.name]||[];
            const shortName=c.name.replace(" Golf Club","").replace(" GC","").replace("Golf Course","").replace("Golf Club","").trim();
            return(
              <div key={c.name} style={{
                background:tile.bg,
                borderRadius:"var(--radius-md)",
                padding:"14px 12px",
                color:"white",
                position:"relative",
                overflow:"hidden",
              }}>
                <div style={{fontSize:9,letterSpacing:"0.12em",textTransform:"uppercase",color:"rgba(255,255,255,0.45)",fontWeight:700,marginBottom:4}}>
                  {shortName}
                </div>
                <div style={{fontSize:36,fontWeight:700,lineHeight:1,color:tile.numColor,fontVariantNumeric:"tabular-nums"}}>
                  {c.avg.toFixed(1)}
                </div>
                <div style={{fontSize:11,color:"rgba(255,255,255,0.4)",marginTop:3}}>
                  pts avg · {c.count} round{c.count===1?"":"s"}
                </div>
                {sparkData.length>=2&&(
                  <div style={{marginTop:8}}>
                    <Sparkline data={sparkData} color={tile.sparkColor} height={44}/>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {/* Fallback info rows for any additional courses beyond 2 */}
      {courseAvgs.slice(2).map((c:any)=>(
        <div key={c.name} className="info-row">
          <span className="info-key">{c.name}</span>
          <span className="info-val">{c.count>0?(c.avg.toFixed(1)+" pts avg ("+c.count+" rounds)"):"No data"}</span>
        </div>
      ))}

      {/* Hole-by-hole averages per course */}
      <div style={{marginTop:20}}>
        <div className="card-title" style={{marginBottom:4}}>Hole-by-Hole Scoring Average</div>
        <p style={{fontSize:13,color:"var(--text-muted)",marginBottom:12}}>League avg Stableford pts per hole. Requires hole-by-hole entry.</p>
        {courseAvgs.map((c:any)=>{
          const courseHoles=holeAvgByCourse[c.name];
          const hasSomeData=courseHoles&&courseHoles.some((h:any)=>h.rounds>0);
          const courseRec=courses?courses.find((cr:any)=>cr.course_name===c.name):null;
          const pars:number[]=courseRec?.hole_pars||[];
          const sis:number[]=courseRec?.hole_stroke_indices||[];
          return(
            <div key={c.name} style={{marginBottom:22}}>
              <div style={{fontWeight:700,fontSize:14,color:"var(--green-800)",marginBottom:8,paddingBottom:5,borderBottom:"2px solid var(--green-100)"}}>{c.name}</div>
              {!hasSomeData?(
                <div style={{fontSize:13,color:"var(--text-muted)",fontStyle:"italic",padding:"6px 0"}}>
                  No hole-by-hole data recorded yet for this course.
                </div>
              ):(
                <>
                  {([{start:0,label:"Front 9"},{start:9,label:"Back 9"}] as {start:number,label:string}[]).map(({start,label})=>(
                    <div key={label} style={{marginBottom:10}}>
                      <div style={{fontSize:11,fontWeight:700,color:"var(--text-muted)",letterSpacing:"0.07em",textTransform:"uppercase",marginBottom:5}}>{label}</div>
                      <div style={{overflowX:"auto"}}>
                        <table style={{width:"100%",borderCollapse:"collapse",minWidth:320}}>
                          <thead>
                            <tr style={{background:"var(--green-900)"}}>
                              <th style={{padding:"5px 8px",fontSize:11,color:"var(--gold-300)",fontWeight:700,textAlign:"left",width:58}}>Hole</th>
                              {Array.from({length:9},(_,i)=>(
                                <th key={i} style={{padding:"5px 4px",fontSize:12,color:"var(--gold-300)",fontWeight:700,textAlign:"center",minWidth:28}}>{start+i+1}</th>
                              ))}
                              <th style={{padding:"5px 6px",fontSize:11,color:"var(--gold-300)",fontWeight:700,textAlign:"center",minWidth:36}}>Avg</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pars.length>0&&(
                              <tr style={{background:"var(--surface2)"}}>
                                <td style={{padding:"5px 8px",fontSize:11,color:"var(--text-muted)",fontWeight:600}}>Par</td>
                                {Array.from({length:9},(_,i)=>(
                                  <td key={i} style={{padding:"5px 4px",textAlign:"center",fontSize:12,color:"var(--text-muted)"}}>{pars[start+i]||"-"}</td>
                                ))}
                                <td style={{padding:"5px 6px",textAlign:"center",fontSize:12,color:"var(--text-muted)"}}>{pars.slice(start,start+9).reduce((a,b)=>a+b,0)||"-"}</td>
                              </tr>
                            )}
                            {sis.length>0&&(
                              <tr>
                                <td style={{padding:"4px 8px",fontSize:10,color:"var(--text-muted)",fontWeight:600}}>SI</td>
                                {Array.from({length:9},(_,i)=>(
                                  <td key={i} style={{padding:"4px 4px",textAlign:"center",fontSize:10,color:"var(--text-muted)"}}>{sis[start+i]||"-"}</td>
                                ))}
                                <td></td>
                              </tr>
                            )}
                            <tr>
                              <td style={{padding:"7px 8px",fontSize:11,fontWeight:700,color:"var(--text-muted)"}}>Avg Pts</td>
                              {Array.from({length:9},(_,i)=>{
                                const h=courseHoles?.[start+i];
                                const val=h&&h.rounds>0?h.avgPts:NaN;
                                const clr=isNaN(val)?"var(--border)":val>=2?"var(--green-600)":val>=1?"var(--text-secondary)":"var(--red-500)";
                                return(
                                  <td key={i} style={{padding:"7px 4px",textAlign:"center",fontWeight:isNaN(val)?400:700,fontSize:isNaN(val)?11:14,color:clr}}>
                                    {isNaN(val)?"--":val.toFixed(1)}
                                  </td>
                                );
                              })}
                              <td style={{padding:"7px 6px",textAlign:"center",fontWeight:700,fontSize:13,color:"var(--green-700)"}}>
                                {(()=>{
                                  const half=courseHoles?courseHoles.slice(start,start+9):[];
                                  const valid=half.filter((h:any)=>!isNaN(h.avgPts)&&h.rounds>0);
                                  return valid.length?(valid.reduce((s:number,h:any)=>s+h.avgPts,0)/valid.length).toFixed(1):"--";
                                })()}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
