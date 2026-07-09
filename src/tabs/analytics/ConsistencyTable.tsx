// -- Consistency (Std Dev) Table -------------------------------
export function ConsistencyTable({seasonData,memberGolferId}:any){
  const rows=[...seasonData].map((d:any)=>{
    if(d.allPts.length<3)return null;
    const avg=d.allPts.reduce((a:number,b:number)=>a+b,0)/d.allPts.length;
    const variance=d.allPts.reduce((s:number,p:number)=>s+(p-avg)**2,0)/d.allPts.length;
    const stdDev=Math.sqrt(variance);
    // Scoring range: max-min
    const range=d.best-d.worst;
    return{golfer:d.golfer,rounds:d.allPts.length,avg,stdDev,range,best:d.best,worst:d.worst};
  }).filter(Boolean).sort((a:any,b:any)=>a.stdDev-b.stdDev);

  return(
    <div>
      <div className="card-title" style={{marginBottom:4}}>Consistency Ranking</div>
      <p style={{fontSize:13,color:"var(--text-muted)",marginBottom:12}}>Lower std dev = more consistent. Min 3 rounds to qualify.</p>
      <div style={{background:"var(--surface)",borderRadius:"var(--radius-md)",border:"1px solid var(--border)",overflow:"hidden"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
          <thead>
            <tr style={{background:"var(--green-900)"}}>
              <th style={{color:"var(--gold-300)",padding:"9px 10px",textAlign:"left",fontSize:12,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase"}}>#</th>
              <th style={{color:"var(--gold-300)",padding:"9px 8px",textAlign:"left",fontSize:12,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase"}}>Golfer</th>
              <th style={{color:"var(--gold-300)",padding:"9px 6px",textAlign:"center",fontSize:12,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase"}}>Avg</th>
              <th style={{color:"var(--gold-300)",padding:"9px 6px",textAlign:"center",fontSize:12,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase"}}>Std Dev</th>
              <th style={{color:"var(--gold-300)",padding:"9px 6px",textAlign:"center",fontSize:12,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase"}}>Range</th>
              <th style={{color:"var(--gold-300)",padding:"9px 8px",textAlign:"center",fontSize:12,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase"}}>Rnds</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r:any,i:number)=>{
              // Inline gold "me" treatment — the zebra background is inline, so a CSS class can't win here
              const isMe=r.golfer.golfer_id===memberGolferId;
              return(
              <tr key={r.golfer.golfer_id} style={{background:isMe?"color-mix(in srgb,var(--gold-500) 9%,var(--surface))":i===0?"var(--green-50)":i%2===1?"var(--surface2)":undefined,borderBottom:"1px solid var(--border)"}}>
                <td style={{padding:"11px 10px",fontWeight:700,color:i===0?"var(--gold-500)":"var(--text-muted)",fontSize:18,boxShadow:isMe?"inset 3px 0 0 var(--gold-500)":undefined}}>{i===0?"⭐":i+1}</td>
                <td style={{padding:"11px 8px",fontWeight:600,fontSize:16}}>{r.golfer.first_name} {r.golfer.last_name}</td>
                <td style={{padding:"11px 6px",textAlign:"center",color:"var(--green-700)",fontWeight:700,fontSize:16}}>{r.avg.toFixed(1)}</td>
                <td style={{padding:"11px 6px",textAlign:"center",fontWeight:700,fontSize:16,color:i===0?"var(--green-600)":"var(--text-primary)"}}>{r.stdDev.toFixed(2)}</td>
                <td style={{padding:"11px 6px",textAlign:"center",color:"var(--text-muted)",fontSize:15}}>{r.best}-{r.worst}</td>
                <td style={{padding:"11px 8px",textAlign:"center",color:"var(--text-muted)",fontSize:15}}>{r.rounds}</td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
