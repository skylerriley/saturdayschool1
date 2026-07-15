// Full-screen story viewer for event highlights.
// Plays the merged card array (auto data beats + human moments) with
// progress pips, tap zones, visible arrows, and slow auto-advance.
// Reuses the app's portal-overlay pattern (same as the feed overlay) and the
// real .sc-* scorecard notation inside .hcard-back for white-on-dark badges.
import { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { ScoreSymbol } from "../../../components/common";
import type { CaptionPart } from "../../../lib/recapEngine";
import { holeAerialUrl, type RecapCard } from "./highlightsShared";

const AUTO_ICON = <svg viewBox="0 0 24 24"><path d="M4 20V6l7 4 9-6v14l-9 5-7-4z" /></svg>;

// Stable per-golfer dot colors for odds boards (same palette as the
// win-probability chart elsewhere in the app).
const DOT_COLORS = ["#2a78d6", "#1baf7a", "#eda100", "#4a3aa7", "#e34948", "#eb6834"];
const dotColor = (golferId: number) => DOT_COLORS[Math.abs(golferId) % DOT_COLORS.length];

const DUR_DATA = 7000;
const DUR_PHOTO = 6500;
const DUR_VIDEO = 7000;

function scoreLabel(gross: number, par: number): string {
  const d = gross - par;
  if (d <= -2) return "Eagle";
  if (d === -1) return "Birdie";
  if (d === 0) return "Par";
  if (d === 1) return "Bogey";
  if (d === 2) return "Double";
  if (d === 3) return "Triple";
  return "+" + d;
}

// -- Shot tracer (fixed arc anchors over the hole image, as in the approved
// mockup; there is no per-hole anchor schema yet -- seam for later).
const ARC_GREEN = "M165 470 C 320 130 620 40 835 140";
const ARC_BUNKER = "M165 470 C 300 190 600 95 795 210";
const ARC_TREES = "M165 470 C 245 305 355 165 452 250";

function TracerShot({ gross, par, imgUrl }: { gross: number; par: number; imgUrl: string }) {
  const d = gross - par;
  const kind = d <= -1 ? "sink" : d === 0 ? "steady" : d === 1 ? "miss" : "spray";
  const conf = kind === "sink"
    ? { path: ARC_GREEN, col: "#ffd76a", end: "green", lx: 835, ly: 140 }
    : kind === "steady"
      ? { path: ARC_GREEN, col: "#88e6a6", end: "green", lx: 835, ly: 140 }
      : kind === "miss"
        ? { path: ARC_BUNKER, col: "#e4c98a", end: "bunker", lx: 795, ly: 210 }
        : { path: ARC_TREES, col: "#ff7a68", end: "trees", lx: 452, ly: 250 };
  const { path, col, end, lx, ly } = conf;
  return (
    <div className="beat-shot">
      <img src={imgUrl} alt="" />
      <svg className="tracer" viewBox="0 0 1024 571" preserveAspectRatio="xMidYMid slice">
        <circle cx="165" cy="470" r="7" fill="#fff" opacity=".9" />
        <path className="trace" d={path} pathLength={100} fill="none" stroke={col} strokeWidth="9" strokeLinecap="round" opacity=".3" />
        <path className="trace" d={path} pathLength={100} fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" />
        <ellipse cx={lx} cy={ly + 9} rx="9" ry="3" fill="#000" opacity=".3" className="endm" />
        {end === "green" && (
          <>
            <circle className="tring" cx={lx} cy={ly} r="14" fill="none" stroke={col} strokeWidth="2.5" />
            <g className="endm">
              <circle cx={lx} cy={ly} r="14" fill="none" stroke={col} strokeWidth="3.5" />
              <circle cx={lx} cy={ly} r="5" fill={col} />
            </g>
          </>
        )}
        {end === "bunker" && (
          <g className="endm">
            {[0, 60, 120, 180, 240, 300].map((a) => {
              const r = (Math.PI * a) / 180;
              return <line key={a} x1={lx} y1={ly} x2={Math.round(lx + Math.cos(r) * 14)} y2={Math.round(ly + Math.sin(r) * 14)} stroke={col} strokeWidth="2.5" strokeLinecap="round" />;
            })}
            <circle cx={lx} cy={ly} r="4.5" fill={col} />
          </g>
        )}
        {end === "trees" && (
          <g className="endm">
            <line x1={lx - 9} y1={ly - 9} x2={lx + 9} y2={ly + 9} stroke={col} strokeWidth="4" strokeLinecap="round" />
            <line x1={lx + 9} y1={ly - 9} x2={lx - 9} y2={ly + 9} stroke={col} strokeWidth="4" strokeLinecap="round" />
          </g>
        )}
      </svg>
    </div>
  );
}

function Caption({ parts }: { parts: CaptionPart[] }) {
  return <>{parts.map((p, i) => (p.b ? <b key={i}>{p.t}</b> : <span key={i}>{p.t}</span>))}</>;
}

export function HighlightsViewer({ cards, startIndex, event, course, golfers, eventEntries, holeScores, holeImages, likes, comments, memberName, adminMode, onClose, onToggleLike, onAddComment, onHide }: any) {
  const [idx, setIdx] = useState<number>(Math.min(startIndex, cards.length - 1));
  const [commentsFor, setCommentsFor] = useState<number | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const segRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);
  const elapsedRef = useRef<number>(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const reduced = useMemo(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);

  const card: RecapCard = cards[idx];

  const durationFor = (c: RecapCard) => (c.kind === "data" ? DUR_DATA : c.row?.media_type === "video" ? DUR_VIDEO : DUR_PHOTO);

  const nav = (dir: number) => {
    const next = idx + dir;
    if (next < 0) { setIdx(0); return; }
    if (next >= cards.length) { onClose(); return; }
    setIdx(next);
  };

  // Auto-advance via rAF driving the active pip's width directly (no
  // re-render per frame). Fully disabled under prefers-reduced-motion.
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

  // Opening comments pauses the story.
  useEffect(() => {
    const p = commentsFor != null;
    pausedRef.current = p || paused;
  }, [commentsFor, paused]);

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

  // Keep the video element in sync with pause state.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (paused || commentsFor != null) v.pause();
    else v.play().catch(() => {});
  }, [paused, commentsFor, idx]);

  const holePars: number[] = course?.hole_pars || [];
  const holeYards: number[] = Array.isArray(course?.hole_yards) ? course.hole_yards : [];

  // "7/11"-style event date shown next to the title (in subtext styling).
  const dateStr = (() => {
    const d = new Date((event?.date || "") + "T00:00:00");
    return isNaN(d.getTime()) ? "" : `${d.getMonth() + 1}/${d.getDate()}`;
  })();

  // Bottom-left hole block: big animated hole number + "Player | Par | Yards".
  const bottomHole = (c: RecapCard): number | null => {
    if (c.kind === "data") return c.beat!.throughHole != null ? null : c.beat!.hole;
    return c.row.pre_round ? null : c.row.hole_number ?? null;
  };
  const bottomMeta = (c: RecapCard): string => {
    const holeParts = (h: number, who: string | null) => {
      const parts: string[] = [];
      if (who) parts.push(who);
      const par = holePars[h - 1];
      const yds = holeYards[h - 1];
      if (par != null) parts.push(`Par ${par}`);
      if (yds != null && yds > 0) parts.push(`${yds} Yards`);
      return parts.join(" | ") || `Hole ${h}`;
    };
    if (c.kind === "data") {
      const b = c.beat!;
      if (b.angle === "final") return "Final";
      if (b.throughHole != null) return `Through ${b.throughHole}`;
      if (b.hole != null) return holeParts(b.hole, b.protagonistName || null);
      return b.subtext || "The round";
    }
    const r = c.row;
    if (r.pre_round) return "Pre-round";
    if (r.hole_number == null) return "Clubhouse";
    return holeParts(r.hole_number, r.golfer_name);
  };
  const holeBlock = (c: RecapCard) => {
    const h = bottomHole(c);
    return (
      <div className="v-holeblock">
        {h != null && <div className="v-holebig" key={idx}>{h}</div>}
        <span className="v-holemeta">{bottomMeta(c)}</span>
      </div>
    );
  };

  // Subject's score for a human card header ("Danny Reyes . Double").
  const subjectScore = (r: any): { gross: number; par: number } | null => {
    if (r.hole_number == null) return null;
    const g = golfers.find((x: any) => `${x.first_name} ${x.last_name}` === r.golfer_name);
    if (!g) return null;
    const entry = eventEntries.find((e: any) => e.golfer_id === g.golfer_id);
    if (!entry) return null;
    const hs = holeScores.find((h: any) => h.summary_id === entry.summary_id && h.hole_number === r.hole_number);
    const par = holePars[r.hole_number - 1];
    if (!hs || hs.gross_score == null || par == null) return null;
    return { gross: hs.gross_score, par };
  };

  const onMediaTap = (e: any) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x > rect.width * 0.68) nav(1);
    else if (x < rect.width * 0.32) nav(-1);
    else setPaused((p) => !p);
  };

  const cardLikes = card.kind === "human" ? likes.filter((l: any) => l.highlight_id === card.row.id) : [];
  const cardComments = card.kind === "human" ? comments.filter((cm: any) => cm.highlight_id === card.row.id) : [];
  const iLiked = card.kind === "human" && memberName != null && cardLikes.some((l: any) => l.liker_name === memberName);
  const sheetComments = commentsFor != null ? comments.filter((cm: any) => cm.highlight_id === commentsFor) : [];

  const body = (
    <div className="hl-overlay" role="dialog" aria-label="Event highlights">
      <div className="viewer">
        {/* media / background layer with tap zones */}
        <div className="v-media" onClick={onMediaTap}>
          {card.kind === "data" ? (
            <div className={"beatbg" + (card.beat!.mood === "fall" ? " fall" : card.beat!.mood === "cool" ? " cool" : "")} />
          ) : card.row.media_type === "video" ? (
            <video ref={videoRef} key={card.row.id} src={card.row.media_url} autoPlay muted playsInline loop />
          ) : (
            <img key={card.row.id} src={card.row.media_url} alt="" />
          )}
        </div>
        <div className="v-scrim-b" />

        {/* progress pips */}
        <div className="v-progress">
          {cards.map((c: RecapCard, i: number) => (
            <div key={i} className={"seg-bar" + (c.kind === "data" ? " auto" : "")}>
              <span ref={(el) => { segRefs.current[i] = el; }} />
            </div>
          ))}
        </div>

        <button className="v-close" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" fill="none" /></svg>
        </button>

        {/* header: title + date only (hole info lives bottom-left now) */}
        <div className="v-head">
          <div className="v-textblock">
            {card.kind === "data" ? (
              <div className="v-infoline">
                <span className="nm">{card.beat!.title}</span>
                {dateStr && <><span className="sep">&bull;</span><span className="v-datesub">{dateStr}</span></>}
              </div>
            ) : (() => {
              const sc = subjectScore(card.row);
              return (
                <div className="v-infoline">
                  <span className="nm">{card.row.golfer_name}</span>
                  {sc && <><span className="sep">&bull;</span><span>{scoreLabel(sc.gross, sc.par)}</span></>}
                  {dateStr && <><span className="sep">&bull;</span><span className="v-datesub">{dateStr}</span></>}
                </div>
              );
            })()}
          </div>
          {adminMode && card.kind === "human" && onHide && (
            <button className="v-hide" onClick={() => onHide(card.row.id)}>Hide</button>
          )}
        </div>

        {/* data-beat body */}
        {card.kind === "data" && (() => {
          const b = card.beat!;
          const aerial = b.hole != null && b.score ? holeAerialUrl(holeImages, event.course_name, b.hole) : null;
          return (
            <div className="beat hcard-back">
              <div className="beat-mid">
                <div className={"beat-kick" + (b.mood === "fall" ? " fall" : b.mood === "expo" ? " expo" : b.mood === "cool" ? " cool" : "")}>{b.kicker}</div>
                <div className="beat-viz">
                  {b.score && aerial && <TracerShot key={idx} gross={b.score.gross} par={b.score.par} imgUrl={aerial} />}
                  {b.odds && (
                    <div className="oddsbox">
                      <div className="ol">{b.throughHole != null ? `Through ${b.throughHole} · odds to win` : `After ${b.hole} · odds to win`}</div>
                      {b.odds.map((r) => (
                        <div key={r.golferId} className={"orow" + (r.featured ? " mv" : "")}>
                          <span className="odot" style={{ background: dotColor(r.golferId) }} />
                          <span className="onm">{shortDisplay(r.name)}</span>
                          <span className="obar"><span style={{ width: Math.min(100, r.win * 2) + "%", background: r.featured ? "var(--gold-300)" : dotColor(r.golferId) }} /></span>
                          <span className="owin">{r.win}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {b.swing && (
                    <div className="swing">
                      {b.swing.map((s, i) => (
                        <div key={i} className="sc-swing">
                          <div className="who">{s.name}</div>
                          <div className="fromto">{s.from}% <b className={s.to >= s.from ? "up" : "dn"}>&rarr; {s.to}%</b></div>
                        </div>
                      ))}
                    </div>
                  )}
                  {b.finalStandings && (
                    <div className="finalwrap">
                      {b.finalStandings.map((r, i) => (
                        <div key={i} className="frow">
                          <span className={"fpos" + (r.pos === "1" ? " p1" : "")}>{r.pos}</span>
                          <span className="fnm">{r.name}</span>
                          <span className="fpts">{r.pts}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {b.grind && (
                    <div className="oddsbox">
                      <div className="ol">Hole by hole</div>
                      <div className="hl-grind">
                        {b.grind.map((g) => (
                          <div key={g.hole} className="hl-grind-cell">
                            <div className="hl-grind-h">{g.hole}</div>
                            <ScoreSymbol gross={g.gross} par={g.par} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {b.fieldStat && (
                    <div className="oddsbox">
                      <div className="ol">How the field played it</div>
                      {(() => {
                        const maxV = Math.max(1, ...b.fieldStat!.map((r) => r.value));
                        return b.fieldStat!.map((r) => (
                          <div key={r.label} className="orow">
                            <span className="onm" style={{ flex: "0 0 74px" }}>{r.label}</span>
                            <span className="obar" style={{ flex: 1, width: "auto" }}>
                              <span style={{ width: (r.value / maxV) * 100 + "%", background: r.color }} />
                            </span>
                            <span className="owin">{r.value}</span>
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                  {b.h2h && (
                    <div className="oddsbox">
                      <div className="ol">Momentum · points through the round</div>
                      {(() => {
                        const maxV = Math.max(1, ...b.h2h!.flatMap((s) => s.points));
                        const len = Math.max(2, b.h2h![0].points.length);
                        const pts = (arr: number[]) => arr.map((v, i) => `${(i / (len - 1)) * 300},${86 - (v / maxV) * 76}`).join(" ");
                        return (
                          <>
                            <svg className="hl-h2h" viewBox="0 0 300 90" preserveAspectRatio="none">
                              {b.h2h!.map((s) => (
                                <polyline key={s.name} points={pts(s.points)} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                              ))}
                            </svg>
                            <div className="hl-h2h-legend">
                              {b.h2h!.map((s) => (
                                <span key={s.name}><i style={{ background: s.color }} />{s.name} · {s.points[s.points.length - 1]} pts</span>
                              ))}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}
                  {b.histBars && (
                    <div className="oddsbox">
                      <div className="ol">Week by week</div>
                      <div className="hl-histbars">
                        {(() => {
                          const maxV = Math.max(1, ...b.histBars!.map((r) => r.value));
                          return b.histBars!.map((r, i) => (
                            <div key={i} className="hl-histbar">
                              <div className="hl-histbar-val">{r.text ?? r.value}</div>
                              <div className={"hl-histbar-bar" + (r.highlight ? " hi" : "")} style={{ height: Math.max(10, (r.value / maxV) * 96) }} />
                              <div className="hl-histbar-label">{r.label}</div>
                            </div>
                          ));
                        })()}
                      </div>
                    </div>
                  )}
                  <div className="beat-cap"><Caption parts={b.caption} /></div>
                </div>
              </div>
              {holeBlock(card)}
              <div className="beat-auto"><span style={{ width: 13, height: 13, display: "flex", fill: "rgba(255,255,255,.55)" }}>{AUTO_ICON}</span> Auto highlight</div>
            </div>
          );
        })()}

        {/* human footer: caption + credit + social */}
        {card.kind === "human" && (
          <div className="v-foot">
            {holeBlock(card)}
            {card.row.caption && <div className="v-cap">{card.row.caption}</div>}
            <div className="v-credit">
              <svg viewBox="0 0 24 24"><path d="M4 20a8 8 0 0 1 16 0" /><circle cx="12" cy="8" r="4" /></svg>
              Added by {card.row.created_by_name}
            </div>
            <div className="v-actions">
              <button className="act" onClick={() => onToggleLike(card.row.id)} aria-label="Like">
                <svg className={"heart" + (iLiked ? " on" : "")} viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-10-9.3C.4 8.4 1.9 5 5.2 5 7.3 5 8.7 6.3 12 9c3.3-2.7 4.7-4 6.8-4 3.3 0 4.8 3.4 3.2 6.7C19.5 16.4 12 21 12 21z" /></svg>
                <span className="n">{cardLikes.length}</span>
              </button>
              <button className="act" onClick={() => setCommentsFor(card.row.id)} aria-label="Comments">
                <svg className="bub" viewBox="0 0 24 24"><path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20l1.1-5.4A8.5 8.5 0 1 1 21 11.5z" /></svg>
                <span className="n">{cardComments.length}</span>
              </button>
            </div>
          </div>
        )}

        {/* nav arrows (kept above tap zones) */}
        <button className="v-nav prev" onClick={(e) => { e.stopPropagation(); nav(-1); }} aria-label="Previous">
          <span className="arw"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg></span>
        </button>
        <button className="v-nav next" onClick={(e) => { e.stopPropagation(); nav(1); }} aria-label="Next">
          <span className="arw"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" /></svg></span>
        </button>

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
