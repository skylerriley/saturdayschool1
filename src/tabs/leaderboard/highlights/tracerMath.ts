// Pure tracer geometry (no components -- react-refresh friendly).
//
// Anchors are NORMALIZED (0..1 of the image) so they survive any crop or
// resolution. The arc is COMPUTED from start+end (ballistic lift, always
// bowing up the screen); an optional authored apex bends a dogleg. Only the
// 4-5 dots are ever authored.

export const VB_W = 1024;
export const VB_H = 660;

export interface Pt { x: number; y: number }
export const toPx = (a: Pt) => ({ x: a.x * VB_W, y: a.y * VB_H });

export function arcPath(a: Pt, b: Pt, lift: number, apex?: Pt): string {
  const A = toPx(a), B = toPx(b);
  let cx: number, cy: number;
  if (apex) {
    // Quadratic that passes through the authored apex at t=0.5.
    const X = toPx(apex);
    cx = 2 * X.x - (A.x + B.x) / 2;
    cy = 2 * X.y - (A.y + B.y) / 2;
  } else {
    const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
    const dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy) || 1;
    let px = -dy / len, py = dx / len;
    if (py > 0) { px = -px; py = -py; } // force the bow upward on screen
    const k = len * lift;
    cx = mx + px * k; cy = my + py * k;
  }
  return `M ${A.x.toFixed(0)} ${A.y.toFixed(0)} Q ${cx.toFixed(0)} ${cy.toFixed(0)} ${B.x.toFixed(0)} ${B.y.toFixed(0)}`;
}

// Low, gently breaking line across the green. NOT a putt-count claim.
export function puttPath(a: Pt, b: Pt): string {
  const A = toPx(a), B = toPx(b);
  const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
  const dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy) || 1;
  return `M ${A.x.toFixed(0)} ${A.y.toFixed(0)} Q ${(mx - (dy / len) * len * 0.12).toFixed(0)} ${(my + (dx / len) * len * 0.12).toFixed(0)} ${B.x.toFixed(0)} ${B.y.toFixed(0)}`;
}
