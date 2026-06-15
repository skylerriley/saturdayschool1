import { ChartCanvas } from "./ChartCanvas";

export function CourseChart({courseAvgs,holeScores,events,courses,leaderboard,golfers}:any){
  const config = {
    type:"bar" as const,
    data:{
      labels:courseAvgs.map((c:any)=>c.name),
      datasets:[{
        label:"Avg Pts",
        data:courseAvgs.map((c:any)=>parseFloat(c.avg.toFixed(1))),
        backgroundColor:["#1a7340","#c47800","#a32020","#0f4526","#9a5a00"],
        borderRadius:6
      }]
    },
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:(c:any)=>(c.parsed.y.toFixed(1)+" pts avg")}}},
      scales:{
        y:{beginAtZero:false,min:20,ticks:{color:"#6b5240",font:{family:"DM Sans, sans-serif",size:14}},grid:{color:"rgba(74,55,40,0.1)"}},
        x:{ticks:{color:"#6b5240",font:{family:"DM Sans, sans-serif",size:13}},grid:{display:false}}
      }
    }
  };

  // Build per-hole averages across all rounds for each course
  const holeAvgByCourse=(()=>{
    const map:Record<string,Record<number,number[]>>={};
    if(!holeScores||!events||!leaderboard)return {} as Record<string,{hole:number,avgPts:number,rounds:number}[]>;
    // Map event_id -> course_name from events
    const evCourseMap:Record<number,string>={};
    events.forEach((e:any)=>{evCourseMap[e.event_id]=(e.course_name||'').trim();});
    // Map summary_id -> event_id from ALL leaderboard entries
    const summaryEvMap:Record<number,number>={};
    leaderboard.forEach((r:any)=>{summaryEvMap[r.summary_id]=r.event_id;});
    // Also map course_id -> course_name via courses table so we can
    // match tee box variants (blue/white/black) all to the same course name
    const courseIdToName:Record<number,string>={};
    if(courses){
      courses.forEach((c:any)=>{courseIdToName[c.course_id]=c.course_name;});
    }
    holeScores.forEach((h:any)=>{
      // Primary: look up via leaderboard summary_id -> event_id -> course_name
      let course:string|undefined=undefined;
      const eid=summaryEvMap[h.summary_id];
      if(eid)course=evCourseMap[eid];
      // Fallback: if summary_id didn't match (temp vs real ID mismatch),
      // try finding a leaderboard entry with a matching golfer+event via
      // the hole's summary_id being close to any leaderboard summary_id
      // (last resort: skip, don't invent data)
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

  return(
    <div>
      <div className="card-title" style={{marginBottom:4}}>Stableford Averages by Course</div>
      <p style={{fontSize:13,color:"var(--text-muted)",marginBottom:12}}>Field average stableford points per course this season.</p>
      {courseAvgs.map((c:any)=><div key={c.name} className="info-row"><span className="info-key">{c.name}</span><span className="info-val">{c.count>0?(c.avg.toFixed(1)+" pts avg ("+c.count+" rounds)"):"No data"}</span></div>)}
      <ChartCanvas config={config} deps={[courseAvgs.length,courseAvgs.map((c:any)=>c.avg).join()]} height={210} style={{marginTop:16}}/>

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
