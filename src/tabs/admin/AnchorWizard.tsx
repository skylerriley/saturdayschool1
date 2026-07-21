// Anchor wizard (Handoff #11 sec 6) -- mobile-precise anchor placement.
//
// The core problem: placing a precise point UNDER a fingertip that covers the
// target. A naive tap-to-place cannot do this. So:
//   1. Sequential, one anchor at a time, with a clear instruction line.
//   2. Tap to place, then DRAG to fine-tune -- the pin stays draggable.
//   3. A magnifier LOUPE while dragging: a zoomed circle offset ABOVE the touch
//      point so the finger never covers what is being placed (the iOS text-
//      selection / Google Maps pattern -- this is what makes it usable at all).
//   4. Nudge arrows for 1px adjustments as a fallback.
//   5. Optional apex step for doglegs (skippable).
//   6. Live preview across ALL valences before saving (cycle 3/2/1/0 pts, or the
//      three green outcomes) -- anchors must make FOUR arcs look right, not one.
//   7. Save writes the anchors jsonb; reopening shows the placed pins to adjust.
//
// Geometry is reused from TracerSvg / tracerMath so the preview is EXACTLY what
// the viewer renders.
import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase, reportWriteError } from "../../lib/supabaseClient";
import { TracerSvg } from "../leaderboard/highlights/TracerSvg";

type Step = { key: string; label: string; hint: string; optional?: boolean };

const HOLE_STEPS: Step[] = [
  { key: "tee", label: "Tee box", hint: "Tap the tee box" },
  { key: "green", label: "Pin", hint: "Tap the pin / flag" },
  { key: "bunker", label: "Bunker", hint: "Tap the main bunker (the miss)" },
  { key: "trouble", label: "Trouble", hint: "Tap the trouble — trees / water" },
  { key: "apex", label: "Dogleg apex", hint: "Does this hole bend? Tap the corner, or skip", optional: true },
];
const GREEN_STEPS: Step[] = [
  { key: "edge", label: "Green edge", hint: "Tap where a ball reaches the green" },
  { key: "pin", label: "Pin", hint: "Tap the cup" },
];

// Loupe geometry.
const LOUPE_D = 116;      // loupe diameter (px)
const LOUPE_ZOOM = 2.6;   // magnification
const LOUPE_LIFT = 92;    // how far above the finger the loupe sits (px)

export function AnchorWizard({ view, hole, row, setHoleImages, showSuccess, onClose }: any) {
  const steps: Step[] = view === "hole" ? HOLE_STEPS : GREEN_STEPS;
  const imgBoxRef = useRef<HTMLDivElement>(null);

  const [anchors, setAnchors] = useState<any>(() => ({ ...(row?.anchors && typeof row.anchors === "object" ? row.anchors : {}) }));
  const [stepIdx, setStepIdx] = useState(0);
  // Which anchor key is actively being dragged (drives the loupe).
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null); // px within the box, for the loupe
  const [previewPts, setPreviewPts] = useState(3);

  const required = view === "hole" ? ["tee", "green", "bunker", "trouble"] : ["edge", "pin"];
  const requiredDone = required.every((k) => anchors[k]);
  const activeStep = steps[stepIdx];

  // Clamp a client point to a normalized 0..1 anchor + its px position in-box.
  const pointToAnchor = (clientX: number, clientY: number) => {
    const rect = imgBoxRef.current!.getBoundingClientRect();
    const px = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const py = Math.max(0, Math.min(rect.height, clientY - rect.top));
    return {
      norm: { x: Number((px / rect.width).toFixed(3)), y: Number((py / rect.height).toFixed(3)) },
      px: { x: px, y: py }, rect,
    };
  };

  // -- placing a new anchor via tap, then it becomes draggable -----------------
  const onBoxPointerDown = (e: any) => {
    if (!imgBoxRef.current) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    // If the current step is unplaced, this tap places it; otherwise re-grab it.
    const key = activeStep ? activeStep.key : null;
    if (!key) return;
    const { norm, px } = pointToAnchor(e.clientX, e.clientY);
    setAnchors((prev: any) => ({ ...prev, [key]: norm }));
    setDragKey(key);
    setDragPos(px);
  };
  const onBoxPointerMove = (e: any) => {
    if (!dragKey) return;
    const { norm, px } = pointToAnchor(e.clientX, e.clientY);
    setAnchors((prev: any) => ({ ...prev, [dragKey]: norm }));
    setDragPos(px);
  };
  const onBoxPointerUp = () => {
    if (dragKey) {
      // Advance to the next unplaced step once the finger lifts.
      setDragKey(null);
      setDragPos(null);
      setStepIdx((i) => Math.min(steps.length, i + 1));
    }
  };

  // Re-grab an already-placed pin to fine-tune it (drag on the dot itself).
  const grabExisting = (key: string) => (e: any) => {
    e.stopPropagation();
    imgBoxRef.current?.setPointerCapture?.(e.pointerId);
    setDragKey(key);
    const { px } = pointToAnchor(e.clientX, e.clientY);
    setDragPos(px);
  };

  // -- nudge (1px) fallback -----------------------------------------------------
  const nudge = (key: string, dx: number, dy: number) => {
    const rect = imgBoxRef.current?.getBoundingClientRect();
    if (!rect || !anchors[key]) return;
    const nx = Math.max(0, Math.min(1, anchors[key].x + dx / rect.width));
    const ny = Math.max(0, Math.min(1, anchors[key].y + dy / rect.height));
    setAnchors((prev: any) => ({ ...prev, [key]: { x: Number(nx.toFixed(3)), y: Number(ny.toFixed(3)) } }));
  };

  const skipApex = () => { if (activeStep?.optional) setStepIdx((i) => i + 1); };
  const undo = () => {
    const i = Math.max(0, stepIdx - 1);
    const key = steps[i].key;
    setAnchors((prev: any) => { const n = { ...prev }; delete n[key]; return n; });
    setStepIdx(i);
  };
  const clearAll = () => { setAnchors({}); setStepIdx(0); };

  const save = async () => {
    if (!row || !requiredDone) return;
    const body = { anchors, view_type: view };
    try {
      await supabase.from("hole_images").update(body, { hole_image_id: row.hole_image_id });
      setHoleImages((p: any[]) => p.map((r: any) => (r.hole_image_id === row.hole_image_id ? { ...r, ...body } : r)));
      showSuccess(`Hole ${hole} ${view} anchors saved`);
      onClose();
    } catch (e: any) { reportWriteError("Anchor save")(e); }
  };

  // The last placed/dragged anchor drives the nudge controls.
  const nudgeKey = dragKey || (activeStep ? null : steps[steps.length - 1]?.key) || (stepIdx > 0 ? steps[stepIdx - 1].key : null);
  const previewAnchors = useMemo(() => (requiredDone ? anchors : null), [anchors, requiredDone]);
  const previewValences = view === "hole" ? [3, 2, 1, 0] : [3, 2, 0];

  // Loupe background: the same image, scaled LOUPE_ZOOM, translated so the
  // target point sits under the loupe's centre crosshair.
  const loupeStyle = (): any => {
    if (!dragPos || !imgBoxRef.current) return null;
    const rect = imgBoxRef.current.getBoundingClientRect();
    const bgW = rect.width * LOUPE_ZOOM, bgH = rect.height * LOUPE_ZOOM;
    return {
      backgroundImage: `url(${row.public_url})`,
      backgroundSize: `${bgW}px ${bgH}px`,
      backgroundPosition: `${LOUPE_D / 2 - dragPos.x * LOUPE_ZOOM}px ${LOUPE_D / 2 - dragPos.y * LOUPE_ZOOM}px`,
    };
  };

  // Portal to .app-shell so the fixed overlay escapes the subtab panel's
  // translateX transform (which otherwise scopes position:fixed to the panel,
  // letting the sticky subtab pills cover the modal's top edge) while staying
  // inside the phone-frame column. This is a full-screen placement surface, so
  // z-index 10001 intentionally covers the bottom nav too.
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 10001, background: "rgba(20,14,10,0.82)", display: "flex", alignItems: "center", justifyContent: "center", padding: 10 }}>
      <div style={{ background: "var(--bg)", borderRadius: "var(--radius-lg)", width: "100%", maxWidth: 560, maxHeight: "94vh", overflowY: "auto", padding: 14, touchAction: "none" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ fontFamily: "var(--font-serif,serif)", fontSize: 18, color: "var(--green-800)" }}>
            {view === "hole" ? "Hole" : "Green"} anchors · Hole {hole}
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-muted)" }}>✕</button>
        </div>

        {/* Instruction line -- one target, one decision */}
        <div style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 8, minHeight: 20 }}>
          {activeStep
            ? <><b style={{ color: "var(--green-800)" }}>{activeStep.label}:</b> {activeStep.hint}</>
            : "All set. Cycle the previews below, then Save."}
        </div>

        {/* Image + placement surface */}
        <div
          ref={imgBoxRef}
          onPointerDown={onBoxPointerDown}
          onPointerMove={onBoxPointerMove}
          onPointerUp={onBoxPointerUp}
          onPointerCancel={onBoxPointerUp}
          style={{ position: "relative", borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)", aspectRatio: "1024/760", background: "#111", cursor: "crosshair", userSelect: "none", touchAction: "none" }}
        >
          <img src={row.public_url} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", pointerEvents: "none" }} />

          {/* placed anchor dots (draggable to re-tune) */}
          {steps.map((s) => anchors[s.key] && (
            <div key={s.key}
              onPointerDown={grabExisting(s.key)}
              style={{ position: "absolute", left: `${anchors[s.key].x * 100}%`, top: `${anchors[s.key].y * 100}%`, transform: "translate(-50%,-50%)", width: 26, height: 26, marginLeft: -13, marginTop: -13, display: "flex", alignItems: "center", justifyContent: "center", cursor: "grab" }}>
              <div style={{ width: 13, height: 13, borderRadius: "50%", background: "#fff", border: "2.5px solid var(--gold-500)", boxShadow: "0 1px 4px rgba(0,0,0,.6)" }} />
              <div style={{ position: "absolute", top: 20, fontSize: 9.5, fontWeight: 800, color: "#fff", textShadow: "0 1px 4px rgba(0,0,0,.9)", whiteSpace: "nowrap" }}>{s.key}</div>
            </div>
          ))}

          {/* live tracer preview once required anchors exist */}
          {previewAnchors && (
            <TracerSvg key={`${view}-${previewPts}-${JSON.stringify(previewAnchors)}`} points={previewPts} anchors={previewAnchors} view={view} />
          )}

          {/* MAGNIFIER LOUPE -- offset above the finger so it never covers the target */}
          {dragPos && (
            <div style={{
              position: "absolute",
              left: dragPos.x - LOUPE_D / 2,
              top: dragPos.y - LOUPE_LIFT - LOUPE_D / 2,
              width: LOUPE_D, height: LOUPE_D, borderRadius: "50%",
              border: "3px solid #fff", boxShadow: "0 4px 16px rgba(0,0,0,.55)",
              backgroundColor: "#111", backgroundRepeat: "no-repeat", pointerEvents: "none", overflow: "hidden",
              ...loupeStyle(),
            }}>
              {/* centre crosshair marking the exact placed point */}
              <div style={{ position: "absolute", left: "50%", top: "50%", width: 1, height: LOUPE_D, background: "rgba(255,255,255,.7)", transform: "translateX(-50%)" }} />
              <div style={{ position: "absolute", top: "50%", left: "50%", height: 1, width: LOUPE_D, background: "rgba(255,255,255,.7)", transform: "translateY(-50%)" }} />
              <div style={{ position: "absolute", left: "50%", top: "50%", width: 10, height: 10, borderRadius: "50%", border: "2px solid var(--gold-400)", transform: "translate(-50%,-50%)" }} />
            </div>
          )}
        </div>

        {/* Nudge controls (1px fallback) */}
        {nudgeKey && anchors[nudgeKey] && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
            <span style={{ fontSize: 11.5, color: "var(--text-muted)", fontWeight: 700 }}>Nudge <b style={{ color: "var(--text-secondary)" }}>{nudgeKey}</b></span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,28px)", gridTemplateRows: "repeat(2,26px)", gap: 3 }}>
              <span />
              {nudgeBtn("↑", () => nudge(nudgeKey, 0, -1))}
              <span />
              {nudgeBtn("←", () => nudge(nudgeKey, -1, 0))}
              {nudgeBtn("↓", () => nudge(nudgeKey, 0, 1))}
              {nudgeBtn("→", () => nudge(nudgeKey, 1, 0))}
            </div>
          </div>
        )}

        {/* Valence preview cycler -- must look right across all outcomes */}
        {previewAnchors && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 5 }}>Preview every outcome before saving:</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {previewValences.map((p) => (
                <button key={p} onClick={() => setPreviewPts(p)}
                  style={{ padding: "7px 12px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: "pointer", border: "1.5px solid",
                    borderColor: previewPts === p ? "var(--gold-600)" : "var(--border-md)", background: previewPts === p ? "var(--gold-50)" : "var(--surface)", color: previewPts === p ? "var(--gold-800)" : "var(--text-secondary)" }}>
                  {valenceLabel(p, view)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Action row */}
        <div style={{ display: "flex", gap: 6, marginTop: 14, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {activeStep?.optional && actionBtn("Skip apex", skipApex)}
          {actionBtn("Undo", undo, stepIdx === 0 && !anchors[steps[0]?.key])}
          {actionBtn("Clear", clearAll, Object.keys(anchors).length === 0)}
          {actionBtn("Save", save, !requiredDone, true)}
        </div>

        {view === "green" && (
          <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 10 }}>
            Green view shows OUTCOME only — in the cup / beside the pin / slides past. Putt counts are unknowable from gross scores and are never claimed.
          </div>
        )}
      </div>
    </div>,
    document.querySelector(".app-shell") || document.body
  );

  function nudgeBtn(label: string, onClick: () => void) {
    return <button onClick={onClick} style={{ border: "1px solid var(--border-md)", background: "var(--surface)", borderRadius: 6, fontSize: 13, fontWeight: 800, color: "var(--text-secondary)", cursor: "pointer" }}>{label}</button>;
  }
  function actionBtn(label: string, onClick: () => void, disabled = false, primary = false) {
    return (
      <button disabled={disabled} onClick={onClick}
        style={{ padding: "9px 14px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer",
          border: primary ? "none" : "1px solid var(--border-md)", background: primary ? "var(--green-700)" : "var(--surface)", color: primary ? "#fff" : "var(--text-secondary)", opacity: disabled ? 0.45 : 1 }}>
        {label}
      </button>
    );
  }
}

function valenceLabel(pts: number, view: "hole" | "green"): string {
  if (view === "green") return pts >= 3 ? "In the cup" : pts === 2 ? "Beside pin" : "Past";
  return pts >= 3 ? "Sink (3+)" : pts === 2 ? "Green (2)" : pts === 1 ? "Bunker (1)" : "Trouble (0)";
}
