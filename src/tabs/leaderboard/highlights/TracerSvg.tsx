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
    // Ring only -- no ground shadow (it was under the removed landing dot).
    return (
      <>
        <circle className="tring" cx={x} cy={y} r="16" fill="none" stroke={col} strokeWidth="4" />
        <g className="endm">
          <circle cx={x} cy={y} r="16" fill="none" stroke={col} strokeWidth="5.5" />
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
            return <line key={a} x1={x} y1={y} x2={Math.round(x + Math.cos(r) * 19)} y2={Math.round(y + Math.sin(r) * 19)} stroke={col} strokeWidth="3" strokeLinecap="round" />;
          })}
          <circle cx={x} cy={y} r="6" fill={col} />
        </g>
      </>
    );
  }
  // Trouble X in a brighter red than the tracer's soft coral, so the miss reads.
  return (
    <>
      {shadow}
      <g className="endm">
        <line x1={x - 12} y1={y - 12} x2={x + 12} y2={y + 12} stroke="#ff3b30" strokeWidth="5" strokeLinecap="round" />
        <line x1={x + 12} y1={y - 12} x2={x - 12} y2={y + 12} stroke="#ff3b30" strokeWidth="5" strokeLinecap="round" />
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
    // worse comes up short of the hole. Do NOT "improve" this into 1-putt/
    // 2-putt claims.
    const edge: Pt = anchors.edge, pin: Pt = anchors.pin;
    if (!edge || !pin) return null;
    // net birdie+ -> into the cup; net par -> settles just beside the pin;
    // worse -> comes up SHORT along the putt line (a left-short first putt is
    // the classic 3-putt), NOT sailing past off-line. "Short" = ~78% of the way
    // from the edge to the pin, so it stops on-line before the hole regardless
    // of green orientation.
    const shortOf = (t: number): Pt => ({ x: edge.x + (pin.x - edge.x) * t, y: edge.y + (pin.y - edge.y) * t });
    const end: Pt = points >= 3 ? pin : points === 2 ? { x: pin.x - 0.03, y: pin.y + 0.03 } : shortOf(0.78);
    const col = points >= 3 ? "#ffd76a" : points === 2 ? "#88e6a6" : "#e4c98a";
    const E = P(end);
    return (
      <svg className="tracer" viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none">
        <circle cx={P(edge).x} cy={P(edge).y} r="7" fill="#fff" opacity=".9" />
        <circle cx={P(pin).x} cy={P(pin).y} r="5" fill="none" stroke="#fff" strokeWidth="2.5" opacity=".8" />
        <path className="trace" d={puttPath(edge, end)} pathLength={100} fill="none" stroke={col} strokeWidth="9" strokeLinecap="round" opacity=".28" />
        <path className="trace" d={puttPath(edge, end)} pathLength={100} fill="none" stroke="#fff" strokeWidth="4.6" strokeLinecap="round" />
        {points >= 3 && <circle className="tring" cx={E.x} cy={E.y} r="13" fill="none" stroke={col} strokeWidth="2.5" />}
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
    <svg className="tracer" viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none">
      <circle cx={P(tee).x} cy={P(tee).y} r="7" fill="#fff" opacity=".9" />
      {/* landing marker renders BEFORE the paths so the green landing rings sit
          UNDER the tracer (paint order = z-order within one SVG) rather than
          overlapping it. */}
      {landingMarker(E.x, E.y, col, endType)}
      <path className="trace" d={d} pathLength={100} fill="none" stroke={col} strokeWidth="10" strokeLinecap="round" opacity=".28" />
      <path className="trace" d={d} pathLength={100} fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}
