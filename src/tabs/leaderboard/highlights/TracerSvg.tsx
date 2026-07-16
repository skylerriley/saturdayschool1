// Anchor-driven shot tracer, shared by the story viewer and the admin anchor
// authoring tool so both render identical geometry (math in tracerMath.ts).
//
// VALENCE comes from Stableford POINTS ONLY (a gross bogey worth 2 points is
// a good hole): >=3 pin + ring pulse, 2 green, 1 bunker, 0 trouble.
import { VB_W, VB_H, toPx, arcPath, puttPath, type Pt } from "./tracerMath";

const P = toPx;

function landingMarker(x: number, y: number, col: string, end: "green" | "bunker" | "trouble") {
  const shadow = <ellipse cx={x} cy={y + 9} rx="9" ry="3" fill="#000" opacity=".3" className="endm" />;
  if (end === "green") {
    return (
      <>
        {shadow}
        <circle className="tring" cx={x} cy={y} r="14" fill="none" stroke={col} strokeWidth="2.5" />
        <g className="endm">
          <circle cx={x} cy={y} r="14" fill="none" stroke={col} strokeWidth="3.5" />
          <circle cx={x} cy={y} r="5" fill={col} />
        </g>
      </>
    );
  }
  if (end === "bunker") {
    return (
      <>
        {shadow}
        <g className="endm">
          {[0, 60, 120, 180, 240, 300].map((a) => {
            const r = (Math.PI * a) / 180;
            return <line key={a} x1={x} y1={y} x2={Math.round(x + Math.cos(r) * 14)} y2={Math.round(y + Math.sin(r) * 14)} stroke={col} strokeWidth="2.5" strokeLinecap="round" />;
          })}
          <circle cx={x} cy={y} r="4.5" fill={col} />
        </g>
      </>
    );
  }
  return (
    <>
      {shadow}
      <g className="endm">
        <line x1={x - 9} y1={y - 9} x2={x + 9} y2={y + 9} stroke={col} strokeWidth="4" strokeLinecap="round" />
        <line x1={x + 9} y1={y - 9} x2={x - 9} y2={y + 9} stroke={col} strokeWidth="4" strokeLinecap="round" />
      </g>
    </>
  );
}

export function TracerSvg({ points, anchors, view }: { points: number; anchors: any; view: "hole" | "green" }) {
  if (!anchors) return null;
  if (view === "green") {
    // GREEN VIEW -- HONESTY CONSTRAINT: we have gross+points only, never
    // shot-level data, so putt counts are unknowable. This renders OUTCOME
    // only: net birdie tracks into the cup, net par settles beside the pin,
    // worse slides past. Do NOT "improve" this into 1-putt/2-putt claims.
    const edge: Pt = anchors.edge, pin: Pt = anchors.pin;
    if (!edge || !pin) return null;
    const end: Pt = points >= 3 ? pin : points === 2 ? { x: pin.x - 0.03, y: pin.y + 0.03 } : { x: pin.x + 0.09, y: pin.y - 0.05 };
    const col = points >= 3 ? "#ffd76a" : points === 2 ? "#88e6a6" : "#e4c98a";
    const E = P(end);
    return (
      <svg className="tracer" viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="xMidYMid slice">
        <circle cx={P(edge).x} cy={P(edge).y} r="7" fill="#fff" opacity=".9" />
        <circle cx={P(pin).x} cy={P(pin).y} r="5" fill="none" stroke="#fff" strokeWidth="2.5" opacity=".8" />
        <path className="trace" d={puttPath(edge, end)} pathLength={100} fill="none" stroke={col} strokeWidth="7" strokeLinecap="round" opacity=".28" />
        <path className="trace" d={puttPath(edge, end)} pathLength={100} fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
        {points >= 3 && <circle className="tring" cx={E.x} cy={E.y} r="13" fill="none" stroke={col} strokeWidth="2.5" />}
        <g className="endm"><circle cx={E.x} cy={E.y} r="5" fill={col} /></g>
      </svg>
    );
  }
  const tee: Pt = anchors.tee, green: Pt = anchors.green;
  const bunker: Pt = anchors.bunker || anchors.green;
  const trouble: Pt = anchors.trouble || anchors.bunker || anchors.green;
  if (!tee || !green) return null;
  const kind = points >= 3 ? "sink" : points === 2 ? "steady" : points === 1 ? "miss" : "spray";
  const end: Pt = kind === "miss" ? bunker : kind === "spray" ? trouble : green;
  const col = kind === "sink" ? "#ffd76a" : kind === "steady" ? "#88e6a6" : kind === "miss" ? "#e4c98a" : "#ff7a68";
  const endType: "green" | "bunker" | "trouble" = kind === "miss" ? "bunker" : kind === "spray" ? "trouble" : "green";
  const d = arcPath(tee, end, kind === "spray" ? 0.22 : 0.34, endType === "green" ? anchors.apex : undefined);
  const E = P(end);
  return (
    <svg className="tracer" viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="xMidYMid slice">
      <circle cx={P(tee).x} cy={P(tee).y} r="7" fill="#fff" opacity=".9" />
      <path className="trace" d={d} pathLength={100} fill="none" stroke={col} strokeWidth="8" strokeLinecap="round" opacity=".28" />
      <path className="trace" d={d} pathLength={100} fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      {landingMarker(E.x, E.y, col, endType)}
    </svg>
  );
}
