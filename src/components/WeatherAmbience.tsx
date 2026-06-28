import React, { useMemo, useState, useEffect, useRef } from 'react';

// ── WMO code → scene ──────────────────────────────────────────────────────────
type WeatherScene = 'sunny' | 'partly-cloudy' | 'overcast' | 'rain' | 'thunderstorm' | 'snow' | 'none';

function getScene(code: number | null | undefined): WeatherScene {
  if (code == null) return 'none';
  if (code === 0)                                   return 'sunny';
  if (code === 1 || code === 2)                     return 'partly-cloudy';
  if (code === 3 || code === 45 || code === 48)     return 'overcast';
  if ([51,53,55,61,63,65,80,81,82].includes(code)) return 'rain';
  if ([95,96,99].includes(code))                    return 'thunderstorm';
  if ([71,73,75,77,85,86].includes(code))           return 'snow';
  return 'none';
}

// ── Card background gradient per scene ───────────────────────────────────────
export function getWeatherCardBg(code: number | null | undefined): string | undefined {
  const scene = getScene(code);
  const map: Partial<Record<WeatherScene, string>> = {
    'sunny':         'linear-gradient(170deg, #f5ede0 0%, #fdf7e8 55%, #fef9f0 100%)',
    'partly-cloudy': 'linear-gradient(170deg, #dde6ef 0%, #e8eff6 40%, #edf3f8 100%)',
    'overcast':      'linear-gradient(185deg, #b8c3d0 0%, #c8d2dc 30%, #d2dae2 60%, #dce3e8 100%)',
    'rain':          'linear-gradient(185deg, #8aa0b4 0%, #9fb2c3 25%, #b0c1ce 55%, #c4d0d8 100%)',
    'thunderstorm':  'linear-gradient(185deg, #5c6e80 0%, #6e7f90 25%, #828f9c 55%, #9ba5ae 100%)',
    'snow':          'linear-gradient(185deg, #c0ccd8 0%, #cdd7e2 30%, #d8e1ea 60%, #e4eaef 100%)',
  };
  return map[scene];
}

// ── CSS keyframes — injected once ────────────────────────────────────────────
const KEYFRAMES = `
  @keyframes wx-cloud-f { 0%{transform:translateX(0)} 100%{transform:translateX(-24px)} }
  @keyframes wx-cloud-r { 0%{transform:translateX(0)} 100%{transform:translateX(22px)} }
  @keyframes wx-sun-pulse { 0%,100%{opacity:.88;transform:scale(1)} 50%{opacity:1;transform:scale(1.05)} }
  @keyframes wx-warm-glow { 0%,100%{opacity:.68} 50%{opacity:.9} }
  @keyframes wx-rain-fall {
    0%{transform:translateY(-30px) translateX(0);opacity:0}
    6%{opacity:1} 94%{opacity:.72}
    100%{transform:translateY(460px) translateX(-15px);opacity:0}
  }
  @keyframes wx-splash {
    0%{transform:scale(0);opacity:.6}
    100%{transform:scale(2.4) translateY(-2px);opacity:0}
  }
  @keyframes wx-snow-fall {
    0%{transform:translateY(-15px) translateX(0) rotate(0deg);opacity:0}
    9%{opacity:.9} 91%{opacity:.8}
    100%{transform:translateY(460px) translateX(20px) rotate(310deg);opacity:0}
  }
  @keyframes wx-lightning {
    0%,84%,100%{opacity:0}
    86%{opacity:1} 88%{opacity:.08} 90%{opacity:.95} 92%{opacity:0}
  }
`;

let keyframesInjected = false;
function ensureKeyframes() {
  if (keyframesInjected) return;
  const style = document.createElement('style');
  style.textContent = KEYFRAMES;
  document.head.appendChild(style);
  keyframesInjected = true;
}

// ── Cloud component — blurred multi-dome ellipses ────────────────────────────
interface CloudProps {
  x: number; y: number; w: number; h: number;
  opacity: number; blur: number; color: string;
  dur: string; dir?: 'f' | 'r';
}
function Cloud({ x, y, w, h, opacity, blur, color, dur, dir = 'f' }: CloudProps) {
  return (
    <div style={{
      position: 'absolute', left: x, top: y, width: w, height: h,
      opacity, filter: `blur(${blur}px)`,
      animation: `${dir === 'r' ? 'wx-cloud-r' : 'wx-cloud-f'} ${dur} ease-in-out infinite alternate`,
    }}>
      <div style={{ position:'absolute', inset:0, background:color, borderRadius:'50%' }} />
      <div style={{
        position:'absolute', borderRadius:'50%', background:color,
        width: Math.round(w*.62), height: Math.round(h*1.42),
        top: Math.round(-h*.52), left: Math.round(w*.1),
      }} />
      <div style={{
        position:'absolute', borderRadius:'50%', background:color,
        width: Math.round(w*.44), height: Math.round(h*1.18),
        top: Math.round(-h*.32), left: Math.round(w*.5),
      }} />
    </div>
  );
}

// ── Scene components ──────────────────────────────────────────────────────────

function SunnyScene() {
  return (
    <>
      <div style={{
        position:'absolute', right:-40, top:-50, width:220, height:250, borderRadius:'50%',
        background:'radial-gradient(circle at 38% 38%, rgba(255,253,200,.92) 0%, rgba(253,211,80,.76) 30%, rgba(251,176,52,.44) 56%, transparent 76%)',
        filter:'blur(14px)',
        animation:'wx-sun-pulse 4s ease-in-out infinite',
      }} />
      <div style={{
        position:'absolute', right:-60, top:-80, width:340, height:275, borderRadius:'50%',
        background:'radial-gradient(ellipse, rgba(254,220,100,.2) 0%, transparent 68%)',
        filter:'blur(8px)',
        animation:'wx-warm-glow 5s ease-in-out infinite',
      }} />
    </>
  );
}

function PartlyCloudyScene() {
  return (
    <>
      <div style={{
        position:'absolute', right:20, top:-20, width:120, height:230, borderRadius:'50%',
        background:'radial-gradient(circle at 42% 42%, rgba(255,250,190,.95) 0%, rgba(253,211,80,.68) 28%, rgba(251,176,52,.36) 52%, transparent 70%)',
        filter:'blur(10px)', opacity:.72,
        animation:'wx-sun-pulse 5s ease-in-out infinite',
      }} />
      <Cloud x={-30} y={10}  w={250} h={72} opacity={.52} blur={10} color="rgba(235,240,248,0.82)" dur="38s" dir="f" />
      <Cloud x={80}  y={28}  w={180} h={55} opacity={.65} blur={7}  color="rgba(242,246,252,0.88)" dur="26s" dir="r" />
      <Cloud x={160} y={5}   w={140} h={42} opacity={.44} blur={12} color="rgba(230,237,248,0.75)" dur="44s" dir="f" />
    </>
  );
}

function OvercastScene() {
  return (
    <>
      <div style={{ position:'absolute', inset:0, background:'linear-gradient(180deg, rgba(80,98,118,.26) 0%, rgba(80,98,118,.05) 60%, transparent 100%)' }} />
      <Cloud x={-60} y={-20} w={320} h={150}  opacity={.55} blur={18} color="rgba(195,205,218,0.68)" dur="65s" dir="f" />
      <Cloud x={160} y={-10} w={260} h={135}  opacity={.48} blur={15} color="rgba(195,205,218,0.65)" dur="80s" dir="r" />
      <Cloud x={-20} y={25}  w={230} h={138}  opacity={.62} blur={10} color="rgba(230,235,242,0.72)" dur="50s" dir="r" />
      <Cloud x={130} y={35}  w={200} h={128}  opacity={.58} blur={9}  color="rgba(230,235,242,0.70)" dur="42s" dir="f" />
      <Cloud x={50}  y={55}  w={160} h={118}  opacity={.5}  blur={7}  color="rgba(240,244,250,0.68)" dur="36s" dir="f" />
    </>
  );
}

interface Drop { x: number; dur: string; del: string; len: number; op: string; }
interface Splash { x: number; y: number; dur: string; del: string; w: number; }

function RainScene({ cardHeight }: { cardHeight: number }) {
  const drops = useMemo<Drop[]>(() =>
    Array.from({ length: 70 }, (_, i) => ({
      x:   Math.sin(i * 7.3) * 150 + 160,
      dur: (.55 + (i % 7) * .05).toFixed(2),
      del: ((i * .034) % 2.2).toFixed(2),
      len: 11 + (i % 5) * 3,
      op:  (.45 + (i % 6) * .08).toFixed(2),
    })), []);

  const splashes = useMemo<Splash[]>(() =>
    Array.from({ length: 28 }, (_, i) => ({
      x:   (i * 37.3) % 320,
      y:   cardHeight * .62 + (i % 8) * (cardHeight * .034),
      dur: (.22 + (i % 5) * .04).toFixed(2),
      del: ((i * .078) % 2.2).toFixed(2),
      w:   5 + (i % 4),
    })), [cardHeight]);

  return (
    <>
      <div style={{ position:'absolute', inset:0, background:'linear-gradient(180deg, rgba(50,70,95,.38) 0%, rgba(50,70,95,.10) 65%, transparent 100%)' }} />
      <Cloud x={-50} y={-30} w={310} h={100} opacity={.72} blur={22} color="rgba(130,145,168,0.75)" dur="70s" dir="f" />
      <Cloud x={140} y={-15} w={250} h={80}  opacity={.65} blur={18} color="rgba(130,145,168,0.72)" dur="88s" dir="r" />
      <Cloud x={-10} y={20}  w={200} h={65}  opacity={.6}  blur={14} color="rgba(145,158,178,0.65)" dur="55s" dir="f" />
      {drops.map((d, i) => (
        <div key={i} style={{
          position:'absolute', left:d.x, top:-30, width:1, height:d.len,
          background:`linear-gradient(to bottom, transparent, rgba(170,200,230,${d.op}))`,
          borderRadius:1,
          animation:`wx-rain-fall ${d.dur}s ${d.del}s linear infinite`,
        }} />
      ))}
      {splashes.map((s, i) => (
        <div key={i} style={{
          position:'absolute', left:s.x, top:s.y,
          width:s.w, height:Math.round(s.w*.4), borderRadius:'50%',
          background:'rgba(170,205,235,.42)',
          animation:`wx-splash ${s.dur}s ${s.del}s ease-out infinite`,
        }} />
      ))}
    </>
  );
}

function ThunderstormScene({ cardHeight }: { cardHeight: number }) {
  const drops = useMemo<Drop[]>(() =>
    Array.from({ length: 55 }, (_, i) => ({
      x:   Math.sin(i * 6.1) * 150 + 155,
      dur: (.5 + (i % 6) * .05).toFixed(2),
      del: ((i * .038) % 2).toFixed(2),
      len: 12 + (i % 5) * 3.5,
      op:  (.4 + (i % 6) * .08).toFixed(2),
    })), []);

  const H = cardHeight;
  const pts1 = `26,0 18,${H*.17} 30,${H*.17} 13,${H*.44} 28,${H*.44} 10,${H*.73} 24,${H*.73} 7,${H}`;
  const pts2 = `18,0 12,${H*.22} 22,${H*.22} 8,${H*.55} 20,${H*.55} 6,${H*.82}`;

  return (
    <>
      <div style={{ position:'absolute', inset:0, background:'linear-gradient(180deg, rgba(28,42,62,.58) 0%, rgba(28,42,62,.18) 65%, transparent 100%)' }} />
      <Cloud x={-60} y={-35} w={350} h={115} opacity={.78} blur={26} color="rgba(105,120,142,0.78)" dur="80s"  dir="f" />
      <Cloud x={120} y={-20} w={280} h={95}  opacity={.72} blur={22} color="rgba(105,120,142,0.74)" dur="100s" dir="r" />
      <Cloud x={-20} y={28}  w={220} h={72}  opacity={.65} blur={16} color="rgba(120,135,155,0.68)" dur="68s"  dir="f" />

      {drops.map((d, i) => (
        <div key={i} style={{
          position:'absolute', left:d.x, top:-30, width:1, height:d.len,
          background:`linear-gradient(to bottom, transparent, rgba(160,190,225,${d.op}))`,
          borderRadius:1,
          animation:`wx-rain-fall ${d.dur}s ${d.del}s linear infinite`,
        }} />
      ))}

      <div style={{
        position:'absolute', left:'42%', top:0, width:48, height:H, zIndex:5,
        filter:'drop-shadow(0 0 8px rgba(255,245,120,.95)) drop-shadow(0 0 24px rgba(255,240,80,.5))',
        animation:'wx-lightning 4.2s 0.6s ease-out infinite',
      }}>
        <svg viewBox={`0 0 48 ${H}`} width={48} height={H}>
          <polyline points={pts1} fill="none" stroke="rgba(255,248,140,0.96)" strokeWidth="2.8" strokeLinejoin="round" strokeLinecap="round" />
          <polyline points={pts1} fill="none" stroke="rgba(255,255,255,0.82)" strokeWidth="1.1" strokeLinejoin="round" />
        </svg>
      </div>

      <div style={{
        position:'absolute', left:'68%', top:0, width:34, height:Math.round(H*.72), zIndex:5,
        filter:'drop-shadow(0 0 5px rgba(255,245,120,.88)) drop-shadow(0 0 15px rgba(255,240,80,.42))',
        animation:'wx-lightning 5.8s 2.1s ease-out infinite',
      }}>
        <svg viewBox={`0 0 34 ${Math.round(H*.72)}`} width={34} height={Math.round(H*.72)}>
          <polyline points={pts2} fill="none" stroke="rgba(255,248,140,0.92)" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      </div>
    </>
  );
}

interface Flake { x: number; sz: number; dur: string; del: string; op: string; glyph: string; }

function SnowScene() {
  const flakes = useMemo<Flake[]>(() => {
    const glyphs = ['•','·','·','•','·','·','•'];
    return Array.from({ length: 45 }, (_, i) => ({
      x:    (i * 41.7) % 340,
      sz:   glyphs[i%glyphs.length] === '•' ? 5 + (i%4) : 3 + (i%3),
      dur:  (3.5 + (i%7)*.6).toFixed(1),
      del:  ((i*.13)%6).toFixed(1),
      op:   (.55 + (i%5)*.08).toFixed(2),
      glyph: glyphs[i % glyphs.length],
    }));
  }, []);

  return (
    <>
      <div style={{ position:'absolute', inset:0, background:'linear-gradient(180deg, rgba(130,155,185,.22) 0%, transparent 60%)' }} />
      <Cloud x={-40} y={-15} w={280} h={82} opacity={.55} blur={20} color="rgba(200,212,228,0.72)" dur="60s" dir="f" />
      <Cloud x={130} y={-5}  w={220} h={65} opacity={.5}  blur={16} color="rgba(210,220,235,0.68)" dur="75s" dir="r" />
      <Cloud x={20}  y={30}  w={180} h={55} opacity={.45} blur={12} color="rgba(215,224,238,0.62)" dur="52s" dir="f" />
      {flakes.map((f, i) => (
        <div key={i} style={{
          position:'absolute', left:f.x, top:-20,
          fontSize:f.sz, color:`rgba(225,232,245,${f.op})`,
          animation:`wx-snow-fall ${f.dur}s ${f.del}s linear infinite`,
          userSelect:'none', pointerEvents:'none',
        }}>{f.glyph}</div>
      ))}
    </>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
interface WeatherAmbienceProps {
  weatherCode: number | null | undefined;
  cardHeight?: number;
}

export function WeatherAmbience({ weatherCode, cardHeight = 340 }: WeatherAmbienceProps) {
  const [visible, setVisible] = useState(false);
  const mountRef = useRef(Date.now());

  useEffect(() => {
    if (weatherCode == null) return;
    const elapsed = Date.now() - mountRef.current;
    const remaining = Math.max(0, 350 - elapsed);
    const t = setTimeout(() => setVisible(true), remaining);
    return () => clearTimeout(t);
  }, [weatherCode]);

  ensureKeyframes();
  const scene = getScene(weatherCode);
  if (scene === 'none') return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute', inset: 0,
        borderRadius: 'inherit', overflow: 'hidden',
        pointerEvents: 'none', zIndex: 0,
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.4s ease',
      }}
    >
      {scene === 'sunny'         && <SunnyScene />}
      {scene === 'partly-cloudy' && <PartlyCloudyScene />}
      {scene === 'overcast'      && <OvercastScene />}
      {scene === 'rain'          && <RainScene cardHeight={cardHeight} />}
      {scene === 'thunderstorm'  && <ThunderstormScene cardHeight={cardHeight} />}
      {scene === 'snow'          && <SnowScene />}
    </div>
  );
}
