import { useState, useEffect } from "react";

// ============================================================
// SCORING FINGERPRINT RADAR -- 6-axis spider chart.
// Supports darkMode for the By Golfer subtab dark card.
// ============================================================
export function ScoringFingerprintRadar({datasets,size=240,maxValue=4,darkMode=false}:{
  datasets:{label:string,color:string,fill?:string,dashed?:boolean,values:{par3:number,par4:number,par5:number,front9:number,back9:number,consistency:number}}[],
  size?:number,
  maxValue?:number,
  darkMode?:boolean,
}){
  // Reduced motion: skip the scale-in entrance entirely (start fully drawn)
  const reduceMotion=typeof window!=="undefined"&&window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [drawn,setDrawn]=useState(reduceMotion);
  useEffect(()=>{
    if(reduceMotion)return;
    const id=requestAnimationFrame(()=>requestAnimationFrame(()=>setDrawn(true)));
    return()=>cancelAnimationFrame(id);
  },[reduceMotion]);

  const axes=[
    {key:"par3",label:"Par 3"},
    {key:"par4",label:"Par 4"},
    {key:"par5",label:"Par 5"},
    {key:"back9",label:"Back 9"},
    {key:"consistency",label:"Consistency"},
    {key:"front9",label:"Front 9"},
  ] as const;

  const cx=size/2,cy=size/2;
  const r=size*0.36;
  const labelR=size*0.46;
  const n=axes.length;
  const angleFor=(i:number)=>(Math.PI*2*i)/n-Math.PI/2;

  const pointFor=(i:number,value:number)=>{
    const ratio=Math.max(0,Math.min(1,value/maxValue));
    const a=angleFor(i);
    return{x:cx+Math.cos(a)*r*ratio,y:cy+Math.sin(a)*r*ratio};
  };

  const ringLevels=[0.25,0.5,0.75,1];

  const gridColor=darkMode?"rgba(255,255,255,0.07)":"var(--border)";
  const labelColor=darkMode?"rgba(255,255,255,0.55)":"var(--text-muted)";

  return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
      <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{maxWidth:size,overflow:"visible"}}>
        {/* Grid rings */}
        {ringLevels.map((lvl,ri)=>{
          const pts=axes.map((_,i)=>{
            const a=angleFor(i);
            return`${cx+Math.cos(a)*r*lvl},${cy+Math.sin(a)*r*lvl}`;
          }).join(" ");
          return<polygon key={ri} points={pts} fill="none" stroke={gridColor} strokeWidth={1}/>;
        })}
        {/* Spokes */}
        {axes.map((_,i)=>{
          const a=angleFor(i);
          return<line key={i} x1={cx} y1={cy} x2={cx+Math.cos(a)*r} y2={cy+Math.sin(a)*r} stroke={gridColor} strokeWidth={1}/>;
        })}
        {/* Axis labels */}
        {axes.map((ax,i)=>{
          const a=angleFor(i);
          const x=cx+Math.cos(a)*labelR;
          const y=cy+Math.sin(a)*labelR;
          return(
            <text key={ax.key} x={x} y={y} fontSize={size*0.048} fontWeight={700} fill={labelColor} textAnchor="middle" dominantBaseline="middle" style={{textTransform:"uppercase",letterSpacing:"0.04em"}}>
              {ax.label}
            </text>
          );
        })}
        {/* Data polygons */}
        {datasets.map((ds,di)=>{
          const pts=axes.map((ax,i)=>{
            const v=(ds.values as any)[ax.key]||0;
            const p=pointFor(i,v);
            return`${p.x},${p.y}`;
          }).join(" ");
          const fillColor=ds.fill?ds.fill:ds.color;
          return(
            <polygon
              key={ds.label+di}
              points={pts}
              fill={fillColor}
              fillOpacity={ds.fill?1:0.18}
              stroke={ds.color}
              strokeWidth={ds.dashed?1.5:2}
              strokeDasharray={ds.dashed?"3 2":undefined}
              strokeLinejoin="round"
              style={{
                transformOrigin:`${cx}px ${cy}px`,
                transform:drawn?"scale(1)":"scale(0)",
                opacity:drawn?1:0,
                transition:`transform 0.7s cubic-bezier(0.22,1,0.36,1) ${di*0.12}s, opacity 0.5s ease ${di*0.12}s`,
              }}
            />
          );
        })}
        {/* Data point dots */}
        {datasets.map((ds,di)=>axes.map((ax,i)=>{
          const v=(ds.values as any)[ax.key]||0;
          const p=pointFor(i,v);
          return(
            <circle
              key={ds.label+di+"-"+ax.key}
              cx={p.x} cy={p.y} r={size*0.012}
              fill={ds.color}
              style={{
                transformOrigin:`${cx}px ${cy}px`,
                transform:drawn?"scale(1)":"scale(0)",
                opacity:drawn?1:0,
                transition:`transform 0.7s cubic-bezier(0.22,1,0.36,1) ${di*0.12+0.1}s, opacity 0.5s ease ${di*0.12+0.1}s`,
              }}
            />
          );
        }))}
      </svg>
      {/* Default legend (non-dark, multi-dataset) */}
      {!darkMode&&datasets.length>1&&(
        <div style={{display:"flex",gap:16,marginTop:6,flexWrap:"wrap",justifyContent:"center"}}>
          {datasets.map((ds,di)=>(
            <div key={ds.label+di} style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"var(--text-secondary)",fontWeight:600}}>
              <span style={{display:"inline-block",width:10,height:10,borderRadius:"50%",background:ds.color}}/>
              {ds.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
