// Admin tracer-anchor authoring tool (deliberately crude -- used once per
// hole). Tap the image to place each named anchor in sequence; a live
// preview tracer renders for the selected valence (3/2/1/0 points); Save
// writes the normalized anchors jsonb onto the hole_images row.
//
// Two views per hole: 'hole' (tee / apex? / green / bunker / trouble) and
// 'green' (edge / pin). The green view has its own image row (view_type =
// 'green'); it can be uploaded here.
import { useMemo, useRef, useState } from "react";
import { supabase, reportWriteError } from "../../lib/supabaseClient";
import { TracerSvg } from "../leaderboard/highlights/TracerSvg";

const HOLE_STEPS = [
  { key: "tee", label: "Tee", hint: "Tap the tee box" },
  { key: "apex", label: "Apex (optional)", hint: "Tap the dogleg apex, or skip" },
  { key: "green", label: "Green / pin", hint: "Tap the pin" },
  { key: "bunker", label: "Bunker", hint: "Tap the miss spot (bunker)" },
  { key: "trouble", label: "Trouble", hint: "Tap the blow-up spot (trees/water)" },
];
const GREEN_STEPS = [
  { key: "edge", label: "Edge", hint: "Tap where a ball reaches the green" },
  { key: "pin", label: "Pin", hint: "Tap the cup" },
];

export function AnchorTool({ courseName, hole, holeImages, setHoleImages, onClose, showSuccess }: any) {
  const [view, setView] = useState<"hole" | "green">("hole");
  const [previewPts, setPreviewPts] = useState(3);
  const [uploading, setUploading] = useState(false);
  const imgBoxRef = useRef<HTMLDivElement>(null);

  const rowFor = (v: "hole" | "green") => (holeImages || []).find((r: any) =>
    r.course_name === courseName && r.hole_number === hole
    && (v === "hole" ? (r.view_type == null || r.view_type === "hole") : r.view_type === "green"));
  const row = rowFor(view);

  const steps = view === "hole" ? HOLE_STEPS : GREEN_STEPS;
  const [draft, setDraft] = useState<any>(() => ({ ...(rowFor("hole")?.anchors || {}) }));
  const [greenDraft, setGreenDraft] = useState<any>(() => ({ ...(rowFor("green")?.anchors || {}) }));
  const anchors = view === "hole" ? draft : greenDraft;
  const setAnchors = view === "hole" ? setDraft : setGreenDraft;
  const [stepIdx, setStepIdx] = useState(0);

  const switchView = (v: "hole" | "green") => { setView(v); setStepIdx(0); };

  const placedCount = steps.filter((s) => anchors[s.key]).length;
  const requiredDone = view === "hole"
    ? anchors.tee && anchors.green && anchors.bunker && anchors.trouble
    : anchors.edge && anchors.pin;

  const onImageTap = (e: any) => {
    if (!imgBoxRef.current || stepIdx >= steps.length) return;
    const rect = imgBoxRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const key = steps[stepIdx].key;
    setAnchors((prev: any) => ({ ...prev, [key]: { x: Number(x.toFixed(3)), y: Number(y.toFixed(3)) } }));
    setStepIdx((i) => i + 1);
  };

  const undo = () => {
    const i = Math.max(0, stepIdx - 1);
    const key = steps[i].key;
    setAnchors((prev: any) => { const next = { ...prev }; delete next[key]; return next; });
    setStepIdx(i);
  };
  const clearAll = () => { setAnchors({}); setStepIdx(0); };
  const skip = () => { if (steps[stepIdx]?.key === "apex") setStepIdx((i) => i + 1); };

  const save = async () => {
    if (!row) return;
    const body = { anchors, view_type: view };
    try {
      await supabase.from("hole_images").update(body, { hole_image_id: row.hole_image_id });
      setHoleImages((p: any[]) => p.map((r: any) => (r.hole_image_id === row.hole_image_id ? { ...r, ...body } : r)));
      showSuccess(`Hole ${hole} ${view} anchors saved`);
    } catch (e: any) { reportWriteError("Anchor save")(e); }
  };

  // Upload a green-view image (second row for the hole).
  const uploadGreenImage = async (file: File) => {
    setUploading(true);
    try {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((res, rej) => { reader.onload = (e: any) => res(e.target.result); reader.onerror = () => rej(); reader.readAsDataURL(file); });
      const img = new Image();
      await new Promise<void>((res) => { img.onload = () => res(); img.src = dataUrl; });
      const MAX = 1400; const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d")!; ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej()), "image/jpeg", 0.82));
      const path = `${courseName.replace(/\s+/g, "-").toLowerCase()}/hole-${hole}-green-${Date.now()}.jpg`;
      const result = await supabase.storage.upload("hole-images", path, blob);
      if (!result) throw new Error("Upload failed");
      const newRow = { course_name: courseName, hole_number: hole, public_url: result.url, storage_path: path, view_type: "green" };
      const inserted = await supabase.from("hole_images").insert(newRow).catch((e: any) => { reportWriteError("Green image save")(e); return null; });
      const ir = Array.isArray(inserted) ? inserted[0] : null;
      setHoleImages((p: any[]) => [...p, { ...newRow, hole_image_id: ir?.hole_image_id || Date.now() }]);
      showSuccess(`Hole ${hole} green image saved`);
    } catch (e: any) { alert("Upload failed: " + (e?.message || String(e))); }
    setUploading(false);
  };

  // Preview needs full anchors; partial drafts render the dots only.
  const previewAnchors = useMemo(() => (requiredDone ? anchors : null), [anchors, requiredDone]);

  const btn = (label: string, onClick: () => void, opts: { disabled?: boolean; primary?: boolean } = {}) => (
    <button
      key={label}
      disabled={opts.disabled}
      onClick={onClick}
      style={{
        padding: "8px 12px", borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: opts.disabled ? "not-allowed" : "pointer",
        border: opts.primary ? "none" : "1px solid var(--border-md)",
        background: opts.primary ? "var(--green-700)" : "var(--surface)",
        color: opts.primary ? "#fff" : "var(--text-secondary)",
        opacity: opts.disabled ? 0.45 : 1,
      }}
    >{label}</button>
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(28,20,16,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
      <div style={{ background: "var(--bg)", borderRadius: "var(--radius-lg)", width: "100%", maxWidth: 560, maxHeight: "92vh", overflowY: "auto", padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 19, color: "var(--green-800)" }}>Tracer anchors · Hole {hole}</div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-muted)" }}>✕</button>
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          {(["hole", "green"] as const).map((v) => (
            <button key={v} onClick={() => switchView(v)}
              style={{ flex: 1, padding: "8px 0", borderRadius: 999, fontWeight: 700, fontSize: 13, cursor: "pointer", border: "1.5px solid", borderColor: view === v ? "var(--green-800)" : "var(--border-md)", background: view === v ? "var(--green-800)" : "var(--surface)", color: view === v ? "#fff" : "var(--text-secondary)" }}>
              {v === "hole" ? "Hole view" : "Green view"}
            </button>
          ))}
        </div>

        {!row ? (
          <div style={{ padding: "18px 6px" }}>
            <div style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 12 }}>
              {view === "hole"
                ? "No hole image yet -- upload one from the hole-images grid first."
                : "No green image for this hole yet. Upload one to enable the green-view outcome tracer."}
            </div>
            {view === "green" && (
              <label style={{ display: "inline-block", padding: "12px 18px", borderRadius: 10, background: "var(--green-700)", color: "#fff", fontWeight: 700, fontSize: 14, cursor: uploading ? "wait" : "pointer" }}>
                {uploading ? "Uploading..." : "Upload green image"}
                <input type="file" accept="image/*" style={{ display: "none" }} disabled={uploading}
                  onChange={async (e) => { const f = e.target.files?.[0]; if (f) await uploadGreenImage(f); e.target.value = ""; }} />
              </label>
            )}
          </div>
        ) : (
          <>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>
              {stepIdx < steps.length
                ? <><b>{steps[stepIdx].label}:</b> {steps[stepIdx].hint} ({placedCount}/{steps.length} placed)</>
                : "All anchors placed. Check each valence preview, then save."}
            </div>
            <div
              ref={imgBoxRef}
              onClick={onImageTap}
              style={{ position: "relative", borderRadius: 12, overflow: "hidden", cursor: "crosshair", border: "1px solid var(--border)", aspectRatio: "1024/660", background: "#111" }}
            >
              <img src={row.public_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 42%", display: "block", pointerEvents: "none" }} />
              {/* placed anchor dots + labels */}
              {steps.map((s) => anchors[s.key] && (
                <div key={s.key} style={{ position: "absolute", left: `${anchors[s.key].x * 100}%`, top: `${anchors[s.key].y * 100}%`, transform: "translate(-50%,-50%)", pointerEvents: "none" }}>
                  <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#fff", border: "2.5px solid var(--gold-500)", margin: "0 auto" }} />
                  <div style={{ fontSize: 10, fontWeight: 800, color: "#fff", textShadow: "0 1px 4px rgba(0,0,0,.9)", textAlign: "center", marginTop: 2 }}>{s.key}</div>
                </div>
              ))}
              {/* live tracer preview once required anchors exist */}
              {previewAnchors && <TracerSvg key={`${view}-${previewPts}-${JSON.stringify(previewAnchors)}`} points={previewPts} anchors={previewAnchors} view={view} />}
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 5 }}>
                {[3, 2, 1, 0].map((p) => (
                  <button key={p} onClick={() => setPreviewPts(p)}
                    style={{ padding: "6px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer", border: "1.5px solid", borderColor: previewPts === p ? "var(--gold-600)" : "var(--border-md)", background: previewPts === p ? "var(--gold-50)" : "var(--surface)", color: previewPts === p ? "var(--gold-800)" : "var(--text-secondary)" }}>
                    {p} pt{p === 1 ? "" : "s"}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {view === "hole" && stepIdx < steps.length && steps[stepIdx].key === "apex" && btn("Skip apex", skip)}
                {btn("Undo", undo, { disabled: stepIdx === 0 })}
                {btn("Clear", clearAll, { disabled: placedCount === 0 })}
                {btn("Save", save, { disabled: !requiredDone, primary: true })}
              </div>
            </div>
            {view === "green" && (
              <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 8 }}>
                Green view shows outcome only (in the cup / beside the pin / slides past). Putt counts are unknowable from gross scores and are never claimed.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
