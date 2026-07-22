// Full-screen story viewer for event highlights -- recap visual language.
// Plays the merged card array (auto data beats + human moments) with progress
// pips, tap zones, visible arrows, press-and-hold pause, and auto-advance.
// Ported class-for-class from the approved mockup (recap-visual-language.html):
// hero label above the focus shot card, glass data panels, anchor-driven
// tracers, and the real .lb-* leaderboard for the final beat.
import { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { ScoreSymbol, GlassPicker } from "../../../components/common";
import type { DataBeat } from "../../../lib/recapEngine";
import { holeAerialUrl, holeImageRow, courseArtisticUrl, type RecapCard } from "./highlightsShared";
import { TracerSvg } from "./TracerSvg";
import { composeBeatShareImage, loadShareImage } from "./shareBeatImage";

const AUTO_ICON = <svg viewBox="0 0 24 24"><path d="M4 20V6l7 4 9-6v14l-9 5-7-4z" /></svg>;

const DUR_DATA = 8000;
const DUR_PHOTO = 6500;
const DUR_VIDEO = 7000;

// Gross score word for the HUMAN-highlight eyebrow ("Danny Reyes . Birdie (3)").
// Auto-beat copy stays points-valence (that rule lives in the engine); a photo
// of a real shot is about the gross number the group actually saw.
function grossLabel(gross: number, par: number): string {
  if (gross === 1) return "Ace";
  const d = gross - par;
  if (d <= -3) return "Albatross";
  if (d === -2) return "Eagle";
  if (d === -1) return "Birdie";
  if (d === 0) return "Par";
  if (d === 1) return "Bogey";
  if (d === 2) return "Double";
  if (d === 3) return "Triple";
  return "+" + d;
}

// Word-wrap for the share-image canvas.
function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = (text || "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  words.forEach((w) => {
    const trial = line ? line + " " + w : w;
    if (ctx.measureText(trial).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = trial;
    }
  });
  if (line) lines.push(line);
  return lines;
}

// ---- Building blocks -----------------------------------------------------------

// Pinch / double-tap zoom that is ISOLATED to the hole/green shot card. The
// tracer + hole-meta live INSIDE this element positioned in normalized image
// coords, so scaling the whole card keeps them locked to the image while the
// hero label, glass panel and caption (siblings above/below) never move.
// Reports zoom!=idle up to the viewer via onZoomChange so auto-advance, the
// swipe-to-close and tap-navigation all stand down while the user is exploring.
const ZOOM_MAX = 4;
function ZoomableShot({
  className, onZoomChange, passthrough, children,
}: {
  className: string;
  onZoomChange: (zoomed: boolean) => void;
  // At 1x with a single finger the shot is transparent to gestures: it forwards
  // to the viewer's own tap/hold/swipe handlers so tapping over the hole image
  // still navigates and a downward drag still closes. Zoom (pinch / 2nd finger /
  // double-tap / pan-while-zoomed) is owned here and never forwarded.
  passthrough: { down: (e: any) => void; move: (e: any) => void; up: (e: any) => void; cancel: (e: any) => void };
  children: any;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [t, setT] = useState({ scale: 1, x: 0, y: 0 });
  // Live gesture bookkeeping kept in a ref so pointer moves don't re-render
  // until we commit a frame.
  const g = useRef<{
    pts: Map<number, { x: number; y: number }>;
    startDist: number;
    startScale: number;
    startMid: { x: number; y: number };
    startT: { x: number; y: number };
    lastTap: number;
    moved: boolean;
    // "pass" -> this gesture is being forwarded to the viewer (tap/hold/swipe);
    // "zoom" -> owned here (pinch / pan-while-zoomed / double-tap).
    mode: "pass" | "zoom";
  }>({ pts: new Map(), startDist: 0, startScale: 1, startMid: { x: 0, y: 0 }, startT: { x: 0, y: 0 }, lastTap: 0, moved: false, mode: "pass" });

  const zoomed = t.scale > 1.01;
  useEffect(() => { onZoomChange(zoomed); }, [zoomed, onZoomChange]);
  // On unmount (beat change), make sure the viewer's zoom-active flag clears.
  useEffect(() => () => onZoomChange(false), [onZoomChange]);

  // Keep the image inside its own frame so panning can't drag it off-card.
  const clamp = (scale: number, x: number, y: number) => {
    const el = wrapRef.current;
    if (!el) return { scale, x, y };
    const r = el.getBoundingClientRect();
    const maxX = (r.width * (scale - 1)) / 2;
    const maxY = (r.height * (scale - 1)) / 2;
    return { scale, x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) };
  };

  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
  const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  const onDown = (e: any) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const st = g.current;
    st.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    st.moved = false;
    if (st.pts.size === 2) {
      // Second finger -> this becomes a pinch. Tell the viewer to abandon the
      // single-finger gesture it thought it had, then own the pointers here.
      st.mode = "zoom";
      passthrough.cancel(e);
      const [a, b] = [...st.pts.values()];
      st.startDist = dist(a, b);
      st.startScale = t.scale;
      st.startMid = mid(a, b);
      st.startT = { x: t.x, y: t.y };
    } else if (st.pts.size === 1) {
      st.startMid = { x: e.clientX, y: e.clientY };
      st.startT = { x: t.x, y: t.y };
      // Already zoomed -> own it (pan / double-tap-to-reset). At 1x, forward to
      // the viewer so tap-nav / hold-pause / swipe-close keep working.
      st.mode = zoomed ? "zoom" : "pass";
      if (st.mode === "pass") passthrough.down(e);
    }
  };

  const onMove = (e: any) => {
    const st = g.current;
    if (!st.pts.has(e.pointerId)) return;
    st.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (st.mode === "pass") { passthrough.move(e); return; }
    if (st.pts.size >= 2) {
      const [a, b] = [...st.pts.values()];
      const d = dist(a, b);
      if (st.startDist > 0) {
        const scale = Math.max(1, Math.min(ZOOM_MAX, st.startScale * (d / st.startDist)));
        const m = mid(a, b);
        const x = st.startT.x + (m.x - st.startMid.x);
        const y = st.startT.y + (m.y - st.startMid.y);
        st.moved = true;
        setT(clamp(scale, x, y));
      }
    } else if (st.pts.size === 1 && zoomed) {
      // One-finger pan while zoomed in.
      const p = [...st.pts.values()][0];
      const x = st.startT.x + (p.x - st.startMid.x);
      const y = st.startT.y + (p.y - st.startMid.y);
      if (Math.abs(p.x - st.startMid.x) + Math.abs(p.y - st.startMid.y) > 4) st.moved = true;
      setT(clamp(t.scale, x, y));
    }
  };

  const finishPointer = (e: any, forwardUp: boolean) => {
    const st = g.current;
    const wasPass = st.mode === "pass";
    st.pts.delete(e.pointerId);
    if (wasPass) { if (forwardUp) passthrough.up(e); return; }
    // Pinch -> one finger left: re-seed the pan origin from the survivor so the
    // continuing drag doesn't jump from the old two-finger midpoint.
    if (st.pts.size === 1) {
      const p = [...st.pts.values()][0];
      st.startMid = { x: p.x, y: p.y };
      st.startT = { x: t.x, y: t.y };
      return;
    }
    if (st.pts.size === 0 && !st.moved) {
      // Double-tap toggles between fit and 2.4x. Zooming in keeps the tapped
      // point stationary on screen (tx = -offset*(s-1)); clamp then pulls it
      // back inside the frame if that pushed an edge past the bounds.
      const now = e.timeStamp || 0;
      if (now - st.lastTap < 300) {
        st.lastTap = 0;
        if (zoomed) { setT({ scale: 1, x: 0, y: 0 }); }
        else {
          const el = wrapRef.current;
          const r = el?.getBoundingClientRect();
          const s = 2.4;
          if (r) {
            const cx = e.clientX - (r.left + r.width / 2);
            const cy = e.clientY - (r.top + r.height / 2);
            setT(clamp(s, -cx * (s - 1), -cy * (s - 1)));
          } else setT({ scale: s, x: 0, y: 0 });
        }
      } else {
        st.lastTap = now;
      }
    }
    // Reset to passthrough for the next gesture once all fingers lift.
    if (st.pts.size === 0) st.mode = "pass";
  };
  const onUp = (e: any) => finishPointer(e, true);
  const onCancel = (e: any) => { if (g.current.mode === "pass") passthrough.cancel(e); finishPointer(e, false); };

  return (
    <div
      ref={wrapRef}
      className={className + (zoomed ? " zoomed" : "")}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onCancel}
    >
      <div className="shot-zoom" style={{ transform: `translate(${t.x}px,${t.y}px) scale(${t.scale})` }}>
        {children}
      </div>
    </div>
  );
}

function HoleMetaBlock({ meta, animKey }: { meta: NonNullable<DataBeat["holeMeta"]>; animKey: any }) {
  return (
    <div className="hole-meta">
      <b><i key={animKey}>{meta.hole}</i></b>
      <span>Par {meta.par}</span>
      {meta.yards != null && <span>{meta.yards} Yds</span>}
    </div>
  );
}

// Fluid caption type by CONTENT LENGTH (Handoff #9 2c), not viewport width --
// the constraint is how many characters must fit. Discrete buckets so a long
// self-contained caption shrinks instead of running on / overlapping the
// footer. Stops tuned against real captions at phone width.
//   <= 60 -> 24px | 61-100 -> 21px | 101-140 -> 18px | > 140 -> 16px
function capSizeClass(parts: { t: string }[]): string {
  const len = parts.reduce((n, p) => n + p.t.length, 0);
  if (len <= 60) return "cap-xl";
  if (len <= 100) return "cap-lg";
  if (len <= 140) return "cap-md";
  return "cap-sm";
}

// Footer date -- the beat's IDENTIFICATION line (Handoff #10 6c), so it
// carries the YEAR. Same month spelling as the chart's shortDate ("Jul 11"),
// plus the year: "Jul 11, 2026". One format used on every card's footer.
const FOOT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function footerDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!m) return "";
  const mon = FOOT_MONTHS[Number(m[2]) - 1] || "";
  return `${mon} ${Number(m[3])}, ${m[1]}`;
}

function CaptionText({ parts }: { parts: { t: string; b?: boolean }[] }) {
  // Engine copy uses ASCII " -- "; render it as an em dash.
  const pretty = (t: string) => t.replace(/ -- /g, " — ");
  return <>{parts.map((p, i) => (p.b ? <b key={i}>{pretty(p.t)}</b> : <span key={i}>{pretty(p.t)}</span>))}</>;
}

function ScorecardStrip({ sc, standalone }: { sc: NonNullable<DataBeat["scorecard"]>; standalone?: boolean }) {
  const cell = (h: { gross: number; par: number }, i: number) => (
    <div key={i} className="sc-cell" style={{ animationDelay: `${i * 26}ms` }}>
      <span className="h">{i + 1}</span>
      <ScoreSymbol gross={h.gross} par={h.par} />
    </div>
  );
  return (
    <div className={"sccard" + (standalone ? " stand" : "")}>
      <div className="sc-nameline"><span className="n">{shortDisplay(sc.name)}</span><span className="p">{sc.totalPoints} Pts</span></div>
      <div className="sc-grid">{sc.holes.slice(0, 9).map(cell)}</div>
      {sc.holes.length > 9 && <div className="sc-grid">{sc.holes.slice(9).map((h, i) => cell(h, i + 9))}</div>}
    </div>
  );
}

function GlassPanel({ beat }: { beat: DataBeat }) {
  const fn = beat.protagonistName ? beat.protagonistName.split(" ")[0] : "";
  if (beat.streak) {
    const s = beat.streak;
    return (
      <div className="glass">
        <div className="glass-lbl">{beat.subtext ? `${beat.subtext}` : "Gross and points"}</div>
        <div className="streak st-win" style={{ "--s": s.focusStart / s.cells.length, "--n": s.focusCount / s.cells.length } as any}>
          {s.cells.map((c, i) => {
            const on = i >= s.focusStart && i < s.focusStart + s.focusCount;
            return (
              <div key={c.hole} className={"st-c" + (on ? " on" : "")}>
                <span className="h">{c.hole}</span>
                <ScoreSymbol gross={c.gross} par={c.par} />
                <span className="pt">{c.points}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  if (beat.scoreRow) {
    const r = beat.scoreRow;
    return (
      <div className="glass">
        <div className="glass-lbl">{fn ? `${fn} · hole ${beat.hole}, recent scores` : "Recent Scores"}</div>
        <div className="srow">
          {r.cells.map((c, i) => (
            <div key={i} className={"sr-c" + (c.highlight ? " hi" : "")} style={{ animationDelay: `${i * 90}ms` }}>
              <ScoreSymbol gross={c.gross} par={c.par} />
              <span className="pt">{c.points != null ? `${c.points} pt${c.points === 1 ? "" : "s"}` : "--"}</span>
              <span className="wk">{c.label}</span>
            </div>
          ))}
        </div>
        <div className="sr-avg"><span className="l">{r.avgLabel}</span><span className="v">{r.avgValue}</span></div>
      </div>
    );
  }
  if (beat.fieldBars) {
    const vals = beat.fieldBars.map((b) => (Number.isFinite(b.value) ? b.value : 0));
    const max = Math.max(1, ...vals);
    return (
      <div className="glass">
        <div className="glass-lbl">{beat.hole != null ? `Hole ${beat.hole} · today's net scores` : "Today's Net Scores"}</div>
        <div className="hbars">
          {beat.fieldBars.map((b, i) => {
            // Defensive: a non-finite value renders 0 width, never NaN%.
            const v = Number.isFinite(b.value) ? b.value : 0;
            if (!Number.isFinite(b.value)) console.warn("fieldBars: non-finite value", b);
            const pct = Math.round((v / max) * 100);
            // Final width is set INLINE; the fill animates transform:scaleX so
            // there is no custom-property-in-keyframe (fragile on iOS WebKit).
            return (
              <div key={b.label} className="hb">
                <span className="hb-l">{b.label}</span>
                <span className="hb-t"><span className="hb-f" style={{ width: `${pct}%`, background: b.color, animationDelay: `${i * 80}ms` }} /></span>
                <span className="hb-v">{b.value}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  if (beat.weekBars) {
    const max = Math.max(1, ...beat.weekBars.map((b) => b.value));
    return (
      <div className="glass">
        <div className="glass-lbl">{fn ? `${fn} · recent form` : "Recent Form"}</div>
        <div className="vbars">
          {beat.weekBars.map((b, i) => (
            <div key={i} className={"vb" + (b.highlight ? " hi" : "")}>
              <div className="vb-n">{b.text ?? b.value}</div>
              <div className="vb-bar" style={{ height: `${Math.max(10, (b.value / max) * 92)}%`, animationDelay: `${i * 70}ms` }} />
              <div className="vb-x">{b.label}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (beat.h2h) {
    const maxV = Math.max(1, ...beat.h2h.flatMap((s) => s.points));
    const len = Math.max(2, beat.h2h[0].points.length);
    const pts = (arr: number[]) => arr.map((v, i) => `${(i / (len - 1)) * 300},${86 - (v / maxV) * 76}`).join(" ");
    return (
      <div className="glass">
        <div className="glass-lbl">Momentum · points through the round</div>
        <svg className="hl-h2h" viewBox="0 0 300 90" preserveAspectRatio="none">
          {beat.h2h.map((s) => (
            <polyline key={s.name} points={pts(s.points)} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          ))}
        </svg>
        <div className="hl-h2h-legend">
          {beat.h2h.map((s) => (
            <span key={s.name}><i style={{ background: s.color }} />{s.name} · {s.points[s.points.length - 1]} pts</span>
          ))}
        </div>
      </div>
    );
  }
  if (beat.ptsPanel) {
    return (
      <div className="glass">
        <div className="glass-lbl c">{beat.ptsPanel.label}</div>
        <div className="gp-cols">
          {beat.ptsPanel.cols.map((c) => (
            <div key={c.name} className={"gp-col" + (c.dir === "up" ? " up" : c.dir === "dn" ? " dn" : "")}>
              <div className="gp-name">{c.name}</div>
              <div className="gp-val">{c.value}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (beat.scorecard) return <ScorecardStrip sc={beat.scorecard} standalone />;
  return null;
}

// One renderer for every standings beat (Handoff #9 5): the real .lb-*
// leaderboard floating over the blurred photo, showing the WHOLE field, capped
// at ROW_CAP with a "+N more" footer. A CHECKPOINT board (three_way / the_turn
// / pace_setter / wire_to_wire) auto-scrolls so every row is seen. The FINAL
// does NOT scroll (Handoff #10 3b) -- it plays its bottom-up reveal + leader
// shine focused on the top of the board. `reduced` => no scroll, static rows.
// Columns are POS | GOLFER | PTS | THRU (Handoff #10 4): points is what the
// card is about, THRU is the timestamp, so it sits last.
// Render up to this many rows into the scrolling track...
const ROW_CAP = 12;
// ...but the viewport shows exactly this many at once, so the board stays
// compact and the rest are revealed by the gentle auto-scroll.
const VISIBLE_ROWS = 5;
// Fallback row height only -- the real height is MEASURED from the rendered row
// (a hardcoded guess is what produced a "5 and a half rows" viewport).
const SB_ROW_FALLBACK_H = 51;

function StandingsBoard({ standings, reduced, animKey }: {
  standings: NonNullable<DataBeat["standings"]>;
  reduced: boolean;
  animKey: any;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [scrollPx, setScrollPx] = useState(0);
  const [rowH, setRowH] = useState(SB_ROW_FALLBACK_H);
  const isFinal = standings.isFinal;
  const all = standings.rows;
  // Final shows the top VISIBLE_ROWS statically (the reveal is the moment).
  // Checkpoint boards render the field (ROW_CAP) and scroll it past the window
  // -- BUT under reduced motion there is no scroll, so cap to the visible
  // window there too and let "+N more" account for the rest honestly.
  const staticTop = isFinal || reduced;
  const rows = all.slice(0, staticTop ? VISIBLE_ROWS : ROW_CAP);
  const overflow = all.length - rows.length;
  const cols = { gridTemplateColumns: "40px 1fr 58px 46px" };
  // Viewport is exactly N x the MEASURED row height, so it always lands on a
  // whole number of rows (never a half-row peeking). A short field shows only
  // as many rows as it has rather than padding empty space.
  const shownRows = Math.min(VISIBLE_ROWS, rows.length);
  const viewportH = shownRows * rowH;

  // Measure the real row height, then the scroll distance (how far the content
  // exceeds the viewport). Both come from live layout rather than constants.
  useEffect(() => {
    const track = trackRef.current;
    const firstRow = track?.querySelector(".lb-row") as HTMLElement | null;
    const measured = firstRow?.getBoundingClientRect().height ?? 0;
    const h = measured > 8 ? measured : SB_ROW_FALLBACK_H;
    setRowH(h);
    if (reduced || isFinal) { setScrollPx(0); return; }
    const contentH = (track?.scrollHeight ?? 0) || (rows.length * h);
    const over = contentH - Math.min(VISIBLE_ROWS, rows.length) * h;
    setScrollPx(over > 4 ? over : 0);
  }, [reduced, isFinal, animKey, rows.length, overflow]);

  const revealDelay = (i: number) => (isFinal ? (rows.length - 1 - i) * 150 : 0);
  const doScroll = !reduced && !isFinal && scrollPx > 0;
  // ~40px/sec through the field, with a long hold on the leader before it
  // starts (see the sbScroll keyframe) so the eye settles on 1st place first.
  const SCROLL_SEC = Math.max(4, Math.min(8, scrollPx / 40));
  const scrollStartSec = 2.2; // linger on the top of the board before scrolling

  return (
    <div className={"finalboard standings-board" + (isFinal ? " is-final" : "")}>
      <div className="lb-header" style={cols}>
        <div className="lb-header-cell">Pos</div>
        <div className="lb-header-cell">Golfer</div>
        <div className="lb-header-cell right">Pts</div>
        <div className="lb-header-cell right">Thru</div>
      </div>
      <div className="sb-viewport" ref={viewportRef} style={{ height: viewportH }}>
        <div
          className="sb-track"
          ref={trackRef}
          style={doScroll ? ({
            "--sb-scroll": `-${scrollPx}px`,
            animation: `sbScroll ${SCROLL_SEC}s ease-in-out ${scrollStartSec}s both`,
          } as any) : undefined}
        >
          {rows.map((r, i) => (
            <div
              key={r.name + i}
              className={"lb-row" + (i === 0 ? " leader" : "")}
              style={{ ...cols, animationDelay: `${revealDelay(i)}ms` }}
            >
              <span className={"lb-rank-cell" + (r.pos === "1" || r.pos === "T1" ? " r1" : "")}>{r.pos}</span>
              <span className="lb-name-main">{r.name}</span>
              <span className="lb-score-big" style={{ textAlign: "right" }}>{r.points}</span>
              <span className="lb-thru-big" style={{ textAlign: "right" }}>{standings.thru}</span>
            </div>
          ))}
          {overflow > 0 && (
            <div className="sb-more">+{overflow} more {overflow === 1 ? "golfer" : "golfers"}</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Viewer --------------------------------------------------------------------

export function HighlightsViewer({
  cards, startIndex, event, course, courses, signups, golfers, eventEntries, holeScores, holeImages,
  likes, comments, memberName, adminMode,
  onClose, onToggleLike, onAddComment,
  onHideBeat, onEditBeatCaption, onDeleteHighlight, onEditHighlightCaption, onEditHighlightDetails,
}: any) {
  const [idx, setIdx] = useState<number>(Math.max(0, Math.min(startIndex, cards.length - 1)));
  const [commentsFor, setCommentsFor] = useState<number | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [zoomActive, setZoomActive] = useState(false); // hole-image zoomed past fit
  // Video sound: ON by default (the file keeps its audio -- it was only ever
  // muted at playback). If the browser blocks unmuted autoplay we fall back to
  // muted and the speaker button (a real user gesture) unmutes.
  const [videoMuted, setVideoMuted] = useState(false);
  const [vidReady, setVidReady] = useState(false); // fade video in over its blurred poster
  const [editDetailsFor, setEditDetailsFor] = useState<any | null>(null); // row being re-attributed
  const [editGolfer, setEditGolfer] = useState<string>("");
  const [editHole, setEditHole] = useState<number | "none" | "pre">("none");
  const [sharing, setSharing] = useState(false); // composing the share image
  // Composed share image awaiting the user's tap. The native share sheet only
  // opens from a LIVE tap (iOS home-screen PWAs enforce this hardest), so we
  // compose first, show a preview sheet, and call navigator.share directly in
  // that button's handler with zero awaits in front of it. png is kept for
  // clipboard copy (iOS clipboard accepts PNG, not JPEG).
  const [sharePrep, setSharePrep] = useState<{ file: File; url: string; png: Blob | null } | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const pausedRef = useRef(false);
  const [holdPaused, setHoldPaused] = useState(false); // press-and-hold
  const [dragY, setDragY] = useState(0); // swipe-down-to-close progress
  const swipeRef = useRef<{ id: number | null; startX: number; startY: number; active: boolean }>({ id: null, startX: 0, startY: 0, active: false });
  const holdRef = useRef<{ timer: any; held: boolean }>({ timer: null, held: false });
  const segRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);
  const elapsedRef = useRef<number>(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // The on-screen photo, loaded with crossOrigin so the share canvas can reuse
  // its already-decoded pixels without a second network fetch.
  const photoImgRef = useRef<HTMLImageElement | null>(null);
  const reduced = useMemo(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);

  const card: RecapCard = cards[idx];
  const courseName = event?.course_name || "";
  const holePars: number[] = course?.hole_pars || [];
  const eventDateLabel = footerDate(event?.date || "");

  const durationFor = (c: RecapCard) => (c.kind === "data" ? DUR_DATA : c.row?.media_type === "video" ? DUR_VIDEO : DUR_PHOTO);

  const nav = (dir: number) => {
    setMenuOpen(false);
    const next = idx + dir;
    if (next < 0) { setIdx(0); return; }
    if (next >= cards.length) { onClose(); return; }
    setIdx(next);
  };

  // Auto-advance via rAF driving the active pip's width directly (no
  // re-render per frame). Pause freezes elapsed time; resume re-seeds the
  // start so the pip continues from exactly where it froze. Fully disabled
  // under prefers-reduced-motion.
  useEffect(() => {
    segRefs.current.forEach((el, i) => { if (el) el.style.width = i < idx ? "100%" : "0%"; });
    elapsedRef.current = 0;
    if (reduced) {
      const el = segRefs.current[idx];
      if (el) el.style.width = "100%";
      return;
    }
    const dur = durationFor(card);
    let cancelled = false;
    const tick = (t: number) => {
      if (cancelled) return;
      if (pausedRef.current) { startRef.current = t - elapsedRef.current; rafRef.current = requestAnimationFrame(tick); return; }
      if (!startRef.current) startRef.current = t;
      elapsedRef.current = t - startRef.current;
      const p = Math.min(1, elapsedRef.current / dur);
      const el = segRefs.current[idx];
      if (el) el.style.width = (p * 100).toFixed(1) + "%";
      if (p >= 1) { nav(1); return; }
      rafRef.current = requestAnimationFrame(tick);
    };
    startRef.current = 0;
    rafRef.current = requestAnimationFrame(tick);
    return () => { cancelled = true; cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, reduced, cards.length]);

  // Comments sheet, the dots menu, press-and-hold, an active image zoom, the
  // edit-details sheet and an in-flight share all stop the clock.
  useEffect(() => {
    pausedRef.current = commentsFor != null || menuOpen || holdPaused || zoomActive || editDetailsFor != null || sharing || sharePrep != null;
  }, [commentsFor, menuOpen, holdPaused, zoomActive, editDetailsFor, sharing, sharePrep]);

  // Release the share preview's object URL when the sheet closes / card changes.
  useEffect(() => () => { if (sharePrep) URL.revokeObjectURL(sharePrep.url); }, [sharePrep]);
  useEffect(() => { setSharePrep(null); }, [idx]);

  // Reset the swipe-to-close drag + video fade whenever the beat changes.
  useEffect(() => { setDragY(0); setVidReady(false); }, [idx]);

  // Warm the cache for the NEXT video card so it doesn't pop in late when the
  // story reaches it (the blurred poster covers whatever latency remains).
  useEffect(() => {
    const next = cards.slice(idx + 1).find((c: RecapCard) => c.kind === "human" && c.row?.media_type === "video");
    if (!next) return;
    const v = document.createElement("video");
    v.preload = "auto";
    v.muted = true;
    v.src = next.row.media_url;
    return () => { v.removeAttribute("src"); try { v.load(); } catch (_: any) {} };
  }, [idx, cards]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") nav(1);
      if (e.key === "ArrowLeft") nav(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  // Pin the comments sheet to the iOS keyboard. When the keyboard opens the
  // VISUAL viewport shrinks but this fixed overlay does not -- Safari then
  // pans the page to expose the input, which (a) lifts the sheet so the card
  // shows through underneath it and (b) draws the text caret at the pre-pan
  // offset, visually outside the field. Translating the sheet up by the
  // keyboard height (and undoing any pan) keeps it flush and the caret true.
  useEffect(() => {
    if (commentsFor == null) return;
    const vv: any = (window as any).visualViewport;
    if (!vv) return;
    const apply = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      const s = document.querySelector(".hl-overlay .hl-sheet") as HTMLElement | null;
      if (s) s.style.transform = kb > 0 ? `translateY(-${kb}px)` : "";
      if (kb > 0) window.scrollTo(0, 0);
    };
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    apply();
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
      const s = document.querySelector(".hl-overlay .hl-sheet") as HTMLElement | null;
      if (s) s.style.transform = "";
    };
  }, [commentsFor]);

  // Keep the video element in sync with every pause source (hold included),
  // and with the sound preference. If unmuted playback is blocked by the
  // browser's autoplay policy, fall back to muted (the effect re-runs and
  // plays); the speaker button unmutes inside a user gesture.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (holdPaused || commentsFor != null || menuOpen || editDetailsFor != null) { v.pause(); return; }
    v.muted = videoMuted;
    v.play().catch(() => {
      if (!videoMuted) setVideoMuted(true);
    });
  }, [holdPaused, commentsFor, menuOpen, editDetailsFor, videoMuted, idx]);

  // ---- press-and-hold pause + tap zones -------------------------------------
  // Pressing down pauses IMMEDIATELY (no indicator); releasing always
  // resumes. A press longer than 180ms counts as a hold, so its release
  // never navigates; shorter presses are taps and keep the zones:
  // left/right third = prev/next. Under prefers-reduced-motion there is no
  // timer, so pressing does nothing and taps still navigate.
  // Swipe-down-to-close: a mostly-vertical downward drag past SWIPE_CLOSE_PX
  // dismisses the viewer; anything shorter springs back. Tracked alongside the
  // tap/hold flow. Suppressed while the image is zoomed (that gesture pans).
  const SWIPE_CLOSE_PX = 110;
  const onPointerDown = (e: any) => {
    if ((e.target as HTMLElement).closest("button")) return;
    if (!zoomActive) {
      swipeRef.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, active: true };
    }
    if (reduced) return;
    holdRef.current.held = false;
    clearTimeout(holdRef.current.timer);
    setHoldPaused(true);
    holdRef.current.timer = setTimeout(() => { holdRef.current.held = true; }, 180);
  };
  const onPointerMove = (e: any) => {
    const s = swipeRef.current;
    if (!s.active || s.id !== e.pointerId || zoomActive) return;
    const dy = e.clientY - s.startY;
    const dx = e.clientX - s.startX;
    // Commit to a vertical swipe once it clearly beats horizontal drift; then
    // follow the finger (down only). Cancels the hold so release won't navigate.
    if (dy > 8 && dy > Math.abs(dx)) {
      holdRef.current.held = true;
      clearTimeout(holdRef.current.timer);
      setHoldPaused(true);
      setDragY(dy);
    }
  };
  const endHold = (): boolean => {
    clearTimeout(holdRef.current.timer);
    setHoldPaused(false);
    const wasHold = holdRef.current.held;
    holdRef.current.held = false;
    return wasHold;
  };
  const onPointerUp = (e: any) => {
    if ((e.target as HTMLElement).closest("button")) return;
    const s = swipeRef.current;
    const swiping = s.active && s.id === e.pointerId;
    swipeRef.current.active = false;
    if (swiping && dragY > SWIPE_CLOSE_PX) { setDragY(0); onClose(); return; }
    const wasSwipe = dragY > 0;
    if (wasSwipe) setDragY(0); // spring back
    if (endHold()) return; // hold release (incl. a spring-back swipe) -- no navigation
    if (menuOpen) { setMenuOpen(false); return; } // outside tap closes the menu
    if (zoomActive) return; // zoom gesture owns this pointer
    // Tap zones are viewport-relative (.v-media is full-screen) so the same
    // logic works whether the event lands on .v-media or is forwarded from the
    // full-bleed .shot card.
    const w = window.innerWidth || 1;
    const x = e.clientX;
    if (x > w * 0.68) nav(1);
    else if (x < w * 0.32) nav(-1);
  };
  // The zoom component forwards its 1x single-finger gestures here, and calls
  // cancel when a pinch takes over so we drop any half-started swipe/hold.
  const cancelGesture = () => {
    swipeRef.current.active = false;
    if (dragY > 0) setDragY(0);
    endHold();
  };
  const shotPassthrough = { down: onPointerDown, move: onPointerMove, up: onPointerUp, cancel: cancelGesture };

  // ---- per-card derived data -------------------------------------------------
  // Background fallback: any ARTISTIC image on the course (never a hole/green
  // layout -- those are for tracers, not blurred backgrounds).
  const firstCourseImg = useMemo(
    () => courseArtisticUrl(holeImages, courseName),
    [holeImages, courseName],
  );

  // Yardage for a HUMAN card: the subject golfer's own tee, falling back to
  // the course row (data beats carry theirs pre-resolved in beat.holeMeta).
  const yardsForGolferName = (name: string, hole: number): number | null => {
    const g = (golfers || []).find((x: any) => `${x.first_name} ${x.last_name}` === name);
    const su = g ? (signups || []).find((s: any) => s.event_id === event.event_id && s.golfer_id === g.golfer_id && s.tee_box_course_id != null) : null;
    const row = su ? (courses || []).find((c: any) => c.course_id === su.tee_box_course_id) : null;
    const y = Array.isArray(row?.hole_yards) ? row.hole_yards[hole - 1] : Array.isArray(course?.hole_yards) ? course.hole_yards[hole - 1] : null;
    return y != null && y > 0 ? y : null;
  };

  // Subject's GROSS result for the human eyebrow ("Danny Reyes . Bogey (5)").
  const subjectGross = (r: any): string | null => {
    if (r.hole_number == null) return null;
    const g = (golfers || []).find((x: any) => `${x.first_name} ${x.last_name}` === r.golfer_name);
    if (!g) return null;
    const entry = (eventEntries || []).find((e: any) => e.golfer_id === g.golfer_id);
    if (!entry) return null;
    const hs = (holeScores || []).find((h: any) => h.summary_id === entry.summary_id && h.hole_number === r.hole_number);
    if (!hs || hs.gross_score == null) return null;
    const par = holePars[r.hole_number - 1];
    return par != null ? grossLabel(hs.gross_score, par) : null;
  };

  const eyebrowFor = (c: RecapCard): string => {
    if (c.kind === "data") return c.beat!.eyebrow;
    const r = c.row;
    if (r.pre_round) return `${r.golfer_name} • Pre-round`;
    const gross = subjectGross(r);
    return gross ? `${r.golfer_name} • ${gross}` : r.golfer_name;
  };

  // ---- share/save a rendered image of the highlight ---------------------------
  // Canvas-composited (no DOM-screenshot library allowed): media cover-cropped
  // to a 1080x1920 story frame + the overlay text (eyebrow, hole meta, caption,
  // credit). R2/Storage both send ACAO for GET, so crossOrigin loads keep the
  // canvas untainted; video cards grab the CURRENT frame from the player.
  const shareCard = async (c: RecapCard) => {
    setSharing(true);
    try {
      const canvas = c.kind === "data"
        ? await composeDataShareCanvas(c)
        : await composeHumanShareCanvas(c);
      const blob: Blob = await new Promise((res, rej) =>
        canvas.toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), "image/jpeg", 0.9));
      const png: Blob | null = await new Promise((res) => canvas.toBlob((b) => res(b), "image/png"));
      const file = new File([blob], "highlight.jpg", { type: "image/jpeg" });
      // Do NOT call navigator.share here: the awaits above already burned the
      // tap's transient activation (iOS standalone PWAs then reject with
      // NotAllowedError and the user got a bare download). Stage the image and
      // let the preview sheet's Share button call share() in a fresh tap.
      setShareNote(null);
      setCopied(false);
      setSharePrep({ file, url: URL.createObjectURL(blob), png });
    } catch (_: any) {
      window.alert("Couldn't create the share image for this highlight.");
    } finally {
      setSharing(false);
    }
  };

  // AUTO beat: re-rendered natively on canvas by shareBeatImage (background,
  // hero, tracer shot, viz panel, caption).
  const composeDataShareCanvas = (c: RecapCard): Promise<HTMLCanvasElement> => {
    const b = c.beat!;
    const { focusRow, anchors, useGreen } = beatFocusFor(b);
    const bgUrl = (b.hole != null ? holeAerialUrl(holeImages, courseName, b.hole) : null) || firstCourseImg;
    return composeBeatShareImage({
      beat: b,
      bgUrl,
      focusUrl: b.score != null && focusRow && anchors ? focusRow.public_url : null,
      anchors,
      greenView: useGreen,
      dateLabel: eventDateLabel,
    });
  };

  const composeHumanShareCanvas = async (c: RecapCard): Promise<HTMLCanvasElement> => {
    const r = c.row;
    {
      try { await (document as any).fonts?.ready; } catch (_: any) {}
      const W = 1080, H = 1920, PAD = 54;
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d")!;

      // Fast source first: the frame/pixels ALREADY on screen. Awaiting a fresh
      // network load here burns the tap's transient user activation, and then
      // navigator.share is refused -- which is why photos fell back to a bare
      // download while videos (in-memory frame) got the real share sheet.
      let source: HTMLImageElement | HTMLVideoElement | null = null;
      const v = videoRef.current;
      if (r.media_type === "video" && v && v.readyState >= 2 && v.videoWidth > 0) source = v;
      const live = photoImgRef.current;
      if (!source && r.media_type === "photo" && live && live.complete && live.naturalWidth > 0) source = live;
      if (!source) {
        // loadShareImage retries with a cache-busted CORS fetch -- the rail
        // shows thumb_url as a plain <img>, which poisons Safari's cache for
        // a direct crossOrigin load of the same URL.
        source = await loadShareImage(r.media_type === "video" ? r.thumb_url : r.media_url);
        if (!source) throw new Error("media load failed");
      }
      const sw = (source as any).videoWidth || (source as any).naturalWidth;
      const sh = (source as any).videoHeight || (source as any).naturalHeight;
      const scale = Math.max(W / sw, H / sh);
      ctx.fillStyle = "#0a2e1a";
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(source, (W - sw * scale) / 2, (H - sh * scale) / 2, sw * scale, sh * scale);

      // scrims (top for the eyebrow, bottom for the text block)
      let g = ctx.createLinearGradient(0, 0, 0, 300);
      g.addColorStop(0, "rgba(0,0,0,.55)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, 300);
      g = ctx.createLinearGradient(0, H - 760, 0, H);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(0,0,0,.85)");
      ctx.fillStyle = g;
      ctx.fillRect(0, H - 760, W, 760);

      // eyebrow (top-left, matching the viewer)
      ctx.fillStyle = "#fff";
      ctx.font = "700 42px 'DM Sans', sans-serif";
      ctx.fillText(eyebrowFor(c), PAD, 118);

      // bottom-up text block: caption, then hole meta (no "Added by" credit on
      // the shared image -- that chrome stays in-app)
      let y = H - 96;
      if (r.caption) {
        ctx.font = "700 62px 'DM Sans', sans-serif";
        ctx.fillStyle = "#fff";
        const lines = wrapCanvasText(ctx, r.caption, W - PAD * 2).slice(0, 4);
        y -= (lines.length - 1) * 76;
        lines.forEach((ln, i) => ctx.fillText(ln, PAD, y + i * 76));
        y -= 96;
      }

      const hole = r.pre_round ? null : r.hole_number;
      const par = hole != null ? holePars[hole - 1] : null;
      if (hole != null && par != null) {
        ctx.fillStyle = "#fff";
        ctx.shadowColor = "rgba(0,0,0,.6)";
        ctx.shadowBlur = 18;
        ctx.font = "400 96px 'DM Serif Display', serif";
        ctx.fillText(String(hole), PAD, y);
        const numW = ctx.measureText(String(hole)).width;
        ctx.shadowBlur = 0;
        ctx.font = "700 36px 'DM Sans', sans-serif";
        const yds = yardsForGolferName(r.golfer_name, hole);
        ctx.fillText(`Par ${par}${yds != null ? ` | ${yds} Yds` : ""}`, PAD + numW + 26, y - 8);
      }

      return canvas;
    }
  };

  // Plain-download fallback (desktop, or a device where share() refuses).
  const saveShareLocal = (prep: { file: File; url: string }) => {
    const a = document.createElement("a");
    a.href = prep.url;
    a.download = prep.file.name;
    a.style.display = "none";
    document.body.appendChild(a); // some browsers ignore download on detached anchors
    a.click();
    setTimeout(() => a.remove(), 5000);
    setSharePrep(null);
  };

  // Native share sheet availability for the staged file.
  const canNativeShare = (prep: { file: File } | null): boolean => {
    const nav: any = navigator;
    if (!prep || !nav.share) return false;
    try { return !nav.canShare || nav.canShare({ files: [prep.file] }); } catch (_: any) { return false; }
  };

  const openEditDetails = (row: any) => {
    setEditGolfer(row.golfer_name || "");
    setEditHole(row.pre_round ? "pre" : row.hole_number ?? "none");
    setEditDetailsFor(row);
  };

  // Golfers who played THIS event (edit-details picker).
  const eventGolferNames = useMemo(() => {
    const names = (eventEntries || [])
      .map((e: any) => {
        const g = (golfers || []).find((x: any) => x.golfer_id === e.golfer_id);
        return g ? `${g.first_name} ${g.last_name}` : null;
      })
      .filter(Boolean) as string[];
    return [...new Set(names)].sort();
  }, [eventEntries, golfers]);

  // Context menu items for the current card.
  const isOwner = card.kind === "human" && memberName != null && card.row.created_by_name === memberName;
  const menuItems: { label: string; danger?: boolean; icon: any; run: () => void }[] = [];
  const ICO_EYE = <svg viewBox="0 0 24 24"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" /><circle cx="12" cy="12" r="3" /></svg>;
  const ICO_EDIT = <svg viewBox="0 0 24 24"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>;
  const ICO_TRASH = <svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></svg>;
  const ICO_SHARE = <svg viewBox="0 0 24 24"><path d="M12 15V3M7 8l5-5 5 5" /><path d="M4 14v6h16v-6" /></svg>;
  const ICO_TAG = <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>;
  if (card.kind === "data") {
    // Everyone can share/save a rendered image of an auto beat too.
    menuItems.push({ label: "Share / save image", icon: ICO_SHARE, run: () => shareCard(card) });
  }
  if (card.kind === "data" && adminMode) {
    menuItems.push({ label: "Hide this beat", icon: ICO_EYE, run: () => onHideBeat && onHideBeat(card.beat) });
    menuItems.push({
      label: "Edit caption", icon: ICO_EDIT, run: () => {
        const current = card.beat!.caption.map((p: any) => p.t).join("");
        const next = window.prompt("Edit caption (empty restores the auto caption):", current);
        if (next != null && onEditBeatCaption) onEditBeatCaption(card.beat, next.trim());
      },
    });
  }
  if (card.kind === "human") {
    // Everyone can share/save a rendered image of a highlight.
    menuItems.push({ label: "Share / save image", icon: ICO_SHARE, run: () => shareCard(card) });
  }
  if (card.kind === "human" && (isOwner || adminMode)) {
    menuItems.push({
      label: "Edit caption", icon: ICO_EDIT, run: () => {
        const next = window.prompt("Edit caption:", card.row.caption || "");
        if (next != null && onEditHighlightCaption) onEditHighlightCaption(card.row, next.trim());
      },
    });
    menuItems.push({ label: "Edit golfer / hole", icon: ICO_TAG, run: () => openEditDetails(card.row) });
    menuItems.push({
      label: "Delete highlight", danger: true, icon: ICO_TRASH, run: () => {
        if (window.confirm("Delete this highlight?") && onDeleteHighlight) onDeleteHighlight(card.row.id);
      },
    });
  }

  const cardLikes = card.kind === "human" ? likes.filter((l: any) => l.highlight_id === card.row.id) : [];
  const cardComments = card.kind === "human" ? comments.filter((cm: any) => cm.highlight_id === card.row.id) : [];
  const iLiked = card.kind === "human" && memberName != null && cardLikes.some((l: any) => l.liker_name === memberName);
  const sheetComments = commentsFor != null ? comments.filter((cm: any) => cm.highlight_id === commentsFor) : [];

  // The paused class freezes every CSS animation while held (no visible
  // indicator by design).
  const visualPaused = holdPaused;

  // Focus-image derivation shared by the beat renderer and the share-image
  // composer. A layout row is only usable when it has ANCHORS (Handoff #11
  // sec 7 -- no fixed-arc fallback). Prefer the green view for a made net
  // birdie+ when anchored; else the hole view.
  const beatFocusFor = (b: DataBeat) => {
    const holeRow = b.hole != null ? holeImageRow(holeImages, courseName, b.hole, "hole") : null;
    const greenRow = b.hole != null ? holeImageRow(holeImages, courseName, b.hole, "green") : null;
    const anchoredHole = holeRow && holeRow.anchors && typeof holeRow.anchors === "object" ? holeRow : null;
    const anchoredGreen = greenRow && greenRow.anchors && typeof greenRow.anchors === "object" ? greenRow : null;
    const useGreen = !!(anchoredGreen && b.score && b.score.points >= 3);
    const focusRow = useGreen ? anchoredGreen : anchoredHole;
    const anchors = focusRow?.anchors && typeof focusRow.anchors === "object" ? focusRow.anchors : null;
    return { focusRow, anchors, useGreen };
  };

  // ---- data-beat body ---------------------------------------------------------
  const renderBeat = (b: DataBeat) => {
    const { focusRow, anchors, useGreen } = beatFocusFor(b);
    // Focus card + tracer only when we have a layout image AND its anchors AND a
    // score to draw. Otherwise the beat renders its glass panel only.
    const showTracer = b.score != null && focusRow != null && anchors != null;
    // A standings beat (race-state / the_turn / final) renders the real .lb-*
    // leaderboard, NOT a hole image -- it has no shot to trace, so the
    // decorative photo is dropped (Handoff #9 5).
    const isStandings = !!b.standings;
    // hcard-back scopes the white-on-dark score-symbol variants: white
    // numbers/borders, triple+ as a filled white square with the numeral
    // knocked out. Points labels keep their gold.
    // On the FINAL board, the hero word ("Final") fades in exactly as the
    // LEADER row (1st place) is revealed. The board reveals bottom-up: row i
    // has delay (rowCount-1-i)*150ms, so the leader (i=0) begins at
    // (rowCount-1)*150ms -- the hero uses that same delay. Reduced motion
    // shows it immediately.
    const isFinalBoard = !!(b.standings && b.standings.isFinal);
    const heroFinalIn = isFinalBoard && !reduced;
    const finalRowCount = isFinalBoard ? Math.min(b.standings!.rows.length, VISIBLE_ROWS) : 0;
    const heroDelayMs = Math.max(0, (finalRowCount - 1) * 150);
    return (
      // key on idx so the entrance animations (card slide-up, caption fade)
      // replay for every beat instead of only on first mount.
      <div className="beat hcard-back" key={`beat-${idx}`}>
        <div className="beat-mid">
          <div
            className={"beat-hero" + (heroFinalIn ? " hero-final-in" : "")}
            style={heroFinalIn ? { animationDelay: `${heroDelayMs}ms` } : undefined}
            key={heroFinalIn ? `hero-${idx}` : undefined}
          >{b.heroLabel}</div>
          {focusRow && !isStandings && (
            // hole/green cutout (has_alpha): .cutout drops the card chrome --
            // the 3D render carries its own shadow. Opaque layouts keep the frame.
            // Wrapped in ZoomableShot so pinch / double-tap zooms the hole image
            // (and its tracer + meta, which are anchored to it) in isolation --
            // nothing else in the beat moves. key on idx resets zoom per beat.
            <ZoomableShot
              key={`shot-${idx}`}
              className={"shot" + (focusRow.has_alpha ? " cutout" : "")}
              onZoomChange={setZoomActive}
              passthrough={shotPassthrough}
            >
              <img src={focusRow.public_url} alt="" />
              {b.holeMeta && <HoleMetaBlock meta={b.holeMeta} animKey={idx} />}
              {showTracer && (
                <TracerSvg
                  key={`${idx}-${useGreen ? "g" : "h"}`}
                  points={b.score!.points}
                  anchors={anchors}
                  view={useGreen ? "green" : "hole"}
                />
              )}
            </ZoomableShot>
          )}
          {isStandings
            ? <StandingsBoard standings={b.standings!} reduced={reduced} animKey={idx} />
            : <GlassPanel beat={b} />}
          <div className={"beat-cap " + capSizeClass(b.caption)}><CaptionText parts={b.caption} /></div>
        </div>
        <div className="beat-auto">
          <span style={{ width: 13, height: 13, display: "flex", fill: "rgba(255,255,255,.55)" }}>{AUTO_ICON}</span> Auto highlight
          {eventDateLabel && <span className="beat-date"> • {eventDateLabel}</span>}
        </div>
      </div>
    );
  };

  const body = (
    <div className="hl-overlay" role="dialog" aria-label="Event highlights">
      <div
        className={"viewer" + (visualPaused ? " paused" : "") + (dragY > 0 ? " dragging" : "")}
        style={dragY > 0 ? {
          transform: `translateY(${dragY}px) scale(${Math.max(0.86, 1 - dragY / 1400)})`,
          borderRadius: Math.min(24, dragY / 5),
          opacity: Math.max(0.4, 1 - dragY / 500),
        } : undefined}
        onContextMenu={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
      >
        {/* media / background layer with tap + hold + swipe-down surface */}
        <div
          className="v-media"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => { swipeRef.current.active = false; if (dragY > 0) setDragY(0); endHold(); }}
          onPointerLeave={() => { swipeRef.current.active = false; if (dragY > 0) setDragY(0); endHold(); }}
        >
          {card.kind === "data" ? (() => {
            const b = card.beat!;
            const bgUrl = (b.hole != null ? holeAerialUrl(holeImages, courseName, b.hole) : null) || firstCourseImg;
            const tint = b.mood === "fall" ? " fall" : b.mood === "cool" ? " cool" : "";
            return bgUrl
              ? <div className={"v-bg" + tint}><img src={bgUrl} alt="" /></div>
              : <div className={"beatbg" + tint} />;
          })() : card.row.media_type === "video" ? (
            // Blurred thumbnail poster underneath; the video fades in over it
            // once it can actually paint (no green-background pop-in).
            <div className="v-vidwrap" key={card.row.id}>
              {card.row.thumb_url && <img className="v-vidposter" src={card.row.thumb_url} alt="" />}
              <video
                ref={videoRef}
                className={vidReady ? "ready" : ""}
                src={card.row.media_url}
                autoPlay
                muted={videoMuted}
                playsInline
                loop
                preload="auto"
                crossOrigin="anonymous"
                onLoadedData={() => setVidReady(true)}
                onCanPlay={() => setVidReady(true)}
              />
            </div>
          ) : (
            <img key={card.row.id} ref={photoImgRef} crossOrigin="anonymous" src={card.row.media_url} alt="" />
          )}
        </div>
        {card.kind === "human" && <div className="v-scrim-b" />}

        {/* progress pips */}
        <div className="v-progress">
          {cards.map((c: RecapCard, i: number) => (
            <div key={i} className={"seg-bar" + (c.kind === "data" ? " auto" : "")}>
              <span ref={(el) => { segRefs.current[i] = el; }} />
            </div>
          ))}
        </div>

        {/* topbar: eyebrow + dots + close */}
        <div className="v-topbar">
          <div className="v-eyebrow">{eyebrowFor(card)}</div>
          {menuItems.length > 0 && (
            <button className="v-ico dots" aria-label="More options" onClick={(e) => { e.stopPropagation(); setMenuOpen((m) => !m); }}>
              <svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
            </button>
          )}
          <button className="v-ico" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        {/* frosted context menu */}
        {menuOpen && menuItems.length > 0 && (
          <div className="hl-menu">
            <div className="who">{card.kind === "data" ? (adminMode ? "Admin" : "Highlight") : isOwner ? "Your highlight" : adminMode ? "Admin" : "Highlight"}</div>
            {menuItems.map((m) => (
              <button key={m.label} className={m.danger ? "danger" : ""} onClick={() => { setMenuOpen(false); m.run(); }}>
                {m.icon} {m.label}
              </button>
            ))}
          </div>
        )}

        {/* data beat */}
        {card.kind === "data" && renderBeat(card.beat!)}

        {/* human card */}
        {card.kind === "human" && (() => {
          const r = card.row;
          const hole = r.pre_round ? null : r.hole_number;
          const par = hole != null ? holePars[hole - 1] : null;
          return (
            <>
              {hole != null && par != null && (
                <div className="h-meta">
                  <HoleMetaBlock meta={{ hole, par, yards: yardsForGolferName(r.golfer_name, hole) }} animKey={idx} />
                </div>
              )}
              <div className="v-foot">
                {r.caption && <div className="v-cap">{r.caption}</div>}
                <div className="v-credit">
                  <svg viewBox="0 0 24 24"><path d="M4 20a8 8 0 0 1 16 0" /><circle cx="12" cy="8" r="4" /></svg>
                  Added by {r.created_by_name}{eventDateLabel ? ` • ${eventDateLabel}` : ""}
                </div>
                <div className="v-actions">
                  <button className="act" onClick={() => onToggleLike(r.id)} aria-label="Like">
                    <svg className={"heart" + (iLiked ? " on" : "")} viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-10-9.3C.4 8.4 1.9 5 5.2 5 7.3 5 8.7 6.3 12 9c3.3-2.7 4.7-4 6.8-4 3.3 0 4.8 3.4 3.2 6.7C19.5 16.4 12 21 12 21z" /></svg>
                    <span className="n">{cardLikes.length}</span>
                  </button>
                  <button className="act" onClick={() => setCommentsFor(r.id)} aria-label="Comments">
                    <svg className="bub" viewBox="0 0 24 24"><path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20l1.1-5.4A8.5 8.5 0 1 1 21 11.5z" /></svg>
                    <span className="n">{cardComments.length}</span>
                  </button>
                  {r.media_type === "video" && (
                    <button className="act" onClick={() => setVideoMuted((m) => !m)} aria-label={videoMuted ? "Turn sound on" : "Turn sound off"}>
                      {videoMuted ? (
                        <svg className="snd" viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4z" /><path d="M22 9l-6 6M16 9l6 6" /></svg>
                      ) : (
                        <svg className="snd" viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /></svg>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </>
          );
        })()}

        {/* share preview bottom sheet. Two reliable paths:
            1) Share... calls navigator.share inside THIS fresh tap -- works in
               Safari tabs / Android; some iOS home-screen PWAs still refuse
               file shares, in which case we show a note instead of silently
               dumping the user on the file-download page.
            2) The preview image itself allows the NATIVE long-press callout
               (Save to Photos / Share / Copy) -- touch-callout and pointer
               events are re-enabled here, and stopPropagation keeps the
               viewer's contextmenu suppression away. That path always works
               in the installed PWA. */}
        {sharePrep && (
          <div className="hl-sheet-scrim" onClick={() => setSharePrep(null)}>
            <div className="hl-sheet" onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.stopPropagation()}>
              <div className="hl-sheet-handle" />
              <div className="hl-sheet-title">Share highlight</div>
              <div className="hl-share-preview">
                <img src={sharePrep.url} alt="Highlight preview" draggable={false} />
              </div>
              <div className="hl-share-hint">Tip: touch and hold the picture to save it to Photos or share it.</div>
              {shareNote && <div className="hl-share-note">{shareNote}</div>}
              <div className="hl-share-actions">
                {canNativeShare(sharePrep) && (
                  <button
                    className="hl-edit-save"
                    onClick={() => {
                      const nav: any = navigator;
                      nav.share({ files: [sharePrep.file] })
                        .then(() => setSharePrep(null))
                        .catch((e: any) => {
                          if (e && e.name === "AbortError") { setSharePrep(null); return; } // user closed the sheet
                          setShareNote("Sharing isn't available in the installed app on this phone -- touch and hold the picture above instead.");
                        });
                    }}
                  >Share...</button>
                )}
                {typeof ClipboardItem !== "undefined" && (navigator as any).clipboard?.write && sharePrep.png && (
                  <button
                    className="hl-edit-cancel"
                    onClick={() => {
                      (navigator as any).clipboard.write([new ClipboardItem({ "image/png": sharePrep.png! })])
                        .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
                        .catch(() => setShareNote("Couldn't copy -- touch and hold the picture above instead."));
                    }}
                  >{copied ? "Copied!" : "Copy image"}</button>
                )}
                <button className="hl-edit-cancel" onClick={() => saveShareLocal(sharePrep)}>Save as file</button>
              </div>
            </div>
          </div>
        )}

        {/* edit golfer / hole bottom sheet */}
        {editDetailsFor && (
          <div className="hl-sheet-scrim" onClick={() => setEditDetailsFor(null)}>
            <div className="hl-sheet" onClick={(e) => e.stopPropagation()}>
              <div className="hl-sheet-handle" />
              <div className="hl-sheet-title">Edit highlight</div>
              <div className="hl-sheet-list">
                <div className="hl-add-label" style={{ marginTop: 4 }}>Who is it about?</div>
                <GlassPicker<string>
                  options={eventGolferNames.map((n: string) => ({ value: n, label: n }))}
                  value={editGolfer}
                  onChange={(v) => setEditGolfer(v)}
                  style={{ width: "100%" }}
                />
                <div className="hl-add-label" style={{ marginTop: 16 }}>Which hole?</div>
                <div className="hl-hole-grid">
                  {Array.from({ length: 18 }, (_, i) => i + 1).map((h) => (
                    <button key={h} className={"hl-chip hl-chip--hole" + (editHole === h ? " on" : "")} onClick={() => setEditHole(editHole === h ? "none" : h)}>{h}</button>
                  ))}
                </div>
                <div className="hl-chip-grid" style={{ marginTop: 8 }}>
                  <button className={"hl-chip" + (editHole === "none" ? " on" : "")} onClick={() => setEditHole("none")}>No specific hole</button>
                  <button className={"hl-chip" + (editHole === "pre" ? " on" : "")} onClick={() => setEditHole(editHole === "pre" ? "none" : "pre")}>Before the round</button>
                </div>
              </div>
              <div className="hl-edit-actions">
                <button className="hl-edit-cancel" onClick={() => setEditDetailsFor(null)}>Cancel</button>
                <button
                  className="hl-edit-save"
                  disabled={!editGolfer}
                  onClick={() => {
                    if (onEditHighlightDetails) {
                      onEditHighlightDetails(editDetailsFor, {
                        golfer_name: editGolfer,
                        hole_number: typeof editHole === "number" ? editHole : null,
                        pre_round: editHole === "pre",
                      });
                    }
                    setEditDetailsFor(null);
                  }}
                >Save</button>
              </div>
            </div>
          </div>
        )}

        {/* comments bottom sheet */}
        {commentsFor != null && (
          <div className="hl-sheet-scrim" onClick={() => setCommentsFor(null)}>
            <div className="hl-sheet" onClick={(e) => e.stopPropagation()}>
              <div className="hl-sheet-handle" />
              <div className="hl-sheet-title">Comments</div>
              <div className="hl-sheet-list">
                {sheetComments.length === 0 && <div className="hl-sheet-empty">No comments yet — say something nice.</div>}
                {sheetComments.map((cm: any) => (
                  <div key={cm.id} className="hl-comment">
                    <div className="hl-comment-name">{cm.commenter_name}</div>
                    <div className="hl-comment-text">{cm.text}</div>
                  </div>
                ))}
              </div>
              <div className="hl-sheet-composer">
                <input
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  placeholder={memberName ? `Comment as ${memberName.split(" ")[0]}...` : "Add a comment..."}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && commentDraft.trim()) {
                      onAddComment(commentsFor, commentDraft.trim());
                      setCommentDraft("");
                    }
                  }}
                />
                <button
                  disabled={!commentDraft.trim()}
                  onClick={() => {
                    if (!commentDraft.trim()) return;
                    onAddComment(commentsFor, commentDraft.trim());
                    setCommentDraft("");
                  }}
                >Post</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return ReactDOM.createPortal(body, document.body);
}

function shortDisplay(full: string): string {
  const parts = (full || "").trim().split(" ").filter(Boolean);
  if (parts.length < 2) return full;
  return parts[0] + " " + parts[parts.length - 1][0];
}
