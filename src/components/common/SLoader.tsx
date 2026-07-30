// ── SLoader ───────────────────────────────────────────────────────────────
// The animated "pulsing gold S" mark from the splash screen, packaged as a
// reusable loading indicator. Same SVG + keyframes as the App.tsx splash
// (adapted from the s-pulse standalone), but self-contained: it ships its own
// scoped CSS and ball grid so any view can drop it in while content loads.
//
// Usage: <SLoader/> centers the mark; wrap in a flex box for full-page centering.

// Hex-packed gold ball grid, generated once at module load. Delay is
// proportional to each ball's position along the top-left -> bottom-right
// diagonal so the fill sweeps in. (Mirrors SPLASH_BALLS in App.tsx.)
const SL_BALLS = (() => {
  const step = 23, r = 14.5, spread = 0.35;
  const out: { x: number; y: number; p: number }[] = [];
  let i = 0;
  for (let y = 8; y <= 352; y += step * 0.88, i++) {
    for (let x = (i % 2 ? -3 : 8.5); x <= 306; x += step) out.push({ x, y, p: x + y });
  }
  const ps = out.map((b) => b.p);
  const lo = Math.min(...ps), hi = Math.max(...ps);
  return out.map((b, idx) => {
    const jitter = ((idx * 0.6180339887) % 1) * 0.015;
    const f = (spread * (b.p - lo)) / (hi - lo) + jitter;
    return { cx: +b.x.toFixed(1), cy: +b.y.toFixed(1), r, delay: f.toFixed(4) };
  });
})();

// Scoped to .sl-mark so it can't collide with the splash's .ss-splash rules.
const SL_CSS = `
  .sl-loader{ display:flex;align-items:center;justify-content:center; }
  .sl-mark{ position:relative;overflow:visible;height:auto; }
  :root{ --sl-dur:3s; }
  @keyframes sl-wipeOut {
    0%      { transform: rotate(-45deg) translateY(-330px); }
    44%,60% { transform: rotate(-45deg) translateY(330px); }
    100%    { transform: rotate(-45deg) translateY(-330px); }
  }
  @keyframes sl-ballPop {
    0%   { transform: scale(0); }
    5%   { transform: scale(1.18); }
    9%   { transform: scale(1); }
    56%  { transform: scale(1); }
    60%  { transform: scale(1.12); }
    65%  { transform: scale(0); }
    100% { transform: scale(0); }
  }
  @keyframes sl-racerMoveA { to { stroke-dashoffset: -300; } }
  @keyframes sl-racerMoveB { to { stroke-dashoffset: -318; } }
  @keyframes sl-baseOutline {
    0%,44% { opacity:.35; }
    58%    { opacity:0; }
    100%   { opacity:0; }
  }
  .sl-mark .sl-sweep   { transform-box: view-box; transform-origin: 150px 180px; animation: sl-wipeOut var(--sl-dur) linear infinite; }
  .sl-mark .sl-ball    { transform-box: fill-box; transform-origin: center; animation: sl-ballPop var(--sl-dur) cubic-bezier(.34,1.4,.5,1) infinite backwards; }
  .sl-mark .sl-outline { animation: sl-baseOutline var(--sl-dur) ease-in-out infinite; }
  .sl-mark .sl-racerA  { animation: sl-racerMoveA calc(var(--sl-dur) * 0.16) linear infinite; }
  .sl-mark .sl-racerB  { animation: sl-racerMoveB calc(var(--sl-dur) * 0.13) linear infinite; }
  @media (prefers-reduced-motion:reduce){
    .sl-mark .sl-ball{ animation:none!important;transform:none; }
    .sl-mark .sl-outline,.sl-mark .sl-racerA,.sl-mark .sl-racerB{ display:none!important; }
  }
`;

let slCssInjected = false;

// Unique id suffix per SVG instance so multiple loaders on one page don't
// share the same clip/gradient ids.
let slIdSeq = 0;

export function SLoader({ size = 88, className = "", style }: { size?: number; className?: string; style?: React.CSSProperties }) {
  if (!slCssInjected && typeof document !== "undefined") {
    const el = document.createElement("style");
    el.setAttribute("data-sl-loader", "");
    el.textContent = SL_CSS;
    document.head.appendChild(el);
    slCssInjected = true;
  }
  const uid = `sl${++slIdSeq}`;
  const holoId = `${uid}Holo`, sId = `${uid}S`, darkId = `${uid}Dark`, embId = `${uid}Emb`;

  return (
    <div className={`sl-loader ${className}`.trim()} style={style}>
      <svg className="sl-mark" viewBox="0 0 300 360" style={{ width: size, height: size * 1.2 }}>
        <defs>
          <linearGradient id={holoId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ff5f8f"/>
            <stop offset="0.25" stopColor="#ffc371"/>
            <stop offset="0.5" stopColor="#f6ff8f"/>
            <stop offset="0.75" stopColor="#7afcff"/>
            <stop offset="1" stopColor="#a17fff"/>
          </linearGradient>
          <clipPath id={sId}>
            <text x="150" y="180" textAnchor="middle" dominantBaseline="central" fontFamily="'DM Sans',sans-serif" fontWeight={900} fontSize="300">S</text>
          </clipPath>
          <clipPath id={darkId}>
            <rect className="sl-sweep" x="-500" y="0" width="1300" height="1000"></rect>
          </clipPath>
          <filter id={embId} x="-20%" y="-20%" width="140%" height="140%">
            <feOffset in="SourceAlpha" dx="0" dy="3" result="o1"></feOffset>
            <feGaussianBlur in="o1" stdDeviation="3" result="b1"></feGaussianBlur>
            <feComposite in="SourceAlpha" in2="b1" operator="out" result="inv1"></feComposite>
            <feFlood floodColor="#7f7f88" floodOpacity="0.3"></feFlood>
            <feComposite in2="inv1" operator="in" result="hl"></feComposite>
            <feOffset in="SourceAlpha" dx="0" dy="-3" result="o2"></feOffset>
            <feGaussianBlur in="o2" stdDeviation="3" result="b2"></feGaussianBlur>
            <feComposite in="SourceAlpha" in2="b2" operator="out" result="inv2"></feComposite>
            <feFlood floodColor="#000000" floodOpacity="0.5"></feFlood>
            <feComposite in2="inv2" operator="in" result="sh1"></feComposite>
            <feMerge>
              <feMergeNode in="SourceGraphic"></feMergeNode>
              <feMergeNode in="sh1"></feMergeNode>
              <feMergeNode in="hl"></feMergeNode>
            </feMerge>
          </filter>
        </defs>

        {/* dark body with recessed emboss */}
        <text x="150" y="180" textAnchor="middle" dominantBaseline="central" fontFamily="'DM Sans',sans-serif" fontWeight={900} fontSize="300" fill="#2a2a2f" filter={`url(#${embId})`}>S</text>

        {/* faint outline while empty */}
        <text className="sl-outline" x="150" y="180" textAnchor="middle" dominantBaseline="central" fontFamily="'DM Sans',sans-serif" fontWeight={900} fontSize="300" fill="none" stroke="#5a5a62" strokeWidth="1.5">S</text>

        {/* gold fill: hex-packed balls */}
        <g clipPath={`url(#${sId})`}>
          {SL_BALLS.map((b, i) => (
            <circle key={i} className="sl-ball" cx={b.cx} cy={b.cy} r={b.r} fill="#ffab00"
              style={{ animationDelay: `calc(var(--sl-dur) * ${b.delay})` }}/>
          ))}
        </g>

        {/* holographic tracers, clipped to the un-filled portion */}
        <text className="sl-racerA" x="150" y="180" textAnchor="middle" dominantBaseline="central" fontFamily="'DM Sans',sans-serif" fontWeight={900} fontSize="300" fill="none" stroke={`url(#${holoId})`} strokeWidth="2" strokeLinecap="round" strokeDasharray="190 110" clipPath={`url(#${darkId})`}>S</text>
        <text className="sl-racerB" x="150" y="180" textAnchor="middle" dominantBaseline="central" fontFamily="'DM Sans',sans-serif" fontWeight={900} fontSize="300" fill="none" stroke="#e8dcc0" strokeWidth="2" strokeLinecap="round" strokeDasharray="26 292" clipPath={`url(#${darkId})`}>S</text>

        {/* white dot on the bottom-right edge */}
        <circle cx="210" cy="265" r="28" fill="#f7f7f5"></circle>
      </svg>
    </div>
  );
}
