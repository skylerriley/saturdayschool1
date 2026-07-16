// Full-screen story viewer for event highlights -- recap visual language.
// Plays the merged card array (auto data beats + human moments) with progress
// pips, tap zones, visible arrows, press-and-hold pause, and auto-advance.
// Ported class-for-class from the approved mockup (recap-visual-language.html):
// hero label above the focus shot card, glass data panels, anchor-driven
// tracers, and the real .lb-* leaderboard for the final beat.
import { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { ScoreSymbol } from "../../../components/common";
import type { DataBeat } from "../../../lib/recapEngine";
import { holeAerialUrl, holeImageRow, type RecapCard } from "./highlightsShared";
import { TracerSvg } from "./TracerSvg";
import { FALLBACK_ANCHORS } from "./tracerMath";

const AUTO_ICON = <svg viewBox="0 0 24 24"><path d="M4 20V6l7 4 9-6v14l-9 5-7-4z" /></svg>;

const DUR_DATA = 8000;
const DUR_PHOTO = 6500;
const DUR_VIDEO = 7000;

// Net score word from Stableford points -- the ONLY valence language allowed
// in user-facing copy (gross words appear solely as scorecard notation).
function netLabel(points: number): string {
  if (points >= 4) return "Net eagle";
  if (points === 3) return "Net birdie";
  if (points === 2) return "Net par";
  if (points === 1) return "Net bogey";
  return "Blank";
}

// ---- Building blocks -----------------------------------------------------------

function HoleMetaBlock({ meta, animKey }: { meta: NonNullable<DataBeat["holeMeta"]>; animKey: any }) {
  return (
    <div className="hole-meta">
      <b><i key={animKey}>{meta.hole}</i></b>
      <span>Par {meta.par}</span>
      {meta.yards != null && <span>{meta.yards} Yds</span>}
    </div>
  );
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
        <div className="glass-lbl">{beat.subtext ? `${beat.subtext} · gross and points` : "Gross and points"}</div>
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
        <div className="glass-lbl">{fn ? `${fn} · hole ${beat.hole}, rounds here` : "Recent rounds here"}</div>
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
    const max = Math.max(1, ...beat.fieldBars.map((b) => b.value));
    return (
      <div className="glass">
        <div className="glass-lbl">{beat.hole != null ? `Hole ${beat.hole} · net scoring across the field` : "Net scoring across the field"}</div>
        <div className="hbars">
          {beat.fieldBars.map((b, i) => (
            <div key={b.label} className="hb">
              <span className="hb-l">{b.label}</span>
              <span className="hb-t"><span className="hb-f" style={{ "--w": `${Math.round((b.value / max) * 100)}%`, background: b.color, animationDelay: `${i * 80}ms` } as any} /></span>
              <span className="hb-v">{b.value}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (beat.weekBars) {
    const max = Math.max(1, ...beat.weekBars.map((b) => b.value));
    return (
      <div className="glass">
        <div className="glass-lbl">{fn ? `${fn} · points week by week` : "Points week by week"}</div>
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

function FinalBoard({ rows }: { rows: { pos: string; name: string; pts: number }[] }) {
  const n = rows.length;
  const cols = { gridTemplateColumns: "44px 1fr 64px" };
  return (
    <div className="finalboard">
      <div className="lb-header" style={cols}>
        <div className="lb-header-cell">Pos</div>
        <div className="lb-header-cell">Golfer</div>
        <div className="lb-header-cell right">Pts</div>
      </div>
      {rows.map((r, i) => (
        <div
          key={r.name + i}
          className={"lb-row" + (i === 0 ? " leader" : "")}
          style={{ ...cols, animationDelay: `${(n - 1 - i) * 150}ms` }}
        >
          <span className={"lb-rank-cell" + (r.pos === "1" || r.pos === "T1" ? " r1" : "")}>{r.pos}</span>
          <span className="lb-name-main">{r.name}</span>
          <span className="lb-score-big" style={{ textAlign: "right" }}>{r.pts}</span>
        </div>
      ))}
    </div>
  );
}

// ---- Viewer --------------------------------------------------------------------

export function HighlightsViewer({
  cards, startIndex, event, course, courses, signups, golfers, eventEntries, holeScores, holeImages,
  likes, comments, memberName, adminMode,
  onClose, onToggleLike, onAddComment,
  onHideBeat, onEditBeatCaption, onDeleteHighlight, onEditHighlightCaption,
}: any) {
  const [idx, setIdx] = useState<number>(Math.max(0, Math.min(startIndex, cards.length - 1)));
  const [commentsFor, setCommentsFor] = useState<number | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const pausedRef = useRef(false);
  const [holdPaused, setHoldPaused] = useState(false); // press-and-hold
  const holdRef = useRef<{ timer: any; held: boolean }>({ timer: null, held: false });
  const segRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);
  const elapsedRef = useRef<number>(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const reduced = useMemo(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);

  const card: RecapCard = cards[idx];
  const courseName = event?.course_name || "";
  const holePars: number[] = course?.hole_pars || [];

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

  // Comments sheet, the dots menu, and press-and-hold stop the clock.
  useEffect(() => {
    pausedRef.current = commentsFor != null || menuOpen || holdPaused;
  }, [commentsFor, menuOpen, holdPaused]);

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

  // Keep the video element in sync with every pause source (hold included).
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (holdPaused || commentsFor != null || menuOpen) v.pause();
    else v.play().catch(() => {});
  }, [holdPaused, commentsFor, menuOpen, idx]);

  // ---- press-and-hold pause + tap zones -------------------------------------
  // Pressing down pauses IMMEDIATELY (no indicator); releasing always
  // resumes. A press longer than 180ms counts as a hold, so its release
  // never navigates; shorter presses are taps and keep the zones:
  // left/right third = prev/next. Under prefers-reduced-motion there is no
  // timer, so pressing does nothing and taps still navigate.
  const onPointerDown = (e: any) => {
    if (reduced) return;
    if ((e.target as HTMLElement).closest("button")) return;
    holdRef.current.held = false;
    clearTimeout(holdRef.current.timer);
    setHoldPaused(true);
    holdRef.current.timer = setTimeout(() => { holdRef.current.held = true; }, 180);
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
    if (endHold()) return; // hold release only -- no navigation
    if (menuOpen) { setMenuOpen(false); return; } // outside tap closes the menu
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x > rect.width * 0.68) nav(1);
    else if (x < rect.width * 0.32) nav(-1);
  };

  // ---- per-card derived data -------------------------------------------------
  const firstCourseImg = useMemo(
    () => (holeImages || []).find((img: any) => img.course_name === courseName && img.public_url && (img.view_type == null || img.view_type === "hole"))?.public_url || null,
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

  // Subject's NET result for the human eyebrow ("Danny Reyes . Net birdie").
  const subjectNet = (r: any): string | null => {
    if (r.hole_number == null) return null;
    const g = (golfers || []).find((x: any) => `${x.first_name} ${x.last_name}` === r.golfer_name);
    if (!g) return null;
    const entry = (eventEntries || []).find((e: any) => e.golfer_id === g.golfer_id);
    if (!entry) return null;
    const hs = (holeScores || []).find((h: any) => h.summary_id === entry.summary_id && h.hole_number === r.hole_number);
    return hs && hs.stableford_points != null ? netLabel(hs.stableford_points) : null;
  };

  const eyebrowFor = (c: RecapCard): string => {
    if (c.kind === "data") return c.beat!.eyebrow;
    const r = c.row;
    if (r.pre_round) return `${r.golfer_name} • Pre-round`;
    const net = subjectNet(r);
    return net ? `${r.golfer_name} • ${net}` : r.golfer_name;
  };

  // Context menu items for the current card.
  const isOwner = card.kind === "human" && memberName != null && card.row.created_by_name === memberName;
  const menuItems: { label: string; danger?: boolean; icon: any; run: () => void }[] = [];
  const ICO_EYE = <svg viewBox="0 0 24 24"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" /><circle cx="12" cy="12" r="3" /></svg>;
  const ICO_EDIT = <svg viewBox="0 0 24 24"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>;
  const ICO_TRASH = <svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></svg>;
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
  if (card.kind === "human" && (isOwner || adminMode)) {
    menuItems.push({
      label: "Edit highlight", icon: ICO_EDIT, run: () => {
        const next = window.prompt("Edit caption:", card.row.caption || "");
        if (next != null && onEditHighlightCaption) onEditHighlightCaption(card.row, next.trim());
      },
    });
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

  // ---- data-beat body ---------------------------------------------------------
  const renderBeat = (b: DataBeat) => {
    const holeRow = b.hole != null ? holeImageRow(holeImages, courseName, b.hole, "hole") : null;
    const greenRow = b.hole != null ? holeImageRow(holeImages, courseName, b.hole, "green") : null;
    // Focus card image: prefer the green view for a made net birdie+ when a
    // green image with anchors exists; otherwise the hole view.
    const useGreen = !!(greenRow && greenRow.anchors && b.score && b.score.points >= 3);
    const focusRow = useGreen ? greenRow : holeRow;
    const anchors = focusRow?.anchors && typeof focusRow.anchors === "object" ? focusRow.anchors : null;
    const showTracer = b.score != null && focusRow != null;
    const isFinal = !!b.finalStandings;
    // hcard-back scopes the white-on-dark score-symbol variants: white
    // numbers/borders, triple+ as a filled white square with the numeral
    // knocked out. Points labels keep their gold.
    return (
      <div className="beat hcard-back">
        <div className="beat-mid">
          <div className="beat-hero">{b.heroLabel}</div>
          {focusRow && !isFinal && (
            <div className="shot">
              <img src={focusRow.public_url} alt="" />
              {b.holeMeta && <HoleMetaBlock meta={b.holeMeta} animKey={idx} />}
              {showTracer && (
                <TracerSvg
                  key={`${idx}-${useGreen ? "g" : "h"}`}
                  points={b.score!.points}
                  anchors={useGreen ? anchors : anchors || FALLBACK_ANCHORS}
                  view={useGreen ? "green" : "hole"}
                />
              )}
            </div>
          )}
          {isFinal ? <FinalBoard rows={b.finalStandings!} /> : <GlassPanel beat={b} />}
          <div className="beat-cap"><CaptionText parts={b.caption} /></div>
        </div>
        <div className="beat-auto"><span style={{ width: 13, height: 13, display: "flex", fill: "rgba(255,255,255,.55)" }}>{AUTO_ICON}</span> Auto highlight</div>
      </div>
    );
  };

  const body = (
    <div className="hl-overlay" role="dialog" aria-label="Event highlights">
      <div
        className={"viewer" + (visualPaused ? " paused" : "")}
        onContextMenu={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
      >
        {/* media / background layer with tap + hold surface */}
        <div
          className="v-media"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={endHold}
          onPointerLeave={endHold}
        >
          {card.kind === "data" ? (() => {
            const b = card.beat!;
            const bgUrl = (b.hole != null ? holeAerialUrl(holeImages, courseName, b.hole) : null) || firstCourseImg;
            const tint = b.mood === "fall" ? " fall" : b.mood === "cool" ? " cool" : "";
            return bgUrl
              ? <div className={"v-bg" + tint}><img src={bgUrl} alt="" /></div>
              : <div className={"beatbg" + tint} />;
          })() : card.row.media_type === "video" ? (
            <video ref={videoRef} key={card.row.id} src={card.row.media_url} autoPlay muted playsInline loop />
          ) : (
            <img key={card.row.id} src={card.row.media_url} alt="" />
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
            <div className="who">{card.kind === "data" ? "Admin" : isOwner ? "Your highlight" : "Admin"}</div>
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
                  Added by {r.created_by_name}
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
                </div>
              </div>
            </>
          );
        })()}

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
