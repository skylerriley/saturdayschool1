// Canvas share-image composer for AUTO data beats. No DOM-screenshot library
// exists in this project (and none is allowed), so the beat is re-rendered
// natively: blurred artistic background + mood tint, eyebrow, hero label,
// hole meta, the beat's data viz (tracer shot / standings / bars / lines /
// scorecard strips / points panel), the caption, and an "Auto highlight"
// footer. Geometry for tracers comes from tracerMath so the shared image and
// the in-app SVG draw identical curves.
import type { DataBeat } from "../../../lib/recapEngine";
import { VB_W, VB_H, arcControl, puttControl, type Pt } from "./tracerMath";

const W = 1080;
const H = 1920;
const PAD = 54;
const CW = W - PAD * 2; // content width

const SANS = "'DM Sans', sans-serif";
const SERIF = "'DM Serif Display', serif";
const GOLD = "#ffc947";
const GREEN_LT = "#5cc98a";
const CORAL = "#ff8a7a";

interface ComposeArgs {
  beat: DataBeat;
  bgUrl: string | null; // artistic background (blurred full-bleed)
  focusUrl: string | null; // anchored hole/green layout image
  anchors: any | null;
  greenView: boolean;
  dateLabel: string; // "Jul 11, 2026"
}

function tryImg(src: string, cors: boolean): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const im = new Image();
    if (cors) im.crossOrigin = "anonymous";
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = src;
  });
}

// CORS-safe image loader for canvas composition. The direct crossOrigin load
// fails on iOS Safari whenever the SAME URL was previously fetched by a plain
// <img> (the app shows these images constantly): the HTTP/service-worker
// cache holds a no-CORS entry, Safari serves it to the CORS request, and the
// check fails -- which is why shared beats came out text-only on the phone.
// The fallback re-fetches with a cache-busting query (fresh CORS response)
// and draws from a blob URL, which can never taint the canvas.
export async function loadShareImage(src: string): Promise<HTMLImageElement | null> {
  const direct = await tryImg(src, true);
  if (direct) return direct;
  try {
    const bust = src + (src.includes("?") ? "&" : "?") + "hlshare=1";
    const res = await fetch(bust, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const im = await tryImg(url, false);
    URL.revokeObjectURL(url);
    return im;
  } catch (_: any) {
    return null;
  }
}

const loadImg = loadShareImage;

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = (text || "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  words.forEach((w) => {
    const trial = line ? line + " " + w : w;
    if (ctx.measureText(trial).width > maxWidth && line) { lines.push(line); line = w; }
    else line = trial;
  });
  if (line) lines.push(line);
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function glassPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  roundRect(ctx, x, y, w, h, 22);
  ctx.fillStyle = "rgba(14,36,24,.66)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.16)";
  ctx.lineWidth = 2;
  ctx.stroke();
}

// White-on-dark scorecard notation (mirrors .hcard-back .sc-*): circles for
// under par (double ring = eagle+), squares for over (double = double+).
function scoreCell(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, gross: number, par: number) {
  const d = gross - par;
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 3;
  const r1 = size / 2;
  const draw = (r: number, square: boolean) => {
    if (square) { ctx.strokeRect(cx - r, cy - r, r * 2, r * 2); }
    else { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); }
  };
  if (d <= -1) { draw(r1, false); if (d <= -2) draw(r1 - 7, false); }
  if (d >= 1) { draw(r1, true); if (d >= 2) draw(r1 - 7, true); }
  ctx.fillStyle = "#fff";
  ctx.font = `700 ${Math.round(size * 0.62)}px ${SANS}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(gross), cx, cy + 1);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

// The tracer shot card: layout image cover-fit into a VB-aspect rounded rect
// plus the flight/putt line and landing marker (same math as TracerSvg).
function drawShot(ctx: CanvasRenderingContext2D, img: HTMLImageElement, y: number, beat: DataBeat, anchors: any, greenView: boolean): number {
  const w = CW;
  const h = Math.round((w * VB_H) / VB_W);
  roundRect(ctx, PAD, y, w, h, 22);
  ctx.save();
  ctx.clip();
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
  ctx.drawImage(img, PAD + (w - dw) / 2, y + (h - dh) / 2, dw, dh);

  const sx = w / VB_W, sy = h / VB_H;
  const T = (p: { x: number; y: number }) => ({ x: PAD + p.x * sx, y: y + p.y * sy });
  const points = beat.score?.points ?? 0;

  const stroke = (c: { A: Pt; B: Pt; C: Pt }, col: string, width: number, alpha: number) => {
    const A = T(c.A), B = T(c.B), Cc = T(c.C);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = col;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.quadraticCurveTo(Cc.x, Cc.y, B.x, B.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
  };

  if (greenView && anchors.edge && anchors.pin) {
    const edge: Pt = anchors.edge, pin: Pt = anchors.pin;
    const shortOf = (t: number): Pt => ({ x: edge.x + (pin.x - edge.x) * t, y: edge.y + (pin.y - edge.y) * t });
    const end: Pt = points >= 3 ? pin : points === 2 ? { x: pin.x - 0.03, y: pin.y + 0.03 } : shortOf(0.78);
    const col = points >= 3 ? "#ffd76a" : points === 2 ? "#88e6a6" : "#e4c98a";
    const c = puttControl(edge, end);
    stroke(c, col, 12, 0.28);
    stroke(c, "#fff", 6, 1);
    const E = T({ x: end.x * VB_W, y: end.y * VB_H });
    if (points >= 3) { ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(E.x, E.y, 17, 0, Math.PI * 2); ctx.stroke(); }
  } else if (anchors.tee && anchors.green) {
    const tee: Pt = anchors.tee, green: Pt = anchors.green;
    const bunker: Pt = anchors.bunker || green;
    const trouble: Pt = anchors.trouble || bunker;
    const kind = points >= 3 ? "sink" : points === 2 ? "steady" : points === 1 ? "miss" : "spray";
    const end: Pt = kind === "miss" ? bunker : kind === "spray" ? trouble : green;
    const col = kind === "sink" ? "#ffd76a" : kind === "steady" ? "#88e6a6" : kind === "miss" ? "#e4c98a" : "#ff7a68";
    const c = arcControl(tee, end, kind === "spray" ? 0.22 : 0.34, (kind === "sink" || kind === "steady") ? anchors.apex : undefined);
    const E = T(c.B);
    // landing marker under the line, like the SVG paint order
    if (kind === "sink" || kind === "steady") {
      ctx.strokeStyle = col; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(E.x, E.y, 21, 0, Math.PI * 2); ctx.stroke();
    } else if (kind === "miss") {
      ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.lineCap = "round";
      for (const a of [0, 60, 120, 180, 240, 300]) {
        const r = (Math.PI * a) / 180;
        ctx.beginPath(); ctx.moveTo(E.x, E.y); ctx.lineTo(E.x + Math.cos(r) * 25, E.y + Math.sin(r) * 25); ctx.stroke();
      }
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(E.x, E.y, 8, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.strokeStyle = "#ff3b30"; ctx.lineWidth = 7; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(E.x - 16, E.y - 16); ctx.lineTo(E.x + 16, E.y + 16); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(E.x + 16, E.y - 16); ctx.lineTo(E.x - 16, E.y + 16); ctx.stroke();
    }
    stroke(c, col, 13, 0.28);
    stroke(c, "#fff", 6.5, 1);
    const S = T(c.A);
    ctx.globalAlpha = 0.9; ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(S.x, S.y, 9, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  ctx.strokeStyle = "rgba(255,255,255,.16)";
  ctx.lineWidth = 2;
  roundRect(ctx, PAD, y, w, h, 22);
  ctx.stroke();
  return h;
}

function panelLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.font = `700 26px ${SANS}`;
  ctx.fillStyle = "rgba(255,255,255,.62)";
  ctx.fillText(text.toUpperCase(), x, y);
}

// Each viz renderer draws inside a glass panel at y and returns the panel height.
function drawViz(ctx: CanvasRenderingContext2D, beat: DataBeat, y: number): number {
  const x = PAD, w = CW, ix = x + 36;

  if (beat.standings) {
    const rows = beat.standings.rows.slice(0, 6);
    const rowH = 92;
    const h = 96 + rows.length * rowH + 24;
    glassPanel(ctx, x, y, w, h);
    panelLabel(ctx, beat.standings.label, ix, y + 58);
    rows.forEach((r, i) => {
      const ry = y + 96 + i * rowH + rowH / 2 + 12;
      const leader = r.pos === "1" || r.pos === "T1";
      ctx.font = `400 44px ${SERIF}`;
      ctx.fillStyle = leader ? GOLD : "rgba(255,255,255,.6)";
      ctx.fillText(r.pos, ix, ry);
      ctx.font = `600 40px ${SANS}`;
      ctx.fillStyle = "#fff";
      ctx.fillText(r.name, ix + 110, ry);
      ctx.font = `400 46px ${SERIF}`;
      ctx.fillStyle = GREEN_LT;
      ctx.textAlign = "right";
      ctx.fillText(String(r.points), x + w - 36, ry);
      ctx.textAlign = "left";
    });
    return h;
  }

  if (beat.weekBars) {
    const bars = beat.weekBars;
    const h = 420;
    glassPanel(ctx, x, y, w, h);
    panelLabel(ctx, "Week by week", ix, y + 58);
    const area = { x: ix, y: y + 100, w: w - 72, h: 220 };
    const maxV = Math.max(1, ...bars.map((b) => b.value));
    const slot = area.w / bars.length;
    const bw = Math.min(110, slot - 22);
    bars.forEach((b, i) => {
      const bh = Math.max(18, (b.value / maxV) * area.h);
      const bx = area.x + i * slot + (slot - bw) / 2;
      const by = area.y + area.h - bh;
      roundRect(ctx, bx, by, bw, bh, 10);
      ctx.fillStyle = b.highlight ? "#f5b000" : "rgba(255,255,255,.28)";
      ctx.fill();
      ctx.font = `700 30px ${SANS}`;
      ctx.fillStyle = "rgba(255,255,255,.85)";
      ctx.textAlign = "center";
      ctx.fillText(String(b.text ?? b.value), bx + bw / 2, by - 14);
      ctx.font = `700 24px ${SANS}`;
      ctx.fillStyle = "rgba(255,255,255,.55)";
      ctx.fillText(b.label, bx + bw / 2, area.y + area.h + 42);
      ctx.textAlign = "left";
    });
    return h;
  }

  if (beat.fieldBars) {
    const rows = beat.fieldBars;
    const rowH = 78;
    const h = 96 + rows.length * rowH + 20;
    glassPanel(ctx, x, y, w, h);
    panelLabel(ctx, beat.hole != null ? `Hole ${beat.hole} · today's net scores` : "Today's net scores", ix, y + 58);
    const maxV = Math.max(1, ...rows.map((r) => (Number.isFinite(r.value) ? r.value : 0)));
    rows.forEach((r, i) => {
      const ry = y + 96 + i * rowH + rowH / 2;
      ctx.font = `600 34px ${SANS}`;
      ctx.fillStyle = "#fff";
      ctx.fillText(r.label, ix, ry + 12);
      const tx = ix + 230, tw = w - 72 - 230 - 90;
      roundRect(ctx, tx, ry - 10, tw, 22, 11);
      ctx.fillStyle = "rgba(255,255,255,.14)";
      ctx.fill();
      const v = Number.isFinite(r.value) ? r.value : 0;
      if (v > 0) {
        roundRect(ctx, tx, ry - 10, Math.max(22, (v / maxV) * tw), 22, 11);
        ctx.fillStyle = r.color;
        ctx.fill();
      }
      ctx.font = `700 34px ${SANS}`;
      ctx.fillStyle = "#fff";
      ctx.textAlign = "right";
      ctx.fillText(String(r.value), x + w - 36, ry + 12);
      ctx.textAlign = "left";
    });
    return h;
  }

  // The `h2h` overlapping-polyline panel was retired in Handoff #14 (rivalry
  // and duel both use the differential `diff` chart now). The share image never
  // rendered `diff` -- both the fade `positionTrace` and the duel/rivalry `diff`
  // fall through here, so the shared card shows hero + caption without a panel,
  // exactly as the duel already did since Handoff #12. Kept out of scope on
  // purpose; add a canvas port later if a chart in the share image is wanted.

  if (beat.scoreRow) {
    const cells = beat.scoreRow.cells.slice(0, 6);
    const h = 350;
    glassPanel(ctx, x, y, w, h);
    panelLabel(ctx, "Recent scores", ix, y + 58);
    const slot = (w - 72) / cells.length;
    cells.forEach((c2, i) => {
      const cx = ix + i * slot + slot / 2;
      if (c2.highlight) {
        ctx.fillStyle = "rgba(245,176,0,.18)";
        roundRect(ctx, cx - slot / 2 + 8, y + 84, slot - 16, 200, 16);
        ctx.fill();
      }
      scoreCell(ctx, cx, y + 150, 74, c2.gross, c2.par);
      ctx.font = `700 27px ${SANS}`;
      ctx.fillStyle = GOLD;
      ctx.textAlign = "center";
      ctx.fillText(c2.points != null ? `${c2.points} pt${c2.points === 1 ? "" : "s"}` : "--", cx, y + 226);
      ctx.fillStyle = "rgba(255,255,255,.55)";
      ctx.font = `700 24px ${SANS}`;
      ctx.fillText(c2.label, cx, y + 262);
      ctx.textAlign = "left";
    });
    ctx.font = `600 30px ${SANS}`;
    ctx.fillStyle = "rgba(255,255,255,.7)";
    ctx.fillText(`${beat.scoreRow.avgLabel}  ${beat.scoreRow.avgValue}`, ix, y + h - 34);
    return h;
  }

  if (beat.streak) {
    const cells = beat.streak.cells.slice(0, 12);
    const h = 300;
    glassPanel(ctx, x, y, w, h);
    panelLabel(ctx, beat.subtext || "Gross and points", ix, y + 58);
    const slot = (w - 72) / cells.length;
    const size = Math.min(66, slot - 14);
    cells.forEach((c2, i) => {
      const inFocus = i >= beat.streak!.focusStart && i < beat.streak!.focusStart + beat.streak!.focusCount;
      const cx = ix + i * slot + slot / 2;
      if (inFocus) {
        ctx.fillStyle = "rgba(245,176,0,.16)";
        roundRect(ctx, cx - slot / 2 + 4, y + 78, slot - 8, 178, 12);
        ctx.fill();
      }
      ctx.font = `700 22px ${SANS}`;
      ctx.fillStyle = "rgba(255,255,255,.55)";
      ctx.textAlign = "center";
      ctx.fillText(String(c2.hole), cx, y + 104);
      scoreCell(ctx, cx, y + 160, size, c2.gross, c2.par);
      ctx.font = `700 26px ${SANS}`;
      ctx.fillStyle = GOLD;
      ctx.fillText(String(c2.points), cx, y + 238);
      ctx.textAlign = "left";
    });
    return h;
  }

  if (beat.scorecard) {
    const sc = beat.scorecard;
    const h = 430;
    glassPanel(ctx, x, y, w, h);
    ctx.font = `600 34px ${SANS}`;
    ctx.fillStyle = "#fff";
    ctx.fillText(sc.name, ix, y + 62);
    ctx.textAlign = "right";
    ctx.fillStyle = GOLD;
    ctx.fillText(`${sc.totalPoints} Pts`, x + w - 36, y + 62);
    ctx.textAlign = "left";
    const rows = [sc.holes.slice(0, 9), sc.holes.slice(9)];
    rows.forEach((row, ri) => {
      const slot = (w - 72) / 9;
      row.forEach((hh, i) => {
        const cx = ix + i * slot + slot / 2;
        const cy = y + 130 + ri * 160;
        ctx.font = `700 22px ${SANS}`;
        ctx.fillStyle = "rgba(255,255,255,.5)";
        ctx.textAlign = "center";
        ctx.fillText(String(ri * 9 + i + 1), cx, cy - 44);
        ctx.textAlign = "left";
        scoreCell(ctx, cx, cy + 10, 62, hh.gross, hh.par);
      });
    });
    return h;
  }

  if (beat.ptsPanel) {
    const cols = beat.ptsPanel.cols.slice(0, 3);
    const h = 300;
    glassPanel(ctx, x, y, w, h);
    ctx.textAlign = "center";
    ctx.font = `700 26px ${SANS}`;
    ctx.fillStyle = "rgba(255,255,255,.62)";
    ctx.fillText(beat.ptsPanel.label.toUpperCase(), x + w / 2, y + 58);
    const slot = w / cols.length;
    cols.forEach((c2, i) => {
      const cx = x + i * slot + slot / 2;
      ctx.font = `600 32px ${SANS}`;
      ctx.fillStyle = "rgba(255,255,255,.75)";
      ctx.fillText(c2.name, cx, y + 130);
      ctx.font = `400 76px ${SERIF}`;
      ctx.fillStyle = c2.dir === "up" ? GREEN_LT : c2.dir === "dn" ? CORAL : "#fff";
      ctx.fillText(c2.value, cx, y + 226);
    });
    ctx.textAlign = "left";
    return h;
  }

  return 0;
}

export async function composeBeatShareImage(args: ComposeArgs): Promise<HTMLCanvasElement> {
  const { beat } = args;
  try { await (document as any).fonts?.ready; } catch (_: any) {}
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // background: blurred artistic photo when available, else a mood gradient
  ctx.fillStyle = "#0a2e1a";
  ctx.fillRect(0, 0, W, H);
  const bg = args.bgUrl ? await loadImg(args.bgUrl) : null;
  if (bg) {
    // Downscale-then-upscale blur: ctx.filter is unsupported on many iOS
    // Safari versions, but drawing through a tiny intermediate canvas gives
    // an equivalent soft background on every platform.
    const tiny = document.createElement("canvas");
    const TW = 68, TH = Math.round((TW * H) / W);
    tiny.width = TW;
    tiny.height = TH;
    const tctx = tiny.getContext("2d")!;
    const scale = Math.max(TW / bg.naturalWidth, TH / bg.naturalHeight) * 1.08;
    const dw = bg.naturalWidth * scale, dh = bg.naturalHeight * scale;
    tctx.drawImage(bg, (TW - dw) / 2, (TH - dh) / 2, dw, dh);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    (ctx as any).imageSmoothingQuality = "high";
    ctx.globalAlpha = 0.9;
    ctx.drawImage(tiny, 0, 0, W, H);
    ctx.restore();
  }
  const tintStops: [string, string, string, string] = beat.mood === "fall"
    ? ["rgba(64,20,16,.58)", "rgba(40,16,12,.2)", "rgba(20,14,10,.6)", "rgba(10,8,6,.9)"]
    : beat.mood === "cool"
      ? ["rgba(10,40,56,.56)", "rgba(10,30,42,.18)", "rgba(8,24,32,.6)", "rgba(6,16,22,.9)"]
      : ["rgba(8,32,20,.58)", "rgba(8,32,20,.18)", "rgba(8,32,20,.55)", "rgba(6,22,14,.88)"];
  const tint = ctx.createLinearGradient(0, 0, 0, H);
  tint.addColorStop(0, tintStops[0]);
  tint.addColorStop(0.3, tintStops[1]);
  tint.addColorStop(0.72, tintStops[2]);
  tint.addColorStop(1, tintStops[3]);
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, W, H);

  // eyebrow
  ctx.fillStyle = "#fff";
  ctx.font = `700 42px ${SANS}`;
  ctx.fillText(beat.eyebrow, PAD, 118);

  // hero label (serif, up to 2 lines) + hole meta
  ctx.font = `400 96px ${SERIF}`;
  ctx.shadowColor = "rgba(0,0,0,.5)";
  ctx.shadowBlur = 16;
  const heroLines = wrap(ctx, beat.heroLabel, CW).slice(0, 2);
  let y = 340;
  heroLines.forEach((ln) => { ctx.fillText(ln, PAD, y); y += 104; });
  ctx.shadowBlur = 0;
  if (beat.holeMeta) {
    ctx.font = `700 38px ${SANS}`;
    ctx.fillStyle = "rgba(255,255,255,.85)";
    ctx.fillText(
      `Hole ${beat.holeMeta.hole} · Par ${beat.holeMeta.par}${beat.holeMeta.yards != null ? ` · ${beat.holeMeta.yards} Yds` : ""}`,
      PAD, y + 6,
    );
    y += 58;
  }
  y += 36;

  // focus shot with tracer (when the beat has one)
  const focus = args.focusUrl ? await loadImg(args.focusUrl) : null;
  if (focus && args.anchors && beat.score) {
    y += drawShot(ctx, focus, y, beat, args.anchors, args.greenView) + 30;
  }

  // data viz panel
  const vizH = drawViz(ctx, beat, y);
  if (vizH > 0) y += vizH + 34;

  // caption (bold styling flattened -- canvas has no inline spans worth the
  // complexity; weight 600 reads right at this size)
  const captionText = beat.caption.map((p) => p.t).join("").replace(/ -- /g, " — ");
  ctx.font = `600 44px ${SANS}`;
  ctx.fillStyle = "rgba(255,255,255,.94)";
  const capLines = wrap(ctx, captionText, CW).slice(0, 5);
  capLines.forEach((ln) => { ctx.fillText(ln, PAD, y + 44); y += 60; });

  // footer
  ctx.font = `600 32px ${SANS}`;
  ctx.fillStyle = "rgba(255,255,255,.6)";
  ctx.fillText(`Auto highlight${args.dateLabel ? ` • ${args.dateLabel}` : ""}`, PAD, H - 76);

  return canvas;
}
