import { useRef, useEffect } from "react";
import {
  Chart as ChartJS,
  CategoryScale, LinearScale,
  PointElement, LineElement, BarElement,
  LineController, BarController, ScatterController,
  Filler, Legend, Tooltip
} from "chart.js";
ChartJS.register(
  CategoryScale, LinearScale,
  PointElement, LineElement, BarElement,
  LineController, BarController, ScatterController,
  Filler, Legend, Tooltip
);

// ============================================================
// ANALYTICS TAB -- rich dashboard
// ============================================================
// ChartCanvas: mounts a canvas via ref and builds the chart.
// Avoids getElementById race conditions entirely.
// ============================================================
export function ChartCanvas({config,deps,height=200,style}:{
  config:object, deps:any[], height?:number, style?:any
}){
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    const canvas=ref.current; if(!canvas)return;
    const existing=ChartJS.getChart(canvas); if(existing)existing.destroy();
    new ChartJS(canvas,config as any);
    return()=>{ const c=ChartJS.getChart(canvas); if(c)c.destroy(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[...deps]);
  return(
    <div style={{position:"relative",width:"100%",height,...(style||{})}}>
      <canvas ref={ref}/>
    </div>
  );
}
