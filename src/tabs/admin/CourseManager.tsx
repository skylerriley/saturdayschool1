import { useState, useRef, useLayoutEffect } from "react";
import { scrollMainTop, scrollMainToEl } from "../../lib/formatters";
import { fuzzyMatchCourseName } from "../../lib/courseNameUtils";
import { GCAPI_KEY } from "../../lib/supabaseClient";
import { HoleImageManager } from "./HoleImageManager";
import { GlassPicker } from "../../components/common";

// ── Course / Images view nav ───────────────────────────────────────────────────
// Text-title tabs with an animated ink line underneath the active view.
// Mirrors OddsViewNav in the pre-event odds module, retuned for the light
// admin theme (earth text tones + gold ink).
function CourseViewNav({ view, setView }: { view: string; setView: (v: any) => void }) {
  const tabs = [
    { id: "tees", label: "COURSE" },
    { id: "images", label: "IMAGES" },
  ];

  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [inkStyle, setInkStyle] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const idx = tabs.findIndex(t => t.id === view);
    const el = btnRefs.current[idx];
    if (!el) return;
    const parent = el.parentElement;
    if (!parent) return;
    const parentRect = parent.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    setInkStyle({ left: elRect.left - parentRect.left, width: elRect.width });
  }, [view]);

  return (
    <div style={{ position: "relative", display: "flex", justifyContent: "center", gap: 24, marginBottom: 14 }}>
      {tabs.map((t, i) => (
        <button
          key={t.id}
          ref={el => { btnRefs.current[i] = el; }}
          onClick={() => setView(t.id)}
          style={{
            background: "none", border: "none", cursor: "pointer",
            padding: "0 4px 12px",
            fontSize: 13, fontWeight: 700,
            color: view === t.id ? "var(--text-primary)" : "var(--text-muted)",
            WebkitTapHighlightColor: "transparent",
            transition: "color 0.2s",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          {t.label}
        </button>
      ))}
      {/* Track line */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        height: 1, background: "var(--border)",
      }} />
      {/* Ink indicator */}
      {inkStyle && (
        <div style={{
          position: "absolute", bottom: 0,
          left: inkStyle.left,
          width: inkStyle.width,
          height: 2,
          background: "var(--gold-400)",
          borderRadius: 2,
          transition: "left 0.28s cubic-bezier(0.4,0,0.2,1), width 0.28s cubic-bezier(0.4,0,0.2,1)",
        }} />
      )}
    </div>
  );
}

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

  // ── Tees / Images subtab (segmented, no modal) ─────────────────────
  // course_name is the row key everywhere; the R2 folder uses the course's
  // numeric id (lowest id sharing this name) as a stable slug.
  const [view, setView] = useState<"tees" | "images">("tees");
  const [imgCourse, setImgCourse] = useState<string>("");
  const courseIdForName = (name: string): number => {
    const ids = courses.filter((c: any) => c.course_name === name).map((c: any) => Number(c.course_id)).filter((n: number) => Number.isFinite(n) && n > 0);
    return ids.length ? Math.min(...ids) : 0;
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
    setTimeout(() => scrollMainToEl(lookupRef.current), 50);
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
  const startNew = () => { setEditing("new"); setForm(blank); setParStr("4,4,3,5,4,4,3,5,4,4,3,5,4,4,3,5,4,4"); setSiStr("1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18"); setYardsStr(""); setShowLookup(false); setTimeout(() => scrollMainToEl(editFormRef.current), 50); };
  const startEdit = (c: any) => { setEditing(c.course_id); setForm({ ...c }); setParStr(c.hole_pars.join(",")); setSiStr(c.hole_stroke_indices.join(",")); setYardsStr(c.hole_yards ? c.hole_yards.join(",") : ""); setShowLookup(false); setTimeout(() => scrollMainToEl(editFormRef.current), 50); };

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
      <CourseViewNav view={view} setView={setView} />

      {view === "tees" && (<>
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
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 8 }}>
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
        // Placed = any per-hole slot (artistic/hole/green) with an image; out of 54.
        const imgCount = (holeImages || []).filter((r: any) => r.course_name === name && r.hole_number != null && r.view_type !== "course").length;
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
            {/* Hole Images: jump to the Images subtab for this course */}
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{imgCount} of 54 images placed</span>
              <button className="btn btn-sm btn-outline" onClick={() => { setImgCourse(name); setView("images"); setTimeout(() => scrollMainTop(), 50); }}>
                {imgCount === 0 ? "+ Add Images" : "Manage Images"}
              </button>
            </div>
          </div>
        );
      })}
      </>)}

      {view === "images" && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Hole Images</div>
          </div>
          <div className="form-group">
            <label className="form-label">Course</label>
            <GlassPicker
              value={imgCourse}
              onChange={(v) => setImgCourse(v)}
              options={[{ value: "", label: "Choose a course…" }, ...courseNames.map((n) => ({ value: n, label: n }))]}
            />
          </div>
          {imgCourse
            ? <HoleImageManager
                key={imgCourse}
                courseName={imgCourse}
                courseId={courseIdForName(imgCourse)}
                holeImages={holeImages}
                setHoleImages={setHoleImages}
                showSuccess={showSuccess}
              />
            : <div className="empty-state" style={{ marginTop: 8 }}><div className="empty-text">Pick a course to manage its artistic, hole, and green images.</div></div>}
        </>
      )}
    </div>
  );
}
