// Admin > Course > Images (Handoff #11).
//
// Coverage grid as the landing view: the primary question is "what is missing?"
// so we lead with it -- 18 holes x 3 view types (artistic / hole / green), plus
// a separate course-map slot. A missing asset is obvious at a glance; a present
// image that still needs anchors shows a distinct "anchors" state (a hole image
// without anchors cannot draw a tracer).
//
// Tapping a cell opens that slot: upload/replace, and for hole/green run the
// anchor wizard (AnchorWizard, below). All uploads go to R2 via uploadCourseAsset
// (static assets, zero egress). Rows still key on course_name (the table's key
// everywhere); the R2 folder uses the course's numeric id as a stable slug.
//
// Admin-gated by construction: this only renders inside AdminTab, which App
// gates on adminMode.
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase, reportWriteError } from "../../lib/supabaseClient";
import { uploadCourseAsset, type CourseViewType } from "../../lib/r2Upload";
import { AnchorWizard } from "./AnchorWizard";

type Slot = { hole: number | null; view: CourseViewType };

const HOLE_VIEWS: CourseViewType[] = ["artistic", "hole", "green"];
const VIEW_LABEL: Record<CourseViewType, string> = {
  artistic: "Artistic", hole: "Hole", green: "Green", course: "Course map",
};
const VIEW_HINT: Record<CourseViewType, string> = {
  artistic: "Beauty shot -- cards + highlight background. Never traced.",
  hole: "Full tee-to-green layout. Focus card + tracer.",
  green: "Green-only view. Focus card + tracer on made birdies.",
  course: "Full routing map (one per course). Upload only for now.",
};

// A slot needs anchors before it can trace. artistic/course never do.
const needsAnchors = (v: CourseViewType) => v === "hole" || v === "green";

// Renders INLINE inside Admin > Courses > Images (not a modal). The slot editor
// and anchor wizard are still overlays -- they are focused single actions and
// the wizard needs full-screen room for the loupe.
export function HoleImageManager({ courseName, courseId, holeImages, setHoleImages, showSuccess }: any) {
  // Active slot being edited (upload/replace + optional anchor wizard).
  const [openSlot, setOpenSlot] = useState<Slot | null>(null);
  const [uploading, setUploading] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  const rows = holeImages || [];
  // Legacy rows (view_type null, un-migrated DB) read as 'artistic' so the grid
  // reflects reality before the taxonomy migration lands.
  const rowFor = (hole: number | null, view: CourseViewType) =>
    rows.find((r: any) => r.course_name === courseName && r.hole_number === hole
      && (view === "artistic" ? (r.view_type == null || r.view_type === "artistic") : r.view_type === view)) || null;

  // Completion: 18 artistic + 18 hole + 18 green = 54 placeable per-hole slots.
  // "placed" means an image exists (anchors are surfaced separately per cell).
  const placed = useMemo(() => {
    let n = 0;
    for (let h = 1; h <= 18; h++) for (const v of HOLE_VIEWS) if (rowFor(h, v)) n++;
    return n;
  }, [rows, courseName]);
  const courseMapRow = rowFor(null, "course");

  // -- upload / replace one slot ------------------------------------------------
  const doUpload = async (slot: Slot, file: File) => {
    setUploading(true);
    try {
      const { publicUrl, hasAlpha } = await uploadCourseAsset(courseId, slot.hole, slot.view, file);
      const existing = rowFor(slot.hole, slot.view);
      if (existing) {
        // R2 key already changed (new uuid) => cache-bust is automatic; just
        // repoint the row. Old R2 object is orphaned (zero egress, negligible).
        await supabase.from("hole_images").update({ public_url: publicUrl, has_alpha: hasAlpha }, { hole_image_id: existing.hole_image_id }).catch(reportWriteError("Image save"));
        setHoleImages((p: any[]) => p.map((r: any) => r.hole_image_id === existing.hole_image_id ? { ...r, public_url: publicUrl, has_alpha: hasAlpha } : r));
      } else {
        const row: any = { course_name: courseName, hole_number: slot.hole, view_type: slot.view, public_url: publicUrl, storage_path: publicUrl, has_alpha: hasAlpha };
        const inserted = await supabase.from("hole_images").insert(row).catch((e: any) => { reportWriteError("Image save")(e); return null; });
        const ir = Array.isArray(inserted) ? inserted[0] : null;
        setHoleImages((p: any[]) => [...p, { ...row, hole_image_id: ir?.hole_image_id || Date.now() }]);
      }
      showSuccess(`${VIEW_LABEL[slot.view]}${slot.hole ? ` hole ${slot.hole}` : ""} saved`);
    } catch (e: any) {
      alert("Upload failed: " + (e?.message || String(e)));
    }
    setUploading(false);
  };

  const doDelete = async (slot: Slot) => {
    const existing = rowFor(slot.hole, slot.view);
    if (!existing) return;
    await supabase.from("hole_images").delete({ hole_image_id: existing.hole_image_id }).catch(reportWriteError("Image delete"));
    setHoleImages((p: any[]) => p.filter((r: any) => r.hole_image_id !== existing.hole_image_id));
    showSuccess(`${VIEW_LABEL[slot.view]}${slot.hole ? ` hole ${slot.hole}` : ""} removed`);
    setOpenSlot(null);
  };

  // -- cell state -> label/color ------------------------------------------------
  // present + anchored (traceable) | present, anchors missing | empty
  const cellState = (hole: number | null, view: CourseViewType): "empty" | "present" | "anchorless" => {
    const r = rowFor(hole, view);
    if (!r) return "empty";
    if (needsAnchors(view) && !(r.anchors && typeof r.anchors === "object" && Object.keys(r.anchors).length)) return "anchorless";
    return "present";
  };

  const activeRow = openSlot ? rowFor(openSlot.hole, openSlot.view) : null;

  return (
    <div>
      {/* Completion summary */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)" }}>{placed} of 54 placed</div>
        <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>artistic / hole / green</div>
      </div>

      <div>
        {/* Column legend */}
        <div style={{ display: "grid", gridTemplateColumns: "34px repeat(3,1fr)", gap: 6, padding: "0 0 6px" }}>
          <div />
          {HOLE_VIEWS.map((v) => (
            <div key={v} style={{ fontSize: 11.5, fontWeight: 800, textAlign: "center", color: "var(--text-secondary)", letterSpacing: ".02em" }}>{VIEW_LABEL[v]}</div>
          ))}
        </div>

        {/* Coverage grid: 18 rows x 3 cols */}
        <div>
          {Array.from({ length: 18 }, (_, i) => i + 1).map((hole) => (
            <div key={hole} style={{ display: "grid", gridTemplateColumns: "34px repeat(3,1fr)", gap: 6, marginBottom: 6, alignItems: "stretch" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, color: "var(--text-muted)" }}>{hole}</div>
              {HOLE_VIEWS.map((v) => {
                const st = cellState(hole, v);
                const r = rowFor(hole, v);
                return (
                  <button key={v} onClick={() => setOpenSlot({ hole, view: v })}
                    style={{
                      position: "relative", height: 58, borderRadius: 9, overflow: "hidden", cursor: "pointer", padding: 0,
                      border: st === "empty" ? "1.5px dashed var(--border-md)" : st === "anchorless" ? "1.5px solid var(--gold-400)" : "1.5px solid var(--green-500)",
                      background: r ? "#111" : "var(--surface2)",
                    }}>
                    {r
                      ? <img src={r.public_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "var(--text-muted)", opacity: 0.4 }}>＋</span>}
                    {st === "anchorless" && (
                      <span style={{ position: "absolute", bottom: 3, left: 3, right: 3, fontSize: 9.5, fontWeight: 800, textAlign: "center", color: "#111", background: "var(--gold-300)", borderRadius: 4, padding: "1px 0", letterSpacing: ".02em" }}>NEEDS ANCHORS</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Course map slot (separate) */}
        <div style={{ padding: "8px 12px 12px", borderTop: "1px solid var(--border)" }}>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--text-secondary)", marginBottom: 6 }}>COURSE MAP</div>
          <button onClick={() => setOpenSlot({ hole: null, view: "course" })}
            style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", cursor: "pointer",
              border: courseMapRow ? "1.5px solid var(--green-500)" : "1.5px dashed var(--border-md)", borderRadius: 9, background: courseMapRow ? "#111" : "var(--surface2)", padding: 0, overflow: "hidden" }}>
            <div style={{ width: 88, height: 58, flexShrink: 0, background: courseMapRow ? "#111" : "var(--surface2)" }}>
              {courseMapRow
                ? <img src={courseMapRow.public_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "var(--text-muted)", opacity: 0.4 }}>🗺</div>}
            </div>
            <span style={{ fontSize: 12.5, color: courseMapRow ? "#fff" : "var(--text-secondary)", padding: "0 10px" }}>
              {courseMapRow ? "Course map set — tap to replace" : "Add course routing map (optional)"}
            </span>
          </button>
        </div>
      </div>

      {/* Slot editor sheet: upload/replace + (for hole/green) open the wizard.
          Portaled to .app-shell (not <body>) so the fixed overlay escapes the
          subtab panel's translateX transform — which otherwise scopes
          position:fixed to the panel, letting the sticky subtab pills cover the
          sheet's top — while STAYING inside the phone frame's stacking context.
          z-index 150 keeps it below the floating bottom nav (.bottom-nav,
          z-index 200) exactly as before; the sheet's bottom padding clears that
          nav + safe area so its buttons are never covered. */}
      {openSlot && !wizardOpen && createPortal(
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 150, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpenSlot(null); }}>
          <div style={{ background: "var(--bg)", borderRadius: "16px 16px 0 0", width: "100%", maxWidth: 620, padding: "16px 16px calc(110px + var(--safe-area-bottom))" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <div style={{ fontFamily: "var(--font-serif,serif)", fontSize: 18, color: "var(--green-800)" }}>
                {VIEW_LABEL[openSlot.view]}{openSlot.hole ? ` · Hole ${openSlot.hole}` : ""}
              </div>
              <button onClick={() => setOpenSlot(null)} style={{ background: "transparent", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-muted)" }}>✕</button>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 12 }}>{VIEW_HINT[openSlot.view]}</div>

            {activeRow && (
              <div style={{ borderRadius: 12, overflow: "hidden", marginBottom: 12, aspectRatio: "1024/760", background: "#111" }}>
                <img src={activeRow.public_url} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              </div>
            )}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <label style={{ flex: "1 1 140px", textAlign: "center", padding: "13px 16px", borderRadius: 10, background: "var(--green-700)", color: "#fff", fontWeight: 700, fontSize: 14.5, cursor: uploading ? "wait" : "pointer" }}>
                {uploading ? "Uploading…" : activeRow ? "Replace image" : "Upload image"}
                <input type="file" accept="image/*" style={{ display: "none" }} disabled={uploading}
                  onChange={async (e) => { const f = e.target.files?.[0]; if (f) await doUpload(openSlot, f); e.target.value = ""; }} />
              </label>
              {activeRow && needsAnchors(openSlot.view) && (
                <button onClick={() => setWizardOpen(true)}
                  style={{ flex: "1 1 140px", padding: "13px 16px", borderRadius: 10, fontWeight: 700, fontSize: 14.5, cursor: "pointer",
                    border: "1.5px solid " + (activeRow.anchors ? "var(--gold-400)" : "var(--gold-500)"),
                    background: activeRow.anchors ? "var(--gold-50)" : "var(--gold-100)", color: "var(--gold-800)" }}>
                  {activeRow.anchors ? "Edit anchors ⌖" : "Place anchors ⌖"}
                </button>
              )}
              {activeRow && (
                <button onClick={() => doDelete(openSlot)}
                  style={{ flex: "0 0 auto", padding: "13px 16px", borderRadius: 10, fontWeight: 700, fontSize: 14.5, cursor: "pointer", border: "1.5px solid var(--red-400)", background: "transparent", color: "var(--red-600)" }}>
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>,
        document.querySelector(".app-shell") || document.body
      )}

      {/* Anchor wizard (hole/green only) */}
      {openSlot && wizardOpen && activeRow && needsAnchors(openSlot.view) && (
        <AnchorWizard
          view={openSlot.view as "hole" | "green"}
          hole={openSlot.hole as number}
          row={activeRow}
          setHoleImages={setHoleImages}
          showSuccess={showSuccess}
          onClose={() => setWizardOpen(false)}
        />
      )}
    </div>
  );
}
