import { useState, useRef } from "react";
import { scrollMainTop } from "../../lib/formatters";
import { fuzzyMatchCourseName } from "../../lib/courseNameUtils";
import { supabase, GCAPI_KEY, reportWriteError } from "../../lib/supabaseClient";

// -- 3b) COURSE MANAGER ---------------------------------------

// Fuzzy course name match: normalises punctuation/suffixes then checks
// substring containment in either direction, so "Strawberry Farms GC"
// matches "Strawberry Farms Golf Club" and vice-versa.
export function CourseManager({ courses, setCourses, holeImages, setHoleImages, showSuccess }: any) {
  const editFormRef = useRef<HTMLDivElement>(null);
  const lookupRef = useRef<HTMLDivElement>(null);
  const blank: any = { course_id: 0, course_name: "", tee_box_name: "", tee_slope: 113, tee_rating: 72.0, par: 72 };
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<any>(blank);
  const [parStr, setParStr] = useState("4,4,3,5,4,4,3,5,4,4,3,5,4,4,3,5,4,4");
  const [siStr, setSiStr] = useState("1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18");
  const [yardsStr, setYardsStr] = useState("");
  const courseNames = [...new Set(courses.map((c: any) => c.course_name))] as string[];

  // ── Hole Images Modal ──────────────────────────────────────────────
  const [imgModalCourse, setImgModalCourse] = useState<string | null>(null);
  const [uploadingHole, setUploadingHole] = useState<number | null>(null);

  const uploadHoleImage = async (courseName: string, hole: number, file: File) => {
    setUploadingHole(hole);
    try {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((res, rej) => { reader.onload = (e: any) => res(e.target.result); reader.onerror = () => rej(); reader.readAsDataURL(file); });
      const img = new Image();
      await new Promise<void>((res) => { img.onload = () => res(); img.src = dataUrl; });
      const MAX = 1400; const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d")!; ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((res, rej) => canvas.toBlob(b => b ? res(b) : rej(), "image/jpeg", 0.82));
      const path = `${courseName.replace(/\s+/g, "-").toLowerCase()}/hole-${hole}-${Date.now()}.jpg`;
      const result = await supabase.storage.upload("hole-images", path, blob);
      if (!result) throw new Error("Upload failed");
      const existing = (holeImages || []).find((r: any) => r.course_name === courseName && r.hole_number === hole);
      if (existing) {
        // Old-file cleanup is best-effort — the replacement already uploaded
        await supabase.storage.remove("hole-images", [existing.storage_path]).catch((e) => console.warn("[storage] cleanup:", e));
        await supabase.from("hole_images").update({ public_url: result.url, storage_path: path }, { hole_image_id: existing.hole_image_id }).catch(reportWriteError("Hole image save"));
        setHoleImages((p: any[]) => p.map((r: any) => r.hole_image_id === existing.hole_image_id ? { ...r, public_url: result.url, storage_path: path } : r));
      } else {
        const row = { course_name: courseName, hole_number: hole, public_url: result.url, storage_path: path };
        // insert() resolves to an ARRAY of rows — grabbing .hole_image_id off it
        // is always undefined, leaving a temp id that later update/delete can't match
        const inserted = await supabase.from("hole_images").insert(row).catch((e: any) => { reportWriteError("Hole image save")(e); return null; });
        const insertedRow = Array.isArray(inserted) ? inserted[0] : null;
        setHoleImages((p: any[]) => [...p, { ...row, hole_image_id: insertedRow?.hole_image_id || Date.now() }]);
      }
      showSuccess(`Hole ${hole} image saved`);
    } catch (e: any) { alert("Upload failed: " + (e?.message || String(e))); }
    setUploadingHole(null);
  };

  const deleteHoleImage = async (courseName: string, hole: number) => {
    const existing = (holeImages || []).find((r: any) => r.course_name === courseName && r.hole_number === hole);
    if (!existing) return;
    await supabase.storage.remove("hole-images", [existing.storage_path]).catch((e) => console.warn("[storage] cleanup:", e));
    await supabase.from("hole_images").delete({ hole_image_id: existing.hole_image_id }).catch(reportWriteError("Hole image delete"));
    setHoleImages((p: any[]) => p.filter((r: any) => r.hole_image_id !== existing.hole_image_id));
    showSuccess(`Hole ${hole} image removed`);
  };

  // ── Course Lookup (golfcourseapi.com) ──────────────────────────────
  const [showLookup, setShowLookup] = useState(false);
  const [lookupQuery, setLookupQuery] = useState("");
  const [lookupResults, setLookupResults] = useState<any[]>([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [selectedCourse, setSelectedCourse] = useState<any>(null);
  const [courseDetail, setCourseDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedTees, setSelectedTees] = useState<Set<string>>(new Set());

  const openLookup = () => {
    setShowLookup(true);
    setLookupQuery(""); setLookupResults([]); setLookupError("");
    setSelectedCourse(null); setCourseDetail(null); setSelectedTees(new Set());
    setTimeout(() => lookupRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const searchCourses = async () => {
    if (!GCAPI_KEY) { setLookupError("VITE_GCAPI_KEY env var not set."); return; }
    if (!lookupQuery.trim()) { setLookupError("Enter a course name to search."); return; }
    setLookupLoading(true); setLookupError(""); setLookupResults([]); setSelectedCourse(null); setCourseDetail(null); setSelectedTees(new Set());
    try {
      const res = await fetch(`https://api.golfcourseapi.com/v1/search?search_query=${encodeURIComponent(lookupQuery)}`, { headers: { Authorization: `Key ${GCAPI_KEY}` } });
      if (!res.ok) { const t = await res.text(); setLookupError(`API error ${res.status}: ${t}`); setLookupLoading(false); return; }
      const data = await res.json();
      const list = data.courses || [];
      setLookupResults(list);
      if (list.length === 0) setLookupError("No courses found. Try a different name or city.");
    } catch (e: any) { setLookupError("Network error: " + e.message); }
    setLookupLoading(false);
  };

  const loadCourseDetail = async (course: any) => {
    setSelectedCourse(course); setCourseDetail(null); setSelectedTees(new Set()); setDetailLoading(true);
    try {
      const res = await fetch(`https://api.golfcourseapi.com/v1/courses/${course.id}`, { headers: { Authorization: `Key ${GCAPI_KEY}` } });
      if (!res.ok) { setLookupError(`Could not load course detail (${res.status})`); setDetailLoading(false); return; }
      const data = await res.json();
      setCourseDetail(data.course || data);
    } catch (e: any) { setLookupError("Network error: " + e.message); }
    setDetailLoading(false);
  };

  // Issue 2: male tees only
  const allApiTees = (): any[] => {
    if (!courseDetail?.tees) return [];
    return courseDetail.tees.male || [];
  };

  const toggleTee = (teeKey: string) => {
    setSelectedTees(prev => { const n = new Set(prev); n.has(teeKey) ? n.delete(teeKey) : n.add(teeKey); return n; });
  };

  const importSelectedTees = () => {
    if (!courseDetail || selectedTees.size === 0) { showSuccess("⚠ Select at least one tee box to import."); return; }
    const tees = allApiTees();
    const toImport = tees.filter((_t: any, i: number) => selectedTees.has(String(i)));
    // Issue 4: reuse existing course_name if already in DB (case-insensitive match)
    const apiCourseName: string = courseDetail.course_name || courseDetail.club_name || selectedCourse.club_name || "";
    const existingName = courseNames.find(n => fuzzyMatchCourseName(n, apiCourseName));
    const resolvedName = existingName || apiCourseName;
    let added = 0;
    const now = new Date().toISOString();
    const newEntries: any[] = toImport.map((t: any) => {
      const pars = (t.holes || []).map((h: any) => h.par || 4);
      const sis = (t.holes || []).map((h: any) => h.handicap || 0);
      const yards = (t.holes || []).map((h: any) => h.yardage || 0);
      while (pars.length < 18) pars.push(4);
      while (sis.length < 18) sis.push(sis.length + 1);
      while (yards.length < 18) yards.push(0);
      const hasYards = yards.some((y: number) => y > 0);
      added++;
      return {
        course_id: Date.now() + added,
        course_name: resolvedName,
        tee_box_name: t.tee_name,
        tee_slope: t.slope_rating || 113,
        tee_rating: t.course_rating || 72.0,
        par: t.par_total || pars.reduce((a: number, b: number) => a + b, 0),
        hole_pars: pars,
        hole_stroke_indices: sis,
        ...(hasYards ? { hole_yards: yards } : {}),
        created_at: now,
      };
    });
    // Issue 3: call setCourses (the prop = setCoursesDB) not raw local state
    setCourses((p: any) => [...p, ...newEntries]);
    showSuccess(`✓ Imported ${added} tee box${added !== 1 ? "es" : ""} for ${resolvedName}`);
    setShowLookup(false);
    setTimeout(() => scrollMainTop(), 100);
  };

  // ── Manual edit form ───────────────────────────────────────────────
  const startNew = () => { setEditing("new"); setForm(blank); setParStr("4,4,3,5,4,4,3,5,4,4,3,5,4,4,3,5,4,4"); setSiStr("1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18"); setYardsStr(""); setShowLookup(false); setTimeout(() => editFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); };
  const startEdit = (c: any) => { setEditing(c.course_id); setForm({ ...c }); setParStr(c.hole_pars.join(",")); setSiStr(c.hole_stroke_indices.join(",")); setYardsStr(c.hole_yards ? c.hole_yards.join(",") : ""); setShowLookup(false); setTimeout(() => editFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); };

  const save = () => {
    const pars = parStr.split(",").map(v => parseInt(v.trim())).filter(v => !isNaN(v));
    const sis = siStr.split(",").map(v => parseInt(v.trim())).filter(v => !isNaN(v));
    if (pars.length !== 18 || sis.length !== 18) { showSuccess("⚠ Must have exactly 18 values for par and stroke index"); return; }
    const yardsRaw = yardsStr.trim();
    const yards = yardsRaw ? yardsRaw.split(",").map(v => parseInt(v.trim())).filter(v => !isNaN(v)) : null;
    if (yards && yards.length !== 18) { showSuccess("⚠ Hole yards must have exactly 18 values (or leave blank)"); return; }
    const entry = { ...form, tee_slope: parseInt(form.tee_slope) || 113, tee_rating: parseFloat(form.tee_rating) || 72.0, par: parseInt(form.par) || 72, hole_pars: pars, hole_stroke_indices: sis, hole_yards: yards || null };
    if (editing === "new") {
      const newId = Date.now();
      setCourses((p: any) => [...p, { ...entry, course_id: newId }]);
      showSuccess(`${entry.tee_box_name} tee added to ${entry.course_name}`);
    } else {
      setCourses((p: any) => p.map((c: any) => c.course_id === editing ? { ...entry, course_id: editing } : c));
      showSuccess(`${entry.course_name} (${entry.tee_box_name}) updated`);
    }
    setEditing(null);
    setTimeout(() => scrollMainTop(), 100);
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div className="card-title">Course & Tee Manager</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-outline btn-sm" onClick={openLookup} style={{ fontSize: 13 }}>🔍 Lookup Course</button>
          <button className="btn btn-primary btn-sm" onClick={startNew}>+ Manual</button>
        </div>
      </div>

      {/* ── Course Lookup Panel ── */}
      {showLookup && (
        <div ref={lookupRef} className="card" style={{ marginBottom: 14, border: "2px solid var(--primary)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>🔍 Course Lookup</div>
            <button className="btn btn-sm btn-outline" onClick={() => setShowLookup(false)}>✕</button>
          </div>

          {/* Search */}
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <input className="form-input" style={{ flex: 1, marginBottom: 0 }} value={lookupQuery} onChange={e => setLookupQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && searchCourses()} placeholder="Course or club name…" />
            <button className="btn btn-primary" style={{ whiteSpace: "nowrap" }} onClick={searchCourses} disabled={lookupLoading}>{lookupLoading ? "…" : "Search"}</button>
          </div>

          {lookupError && <div style={{ color: "var(--danger,#e53e3e)", fontSize: 13, marginBottom: 8 }}>{lookupError}</div>}

          {/* Search Results */}
          {lookupResults.length > 0 && !courseDetail && (
            <div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>{lookupResults.length} result{lookupResults.length !== 1 ? "s" : ""} — tap to select</div>
              <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8 }}>
                {lookupResults.map((r: any, i: number) => (
                  <div key={i} onClick={() => loadCourseDetail(r)} style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", cursor: "pointer", background: selectedCourse?.id === r.id ? "var(--primary-light,#e8f5e9)" : "transparent" }}>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{r.club_name}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{r.course_name}{r.location?.city ? ` · ${r.location.city}, ${r.location.state || r.location.country}` : ""}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {detailLoading && <div style={{ textAlign: "center", padding: 16, color: "var(--text-muted)" }}>Loading tee data…</div>}

          {/* Tee Selection */}
          {courseDetail && (
            <div style={{ marginTop: 10 }}>
              {(() => {
                const apiCourseName: string = courseDetail.course_name || courseDetail.club_name || "";
                const matchedName = courseNames.find(n => fuzzyMatchCourseName(n, apiCourseName));
                return (<>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{apiCourseName}</div>
                  {matchedName && <div style={{ fontSize: 12, color: "var(--primary)", marginBottom: 6 }}>✓ Matches <strong>"{matchedName}"</strong> in your course list — imported tees will be added to it</div>}
                </>);
              })()}
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>Select men's tee boxes to import:</div>
              {allApiTees().length === 0 && <div style={{ fontSize: 13, color: "var(--text-muted)" }}>No tee data available for this course.</div>}
              {allApiTees().map((t: any, i: number) => {
                const key = String(i);
                const checked = selectedTees.has(key);
                const pars = (t.holes || []).map((h: any) => h.par);
                const yardsArr = (t.holes || []).map((h: any) => h.yardage || 0);
                const totalYards = yardsArr.reduce((a: number, b: number) => a + b, 0);
                const hasHoles = pars.length === 18;
                const hasYards = hasHoles && yardsArr.some((y: number) => y > 0);
                return (
                  <div key={i} onClick={() => toggleTee(key)} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", marginBottom: 6, border: `2px solid ${checked ? "var(--primary)" : "var(--border)"}`, borderRadius: 8, cursor: "pointer", background: checked ? "var(--primary-light,#e8f5e9)" : "var(--surface,#fafaf8)" }}>
                    <div style={{ width: 22, height: 22, borderRadius: 4, border: `2px solid ${checked ? "var(--primary)" : "var(--border)"}`, background: checked ? "var(--primary)" : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1 }}>
                      {checked && <span style={{ color: "#fff", fontSize: 14, lineHeight: 1 }}>✓</span>}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{t.tee_name}</div>
                      <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Slope {t.slope_rating} · Rating {t.course_rating} · Par {t.par_total}{hasYards ? ` · ${totalYards} yds` : ""}</div>
                      {hasHoles && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>Pars: {pars.join(", ")}</div>}
                      {hasYards && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>Yards: {yardsArr.join(", ")}</div>}
                      {!hasHoles && <div style={{ fontSize: 11, color: "#d97706", marginTop: 2 }}>⚠ Hole-by-hole data unavailable — pars will default to 4</div>}
                      {hasHoles && !hasYards && <div style={{ fontSize: 11, color: "#d97706", marginTop: 2 }}>⚠ No yardage data from API for this tee</div>}
                    </div>
                  </div>
                );
              })}
              {allApiTees().length > 0 && (
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={importSelectedTees} disabled={selectedTees.size === 0}>
                    Import {selectedTees.size > 0 ? `${selectedTees.size} ` : ""}Tee{selectedTees.size !== 1 ? "s" : ""}
                  </button>
                  <button className="btn btn-outline" onClick={() => { setSelectedCourse(null); setCourseDetail(null); setSelectedTees(new Set()); }}>← Back</button>
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-muted)" }}>Powered by <a href="https://golfcourseapi.com" target="_blank" rel="noreferrer" style={{ color: "var(--primary)" }}>GolfCourseAPI</a> · Free tier: 50 req/day</div>
        </div>
      )}

      {/* ── Manual Edit Form ── */}
      {editing && (
        <div ref={editFormRef} className="card" style={{ marginBottom: 14 }}>
          <div className="card-title" style={{ marginBottom: 10 }}>{editing === "new" ? "New Tee Box (Manual)" : "Edit Tee Box"}</div>
          <div className="form-group">
            <label className="form-label">Course Name</label>
            <input className="form-input" list="cname-list" value={form.course_name} onChange={e => setForm((p: any) => ({ ...p, course_name: e.target.value }))} placeholder="e.g. Strawberry Farms GC" />
            <datalist id="cname-list">{courseNames.map(n => <option key={n} value={n} />)}</datalist>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Tee Name</label><input className="form-input" value={form.tee_box_name} onChange={e => setForm((p: any) => ({ ...p, tee_box_name: e.target.value }))} /></div>
            <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Par</label><input className="form-input" type="number" value={form.par} onChange={e => setForm((p: any) => ({ ...p, par: e.target.value }))} /></div>
            <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Slope</label><input className="form-input" type="number" value={form.tee_slope} onChange={e => setForm((p: any) => ({ ...p, tee_slope: e.target.value }))} /></div>
            <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Rating</label><input className="form-input" type="number" step="0.1" value={form.tee_rating} onChange={e => setForm((p: any) => ({ ...p, tee_rating: e.target.value }))} /></div>
          </div>
          <div className="form-group" style={{ marginTop: 8 }}><label className="form-label">Hole Pars (18, comma-separated)</label><input className="form-input" value={parStr} onChange={e => setParStr(e.target.value)} placeholder="4,4,3,5,…" /></div>
          <div className="form-group"><label className="form-label">Stroke Indices (18, comma-separated)</label><input className="form-input" value={siStr} onChange={e => setSiStr(e.target.value)} placeholder="1,2,3,…" /></div>
          <div className="form-group"><label className="form-label">Hole Yards (18, comma-separated — optional)</label><input className="form-input" value={yardsStr} onChange={e => setYardsStr(e.target.value)} placeholder="488,457,375,… (leave blank if unknown)" /></div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={save}>Save</button>
            <button className="btn btn-outline" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      )}

      {courseNames.map(name => {
        const courseImgs = (holeImages || []).filter((r: any) => r.course_name === name);
        const imgCount = courseImgs.length;
        return (
          <div key={name} className="card" style={{ padding: "12px 14px" }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{name}</div>
            {courses.filter((c: any) => c.course_name === name).map((c: any) => {
              const isNew = c.created_at && (Date.now() - new Date(c.created_at).getTime()) < 14 * 24 * 60 * 60 * 1000;
              return (
                <div key={c.course_id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 600 }}>{c.tee_box_name}</span>
                    <span style={{ fontSize: 13, color: "var(--text-muted)", marginLeft: 8 }}>Sl {c.tee_slope} · Rt {c.tee_rating} · Par {c.par}</span>
                  </div>
                  <button className="btn btn-sm btn-outline" onClick={() => startEdit(c)}>Edit</button>
                  {isNew && <button className="btn btn-sm btn-danger" onClick={() => { setCourses((p: any) => p.filter((x: any) => x.course_id !== c.course_id)); showSuccess("Tee removed"); setTimeout(() => scrollMainTop(), 50); }}>Del</button>}
                </div>
              );
            })}
            {/* Hole Images button */}
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{imgCount} of 18 hole {imgCount === 1 ? "image" : "images"}</span>
              <button className="btn btn-sm btn-outline" onClick={() => setImgModalCourse(name)}>
                {imgCount === 0 ? "+ Add Hole Images" : "Manage Hole Images"}
              </button>
            </div>
          </div>
        );
      })}

      {/* ── Hole Images Modal ── */}
      {imgModalCourse && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9300, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "20px 12px", overflowY: "auto" }} onClick={e => { if (e.target === e.currentTarget) setImgModalCourse(null); }}>
          <div style={{ background: "var(--surface)", borderRadius: 16, width: "100%", maxWidth: 560, boxShadow: "0 8px 40px rgba(0,0,0,0.4)", overflow: "hidden" }}>
            {/* Header */}
            <div style={{ background: "var(--green-900)", padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontFamily: "var(--font-serif,serif)", fontSize: 18, fontWeight: 700, color: "var(--gold-300,#d4a843)" }}>{imgModalCourse}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>Hole images · used on Weekly Leaderboard course cards</div>
              </div>
              <button onClick={() => setImgModalCourse(null)} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "white", borderRadius: "50%", width: 32, height: 32, fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>✕</button>
            </div>
            {/* Hole grid */}
            <div style={{ padding: "16px", display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, maxHeight: "70vh", overflowY: "auto" }}>
              {Array.from({ length: 18 }, (_, i) => {
                const hole = i + 1;
                const existing = (holeImages || []).find((r: any) => r.course_name === imgModalCourse && r.hole_number === hole);
                const isUploading = uploadingHole === hole;
                return (
                  <div key={hole} style={{ borderRadius: 10, overflow: "hidden", border: "1px solid var(--border)", background: "var(--surface2)", position: "relative" }}>
                    {/* Image preview or placeholder */}
                    <div style={{ height: 90, position: "relative", background: existing ? "#111" : "var(--earth-100)" }}>
                      {existing
                        ? <img src={existing.public_url} alt={`Hole ${hole}`} style={{ width: "100%", height: "100%", objectFit: "cover", opacity: isUploading ? 0.4 : 1 }} />
                        : <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, color: "var(--text-muted)", opacity: 0.4 }}>⛳</div>
                      }
                      {/* Hole number badge */}
                      <div style={{ position: "absolute", top: 6, left: 6, background: "rgba(0,0,0,0.65)", color: "white", borderRadius: 6, padding: "2px 7px", fontSize: 11, fontWeight: 700 }}>#{hole}</div>
                      {/* Loading overlay */}
                      {isUploading && (
                        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "white", fontWeight: 600 }}>Uploading…</div>
                      )}
                    </div>
                    {/* Actions */}
                    <div style={{ padding: "6px 8px", display: "flex", gap: 4 }}>
                      <label style={{ flex: 1, textAlign: "center", padding: "5px 4px", borderRadius: 6, background: "var(--green-800)", color: "white", fontSize: 11, fontWeight: 600, cursor: isUploading || uploadingHole !== null ? "not-allowed" : "pointer", opacity: uploadingHole !== null && !isUploading ? 0.5 : 1, letterSpacing: "0.02em" }}>
                        {existing ? "Replace" : "Upload"}
                        <input type="file" accept="image/*" style={{ display: "none" }} disabled={uploadingHole !== null}
                          onChange={async (e) => { const f = e.target.files?.[0]; if (f) await uploadHoleImage(imgModalCourse!, hole, f); e.target.value = ""; }} />
                      </label>
                      {existing && (
                        <button style={{ padding: "5px 8px", borderRadius: 6, background: "transparent", border: "1px solid var(--border)", color: "var(--text-muted)", fontSize: 11, cursor: "pointer" }}
                          onClick={() => deleteHoleImage(imgModalCourse!, hole)}>✕</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Footer */}
            <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--surface2)" }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {(holeImages || []).filter((r: any) => r.course_name === imgModalCourse).length} / 18 uploaded · compressed to 1400px JPEG
              </span>
              <button className="btn btn-sm btn-outline" onClick={() => setImgModalCourse(null)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
